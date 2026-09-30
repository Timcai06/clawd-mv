"""Whisper word timestamps on aligned vocals; no lyric prompt biases the score."""
import common
import argparse
import json
import re
import time
import numpy as np
import soundfile as sf

MODELS = {"turbo": "mlx-community/whisper-large-v3-turbo",
          "large": "mlx-community/whisper-large-v3-mlx"}


def vocabulary_prompt():
    """Song-derived vocabulary only; this pass is never used for match-rate."""
    stop = {"the", "your", "there", "now", "with", "and", "from", "just", "too",
            "till", "was", "what", "one", "see", "but", "this", "that", "every"}
    terms = []
    for _, _, line in common.load_lyrics_src():
        for word in line.split():
            clean = word.strip(',.!?;:"“”')
            norm = common.tokens(clean)
            if not norm or norm[0] in stop:
                continue
            if (re.search(r"[A-Z]", clean) and len(clean) >= 3) or len(clean) >= 8:
                if clean not in terms:
                    terms.append(clean)
    hook = common.CONFIG.get("hook", {})
    terms.extend([hook[k] for k in ("word", "spoken_form") if hook.get(k)])
    return "Song vocabulary: " + ", ".join(terms[:100])


def run_pair(tag="turbo", force=False):
    raw = run(tag, force=force)
    if raw["measurement"]["skip_reason"]:
        return raw, []
    guided = run(tag + "_prompt", model=MODELS[tag], prompt=vocabulary_prompt(), force=force)
    contextual = run(tag + "_context", model=MODELS[tag], prompt=vocabulary_prompt(), force=force,
                     context=True)
    return raw, [guided, contextual]


def transcribe_guided(y, sr, model, prompt):
    """Refresh vocabulary in overlapping windows; mlx resets initial_prompt."""
    import mlx_whisper
    segments = []
    for core in range(0, len(y), 20 * sr):
        a, b = max(0, core - 3 * sr), min(len(y), core + 23 * sr)
        result = mlx_whisper.transcribe(y[a:b], path_or_hf_repo=model, language="en",
            word_timestamps=True, condition_on_previous_text=False, initial_prompt=prompt,
            temperature=(0.0, .2, .4), no_speech_threshold=.6, hallucination_silence_threshold=2.0)
        words = []
        for segment in result["segments"]:
            for word in segment.get("words", []):
                word = {**word, "start": word["start"] + a / sr, "end": word["end"] + a / sr}
                if core / sr <= (word["start"] + word["end"]) / 2 < min(len(y), core + 20 * sr) / sr:
                    words.append(word)
        if words:
            segments.append(dict(start=words[0]["start"], end=words[-1]["end"], words=words,
                                 text="".join(w["word"] for w in words)))
    return dict(text=" ".join(s["text"] for s in segments), segments=segments, language="en")


def run(tag="turbo", model=None, prompt=None, force=False, context=False):
    model = model or MODELS[tag]
    out = common.WORK / f"whisper_{tag}.json"
    provenance = {"model": model, "prompt": prompt, "source": "aligned_demucs_vocals", "version": 3 if prompt else 1}
    if context:
        provenance["context"] = True
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
        if prompt:
            import mlx.core as mx
            mx.random.seed(0)
            if context:
                res = mlx_whisper.transcribe(str(common.WORK / "vocals16k.wav"),
                    path_or_hf_repo=model, language="en", word_timestamps=True,
                    condition_on_previous_text=True, initial_prompt=prompt, temperature=(0., .2, .4),
                    no_speech_threshold=.6, hallucination_silence_threshold=2.)
            else:
                res = transcribe_guided(y, sr, model, prompt)
        else:
            res = mlx_whisper.transcribe(str(common.WORK / "vocals16k.wav"),
                path_or_hf_repo=model, language="en", word_timestamps=True,
                condition_on_previous_text=False, initial_prompt=None, temperature=0.0,
                no_speech_threshold=.6, hallucination_silence_threshold=2.0)
        reason = None
    repo_cache = common.CACHE / "hf" / "hub" / ("models--" + model.replace("/", "--"))
    revision_file = repo_cache / "refs" / "main"
    revision = revision_file.read_text().strip() if revision_file.exists() else None
    res["measurement"] = dict(seconds=time.perf_counter() - start, vocal_rms_dbfs=rms_db,
                              skip_reason=reason, provenance=provenance, model_revision=revision)
    out.write_text(json.dumps(res, indent=1, default=float) + "\n")
    print(f"Whisper {tag}: {res.get('text', '')}", flush=True)
    return res


if __name__ == "__main__":
    parser = common.add_song_args(argparse.ArgumentParser(description=__doc__))
    parser.add_argument("--whisper-model", choices=MODELS, default="turbo")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    common.configure(args)
    run_pair(args.whisper_model, force=args.force)
