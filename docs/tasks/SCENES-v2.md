# 场景 v2：按「视觉规范 v2」做正式场景（分组并行）

- 负责：X（Codex，gpt-6.1-sol）按组实现，C（Claude）审查、合并、整片集成
- 每组一个分支 `codex/v2-<组>`、一个独立 worktree。只提交到自己的分支，**不要推送，不要合并到 main**
- 状态：2026-10-01 派出。**今晚要出整片预览**，请在保证质量的前提下尽快完成，做完一场提交一场

## 必读（按顺序）
1. `CLAUDE.md`
2. `docs/TREATMENT.md` 的 **「视觉规范 v2」**：三种底色、放开和保留的规则、光标母题、镜头语法、**「每场的画法」表**。这是本任务的核心依据。v1 被否定的原因也写在那里：背景单一、没有动态。
3. `docs/STORYBOARD.md` 和 `storyboard/shots.json`：你负责的场景的**逐镜头表**（锚点、画面、Clawd 动作、镜头运动）。画面内容以分镜为准，**画法以视觉规范 v2 的表为准**；两者冲突时按 v2 的画法来表现分镜里的内容。
4. `docs/ARCHITECTURE.md`、`docs/ENGINE.md`（确定性、4K、运动模糊、性能）
5. `reference/pdoom/docs/TREATMENT.md` 和 `reference/pdoom/scenes/`：**我们要达到的水准**。pdoom 每场 800–1700 行，每场都有自己的全屏着色器背景，一直在动，大变化落在拍子上。拿它的写法当参考（着色器背景、LineBatch 细线、`hatch` / `engrave` 着色、实例化 3D、光线步进、逐场调后期），**但不要照抄它的画面和母题**。

## 现成的部件（都在 `app/src/`）
- `kit/ground.ts`：**活背景**。`Ground.render(renderer, out, { kind: 'paper'|'ink'|'clay', t, camX, camY, zoom, kick, haze, streaks, travel, halftone, flipTo, flip, wipe })`；`GlowLayer`（只让 clay 在 INK 底上发光）；`postFor(kind)`（逐底色的后期预设，可以在它的基础上逐场调）。
- `kit/cursor.ts`：clay 光标母题（`drawCursor`、`drawTrail`、`blink`）。
- `kit/stage.ts`：3D 舞台（海报平面、悬浮面板、投影、透视相机）。叠在活背景上时用 `new Stage(renderer, pw, ph, true)`（透明海报，不清屏）。
- `kit/poster.ts`：网格、超大字、大圆、小字。
- `kit/clawd.ts`：Clawd 精灵和动作 A1–A13（只能用它，不许重画 Clawd）。
- `kit/time.ts`：拍点工具（这首歌从约 133 BPM 渐快到约 138 BPM，**一切节拍计算都查逐拍网格**）。
- `kit/lyrics-type.ts`：歌词层（小字卡拉 OK + 主题句大字冲击）。每场要把歌词**以自己的方式**融进画面（被光标打出、刻在物体上、沿路径走、被盖章……），这个模块可以当默认方案或计时来源。
- 组件：`kit/editor.ts`、`terminal.ts`、`testlist.ts`、`gitlog.ts`、`todo.ts`、`notify.ts`、`issue.ts`、`calendar.ts`、`welcome.ts`、`callstack.ts`、`pr.ts`、`gitgraph.ts`、`devices.ts`、`keyboard.ts`、`textrain.ts`，以及 `content.ts` 里的故事内容。
- 参考写法：`scenes/gallery-ground.ts`（活背景 + 发光 + 光标），`scenes/s08-commit.ts`（多镜头共用一个 world 单例、从歌词算出时间点、舞台和相机）。**注意**：`s08-commit.ts` 还是 v1 的画法，C 正在把它升级成 v2；学它的结构，不要学它的画法。

