# X8：歌词排版层和片尾字幕

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x8-lyrics`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/ARCHITECTURE.md`、`docs/TREATMENT.md` 的「视觉规范」和歌词表、`docs/STORYBOARD.md`、`docs/ENGINE.md` 的 Data 和 Typography 两节、`app/src/theme.ts`、`app/src/kit/time.ts`、`app/src/engine/lyrics.ts`。组件写法照 `app/src/kit/` 里已有的组件（X5–X7）。

歌已定稿，`data/lyrics.json` 是真实的逐词对齐数据（带 `syl` 音节时间的词，比如 `commit`）；`audio/song.wav` 是母带（gitignored，worktree 里已放好）。整片分镜在 `storyboard/shots.json`。

## 要做的
1. **歌词排版层** `kit/lyrics-type.ts`。两种样式，都是纯绘制函数 + 一个从 `(Lyrics, t)` 算出 state 的函数（state 构造函数可以读歌词和时间，绘制函数不行）：
   - **小字行**：当前这句歌词用等宽小字（`F.mono`），对齐到网格。逐词卡拉 OK：已唱的词 `ink`，未唱的词 `ink` 的 30%，正在唱的词用 `Lyrics.wordProgress` 做从左到右的擦除（参考 ENGINE.md 的 `glyphX`，词分段绘制时不能丢字距）。一句唱完后保持到下一句开始前约半拍再消失。
   - **主题句大字**：用于「I need one more commit」「I need one last commit」。超大粗体（`F.archivo`，字重 900，全大写），可以被画框裁切。弱起的词（I need one more / last）以较小字号逐词出现；**COMMIT 在第二个音节（`syl[1]` 的开始时间）重重落下**：从更大缩到原尺寸、带一次很短的过冲，时间只取决于 t。这是全片最重要的排版时刻，按 Tim 的决定，冲击点就是实际唱出的重音，不吸附到小节第一拍。
   - 配色只用 token；`clay` 只给主题词 COMMIT 用。
   - 引用弯引号（`smart()`）规则见 ENGINE.md 的 Typography 一节。
2. **片尾字幕** `kit/credits.ts`：state 给出每行的显示进度。先放这些文案（Tim 会改）：
   - 标题：`Works on My Machine`
   - `A song about Clawd's day`
   - `Music generated with Suno · lyrics & prompt by Tim`
   - `Every frame drawn by code — three.js, rendered frame by frame`
   - `Made with Claude Code & Codex`
   - `Clawd is Anthropic's Claude Code mascot · fan work, non-commercial`
3. **陈列页**：
   - `scenes/gallery-lyrics.ts`：**整首歌从头到尾**，按真实的 `data/lyrics.json` 显示小字行；主题句那几句换成大字样式。画面上同时显示当前的小节号和拍号。这个陈列页的用途是让 Tim 对着真歌检查卡拉 OK 同步，所以时间必须完全来自数据，不做任何手工修正。
   - `scenes/gallery-credits.ts`：片尾字幕的出现过程。

## 约束
- 只用 `theme.ts` 的 token；字体 `F.mono`、`F.archivo`；不要描边、辉光、渐变。陈列页返回 `{ ...POSTER_POST, hud: 0 }`。
- 只改：`app/src/kit/lyrics-type.ts`、`kit/credits.ts`、`scenes/gallery-lyrics.ts`、`scenes/gallery-credits.ts`、`app/tests/kit-lyrics-type.test.ts`、`app/tests/kit-credits.test.ts`。其他文件不动，需要改的话在报告里提出。
- 代码注释用英文，风格沿用上游。不截屏自评；静帧和视频交给 Tim 看。
- 小步提交到 `codex/x8-lyrics`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
2. `bun test tests/` 全部通过（已有 64 项加新增）。覆盖：小字行在各时间点的已唱 / 正在唱 / 未唱划分；COMMIT 的冲击时间等于 `syl[1]` 的开始；一句结束后的保持时长。
3. 确定性：同一个 t 渲染两次，解码后逐像素一致。
4. 性能：每帧平均 < 25 ms。
5. 给 Tim 的材料：`bun scripts/render.ts video --gallery lyrics --preset veryfast --out ../out/x8/lyrics-karaoke.mp4`（整首，带真歌）；`out/x8/credits/` 下 4–6 张静帧。报告视频的帧数、时长和日志里的所有报错。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、state 字段、验收 1–5 的逐项结果、视频和静帧路径、需要 C 改的地方。
