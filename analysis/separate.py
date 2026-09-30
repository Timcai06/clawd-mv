"""Demucs separation and per-song delay measurement against gapless decoding."""
import common
import argparse
import json
import time
import numpy as np
import soundfile as sf
from scipy.signal import correlate, correlation_lags


def measure_offset():
    signals = [sf.read(common.STEMS / f"{name}.wav", dtype="float32", always_2d=True)
               for name in common.STEM_NAMES]
    sr = signals[0][1]
    if any(s != sr for _, s in signals):
        raise ValueError("Stem sample rates disagree")
    n = min(len(y) for y, _ in signals)
    summed = sum(y[:n].mean(axis=1) for y, _ in signals)
    mix, _ = common.load_mix(sr)
    n = min(n, len(mix))
    size = min(n, 8 * sr)
    windows = []
    for start in np.unique(np.linspace(0, max(0, n - size), 5).astype(int)):
        a, b = summed[start:start + size], mix[start:start + size]
        a, b = a - a.mean(), b - b.mean()
        corr = correlate(a, b, mode="full", method="fft")
        lags = correlation_lags(len(a), len(b))
        keep = np.abs(lags) <= int(sr * .25)
        idx = np.flatnonzero(keep)[np.argmax(corr[keep])]
        lag = int(lags[idx])
        aa = a[max(0, lag):min(len(a), len(a) + lag)]
        bb = b[max(0, -lag):min(len(b), len(b) - lag)]
        score = float(np.dot(aa, bb) / (np.linalg.norm(aa) * np.linalg.norm(bb) + 1e-12))
        windows.append(dict(start=float(start / sr), lag_samples=lag, correlation=score))
    valid = [w for w in windows if w["correlation"] >= .5]
    if not valid:
        raise ValueError("Stem sum does not correlate with source audio (all windows < 0.5)")
    lag = int(np.median([w["lag_samples"] for w in valid]))
    result = dict(sample_rate=sr, offset_samples=lag, offset_seconds=lag / sr,
                  convention="Positive lag means stems are late; trim their beginning.",
                  max_window_deviation_samples=max(abs(w["lag_samples"] - lag) for w in valid),
                  windows=windows)
    (common.WORK / "stem_offset.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Stem offset: {lag} samples @{sr} Hz ({lag / sr * 1000:.3f} ms)", flush=True)
    return result


def run(device="cpu", force=False):
    manifest = common.WORK / "separation.json"
    if manifest.exists() and all((common.STEMS / f"{s}.wav").exists() for s in common.STEM_NAMES) and not force:
        result = json.loads(manifest.read_text())
        return {**result, "cached": True}
    from demucs.separate import main
    import torch
    import random
    random.seed(0)
    torch.manual_seed(0)
    # The filename controls Demucs output naming, independent of source location.
    staging = common.WORK / "input"
    staging.mkdir(exist_ok=True)
    source = staging / (common.SONG_ID + common.AUDIO.suffix)
    if not source.exists():
        source.symlink_to(common.AUDIO)
    start = time.perf_counter()
    manifest.unlink(missing_ok=True)
    main(["-n", common.MODEL, "-d", device, "--float32", "--shifts", "1",
          "-o", str(common.ROOT / "stems"), str(source)])
    seconds = time.perf_counter() - start
    start = time.perf_counter()
    measure_offset()
    result = dict(demucs_seconds=seconds, offset_seconds=time.perf_counter() - start,
                  device=device, seed=0, cached=False)
    manifest.write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = common.add_song_args(argparse.ArgumentParser(description=__doc__))
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    common.configure(args)
    print(run(args.device, args.force))