## 分组
| 组 | 场景 | 文件前缀 | 推理强度 |
|---|---|---|---|
| A | S01 冷启动、S02 通知、S03 Issue | `s01-` `s02-` `s03-` | high |
| B | S04 日历城、S05 代码平台 | `s04-` `s05-` | xhigh |
| C | S06 待办、S07 键盘地形 | `s06-` `s07-` | high |
| D | S09 终端、S10 红墙、S11 报错雨、S12 重跑（**重做**：现有的 `s09-terminal.ts` 等是 v1，改成 v2） | `s09-` … `s12-` | high |
| E | S13 副歌 2、S14 下潜 | `s13-` `s14-` | high |
| F | S15 第 42 行、S16 变绿 | `s15-` `s16-` | xhigh |
| G | S17 发布（最后一遍副歌）、S18 第二天（含片尾字幕 `kit/credits.ts`） | `s17-` `s18-` | high |

时间线会自动把 `scenes/sNN-*.ts` 接到对应镜头上（`app/src/timeline.ts` 的 `sceneFile`），**每个场景只能有一个 `sNN-` 开头的主文件**；辅助文件请命名为 `sNN-<主文件名>-xxx.ts` 也行，但**主文件必须是按字母序排第一个的那个**，更稳妥的做法是把辅助代码放在 `scenes/parts/sNN-*.ts`。

## 硬性要求
1. **活背景**：每场用 `Ground` 或者自己的全屏着色器做背景，至少有一样东西随音乐或镜头在变（视差网格、底鼓脉冲、运动条纹、流动的纹理……）。不许出现静止的底。
2. **底色和画法**严格按视觉规范 v2 的「每场的画法」表。
3. **镜头语法**：大变化落在拍子上（硬切在小节第一拍，冲击在重音上）；强缓动，先停再猛动；场内有子切换和重新构图。
4. **主题词冲击**（E 组的 S13、G 组的 S17）：锚在 `commit` 的第二个音节（`syl: 2`）上，重音那一刻整屏翻成 CLAY 底，巨大的 COMMIT 砸下，之后回到本场底色。S13 是第 2 级（比 S08 更满），S17 是第 3 级（全片最大）。
5. **光标母题**按 v2 规范出现在本场该出现的地方。
6. **确定性**：画面只由 t 决定（逐帧随机用 `frameIdx`，伪随机用固定种子）；不许用 `Math.random()` / `Date.now()`。
7. 只用 `theme.ts` 的 token；`fail` / `pass` 只用在测试状态和 PR diff 上。
8. **性能**：每帧平均 < 25 ms；3D 很重的场景最多 40 ms，并在报告里说明。
9. **4K**：`--scale 2` 能正常出图（面板贴图、细线在 4K 下不能糊，见 ENGINE.md）。

## 文件归属
- 只改：本组场景的 `scenes/sNN-*.ts`、`scenes/parts/sNN-*.ts`、测试 `app/tests/scene-<组>.test.ts`。
- **不要改** `kit/`、`theme.ts`、`timeline.ts`、`engine/`、`storyboard/`、其他组的场景文件。确实需要改公共部件（比如某个组件缺一个参数）时：先在本组文件里自己实现一个局部版本，然后在报告里写清楚，由 C 统一合并进公共部件。
- 代码注释用英文，风格沿用上游。不截屏自评；静帧和视频交给 Tim 看。
- 小步提交到 `codex/v2-<组>`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误；`bun test tests/` 全部通过。
2. `bun scripts/storyboard-check.ts` 仍然 0 个过短、0 个不递增（已知 S13-6 过短，C 会处理）。
3. 确定性：每个场景取 3 个时间点，乱序渲染两次，解码后逐像素一致。
4. 性能：`bun scripts/render.ts perf --from <本组起点> --to <本组终点>`。
5. 给 Tim 的材料：`bun scripts/render.ts video --from <起点-0.5> --to <终点+0.5> --preset veryfast --out ../out/v2-<组>/clip.mp4`（带母带音轨），加每个场景 3 张静帧（`out/v2-<组>/stills/`），再加 1 张 `--scale 2` 的 4K 静帧。本组的起止时间用 `bun scripts/storyboard-check.ts` 查。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、每场的画法实现说明（底色、背景着色器、技术）、验收 1–5 的逐项结果、视频和静帧路径、需要 C 合并进公共部件的东西。
