# 按歌分析与候选测量

从仓库根目录运行。环境、模型缓存和临时文件均放在 `analysis/`。Whisper 使用 MLX，需要 Apple Silicon 的 Metal 访问权限；无 GPU 权限的沙箱需放行本地计算。Demucs 默认 CPU。

## X3 定稿数据

`stage3.py` 复用已有分轨，生成允许变速的逐拍网格、Whisper 粗锚点约束的双模型 CTC 对齐、正式数据和点击验收音轨。实测结果与限制见 [X3_REPORT.md](X3_REPORT.md)。以下命令在 **clawd-mv-x3 根目录**执行；全部模型、临时文件和缓存留在当前 worktree。Whisper 优先使用 `analysis/.cache/models/whisper-large-v3-turbo/`，不会重新下载这份本地权重。CTC 使用 torchaudio 官方 MMS_FA、LV60K 权重，首次缺失时下载至本地 torch 缓存。

```sh
cd /Users/tim/DEV/clawd-mv-x3
export UV_CACHE_DIR="$PWD/analysis/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$PWD/analysis/.cache/python"
export TMPDIR="$PWD/analysis/.cache/tmp"
export XDG_CACHE_HOME="$PWD/analysis/.cache/xdg"

rtk proxy uv sync --project analysis
for stage in prepare transcribe beats align deliver; do
  rtk proxy uv run --project analysis python analysis/stage3.py \
    --audio audio/candidates/c1-works-on-my-machine.wav \
    --structure analysis/structures/clawd.json --song-id c1 \
    --stage "$stage" --extra-vocal-near 140.3
done

rtk proxy uv run --project analysis python analysis/stage3.py \
  --audio reference/pdoom/audio/pdoom.mp3 \
  --structure analysis/structures/pdoom.json --song-id pdoom --stage prepare
rtk proxy uv run --project analysis python analysis/stage3.py \
  --audio reference/pdoom/audio/pdoom.mp3 \
  --structure analysis/structures/pdoom.json --song-id pdoom --stage regression \
  --reference-audio-json reference/pdoom/data/audio.json

rtk proxy uv run --project analysis python analysis/verify_x3.py
```

`verify_x3.py` 运行全部 Python 测试、TypeScript 检查、20–25 秒视频、5/30/90 秒静帧，以及浏览器预览的 WAV/MP3 回退检查。它使用单独的 Vite 服务，避免连接到其他 worktree 的预览；日志和 ffprobe 数据在 `out/x3/`，不截图、不审图、不播放音频。浏览器和 CTC 的 Metal 计算需要本机 GPU 权限。

主要中间证据在 `analysis/work/c1/{beats,align_debug,stage3}.json`，pdoom 回归在 `analysis/work/pdoom/regression.json`。`beats.json` 含逐拍残差、8 秒窗口原始 kick 局部拟合、恒速对照；`align_debug.json` 含所有低置信度词及原因。有效 Whisper/CTC 缓存可以复用；CTC 缓存会检查帧数、可读性和有限值，未写完的文件重新计算。最终的 `bpm` 仅是中位数，动画必须使用 `beats[]/downbeats[]`。

`deliver` 会写入 `data/audio.json`、`data/lyrics.json`、本地 `audio/song.wav`，删除两个 `.approx.json`，并输出 `out/x3/click-check.wav` 与 `out/x3/click-check-hooks.wav`。小节相位和歌词置信度均为启发式，不代替 Tim 的听感验收。

## X1 候选测量

```sh
cd /Users/tim/DEV/clawd-mv-x1
export UV_CACHE_DIR="$PWD/analysis/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$PWD/analysis/.cache/python"
uv sync --project analysis

uv run --project analysis python analysis/measure.py \
  --audio reference/pdoom/audio/pdoom.mp3 \
  --structure analysis/structures/pdoom.json \
  --reference-audio-json reference/pdoom/data/audio.json

uv run --project analysis python analysis/measure.py \
  --audio audio/song.mp3 --structure analysis/structures/clawd.json \
  --song-id placeholder

# Replace take-01.mp3 with an actual downloaded candidate.
uv run --project analysis python analysis/measure.py \
  --audio audio/candidates/take-01.mp3 \
  --structure analysis/structures/clawd.json --song-id clawd-take-01

uv run --project analysis python -m unittest discover \
  -s analysis -p 'test_*.py' -v
```

输出目录（均已 gitignore）：

- `stems/<model>/<song_id>/{vocals,drums,bass,other}.wav`：原始分轨。
- `work/<song_id>/stem_offset.json`：五窗口互相关；正偏移裁前部，负偏移补零。
- `work/<song_id>/whisper_turbo.json`：无提示转写，用于吻合率；`whisper_turbo_prompt.json`：分窗词表转写；`whisper_turbo_context.json`：连续上下文词表转写。两份辅助转写只用于定位，前者保留原有 CTC 交叉核对路径。
- `work/<song_id>/analysis.json`：拍网格、相位候选、歌词定位证据。
- `work/<song_id>/data/audio.json`：上游字段的拍点、分段、100 fps 包络；未定位段落含 null，尚不可直接交付前端。
- `qa/<song_id>/measure.md`、`measure.json`：中文报告和完整结构化证据。

