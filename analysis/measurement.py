"""Advisory arrangement checks and vocal onset estimates, independent of targets."""
import common
import numpy as np
import librosa
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks
from lyric_timing import section_lines


def envelope_metric(env, start, end, fps=100):
    if start is None or end is None or end <= start:
        return dict(mean_relative=None, p90_relative=None, relative_db=None, rms_dbfs=None)
    y = env[max(0, int(start * fps)):min(len(env), int(end * fps))]
    if not len(y):
        return dict(mean_relative=None, p90_relative=None, relative_db=None, rms_dbfs=None)
    ref = float(np.percentile(env, 95))
    mean = float(np.sqrt(np.mean(y ** 2)))
    return dict(mean_relative=mean / (ref + 1e-12), p90_relative=float(np.percentile(y, 90) / (ref + 1e-12)),
                relative_db=float(20 * np.log10((mean + 1e-12) / (ref + 1e-12))),
                rms_dbfs=float(20 * np.log10(mean + 1e-12)), reference_rms=ref)


def activity(metric):
    if metric["mean_relative"] is None:
        return "uncertain"
    if metric["rms_dbfs"] < -65 or metric["mean_relative"] < .05:
        return "absent"
    if metric["mean_relative"] > .15:
        return "present"
    return "uncertain"


def arrangement(evidence, envelopes):
    P, meter = evidence["grid"]["beat_period"], common.CONFIG["beats_per_bar"]
    checks = []
    for cfg, measured in zip(common.CONFIG["sections"], evidence["sections"]):
        start, end = measured["start"], measured["end"]
        for instrument, expect in cfg.get("expect", {}).items():
            targets = ("drums", "bass") if instrument == "stop_bar" else (instrument,)
            for target in targets:
                a, b, desired = start, end, expect
                if expect == "stop_in_pickup_bar":
                    a = start + P if start is not None else None
                    b = start + meter * P if start is not None else None
                    desired = "absent"
                elif instrument == "stop_bar" and expect == "last":
                    a, b, desired = (end - meter * P if end is not None else None), end, "absent"
                supported = target in envelopes and desired in ("present", "absent")
                # Avoid transition transients; thresholds are fixed for every song.
                metric = envelope_metric(envelopes[target], a + .04 if a is not None else None,
                                         b - .04 if b is not None else None) if supported else envelope_metric([], None, None)
                detected = activity(metric)
                status = "不确定" if detected == "uncertain" else ("命中" if detected == desired else "未命中")
                checks.append(dict(section=cfg["name"], instrument=target, expect=expect,
                                   start=a, end=b, **metric, detected=detected, status=status,
                                   advisory=True))
    return checks


def vocal_attack(vocals, sr, word, syllable):
    """Estimate from acoustics inside a Whisper word, never from the beat target."""
    a, b = max(0., word["start"] - .15), min(len(vocals) / sr, word["end"] + .10)
    y = vocals[int(a * sr):int(b * sr)]
    if len(y) < sr * .03:
        return dict(onset=None, confidence="unresolved", reason="Word interval too short")
    rate, hop = 16000, 80
    y = librosa.resample(y, orig_sr=sr, target_sr=rate)
    S = np.abs(librosa.stft(y, n_fft=512, hop_length=hop))
    frequencies = librosa.fft_frequencies(sr=rate, n_fft=512)
    mid = np.sqrt((S[(frequencies >= 150) & (frequencies <= 3000)] ** 2).sum(axis=0))
    env = gaussian_filter1d(mid, 2)
    nuclei, props = find_peaks(env, distance=20, prominence=max(env.max() * .12, 1e-9))
    nuclei = [int(n) for n in nuclei if a + n * hop / rate >= word["start"] - .03
              and a + n * hop / rate <= word["end"] + .03]
    if syllable > 1:
        if len(nuclei) < syllable:
            return dict(onset=None, confidence="unresolved", reason="Cannot isolate stressed syllable acoustically",
                        nuclei=[a + n * hop / rate for n in nuclei])
        peak = nuclei[syllable - 1]
        previous = nuclei[syllable - 2]
        valley = previous + int(np.argmin(env[previous:peak + 1]))
        threshold = env[valley] + .2 * (env[peak] - env[valley])
        onset = valley + int(np.flatnonzero(env[valley:peak + 1] >= threshold)[0])
        confidence = "low"
    else:
        flux = np.maximum(np.diff(np.log1p(S), axis=1, prepend=np.log1p(S[:, :1])), 0).mean(axis=0)
        flux = gaussian_filter1d(flux, 1)
        peaks, _ = find_peaks(flux, distance=6, prominence=max(flux.max() * .08, 1e-9))
        candidates = [int(p) for p in peaks if abs(a + p * hop / rate - word["start"]) <= .16]
        if not candidates:
            return dict(onset=None, confidence="unresolved", reason="No local vocal attack near word onset")
        onset = min(candidates, key=lambda p: abs(a + p * hop / rate - word["start"]))
        confidence = "medium" if word["probability"] >= .5 else "low"
    return dict(onset=float(a + onset * hop / rate), confidence=confidence,
                method="Spectral-flux peak near Whisper word start" if syllable == 1 else "20% energy rise after the valley before the requested syllable nucleus",
                nuclei=[a + n * hop / rate for n in nuclei],
                caveat="Singing, double tracking and phoneme boundaries can shift this estimate; no forced alignment or listening verification.")


def hooks(evidence, vocals, sr):
    config = common.CONFIG.get("hook")
    if not config:
        return []
    target_tokens = common.tokens(config.get("spoken_form", config["word"]))
    whole = common.tokens(config["word"])
    mapped = section_lines(evidence["lyric_anchors"])
    out = []
    P, meter = evidence["grid"]["beat_period"], common.CONFIG["beats_per_bar"]
    for section, anchor in zip(evidence["sections"], mapped):
        if "chorus" not in section["name"].lower():
            continue
        row = dict(section=section["name"], word=config["word"], onset=None,
                   target=section["start"] + meter * P if section["start"] is not None else None,
                   delta_ms=None, delta_beats=None, confidence="unresolved")
        words = []
        if anchor and anchor["start"] is not None and anchor["end"] is not None:
            words = [w for w in evidence["words"] if w["start"] >= anchor["start"]
                     and w["start"] <= anchor["end"] + .1
                     and w["token"] in {target_tokens[-1], *whole}]
        if words:
            word = words[0]
            separate_word = len(word.get("source_tokens", [word["token"]])) == 1
            syllable = 1 if len(target_tokens) > 1 and word["token"] == target_tokens[-1] and separate_word else config.get("stressed_syllable", 1)
            row.update(vocal_attack(vocals, sr, word, syllable))
            row["whisper_word"] = word
            if row["onset"] is not None and row["target"] is not None:
                delta = row["onset"] - row["target"]
                row.update(delta_ms=delta * 1000, delta_beats=delta / P)
        else:
            row["reason"] = "Hook not recognized within the first lyric line"
        out.append(row)
    return out
