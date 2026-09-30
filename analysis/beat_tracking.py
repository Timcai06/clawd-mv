"""Elastic beat tracking with acoustic evidence and an explicit constant case."""
import common
import numpy as np
import numba
from scipy.ndimage import gaussian_filter1d
from scipy.sparse import diags
from scipy.sparse.linalg import spsolve
from signal_features import band_onsets
from rhythm import fit_grid

FPS = 200


@numba.njit(cache=True)
def beat_path(score, period, fps=FPS):
    """DP over beat times; regularize intervals, without fixing global phase."""
    n = len(score)
    lo, hi = int(period * fps * .80), int(period * fps * 1.20)
    value = np.full(n, -1e12)
    back = np.full(n, -1, np.int64)
    for t in range(n):
        if t < period * fps * 1.2:
            value[t] = score[t]
        for step in range(lo, hi + 1):
            prev = t - step
            if prev < 0:
                continue
            v = value[prev] + score[t] - 45 * np.log(step / (period * fps)) ** 2
            if v > value[t]:
                value[t], back[t] = v, prev
    end0 = max(0, n - int(period * fps))
    t = end0 + np.argmax(value[end0:])
    result = []
    while t >= 0:
        result.append(t / fps)
        t = back[t]
    return np.array(result[::-1])


def evidence_onsets(stems, mix, sr):
    """Keep low/mid drum attacks separately for independent residual reports."""
    out = {}
    for name, signal, lo, hi, weight in (
        ('kick', stems['drums'], None, 150, 1.),
        ('snare_band', stems['drums'], 1500, 5000, .75),
        ('hat_band', stems['drums'], 7000, None, .25),
        ('mix_low', mix, None, 150, .4),
    ):
        t, db = band_onsets(signal, sr, lo, hi, win=.012, min_gap=.10, rel_db=9)
        if len(t):
            keep = db > max(-65, np.percentile(db, 90) - 30)
            t, db = t[keep], db[keep]
        strength = np.clip(10 ** ((db - np.percentile(db, 90)) / 40), .1, 1.5) if len(db) else db
        out[name] = dict(times=t, db=db, strength=strength, weight=weight)
    return out


def nearest_residual(beats, onsets):
    """Signed beat minus closest attack; missing attacks stay explicitly null."""
    if len(onsets) == 0:
        return np.full(len(beats), np.nan)
    ix = np.abs(beats[:, None] - onsets[None, :]).argmin(axis=1)
    return beats - onsets[ix]


def stats(residual):
    x = np.abs(np.asarray(residual)) * 1000
    x = x[np.isfinite(x)]
    if not len(x):
        return dict(count=0, median_ms=None, p90_ms=None, max_ms=None, within_50ms=None)
    return dict(count=len(x), median_ms=float(np.median(x)), p90_ms=float(np.percentile(x, 90)),
                max_ms=float(x.max()), within_50ms=int((x <= 50).sum()))


def smooth_beats(initial, events):
    """Regularized least squares interpolates absent hits, rather than inventing them."""
    n = len(initial)
    onset = np.concatenate([events[k]['times'] for k in ('kick', 'snare_band', 'mix_low')])
    r = nearest_residual(initial, onset)
    supported = np.isfinite(r) & (np.abs(r) < .075)
    y = initial.copy()
    y[supported] -= r[supported]
    w = np.where(supported, 1., .02)
    d2 = diags([np.ones(n - 2), -2 * np.ones(n - 2), np.ones(n - 2)], [0, 1, 2], shape=(n - 2, n))
    return spsolve((diags(w) + 6 * d2.T @ d2).tocsc(), w * y), supported


