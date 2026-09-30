"""Constant beat-grid fit, local drift, and meter phase without a snare prior."""
import common
import numpy as np
import librosa
from scipy.ndimage import maximum_filter1d
from signal_features import band_onsets
from lyric_timing import section_lines


def fit_grid(drums, mix, sr, nominal_bpm):
    hop, rate = 128, 22050
    sources = [librosa.resample(y, orig_sr=sr, target_sr=rate) for y in (drums, mix)]
    envs = [librosa.onset.onset_strength(y=y, sr=rate, hop_length=hop) for y in sources]
    n = min(map(len, envs))
    o = sum(e[:n] / (np.percentile(e, 99) + 1e-9) for e in envs)
    o = maximum_filter1d(o, 3)
    fps, duration = rate / hop, len(mix) / sr

    def score(bpm, offsets, start=0, end=duration):
        period = 60 / bpm
        beats = np.arange(int(np.floor(start / period)), int(np.ceil(end / period))) * period
        times = offsets[:, None] + beats[None, :]
        idx = np.rint(times * fps).astype(int)
        mask = (times >= start) & (times < end) & (idx >= 0) & (idx < n)
        return (o[np.clip(idx, 0, n - 1)] * mask).sum(1) / np.maximum(1, mask.sum(1))

    best = (-np.inf, nominal_bpm, 0.)
    # The declared BPM resolves half/double-time ambiguity; it is not the output.
    bounds = (nominal_bpm * .70, nominal_bpm * 1.40)
    for bpm in np.arange(*bounds, .05):
        offsets = np.arange(0, 60 / bpm, .006)
        scores = score(bpm, offsets)
        i = scores.argmax()
        if scores[i] > best[0]:
            best = (float(scores[i]), float(bpm), float(offsets[i]))
    _, coarse, offset = best
    for bpm in np.arange(coarse - .06, coarse + .061, .002):
        offsets = np.arange(offset - .02, offset + .0201, .001)
        scores = score(bpm, offsets)
        i = scores.argmax()
        if scores[i] > best[0]:
            best = (float(scores[i]), float(bpm), float(offsets[i]))
    _, bpm, off = best
    P = 60 / bpm
    # Acoustic attack times remove the spectral-flux window latency.
    onset_t, onset_db = band_onsets(drums, sr, None, 150, win=.012, min_gap=.2, rel_db=10)
    if len(onset_t) < 8:
        onset_t, onset_db = band_onsets(mix, sr, None, 150, win=.012, min_gap=.2, rel_db=10)
    if len(onset_t):
        keep = onset_db > np.percentile(onset_db, 90) - 30
        onset_t = onset_t[keep]
    for _ in range(2):
        indices = np.rint((onset_t - off) / P)
        residual = onset_t - (off + indices * P)
        keep = np.abs(residual) < .10
        if keep.sum() >= 8:
            fit_P, fit_off = np.polyfit(indices[keep], onset_t[keep], 1)
            if abs(fit_P - P) < .005:
                P, off = float(fit_P), float(fit_off)
    off %= P
    bpm = 60 / P
    residual = onset_t - (off + np.rint((onset_t - off) / P) * P)
    local = []
    for start in np.arange(0, duration, 15.):
        end = min(duration, start + 15)
        keep = (onset_t >= start) & (onset_t < end) & (np.abs(residual) < P * .3)
        phase = float(np.median(residual[keep])) if keep.sum() >= 4 else None
        local_bpm = None
        if keep.sum() >= 8:
            indices = np.rint((onset_t[keep] - off) / P)
            pp, _ = np.polyfit(indices, onset_t[keep], 1)
            local_bpm = float(60 / pp)
        local.append(dict(start=float(start), end=float(end), observations=int(keep.sum()),
                          phase_deviation_ms=phase * 1000 if phase is not None else None,
                          bpm=local_bpm,
                          bpm_drift=local_bpm - bpm if local_bpm is not None else None))
    phases = [abs(w["phase_deviation_ms"]) for w in local if w["phase_deviation_ms"] is not None]
    drifts = [abs(w["bpm_drift"]) for w in local if w["bpm_drift"] is not None]
    return dict(bpm=bpm, beat_period=P, first_beat=off, tempo_search_range=list(bounds),
                stability=dict(window_seconds=15, windows=local,
                    max_phase_deviation_ms=max(phases, default=None),
                    max_bpm_drift=max(drifts, default=None),
                    caveat="Windows with insufficient attacks are unresolved; constant grid extrapolates through them."))


def bar_phase(stems, sr, grid, anchors):
    P, off, meter = grid["beat_period"], grid["first_beat"], common.CONFIG["beats_per_bar"]
    harmonic = stems["other"] + stems["bass"]
    y = librosa.resample(harmonic, orig_sr=sr, target_sr=22050)
    hop = 256
    chroma = librosa.feature.chroma_stft(y=y, sr=22050, hop_length=hop, n_fft=2048)
    beats = off + P * np.arange(int((len(harmonic) / sr - off) / P))
    novelty, low = [], []
    for t in beats:
        def window(a, b):
            i, j = max(0, int(a * 22050 / hop)), min(chroma.shape[1], int(b * 22050 / hop))
            return chroma[:, i:max(i + 1, j)].mean(axis=1)
        before, after = window(t - .70 * P, t - .15 * P), window(t + .15 * P, t + .70 * P)
        novelty.append(1 - float(np.dot(before, after) / (np.linalg.norm(before) * np.linalg.norm(after) + 1e-9)))
        a, b = max(0, int(t * sr)), min(len(harmonic), int((t + .18 * P) * sr))
        low.append(float(np.sqrt(np.mean(stems["bass"][a:b] ** 2))) if b > a else 0.)
    novelty, low = np.asarray(novelty), np.asarray(low)
    lyric_starts = [a["start"] for s, a in zip(common.CONFIG["sections"], section_lines(anchors))
                    if a and a["start"] is not None and "chorus" not in s["name"].lower()]
    candidates = []
    for phase in range(meter):
        mask = np.arange(len(beats)) % meter == phase
        harmony = float(novelty[mask].mean()) if mask.any() else 0.
        bass = float(low[mask].mean()) if mask.any() else 0.
        distances = [min(((t - off) / P - phase) % meter, (phase - (t - off) / P) % meter)
                     for t in lyric_starts]
        lyric = float(np.mean(np.exp(-np.array(distances) ** 2 / .75))) if distances else 0.
        candidates.append(dict(phase=phase, harmony=harmony, bass=bass, lyric=lyric))
    for key, weight in (("harmony", .65), ("bass", .2), ("lyric", .15)):
        vals = np.array([c[key] for c in candidates])
        scaled = (vals - vals.min()) / (vals.max() - vals.min() + 1e-9)
        for c, value in zip(candidates, scaled):
            c["score"] = c.get("score", 0.) + weight * float(value)
    ranked = sorted(candidates, key=lambda c: c["score"], reverse=True)
    margin = ranked[0]["score"] - ranked[1]["score"]
    # Strong accents may still admit more than one musical interpretation.
    confidence = "medium" if margin >= .15 and np.ptp(novelty) > .02 else "low"
    return dict(first_downbeat=off + ranked[0]["phase"] * P,
                bar_phase=dict(selected=ranked[0]["phase"], confidence=confidence,
                    score_margin=margin, candidates=candidates,
                    method="65% beatwise harmonic change, 20% bass attack energy, 15% non-chorus lyric proximity. No snare pattern or fixed chord length; hook timing is excluded."))
