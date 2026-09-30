"""Measure a candidate: audio + structure -> qa/<song_id>/measure.{md,json}."""
import common
import argparse
import hashlib
from importlib.metadata import version
import json
import platform
import time
from analyze import run as analyze
from separate import run as separate
from whisper_run import run as whisper
from measurement import arrangement, hooks, envelope_metric, activity


def reference_checks(report, envelopes, path):
    """Post-measurement pdoom regression only; reference never enters inference."""
    ref = json.loads(path.read_text())
    P = ref["beat_period"]
    measured = {s["name"]: s for s in report["sections"]}
    boundaries = []
    for section in ref["sections"]:
        actual = measured.get(section["name"], {})
        for edge in ("start", "end"):
            value = actual.get(edge)
            delta = (value - section[edge]) / P if value is not None else None
            boundaries.append(dict(section=section["name"], edge=edge, reference=section[edge],
                measured=value, delta_beats=delta, within_one_beat=abs(delta) <= 1 if delta is not None else None))
    off = ref["downbeats"][0]
    probes = []
    for label, instrument, a, b, desired in [
        ("verse1 bars 1-8", "drums", off + 4 * P, off + 9 * 4 * P, "absent"),
        ("bar 9 entry", "drums", off + 9 * 4 * P, off + 10 * 4 * P, "present"),
        ("bar 12 beats 2-4", "bass", off + 12 * 4 * P + P, off + 13 * 4 * P, "absent"),
        ("bars 49-51", "drums", off + 49 * 4 * P, off + 52 * 4 * P, "absent"),
        ("bars 49-51", "bass", off + 49 * 4 * P, off + 52 * 4 * P, "absent")]:
        metric = envelope_metric(envelopes[instrument], a + .04, b - .04)
        probes.append(dict(label=label, instrument=instrument, start=a, end=b,
            **metric, expected=desired, detected=activity(metric), consistent=activity(metric) == desired))
    return dict(reference=str(path), bpm_error=report["bpm"] - ref["bpm"], boundaries=boundaries,
                max_boundary_error_beats=max((abs(x["delta_beats"]) for x in boundaries if x["delta_beats"] is not None), default=None),
                unresolved_boundaries=sum(x["delta_beats"] is None for x in boundaries),
                arrangement=probes,
                hooks=[dict(section=h["section"], delta_beats=h["delta_beats"],
                            within_eighth_beat=abs(h["delta_beats"]) <= .125 if h["delta_beats"] is not None else None)
                       for h in report["hooks"]])


def fmt(value, digits=3):
    return "未定位" if value is None else f"{value:.{digits}f}"