def track(stems, mix, sr, nominal):
    duration = len(mix) / sr
    prior = fit_grid(stems['drums'], mix, sr, nominal)
    period = prior['beat_period']
    events = evidence_onsets(stems, mix, sr)
    score = np.zeros(int(np.ceil(duration * FPS)))
    for e in events.values():
        impulse = np.zeros_like(score)
        idx = np.clip(np.rint(e['times'] * FPS).astype(int), 0, len(score) - 1)
        np.maximum.at(impulse, idx, e['strength'] * e['weight'])
        score += gaussian_filter1d(impulse, 2) * (2 * np.sqrt(2 * np.pi))
    initial = beat_path(score, period)
    if len(initial) < 4:
        raise ValueError('At least four beats are required for tempo estimation')
    beats, supported = smooth_beats(initial, events)
    if supported.sum() < 4:
        raise ValueError('Insufficient acoustic evidence for beat tracking')
    ix = np.arange(len(beats))
    # Test the DP's own beat numbers for a constant clock, with robust trimming.
    keep = supported.copy()
    for _ in range(3):
        p, off = np.polyfit(ix[keep], beats[keep], 1)
        err = beats - (off + ix * p)
        keep = supported & (np.abs(err) < .035)
    fit = off + ix * p
    err = beats[supported] - fit[supported]
    windows = [np.median((beats - fit)[supported & (beats >= a) & (beats < a + 8)])
               for a in np.arange(0, duration, 8)
               if np.sum(supported & (beats >= a) & (beats < a + 8)) >= 6]
    constant = (len(err) >= 16 and np.percentile(np.abs(err), 90) < .020
                and max(map(abs, windows), default=1) < .018)
    if constant:
        # Refit attack times directly; avoid smoothing bias at song edges.
        times = events['kick']['times']
        indices = np.rint((times - off) / p)
        residual = times - (off + indices * p)
        mask = np.abs(residual) < .04
        if mask.sum() >= 16:
            p, off = np.polyfit(indices[mask], times[mask], 1)
        beats = off + ix * p
    # Extend the inferred clock to both file edges (including instrumental decay).
    start_p, end_p = np.median(np.diff(beats[:17])), np.median(np.diff(beats[-17:]))
    while beats[0] - start_p >= 0:
        beats = np.r_[beats[0] - start_p, beats]
    while beats[-1] + end_p < duration:
        beats = np.r_[beats, beats[-1] + end_p]
    beats = beats[(beats >= 0) & (beats < duration)]
    if not np.all(np.diff(beats) > 0):
        raise ValueError('Non-monotonic beat path')
    drums = np.sort(np.concatenate([events[k]['times'] for k in ('kick', 'snare_band', 'hat_band')]))
    residual = nearest_residual(beats, drums)
    prior_beats = np.arange(prior['first_beat'], duration, period)
    # An eight-beat secant suppresses hit jitter while preserving gradual drift.
    local_bpm = np.array([60 * (min(len(beats) - 1, i + 4) - max(0, i - 4)) /
        (beats[min(len(beats) - 1, i + 4)] - beats[max(0, i - 4)]) for i in range(len(beats))])
    tempo_windows = []
    kick = events['kick']['times']
    for a in np.arange(0, duration, 8):
        mask = (beats >= a) & (beats < a + 8)
        selected = beats[mask]
        rr = nearest_residual(selected, kick)
        supported_window = np.isfinite(rr) & (np.abs(rr) < .05)
        indices = np.where(mask)[0][supported_window]
        raw = selected[supported_window] - rr[supported_window]
        p, off = np.polyfit(indices, raw, 1) if len(indices) >= 6 else (np.nan, np.nan)
        tempo_windows.append(dict(start=float(a), end=float(min(duration, a + 8)),
            local_bpm_median=float(np.median(local_bpm[mask])), kick_observations=len(raw),
            raw_kick_bpm=float(60 / p) if np.isfinite(p) else None,
            raw_kick_fit=stats(raw - (off + indices * p)),
            drum_residual=stats(nearest_residual(selected, drums))))
    return beats, dict(mode='constant' if constant else 'elastic', constant_prior=prior,
        bpm=float(60 / np.median(np.diff(beats))),
        constant_test=dict(p90_ms=float(np.percentile(np.abs(err), 90) * 1000),
                           max_window_phase_ms=float(max(map(abs, windows), default=0) * 1000)),
        residual_summary=stats(residual),
        constant_prior_residual=stats(nearest_residual(prior_beats, drums)),
        tempo_windows=tempo_windows,
        per_beat=[dict(index=i, time=float(t), nearest_drum_residual_ms=float(r * 1000),
                       local_bpm=float(local_bpm[i]), drum_supported=bool(abs(r) <= .05))
                  for i, (t, r) in enumerate(zip(beats, residual))],
        events={k: {a: v.tolist() if isinstance(v, np.ndarray) else v for a, v in e.items()}
                for k, e in events.items()})
