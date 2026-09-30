# X9：场景 S09–S12（过门、主歌 2、预副歌 2）

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x9-s09-s12`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/ARCHITECTURE.md`、`docs/TREATMENT.md` 的「视觉规范」、`docs/STORYBOARD.md`（**S09、S10、S11、S12 四个场景的逐镜头表**，以及 Clawd 动作库），`storyboard/shots.json`，`docs/ENGINE.md`。

**参考场景是 `app/src/scenes/s08-commit.ts`（C 写的副歌 1）。照它的结构写**：
- 一个场景模块负责一个场景的全部镜头；多个镜头共用一个模块级的 world（单例 + 引用计数），因为引擎给每个镜头各建一个场景实例。
- 画面只由 t 和对齐好的歌词时间决定（`kit/time.ts` 的 `wordTime`、`afterBeats`、`beatsSince`、`span`、`hitAfter`）。不写死秒数；实在需要的兜底时间取自 `shots.json` 的 `t`。
- 世界：`kit/stage.ts` 的海报舞台 + 悬浮面板 + 相机；海报上的网格、大字、大圆用 `kit/poster.ts`。
- 组件：`kit/` 里已经有的全部组件（终端、测试列表、文字雨、大字砸下、编辑器、Clawd……），不要自己重画同样的东西。
- 返回 `{ ...POSTER_POST, hud: 0 }`，需要震屏就加 `shake`（逐帧随机用 `frameIdx`）。
- 歌词：S08 里用的是临时小字 caption。现在正式的歌词层已经有了：`kit/lyrics-type.ts`（`lyricsTypeState` + 绘制函数），**你的场景直接用正式的歌词层**画当前这句歌词。

时间线已经会自动把 `scenes/s09-*.ts`、`s10-*.ts`、`s11-*.ts`、`s12-*.ts` 接到对应镜头上（见 `app/src/timeline.ts` 的 `sceneFile`），不用改时间线。

## 要做的
四个场景文件：`scenes/s09-terminal.ts`、`s10-redwall.ts`、`s11-rain.ts`、`s12-rerun.ts`。按分镜表逐镜头实现（镜头运动、Clawd 动作编号、画面内容），重点：
- S09：终端从底部升起、逐字敲出 `npm test`、进度点一拍一个。
- S10：「Nineteen」上 19 行失败一口气刷出、计数放大；「shattering」上整面碎开（`kit/testlist.ts` 的碎裂）。红色只用 `fail` token。
- S11：堆栈文字雨（`kit/textrain.ts`），雨滴里有 `at daysIn (month.ts:42)`；两个 undefined 按两次唱「Undefined」的时间砸下，Clawd 每次被压扁；「why」时拉到极远。
- S12：三次「run」三次递进推近、越来越红；「Clear the cache」清空；「count to ten」时 Clawd 数腿（A9），头顶的数字 1…10、11，**11 要能看清**（伏笔）。

## 约束
- 只改：上面四个场景文件，以及它们的辅助文件 `scenes/s09-*.ts` … `s12-*.ts`、测试 `app/tests/scene-s09-s12.test.ts`。**不要改** `kit/`、`theme.ts`、`timeline.ts`、`engine/`、`s08-commit.ts`；需要改的话在报告里提出（比如某个组件缺一个参数）。
- 只用 `theme.ts` 的 token。遵守视觉规范的禁用清单。
- 代码注释用英文，风格沿用上游。不截屏自评；静帧和视频交给 Tim 看。
- 小步提交到 `codex/x9-s09-s12`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误；`bun test tests/` 全部通过。
2. `bun scripts/storyboard-check.ts` 仍然 0 个过短、0 个不递增。
3. 确定性：每个场景取 3 个时间点，渲染两次，解码后逐像素一致。
4. 性能：`bun scripts/render.ts perf --from 43 --to 67` 平均 < 25 ms。
5. 给 Tim 的材料：`bun scripts/render.ts video --from 42.5 --to 67 --preset veryfast --out ../out/x9/s09-s12.mp4`（带母带音轨），以及每个场景 2–3 张静帧（`out/x9/stills/`）。报告帧数、时长和日志里的所有报错。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、验收 1–5 的逐项结果、视频和静帧路径、需要 C 改的地方。
