# X1：分析管线从 pdoom 解耦，并加上 Suno 候选测量工具

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x1-analysis`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/CONTEXT.md`、`docs/PLAN.md`，以及 `docs/TREATMENT.md` 的「结构」「Suno v6 怎么写」两节。

`analysis/` 是从上游 pdoom-video 拿来的，目前在本仓库**跑不起来**，而且写死了 pdoom 的参数：
- `common.py`：`AUDIO = audio/pdoom.mp3`（本仓库没有这个文件，原曲在 `reference/pdoom/audio/pdoom.mp3`）；`LYRICS_SRC = lyrics/lyrics.src.js`（本仓库没有，上游的在 `reference/pdoom/lyrics/lyrics.src.js`）；`STEMS` 路径里写死了 `pdoom`；`STEM_OFFSET_SAMPLES = 1015` 是对 pdoom 那一个 mp3 实测出来的常数。
- `analyze.py`：`SECTION_BARS` 是人工听出来的 pdoom 小节表；定小节相位用的是 pdoom 的鼓型（军鼓在 2、4 拍）和 2 小节一换的和弦。
- `whisper_run.py`：`initial_prompt` 是 pdoom 的词表。
- `align.py`：有 pdoom 的手工锚点。**这个任务不改 align.py 的对齐逻辑**（阶段 3 再做），只在它引用路径的地方跟着改，保证它不因为本任务而坏掉。

接下来 Tim 会从 Suno 下载 3 个左右的候选（mp3，放在 `audio/candidates/`，已 gitignore）。在那之前，我们要有一个工具能对每个候选给出客观数据，帮 Tim 挑。

## 要做的
1. **按歌参数化**。所有脚本接受一首歌的输入（mp3 路径 + 结构配置文件），产物按歌分目录，放在 `analysis/stems/<model>/<song_id>/`、`analysis/work/<song_id>/`、`analysis/qa/<song_id>/`。pdoom 当作一首普通的歌来跑，不再特殊对待。
2. **人声分轨的时间偏移按歌实测**：用分轨之和与 mp3 无缝解码做互相关，得到采样偏移，写进该歌的 work 目录，并在报告里打印出来。pdoom 的结果应该接近 1015 个采样（@44.1 kHz）；不是的话，报告实际值并分析原因。
3. **结构配置**：`analysis/structures/<song_id>.json`。本曲的配置 `clawd.json` 已由 C 写好（格式说明在它的 `_doc` 字段里）。你按同一格式写 `pdoom.json`，内容从上游的 `SECTION_BARS` 和 `reference/pdoom/lyrics/lyrics.src.js` 来。**可以扩展格式**（比如 pdoom 需要的字段），但要在 `_doc` 里说明，并保证 `clawd.json` 仍然有效；要改 `clawd.json` 的现有字段，先在报告里提出，不要直接改。
4. **段落边界锚定到歌词**：真歌的小节数一定和配置不同，所以段落起点 = 该段 `first_line` 被唱出的那一小节的强拍（规则沿用上游的注释：一行歌词如果以不到 2 拍的弱起开头，弱起留在上一段）。歌词行的时间来自 Whisper。`first_line` 为 null 的段接在上一段后面。
5. **小节相位（哪一拍是第 1 拍）不能依赖 pdoom 的鼓型**。要能在「电子流行、四踩底鼓」的歌上工作。可以用和弦变化、低频能量、段落起点的歌词锚点等组合，方法你定，但要在报告里说明，并给出置信度。
6. **新增 `analysis/measure.py`**：输入一首歌（mp3 + 结构配置），输出 `analysis/qa/<song_id>/measure.md` 和 `measure.json`，内容：
   - 时长
   - BPM，以及稳定性（每 15 秒一段的相位偏差或速度漂移，给出最大值）
   - 每个段落的实测起止时间和小节数，对照配置里的名义小节数
   - Whisper 转写和歌词的吻合率。歌词取结构配置里的 `lyrics` 文件，去掉 `[...]` 标签；统一小写、去掉标点、连字符拆成两个词；用词级序列对齐（比如 difflib）；吻合率 = 对上的歌词词数 ÷ 歌词总词数。同时列出没对上的词
   - **主题词落拍**：每一遍副歌里主题词（配置里的 `hook.word`）的重读音节，在人声分轨上找到它的起音，离「该段第 2 小节强拍」差多少毫秒、差多少拍
   - **编曲要点命中表**：配置里每段的 `expect`（鼓有没有、贝斯有没有、弱起小节贝斯停没停），用分轨包络实测，给出数值和「命中 / 未命中 / 不确定」。**这只是参考信息，不是通过或失败的门槛**
   - 一个汇总段落，写给不看代码的人
7. **用 pdoom 当标准答案来验证**（这是主要的验收）。对 `reference/pdoom/audio/pdoom.mp3` 跑 `measure.py`，结果要和已知事实一致：
   - BPM ≈ 132.0，速度恒定
   - 段落边界和 `reference/pdoom/data/audio.json` 的 `sections` 相差不超过 1 拍
   - 主歌 1（第 1–8 小节）没有鼓，鼓从第 9 小节开始
   - 第 12 小节第 2–4 拍贝斯降到接近 0
   - 第 49–51 小节鼓和贝斯都退出
   - 四遍副歌的「DOOM」落在下一小节强拍附近。预期偏差在 1/8 拍以内；如果不是，报告实际值并解释。**不要为了凑这些数去调参**，对不上就如实报告
8. **占位音轨冒烟测试**：对 `audio/song.mp3`（132 BPM 的点击音轨，没有人声）跑一遍，要能正常结束：BPM 报 132，吻合率报 0，不崩溃。

## 约束
- 只改 `analysis/`，另外可以新增 `analysis/README.md`。**不要碰 `app/`、`docs/`、`data/`、`lyrics/`**，也不要改 `reference/` 里的任何东西。
- 代码注释用英文，风格沿用上游。
- 模型权重、分轨、中间文件都不要提交（`.gitignore` 已覆盖 `analysis/.cache/`、`stems/`、`work/`、`qa/`）。
- 可以联网安装依赖、下载模型（PyPI、Hugging Face、torch hub）。用 `uv`，环境放在 `analysis/.venv`。
- 不截屏，不对图表下审美结论。`qa_plot.py` 之类的图可以生成，但你只报告数字。
- 小步提交到 `codex/x1-analysis`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 交付
最后一条消息给出：
1. 改了哪些文件，每个一句话
2. 怎么跑（完整命令）
3. pdoom 验收的逐项结果，附实际数值
4. 占位音轨的结果
5. 已知问题和没做的事
6. 各步耗时（Demucs、Whisper 等）
