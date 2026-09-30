# X4：灰盒动态分镜（由分镜数据驱动）

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x4-animatic`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/ENGINE.md`、`docs/STORYBOARD.md`、`storyboard/shots.json`（它的 `_doc` 字段说明了格式）、`app/src/timeline.ts`、`reference/pdoom/app-timeline.ts`（上游怎样把场景切换锚定到歌词和拍点）。

分镜表有 18 个场景、80 个镜头，数据源是 `storyboard/shots.json`。Tim 要看的是**跟着真歌播放的动态分镜**，用来判断节奏和镜头数够不够，而不只是一张文字表。最终的画面风格还没定，所以这一版是「灰盒」：只用中性的灰色块和文字，把每个镜头的内容、时长、切点表达清楚。

另一个任务 X3 正在同时进行（`codex/x3-stage3`），它会产出真实的 `data/audio.json`、`data/lyrics.json`，并让引擎改读 `audio/song.wav`。**这两部分不是你的任务，不要动** `data/`、`analysis/`、`app/src/main.ts`、`app/scripts/render.ts`。在它们合并之前，引擎读的是占位数据，所以你的实现必须能在锚点找不到时回退到 JSON 里的 `t`。

## 要做的
1. **锚点解析** `app/src/storyboard.ts`：输入 `shots.json` 加上引擎的 `Lyrics` 和 `AudioData`，输出每个镜头的开始时间。规则：
   - `anchor.word` 为 null：用 `t`，再按 `snap` 吸附到最近的强拍或拍。
   - 否则：在歌词里找到第 `occ` 次出现的、文本等于 `anchor.line` 的那一句（先归一化：大小写、引号、标点、破折号；弯引号和直引号视为相同）；再在这一句里找第一个等于 `anchor.word` 的词（有 `sub` 时找第 `sub` 次）。如果这个词是连字符词的一部分（比如 `Tap-tap-tapping` 被当作一个词），按连字符把它的时长平均分给各部分。取该词的开始时间，按 `snap` 吸附（`downbeat` 吸附到最近的小节强拍，`beat` 吸附到最近的拍，`none` 不吸附），再加上 `offset_beats` 拍。
   - 找不到时回退到 `t`（同样吸附），并记录这是「回退」。
   - 解析后如果出现时间不递增，或某个镜头短于 1 拍，都要记录下来。
2. **时间线** `app/src/timeline.ts`：每个镜头一个时间线条目（id 用镜头 id），相邻镜头硬切。
3. **灰盒场景** `app/src/scenes/animatic.ts`：同一个场景类服务所有镜头（通过 `ctx.params` 传入镜头数据）。画面要清楚地显示：
   - 镜头 id、场景名、画面描述（中文，字号要大到一眼能读完）、镜头运动、Clawd 动作编号
   - Clawd 占位：按 `reference/clawd/clawd.json` 里 `terminal_welcome.pixels` 画出 16×5 的像素 Clawd，每个像素是一个方块；再按动作编号做最简单的运动示意，至少要有 A3（每拍弹一下）、A6（跳）、A1（闭眼）、A8（抖）
   - 当前歌词行，逐词高亮（用引擎现有的 `Lyrics` 查询）
   - 小节号和拍号计数；镜头内的进度条
   - 每个场景一种不同明度的中性灰底，让场景切换一眼可见。**不要做任何风格化设计**（配色、字体选择都不重要），这不是成片
   - 如果某个镜头的时间是「回退」来的，在角落显示一个小标记
   - 中文要能显示；引擎自带的字体没有中文，可以用系统字体回退
4. **检查脚本** `app/scripts/storyboard-check.ts`（用 bun 运行）：解析全部镜头，打印一张表（镜头 id、解析出的时间、来源是锚点还是回退、时长），并汇总回退数、过短镜头、不递增的问题。退出码：有不递增时非 0。
5. 在 `docs/ENGINE.md` 末尾加一小节，说明分镜数据怎样驱动时间线、怎样运行检查脚本。只加这一节，不改别的内容。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
2. `bun scripts/storyboard-check.ts` 能跑通，输出 80 个镜头；在占位数据下全部回退是正常的，报告回退数。
3. 为了在 X3 合并前就验证锚点逻辑，写一个测试：用 `analysis/work/c1/whisper_turbo_quick.json`（Whisper 在定稿歌上的转写，词级时间；worktree 里已放好）临时构造一份 lyrics，喂给解析器，报告有多少个镜头能按锚点解析成功、哪些失败以及原因。这份临时数据不要写进 `data/`。
4. 渲染能跑通：`bun scripts/render.ts stills --t 1,5,26.5,50,97,120,150 --out ../out/x4/stills`；再渲染整片灰盒：`bun scripts/render.ts video --preset veryfast --out ../out/x4/animatic.mp4`。报告总帧数、时长、渲染速度，以及浏览器日志里除了预期的 `data/audio.json` 404 以外的所有报错。
5. 性能：每帧平均 < 25 ms（`bun scripts/render.ts perf --from 20 --to 30`）。

## 约束
- 只改 `app/src/storyboard.ts`、`app/src/timeline.ts`、`app/src/scenes/animatic.ts`（可以加 `app/src/scenes/animatic-*.ts` 辅助文件）、`app/scripts/storyboard-check.ts`、`docs/ENGINE.md` 的新一节，以及测试文件。**`storyboard/shots.json` 只读**；发现数据有问题，在报告里指出，不要改。
- 画面只由 t 决定，遵守 `docs/ENGINE.md` 的确定性规则。
- 代码注释用英文，风格沿用上游。
- 不截屏，不对画面下结论。
- 小步提交到 `codex/x4-animatic`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、验收 1–5 的逐项结果和数值、`shots.json` 里发现的问题、整片灰盒视频的路径。