`--song-id` 默认音频文件名（去扩展名）。同一结构配置可以测多个候选。已有 ID 若对应不同音频 SHA256 或模型会报错，需换 ID，避免误用缓存。`--force` 重新分轨和转写；普通重跑复用这两个步骤，重新计算节拍与报告。

## 结构格式

`structures/clawd.json` 保持原样。`lyrics` 相对于仓库根目录，可以是普通文本（去掉 `[...]` 标签），或上游 JS `[start,end,text]` 数组；测量不使用 JS 中的旧时间。

`sections` 顺序须与歌词一致，`first_line` 对应歌词完整一行。重复行按文件顺序消费。起点由 Whisper 首词定位到小节强拍；不足 2 拍的弱起留在上一段。同一首词有多路时间候选时，按覆盖率排序，并剔除会使段落倒序或零长度的候选；没有有效首词证据时标未定位。`first_line: null` 接在前段**名义长度**之后，报告写为推算。末段使用实际音轨结束时间，可能包含渐弱和不完整小节。

仅 `pdoom.json` 增加扩展字段，并在 `_doc` 说明：

- `lyric_aliases`：显示词到读音词的映射，只用于定位，不参与吻合率。
- `hook.spoken_form`：例如 `pee doom`，帮助识别独立重读词。
- `hook.stressed_syllable` 从 1 开始编号；段名含 `chorus` 的段落做主题词测量，目标是段内第 2 小节强拍。

`expect` 支持 `drums` / `bass` 的 `present`、`absent`、`stop_in_pickup_bar`（第 1 小节第 2–4 拍），以及 `stop_bar: last`（末小节鼓、贝斯退出）。未知期望标不确定。“命中”只是参考，不是选曲门槛。

## 方法和边界

节拍用混音、鼓的 spectral flux 搜索常速网格，再以低频起音拟合速度和相位。搜索范围为名义 BPM 的 0.70–1.40 倍，帮助消除半速/倍速歧义，不适合远离名义速度的音乐。15 秒窗口报告相位偏差、局部 BPM 和最大漂移，无足够起音的窗口保持未定位。

小节相位综合每拍和声变化、贝斯起音能量、非副歌歌词起点，不要求军鼓在 2/4 拍，不规定两小节换和弦。分数差是启发式置信度，不是概率。主题词预期落点不参与相位推断。

歌词用 `SequenceMatcher(autojunk=False)`：小写、去标点、连字符拆词，只计完全匹配；报告所有未匹配词并保留重复。用于评分的 Whisper 不注入提示。定位另运行分窗和连续上下文两遍，从歌词自动提取大写词、长词及 hook 词表（不包含手工时间）。分窗以 20 秒为核心、两侧各加 3 秒上下文，防止 initial_prompt 在后续窗口被重置；连续上下文补充重复主题句。逐行选择首词可定位且覆盖率最高的来源，主题词候选只取歌词序列已对应的词，优先独立音节词和较高识别概率。三路转写、提示和逐行来源都保留，不改变无提示评分；辅助转写可能出现重复或漏词，低置信度不能算听感验收。人声 RMS 小于 -60 dBFS 时返回空转写；否则运行模型并使用静音、幻觉过滤。

主题词起音在人声和 Whisper 词窗口中找 spectral flux 峰；词内第 2 音节用相邻平滑能量核之间谷值之后的 20% 上升点估计。算法不看期望落点，也不能保证把每个振幅峰正确解释成音节。叠唱、连唱、漏词会降低置信度或返回 null，需后续精细语音对齐和听感验收。

编曲按原始分轨 RMS 除以该分轨全曲 95 分位 RMS：<0.05 缺席、>0.15 存在，中间不确定；绝对 RMS <-65 dBFS 也判缺席。窗口两端各去 40 ms。JSON 保留窗口、数值和状态。

`--reference-audio-json` 仅在测量之后做 pdoom 回归比较。参考答案不进入拟合，不用于修正结果；脚本不读取参考 `lyrics.json`。

## 原有 CTC 工具

`align.py`、`ctc_emissions.py`、`vocal_feats.py`、`pron.py`、`zoom.py` 也接受 `--audio`、`--structure`、可选 `--song-id`、`--model`。例如：

```sh
uv run --project analysis python analysis/vocal_feats.py \
  --audio reference/pdoom/audio/pdoom.mp3 --structure analysis/structures/pdoom.json
uv run --project analysis python analysis/ctc_emissions.py \
  --audio reference/pdoom/audio/pdoom.mp3 --structure analysis/structures/pdoom.json vocals vocL vocR
uv run --project analysis python analysis/align.py \
  --audio reference/pdoom/audio/pdoom.mp3 --structure analysis/structures/pdoom.json
```

X3 的 `align.py` 只需 mono vocal 的 MMS/LV60K emissions、vocal features 和 Whisper 转写，不依赖 karaoke lead 或 pdoom 手工锚点。`stage3.py --stage align` 会准备前两项；先运行 `transcribe`。连字符词拆成读音子词，再合回显示词的 `syl`；`cache` 按 `cash` 对齐。`ctcalign.py` 的帧数随音源变化。单独运行 `align.py` 仍只写该歌的 `work/.../data/lyrics.json`，正式文件由 `deliver` 写入。

`make_fonts.py` 是字体工具，不属于按歌分析，未运行。`qa_plot.py` 是绘图辅助模块。本任务不截屏、不审图、不评价听感。
