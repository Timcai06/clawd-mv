"""Strict lyric match-rate and independent, order-preserving timing anchors."""
from difflib import SequenceMatcher
import re
import numpy as np
import common


def transcript_words(transcript):
    words = []
    for seg in transcript.get("segments", []):
        # Retain only word-level evidence; never invent times from segment text.
        for w in seg.get("words", []):
            for token in common.tokens(w["word"]):
                words.append(dict(token=token, start=float(w["start"]), end=float(w["end"]),
                                  probability=float(w.get("probability", 0)),
                                  source_word=w["word"], source_tokens=common.tokens(w["word"])))
    return words


def align_lyrics(transcript):
    lines = [text for _, _, text in common.load_lyrics_src()]
    observed = transcript_words(transcript)
    target = [token for line in lines for token in common.tokens(line)]
    heard = [w["token"] for w in observed]
    strict = SequenceMatcher(a=target, b=heard, autojunk=False)
    matched = {i + k for i, j, n in strict.get_matching_blocks() for k in range(n)}
    unmatched = [dict(index=i, word=word) for i, word in enumerate(target) if i not in matched]
    extra = []
    for op, a, b, c, d in strict.get_opcodes():
        if op != "equal":
            extra.extend(heard[c:d])
    report = dict(matched_words=len(matched), total_words=len(target),
                  match_rate=len(matched) / len(target) if target else 0.0,
                  unmatched_words=unmatched, unmatched_transcript_words=extra,
                  normalization="lowercase; strip bracket labels/punctuation; hyphens split; no aliases")
    # Aliases help locate lines but do not change the strict match metric.
    expanded, line_ids = [], []
    for li, text in enumerate(lines):
        for src, dst in common.CONFIG.get("lyric_aliases", {}).items():
            text = re.sub(re.escape(src), lambda _: dst, text, flags=re.IGNORECASE)
        ts = common.tokens(text)
        expanded.extend(ts)
        line_ids.extend([li] * len(ts))
    mapping = {}
    for i, j, n in SequenceMatcher(a=expanded, b=heard, autojunk=False).get_matching_blocks():
        mapping.update({i + k: j + k for k in range(n)})
    anchors = []
    for li, line in enumerate(lines):
        idx = [i for i, v in enumerate(line_ids) if v == li]
        pairs = [(i, mapping[i]) for i in idx if i in mapping]
        coverage = len(pairs) / len(idx) if idx else 0
        # A later matched word cannot establish the first word onset accurately.
        first = next((j for i, j in pairs if i == idx[0]), None) if idx else None
        anchors.append(dict(line_index=li, text=line, coverage=coverage,
                            start=observed[first]["start"] if first is not None and coverage >= .4 else None,
                            end=max((observed[j]["end"] for _, j in pairs), default=None),
                            word_indices=[j for _, j in pairs],
                            confidence="medium" if first is not None and coverage >= .4 else "unresolved"))
    return report, anchors, observed


def section_lines(anchors):
    """Repeated chorus lines are consumed in lyric-file order, not by timestamp."""
    out, cursor = [], 0
    for section in common.CONFIG["sections"]:
        line = section["first_line"]
        if line is None:
            out.append(None)
            continue
        target = common.tokens(line)
        match = next((a for a in anchors[cursor:] if common.tokens(a["text"]) == target), None)
        if match is None:
            raise ValueError(f"first_line not found in lyrics after line {cursor}: {line}")
        cursor = match["line_index"] + 1
        out.append(match)
    return out


def snap_section(t, first_downbeat, period, meter):
    """A pickup shorter than two beats belongs to the preceding section."""
    pos = (t - first_downbeat) / period
    bar = np.floor((pos + .12) / meter)
    within = pos - bar * meter
    if within > meter - 2:
        bar += 1
    return float(first_downbeat + bar * meter * period)


def sections_from_lyrics(anchors, grid, duration):
    mapped = section_lines(anchors)
    P, meter, off = grid["beat_period"], common.CONFIG["beats_per_bar"], grid["first_downbeat"]
    out = []
    for i, (section, anchor) in enumerate(zip(common.CONFIG["sections"], mapped)):
        start, source = None, "unresolved lyric anchor"
        if section["first_line"] is None:
            if i == 0:
                start = 0.0
            elif out[-1]["start"] is not None:
                # The first instrumental intro begins at time zero, before beat 1.
                base = off if i == 1 and out[0]["start"] == 0 else out[-1]["start"]
                start = base + out[-1]["nominal_bars"] * meter * P
            source = "nominal continuation (not lyric-measured)"
        elif anchor and anchor["start"] is not None:
            start = max(0., snap_section(anchor["start"], off, P, meter))
            source = "Whisper first word + bar grid"
        if start is not None and (start >= duration or (i and out[-1]["start"] is not None and start <= out[-1]["start"])):
            start, source = None, "unresolved: outside audio or non-increasing anchor"
        out.append(dict(name=section["name"], start=start, end=None, measured_bars=None,
                        nominal_bars=section["bars"], source=source,
                        lyric_start=anchor["start"] if anchor else None,
                        lyric_coverage=anchor["coverage"] if anchor else None))
    for i, section in enumerate(out):
        end = out[i + 1]["start"] if i + 1 < len(out) else duration
        if section["start"] is not None and end is not None and end > section["start"]:
            section["end"] = end
            first = off if i == 0 and section["source"].startswith("nominal") else section["start"]
            section["measured_bars"] = (end - first) / (meter * P)
    return out
