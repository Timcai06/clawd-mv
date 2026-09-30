"""Per-song paths and cache setup. Import before any ML libraries."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
CACHE = ROOT / ".cache"
for var, sub in [("TORCH_HOME", "torch"), ("HF_HOME", "hf"), ("HF_HUB_CACHE", "hf/hub"),
                 ("XDG_CACHE_HOME", "xdg"), ("HUGGINGFACE_HUB_CACHE", "hf/hub"),
                 ("TRANSFORMERS_CACHE", "hf/transformers"), ("MPLCONFIGDIR", "mpl"),
                 ("NUMBA_CACHE_DIR", "numba"), ("UV_CACHE_DIR", "uv"), ("TMPDIR", "tmp")]:
    os.environ[var] = str(CACHE / sub)
    (CACHE / sub).mkdir(parents=True, exist_ok=True)

STEM_NAMES = ("vocals", "drums", "bass", "other")


def add_song_args(parser):
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--structure", required=True, type=Path)
    parser.add_argument("--song-id", help="Output directory ID; defaults to the audio filename stem")
    parser.add_argument("--model", default="htdemucs_ft", help="Demucs model")
    return parser


def configure(args):
    global AUDIO, STRUCTURE, CONFIG, SONG_ID, MODEL, STEMS, LYRICS_SRC, WORK, QA, DATA, KARAOKE
    AUDIO = args.audio.resolve()
    STRUCTURE = args.structure.resolve()
    CONFIG = json.loads(STRUCTURE.read_text())
    SONG_ID = args.song_id or AUDIO.stem
    MODEL = args.model
    for value in (SONG_ID, MODEL):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", value):
            raise ValueError("song-id/model must be a safe directory name")
    if not AUDIO.is_file():
        raise FileNotFoundError(AUDIO)
    if CONFIG.get("beats_per_bar", 4) < 2 or CONFIG["bpm"] <= 0:
        raise ValueError("Invalid meter or nominal BPM")
    names = [s["name"] for s in CONFIG["sections"]]
    if len(set(names)) != len(names) or any(s["bars"] <= 0 for s in CONFIG["sections"]):
        raise ValueError("Sections need unique names and positive nominal bar counts")
    LYRICS_SRC = PROJECT / CONFIG["lyrics"]
    if not LYRICS_SRC.is_file():
        raise FileNotFoundError(LYRICS_SRC)
    STEMS = ROOT / "stems" / MODEL / SONG_ID
    WORK, QA = ROOT / "work" / SONG_ID, ROOT / "qa" / SONG_ID
    DATA, KARAOKE = WORK / "data", ROOT / "stems" / "karaoke" / SONG_ID
    for path in (WORK, QA, DATA):
        path.mkdir(parents=True, exist_ok=True)
    source = {"audio_sha256": hashlib.sha256(AUDIO.read_bytes()).hexdigest(), "model": MODEL}
    manifest = WORK / "source.json"
    if manifest.exists() and json.loads(manifest.read_text()) != source:
        raise ValueError("This song-id belongs to different audio/model. Use a new --song-id.")
    manifest.write_text(json.dumps(source, indent=2) + "\n")
    return CONFIG


def configure_cli():
    """Consume shared flags, leaving legacy script-specific arguments intact."""
    parser = add_song_args(argparse.ArgumentParser(add_help=False))
    args, rest = parser.parse_known_args()
    configure(args)
    sys.argv[1:] = rest


def load_lyrics_src():
    """Read upstream JS tuples or plain lyrics with bracketed labels removed."""
    src = LYRICS_SRC.read_text(encoding="utf-8")
    if LYRICS_SRC.suffix == ".js":
        return [tuple(x) for x in json.loads(src[src.index("["):src.rindex("]") + 1])]
    text = re.sub(r"\[[^\]]*\]", "", src)
    return [(None, None, line.strip()) for line in text.splitlines() if line.strip()]


def tokens(text):
    """Lowercase, split hyphens, remove punctuation (keep contractions whole)."""
    text = re.sub(r"[-‐‑–—]", " ", text.lower())
    return "".join(c for c in text if c.isalnum() or c.isspace()).split()


def load_mix(sr=44100, mono=True):
    """Explicit ffmpeg gapless decode; this defines time zero for every output."""
    import numpy as np
    import subprocess
    channels = 1 if mono else 2
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(AUDIO),
                                   "-f", "f32le", "-ac", str(channels), "-ar", str(sr), "pipe:1"])
    y = np.frombuffer(raw, dtype="<f4")
    return (y if mono else y.reshape(-1, channels).T), sr


def load_stem(name, sr=None, mono=True):
    """Apply the measured offset, including padding for a negative lag."""
    import numpy as np
    import soundfile as sf
    y, s = sf.read(STEMS / f"{name}.wav", dtype="float32", always_2d=True)
    offset = json.loads((WORK / "stem_offset.json").read_text())
    if s != offset["sample_rate"]:
        raise ValueError("Stem sample rate differs from measured offset")
    lag = offset["offset_samples"]
    y = y[lag:] if lag >= 0 else np.pad(y, ((-lag, 0), (0, 0)))
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


def load_lead(sr=None, mono=True):
    """Optional karaoke lead, already in gapless time (legacy CTC workflow)."""
    import soundfile as sf
    import numpy as np
    y, s = sf.read(KARAOKE / "lead.wav", dtype="float32", always_2d=True)
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


def load_vocal_source(name, sr=None):
    if name == "lead":
        return load_lead(sr)
    if name in ("vocL", "vocR"):
        y, s = load_stem("vocals", sr=sr, mono=False)
        return y[0 if name == "vocL" else 1], s
    return load_stem("vocals", sr=sr)
