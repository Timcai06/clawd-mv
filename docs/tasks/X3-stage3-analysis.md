# X3：阶段 3 完整分析（定稿歌）→ `data/audio.json`、`data/lyrics.json`

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x3-stage3`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/CONTEXT.md`、`docs/PLAN.md`（阶段 3）、`docs/STORYBOARD.md`（开头的结构表）、`docs/ENGINE.md` 的「Data」一节、`analysis/README.md`、`analysis/VALIDATION.md`。

歌已经定稿，Tim 不会再改：
- 母带：`audio/candidates/c1-works-on-my-machine.wav`（48 kHz / 16 位，160.6 秒，gitignored；worktree 里已经放好一份）
- 歌词：`lyrics/song.suno.txt` 是 Suno 实际唱的文本。显示版和它只差一个词：唱的是 `cash`，屏幕上显示 `cache`（见 `docs/TREATMENT.md` 的读音对照）
- 结构：`analysis/structures/clawd.json`

X1 的 `measure.py` 用它测过一次（报告在 `analysis/qa/c1/`，重跑即可再生成）：歌词吻合率 88%，12/12 段有起点。**但速度这件事它测不准。** 它按恒定速度拟合网格，得出 133.8 BPM，相位偏差最大 110 ms。C 用鼓轨复核：全局约 134.0 BPM，但 458 个鼓点里只有 157 个落在恒定网格 ±50 ms 以内，20–60 秒几乎对不上。所以**这首歌不能假设恒定速度**。

引擎读的是逐拍时间表（`beats[]`、`downbeats[]`），本来就支持速度变化。

## 要做的
1. **拍点和小节（最重要）**
   - 给出逐拍的时间表，**允许速度变化**。方法你定：可以是现成的拍点跟踪模型（能用 uv 装、权重来自可信来源），也可以在 X1 的基础上做局部速度拟合或动态规划。在报告里说明方法和原因。
   - 先搞清楚：这首歌是真的速度在变（在哪几段、变了多少），还是某些段落鼓型稀疏、导致测量失败？给出证据：逐段的局部 BPM 曲线，以及每一拍到最近鼓点起音的残差分布。
   - 定小节第 1 拍：可用的证据有主题词 commit 的重读音节、段落起点、和弦变化、低频能量等。给出置信度；小节相位有歧义的段落单独列出。
   - **回归要求**：同一套方法跑 pdoom，要得到和 `reference/pdoom/data/audio.json` 一致的恒定 132 BPM 网格（拍点误差报告最大值和中位数）。
2. **段落**：按 `clawd.json` 的锚点规则给出 `sections[]`。尾奏约 29 秒（131.8–160.6），140.3 秒附近有一声人声（Whisper 识别成「Bye」），在报告里说明它的实测起止。
3. **逐词对齐**：用 `align.py` 那套 CTC 强制对齐（先去掉 pdoom 的手工锚点，改成用 Whisper 的词时间做粗锚点），输出每个词的起止时间。`cash` 在 `lyrics.json` 里要写成显示版的 `cache`；读音映射写进 `pron.py` 的机制里。连字符词（`Tap-tap-tapping`）的处理方式在报告里说明。给出**置信度报告**：低置信度的词单独列出。
4. **包络和起音**：沿用上游的 `rms/low/mid/high/vocal/drums/bass/other` 包络（100 fps）和 `kick/snare/hat/vocal` 起音，格式和现有的 `data/audio.approx.json`、`reference/pdoom/data/audio.json` 一致。数据字段以引擎的读取代码为准（`app/src/engine/audio.ts`、`lyrics.ts`）。
5. **输出**：`data/audio.json`、`data/lyrics.json`（这两个文件要提交）；删除 `data/audio.approx.json`、`data/lyrics.approx.json`。
6. **引擎用真歌**：
   - 预览（`app/src/main.ts`）和导出（`app/scripts/render.ts`）现在读的是 `audio/song.mp3`。改成优先读 `audio/song.wav`，没有时回退到 `audio/song.mp3`。
   - `audio/song.wav` 是母带的一份拷贝，**不进 git**（把它加进 `.gitignore`）。占位的 `audio/song.mp3` 先保留，让没有母带的环境也能跑。
   - 导出时直接把 WAV 交给 ffmpeg 编码成 AAC。
7. **给 Tim 听的验收材料**（Tim 用耳朵判断，这是这一步最关键的验收）：生成 `out/x3/click-check.wav`，内容是母带叠加点击声：每拍一下，小节第 1 拍用更高的音。另外生成 `out/x3/click-check-hooks.wav`，只截取三遍副歌主题句前后各 4 小节。

## 验收（都不看画面）
1. 报告里给出：局部 BPM 曲线（逐段列表）、拍点残差统计、小节相位置信度、pdoom 回归结果。
2. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
3. 引擎用新数据能跑通：`cd app && bun scripts/render.ts video --from 20 --to 25 --preset veryfast --out ../out/x3/check.mp4`。报告帧数、时长，以及浏览器日志里的所有报错；这时不应该再有 `data/audio.json` 的 404。
4. `bun scripts/render.ts stills --t 5,30,90 --out ../out/x3/stills` 能跑通（只报告有没有报错，不看画面）。
5. X1 的测试 `python -m unittest discover -s analysis -p 'test_*.py'` 仍然通过；有新逻辑就补测试。

## 约束
- 可以改 `analysis/`、`data/`、`.gitignore`、`app/src/main.ts`、`app/scripts/render.ts`。其他地方不动。
- 不要修改 `reference/` 里的任何东西。
- 代码注释用英文，风格沿用上游。模型权重、分轨、中间文件都不要提交。
- 可以联网装依赖、下载模型。Whisper turbo 的权重在 `analysis/.cache/models/whisper-large-v3-turbo/`（mlx 格式，本地路径可以直接当 `path_or_hf_repo` 用），不要重新下载。uv 缓存设在 `analysis/.cache/uv`。
- 不截屏，不对画面和听感下结论。
- 小步提交到 `codex/x3-stage3`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、怎么跑（完整命令）、验收 1–5 的逐项结果和数值、给 Tim 听的两个文件的路径、已知问题。
