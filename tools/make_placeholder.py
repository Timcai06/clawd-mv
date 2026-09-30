"""Placeholder song + data so the engine runs before the real Suno track exists.

Writes audio/song.mp3 (a 120 s click track at 132 BPM, higher pitch on downbeats),
data/audio.approx.json and data/lyrics.approx.json. The *.approx.json names are the
engine's fallbacks: once stage 3 writes data/audio.json and data/lyrics.json they win.
Delete audio/song.mp3 and these two files when the real song lands.

Run:  python3 tools/make_placeholder.py
"""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
BPM, DUR, OFF = 132.0, 120.0, 0.25
BP = 60.0 / BPM

beats = [round(OFF + i * BP, 4) for i in range(int((DUR - OFF) / BP) + 1)]
downbeats = beats[::4]
sections = [{"name": "placeholder", "start": 0.0, "end": DUR}]
audio = {
    "duration": DUR, "bpm": BPM, "fps": 100, "time_signature": 4,
    "beats": beats, "downbeats": downbeats, "sections": sections,
    "features": {}, "onsets": {"kick": [[b, 1.0] for b in downbeats]},
}
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data/audio.approx.json").write_text(json.dumps(audio))

# one dummy line every 4 bars, one word per beat
text = ["hello from the placeholder", "clawd is writing code", "tests are running now", "ship it on the beat"]
lines = []
for k, bar in enumerate(range(2, len(downbeats) - 4, 4)):
    words = text[k % len(text)].split()
    t0 = downbeats[bar]
    ws = [{"w": w, "start": round(t0 + i * BP, 4), "end": round(t0 + (i + 0.8) * BP, 4)} for i, w in enumerate(words)]
    lines.append({"text": " ".join(words), "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws})
(ROOT / "data/lyrics.approx.json").write_text(json.dumps({"lines": lines}, indent=1))

# click track: 1320 Hz on downbeats, 880 Hz on other beats, 40 ms decay
expr = (f"if(gte(t,{OFF}),sin(2*PI*if(lt(mod(t-{OFF},{4*BP}),{BP}),1320,880)*t)"
        f"*exp(-60*mod(t-{OFF},{BP})),0)*0.5")
(ROOT / "audio").mkdir(exist_ok=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{expr}':s=44100:d={DUR}",
                "-ac", "2", "-b:a", "192k", str(ROOT / "audio/song.mp3")], check=True)
print(f"{len(beats)} beats, {len(downbeats)} bars, {len(lines)} lyric lines")
