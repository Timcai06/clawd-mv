"""Whisper word timestamps on aligned vocals; no lyric prompt biases the score."""
import common
import argparse
import json
import time
import numpy as np
import soundfile as sf

MODELS = {"turbo": "mlx-community/whisper-large-v3-turbo",
          "large": "mlx-community/whisper-large-v3-mlx"}


def run(tag="turbo", model=None, prompt=None, force=False):
    model = model or MODELS[tag]
    out = common.WORK / f"whisper_{tag}.json"
    provenance = {"model": model, "prompt": prompt, "source": "aligned_demucs_vocals", "version": 1}
    if out.exists() and not force:
        res = json.loads(out.read_text())
        if res.get("measurement", {}).get("provenance") == provenance:
            return res
    y, sr = common.load_stem("vocals", sr=16000)
    sf.write(common.WORK / "vocals16k.wav", y, sr)
    start = time.perf_counter()
    # Silence is handled without normalizing separation bleed into speech.
    rms_db = float(20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-12))
    if rms_db < -60:
        res = {"text": "", "segments": [], "language": "en"}
        reason = "Vocal RMS below -60 dBFS; no speech transcription attempted."
    else:
        import mlx_whisper
        res = mlx_whisper.transcribe(str(common.WORK / "vocals16k.wav"),
            path_or_hf_repo=model, language="en", word_timestamps=True,
            condition_on_previous_text=False, initial_prompt=prompt, temperature=0.0,
            no_speech_threshold=.6, hallucination_silence_threshold=2.0)
        reason = None
    res["measurement"] = dict(seconds=time.perf_counter() - start, vocal_rms_dbfs=rms_db,
                              skip_reason=reason, provenance=provenance)
    out.write_text(json.dumps(res, indent=1, default=float) + "\n")
    # Retain the legacy cross-check filename without introducing a biased prompt.
    if tag == "turbo" and prompt is None:
        (common.WORK / "whisper_turbo_prompt.json").write_text(out.read_text())
    print(f"Whisper {tag}: {res.get('text', '')}", flush=True)
    return res


if __name__ == "__main__":
    parser = common.add_song_args(argparse.ArgumentParser(description=__doc__))
    parser.add_argument("--whisper-model", choices=MODELS, default="turbo")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    common.configure(args)
    run(args.whisper_model, force=args.force)
