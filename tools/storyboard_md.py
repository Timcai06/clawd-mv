"""Render storyboard/shots.json into the shot tables of docs/STORYBOARD.md.

The JSON is the source of truth; everything between the two GENERATED markers in
docs/STORYBOARD.md is rewritten. Run:  python3 tools/storyboard_md.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "storyboard/shots.json"
DOC = ROOT / "docs/STORYBOARD.md"
BEGIN, END = "<!-- GENERATED:shots -->", "<!-- /GENERATED:shots -->"


def anchor_text(a):
    if not a.get("word"):
        return "（器乐）" + {"downbeat": "强拍", "beat": "拍", "none": ""}.get(a.get("snap", ""), "")
    s = a["word"]
    if a.get("sub"):
        s += f"（第 {a['sub']} 次）"
    if a.get("occ", 1) > 1:
        s += f" · 该句第 {a['occ']} 遍"
    return s


def main():
    d = json.loads(SRC.read_text(encoding="utf-8"))
    shots, scenes = d["shots"], d["scenes"]
    ends = [s["t"] for s in shots[1:]] + [d["song"]["duration"]]
    out = [f"共 {len(scenes)} 个场景、{len(shots)} 个镜头。时间是近似值（s），实际以锚点词为准。", ""]
    for sc in scenes:
        mine = [(s, e) for s, e in zip(shots, ends) if s["scene"] == sc["id"]]
        if not mine:
            continue
        t0, t1 = mine[0][0]["t"], mine[-1][1]
        out += [f"### {sc['id']} {sc['name']}（{t0:.1f}–{t1:.1f}，{len(mine)} 个镜头）", "",
                f"布景：{sc['set']}", "",
                "| 镜头 | 约 | 时长 | 锚点 | 画面 | Clawd | 镜头运动 |", "|---|---|---|---|---|---|---|"]
        for s, e in mine:
            out.append(f"| {s['id']} | {s['t']:.1f} | {e - s['t']:.1f} | {anchor_text(s['anchor'])} | "
                       f"{s['visual']} | {s.get('clawd') or '—'} | {s['camera']} |")
        out.append("")
    body = "\n".join(out)
    doc = DOC.read_text(encoding="utf-8")
    a, b = doc.index(BEGIN) + len(BEGIN), doc.index(END)
    DOC.write_text(doc[:a] + "\n" + body + "\n" + doc[b:], encoding="utf-8")
    print(f"{len(scenes)} scenes, {len(shots)} shots -> {DOC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