def write_markdown(r):
    match = r["lyric_match"]
    stable = r["stability"]
    unresolved = sum(s["start"] is None for s in r["sections"])
    hs = [h for h in r["hooks"] if h["delta_ms"] is not None]
    summary = (f"这首音轨长 {r['duration']:.2f} 秒，测得 {r['bpm']:.3f} BPM。"
               f"有足够起音证据的 15 秒窗口中，最大拍相位偏差 {fmt(stable['max_phase_deviation_ms'], 2)} ms；"
               f"歌词逐词吻合率 {match['match_rate']:.1%}（{match['matched_words']}/{match['total_words']}）。"
               f"{len(r['sections']) - unresolved}/{len(r['sections'])} 个段落有可报告的起点（含标明的名义推算）；"
               f"{len(hs)}/{len(r['hooks'])} 遍副歌找到主题音节估计。"
               f"小节相位置信度为 {r['bar_phase']['confidence']}。编曲表只供比较，听感和最终选曲由 Tim 判断。")
    r["summary"] = summary
    offset = r["stem_offset"]
    lines = [f"# {r['song_id']} 候选测量", "", summary, "", "## 时间基准与方法", "",
        f"- 时间零点：ffmpeg 无缝解码；分轨偏移 {offset['offset_samples']} samples @{offset['sample_rate']} Hz = {offset['offset_seconds'] * 1000:.3f} ms。正值表示需提前分轨。",
        f"- 互相关各窗口 lag：{[w['lag_samples'] for w in offset['windows']]}；相关系数：{[round(w['correlation'], 4) for w in offset['windows']]}。",
        f"- 小节相位：{r['bar_phase']['method']} 分差 {r['bar_phase']['score_margin']:.3f}，置信度是启发式等级，并非校准概率。",
        "- 段落由该段第一行首词的 Whisper 时间定位到小节。距下一强拍不足 2 拍的短弱起归上一段；null 行按前段名义长度接续。无法识别首词时不冒充实测。",
        "- 吻合率不使用读音别名或歌词提示。主题音节先从人声和 Whisper 词窗口估计，再和第 2 小节强拍比较；多音节及叠唱可能不确定。",
        "- 编曲按各分轨 95 分位 RMS 归一：<0.05 或绝对 RMS <-65 dBFS 为缺席，>0.15 为存在，中间不确定。窗口两端各去 40 ms，防止边缘瞬态影响。", "",
        "## 15 秒窗口稳定性", "", "| 时间(s) | 起音数 | 相位偏差(ms) | 局部 BPM | BPM 漂移 |", "|---|---:|---:|---:|---:|"]
    for w in stable["windows"]:
        lines.append(f"| {w['start']:.0f}–{w['end']:.1f} | {w['observations']} | {fmt(w['phase_deviation_ms'])} | {fmt(w['bpm'])} | {fmt(w['bpm_drift'])} |")
    lines += ["", f"最大绝对 BPM 漂移：{fmt(stable['max_bpm_drift'])}。未定位窗口不算稳定通过。", "",
              "## 段落", "", "| 段落 | 起点(s) | 终点(s) | 实测小节 | 名义小节 | 来源 |", "|---|---:|---:|---:|---:|---|"]
    for s in r["sections"]:
        lines.append(f"| {s['name']} | {fmt(s['start'])} | {fmt(s['end'])} | {fmt(s['measured_bars'])} | {s['nominal_bars']} | {s['source']} |")
    lines += ["", "## 歌词", "", f"吻合率 {match['match_rate']:.2%}。未对上的歌词词（保留重复）：", "", ", ".join(w["word"] for w in match["unmatched_words"]) or "无", "",
              "Whisper 转写：", "", r["transcript"].replace("\n", " ") or "（空）", "", "## 主题词落拍", "",
              "| 副歌 | 起音(s) | 第2小节强拍(s) | 偏差(ms) | 偏差(拍) | 置信度 |", "|---|---:|---:|---:|---:|---|"]
    for h in r["hooks"]:
        lines.append(f"| {h['section']} | {fmt(h['onset'])} | {fmt(h['target'])} | {fmt(h['delta_ms'])} | {fmt(h['delta_beats'])} | {h['confidence']} |")
        if h.get("reason"):
            lines.append(f"\n{h['section']}：{h['reason']}\n")
    lines += ["", "## 编曲要点（参考项）", "", "| 段落 | 分轨 | 期望 | 相对 RMS | 相对 dB | 结论 |", "|---|---|---|---:|---:|---|"]
    for a in r["arrangement"]:
        lines.append(f"| {a['section']} | {a['instrument']} | {a['expect']} | {fmt(a['mean_relative'])} | {fmt(a['relative_db'])} | {a['status']} |")
    if "reference_validation" in r:
        v = r["reference_validation"]
        lines += ["", "## pdoom 独立回归比较", "", f"BPM 与参考差 {v['bpm_error']:.4f}；已定位边界最大误差 {fmt(v['max_boundary_error_beats'])} 拍；{v['unresolved_boundaries']} 个边界未定位。", "",
                  "| 段落边缘 | 参考(s) | 实测(s) | 偏差(拍) | ≤1拍 |", "|---|---:|---:|---:|---|"]
        for b in v["boundaries"]:
            lines.append(f"| {b['section']}.{b['edge']} | {b['reference']:.3f} | {fmt(b['measured'])} | {fmt(b['delta_beats'])} | {b['within_one_beat']} |")
        lines += ["", "参考小节窗口的独立分轨探针（上游使用从 0 开始的小节编号）：", ""]
        for a in v["arrangement"]:
            lines.append(f"- {a['label']} / {a['instrument']}：相对 RMS {fmt(a['mean_relative'])}，{fmt(a['relative_db'])} dB，{a['detected']}。")
        if offset["offset_samples"] != 1015:
            lines += ["", "偏移与上游 1015 samples 不同：上游常数针对未裁掉编码器延迟的旧解码产物；本次使用当前 Demucs 解码器生成新分轨。以多窗口互相关实测为准，不补造延迟。解码器版本见 JSON provenance。"]
    lines += ["", "## 耗时和复现", "", "```json", json.dumps(r["timings"], indent=2, ensure_ascii=False), "```", "",
              "缓存命中时保留首次产物计算耗时；本次 wall time 单独记录。模型和环境版本、SHA256、所有数值详见 measure.json。", ""]
    (common.QA / "measure.md").write_text("\n".join(lines))


def main():
    parser = common.add_song_args(argparse.ArgumentParser(description=__doc__))
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--whisper-model", choices=("turbo", "large"), default="turbo")
    parser.add_argument("--force", action="store_true", help="Recompute separation and transcription")
    parser.add_argument("--reference-audio-json", type=common.Path, help="Optional post-measurement pdoom regression")
    args = parser.parse_args()
    common.configure(args)
    start = time.perf_counter()
    sep = separate(args.device, args.force)
    transcript = whisper(args.whisper_model, force=args.force)
    evidence, stems, envelopes = analyze(transcript)
    metrics_start = time.perf_counter()
    report = dict(schema_version=1, song_id=common.SONG_ID, audio=str(common.AUDIO),
                  duration=evidence["duration"], **evidence["grid"], sections=evidence["sections"],
                  lyric_match=evidence["lyric_match"], transcript=transcript.get("text", ""),
                  lyric_anchors=evidence["lyric_anchors"],
                  stem_offset=json.loads((common.WORK / "stem_offset.json").read_text()),
                  hooks=hooks(evidence, stems["vocals"], 44100), arrangement=arrangement(evidence, envelopes),
                  provenance=dict(structure_sha256=hashlib.sha256(common.STRUCTURE.read_bytes()).hexdigest(),
                      lyrics_sha256=hashlib.sha256(common.LYRICS_SRC.read_bytes()).hexdigest(),
                      source=json.loads((common.WORK / "source.json").read_text()), python=platform.python_version(),
                      packages={p: version(p) for p in ("demucs", "torch", "torchaudio", "librosa", "mlx-whisper")},
                      whisper=transcript["measurement"]))
    if args.reference_audio_json:
        report["reference_validation"] = reference_checks(report, envelopes, args.reference_audio_json)
    report["timings"] = dict(separation=sep, whisper_seconds=transcript["measurement"]["seconds"],
         rhythm_and_envelopes_seconds=evidence["analysis_seconds"], metrics_seconds=time.perf_counter() - metrics_start,
         this_run_wall_seconds=time.perf_counter() - start)
    write_markdown(report)
    (common.QA / "measure.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    print(report["summary"])
    print(f"Wrote {common.QA / 'measure.md'}")
    return report


if __name__ == "__main__":
    main()
