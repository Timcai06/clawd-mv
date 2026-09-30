"""Per-song beat grid, lyric-anchored sections and animation envelopes."""
import common
import argparse
import json
import time
import numpy as np
import librosa
from scipy.signal import sosfiltfilt
from signal_features import band_sos, frame_rms, smooth_env, norm01, drum_onsets, strength01
from lyric_timing import align_lyrics, sections_from_lyrics
from rhythm import fit_grid, bar_phase

SR, FPS = 44100, 100


def run(transcript):
    start = time.perf_counter()
    mix, _ = common.load_mix(SR)
    duration = len(mix) / SR
    stems = {}
    for name in common.STEM_NAMES:
        y, _ = common.load_stem(name, SR)
        stems[name] = np.pad(y[:len(mix)], (0, max(0, len(mix) - len(y))))
    lyric_match, anchors, words = align_lyrics(transcript)
    grid = fit_grid(stems["drums"], mix, SR, common.CONFIG["bpm"])
    grid.update(bar_phase(stems, SR, grid, anchors))
    sections = sections_from_lyrics(anchors, grid, duration)
    P, off, db, meter = grid["beat_period"], grid["first_beat"], grid["first_downbeat"], common.CONFIG["beats_per_bar"]
    env = {"rms": frame_rms(mix, SR)}
    for name, (lo, hi) in {"low": (None, 150), "mid": (150, 2000), "high": (4000, None)}.items():
        env[name] = frame_rms(sosfiltfilt(band_sos(lo, hi, SR), mix), SR)
    for name, y in stems.items():
        env["vocal" if name == "vocals" else name] = frame_rms(y, SR)
    normalized = {k: np.round(norm01(smooth_env(y)), 3).tolist() for k, y in env.items()}
    kick, snare, hat, _ = drum_onsets(stems["drums"], SR, P, off)
    onset = {name: [[round(float(t), 3), round(float(s), 3)] for t, s in zip(ts, strength01(dbv))]
             for name, (ts, dbv) in zip(("kick", "snare", "hat"), (kick, snare, hat))}
    v = librosa.resample(stems["vocals"], orig_sr=SR, target_sr=22050)
    times = librosa.onset.onset_detect(y=v, sr=22050, hop_length=110, units="time")
    onset["vocal"] = [[float(t), 1.] for t in times]
    doc = dict(duration=duration, bpm=grid["bpm"], beat_period=P, time_signature=meter,
               beats=np.arange(off, duration, P).tolist(), downbeats=np.arange(db, duration, meter * P).tolist(),
               sections=sections, fps=FPS, **normalized, onsets=onset,
               notes="Gapless mp3 timeline; measured stem offset; sections without lyric evidence remain unresolved.")
    (common.DATA / "audio.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    evidence = dict(grid=grid, sections=sections, lyric_match=lyric_match, lyric_anchors=anchors,
                    words=words, duration=duration, analysis_seconds=time.perf_counter() - start)
    (common.WORK / "analysis.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence, stems, env


if __name__ == "__main__":
    parser = common.add_song_args(argparse.ArgumentParser(description=__doc__))
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    common.configure(args)
    from separate import run as separate
    from whisper_run import run as whisper
    separate(args.device)
    result, _, _ = run(whisper())
    print(f"BPM {result['grid']['bpm']:.3f}; wrote {common.DATA / 'audio.json'}")
