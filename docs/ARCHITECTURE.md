# 架构：从分镜数据到成片

> 状态：初稿（2026-09-30，C 写）。这是写场景和组件之前必须遵守的约定。`docs/ENGINE.md` 讲引擎本身（继承自上游），本文讲**本项目在引擎之上怎么组织**。改约定先改本文。

## 总体：分镜驱动，灰盒逐个替换成真场景

```
storyboard/shots.json ──► app/src/storyboard.ts（锚点 → 时间）──► app/src/timeline.ts
                                                                     │
          每个镜头：有 scenes/<场景>.ts 就用真场景，没有就用 animatic（灰盒）
```

- **分镜是唯一的剪辑表。** 镜头的起止时间只由 `shots.json` 的锚点、`data/lyrics.json` 和 `data/audio.json` 决定，场景代码里不写死秒数。
- **渐进替换**：`timeline.ts` 按镜头所属的场景 id 查找场景模块 `scenes/s08-commit.ts` 这样的文件。找到就用它，找不到就用 `animatic`。所以任何时候整片都能完整播放、完整导出，做好一个场景就替换掉一段灰盒。（`timeline.ts` 的这个改动由 C 来做。）
- 一个场景模块负责一个场景（S01–S18）里的**所有镜头**。它通过 `ctx.params.shot`（当前镜头：id、锚点、解析出的时间）知道自己在演哪个镜头。场景内部可以跨镜头保持连续（比如 S08 的刹车 → 落拍）。

## 目录和文件归属

| 路径 | 内容 | 归属 |
|---|---|---|
| `app/src/theme.ts` | 色板 token（取代 `engine/palette.ts` 的旧色） | C |
| `app/src/kit/` | 共享组件（编辑器、终端、测试列表……），纯绘制函数 | 按任务分给 C 或 X，一个文件只有一个负责人 |
| `app/src/kit/clawd.ts` | Clawd 精灵和动作库 A1–A13 | C |
| `app/src/kit/stage.ts` | 海报舞台：纸面、网格、超大字、大圆、面板的 3D 摆放、相机 | C |
| `app/src/scenes/sNN-*.ts` | 场景 S01–S18 | 按任务分，一个场景只有一个负责人 |
| `app/src/scenes/animatic*.ts` | 灰盒 | 保留，作为兜底 |

并行规则：同时进行的任务**不改同一个文件**。需要改别人的文件时，在任务报告里提出，由负责人改。

## 色板：只用 token

- `theme.ts` 导出视觉规范里的 token：`paper`、`ink`、`inkSoft`（ink 的 60% / 30% / 12%）、`clay`、`fail`、`pass`，每个都提供 `hex`、线性 RGB（给 GL）、`rgba(a)`（给 Canvas2D）三种形式。
- 场景和组件**只许用 token**，不许写死颜色值。这样调色时改一处就行。
- `fail` / `pass` 只能出现在测试状态上（见视觉规范）。

## 组件：纯函数，只由状态决定

组件是一个绘制函数：`draw(ctx2d, box, state)`。`state` 是一个普通对象，由场景根据时间 t 算出来。比如编辑器的 state 是「显示哪些行、光标在第几个字、哪一行高亮」。

- 组件内部**不读时间，不存状态**。所有随时间变化的东西都在场景里算好，再作为 state 传进去。好处是：画面只由 t 决定，天然满足确定性；组件可以单独测试，喂一个 state 就能出图。
- 打字进度、逐条出现这类效果，由场景用共享的时间工具算出来（见下文），不在组件里各写一套。
- 组件在逻辑像素（1920×1080 坐标系）里绘制。4K 由引擎负责（见 ENGINE.md 的「Output scale」）。

## 海报舞台和 3D 面板

- 世界是一张平面海报，放在 3D 空间里 z = 0 的位置：纸面、网格线、超大字、大圆都画在海报上。
- 编辑器这类「物件」是悬在海报上方的**面板**：一块平面网格，贴上组件画出来的 Canvas2D 贴图，可以有位置、旋转、z 高度。
- 投影：每块面板在海报上投一张模糊过的矩形阴影，模糊程度随高度增加。
- 相机：透视相机。镜头运动（推、拉、摇、移、斜看）用关键帧描述，关键帧挂在镜头的锚点和拍点上，不写秒数。
- 景深：先用最便宜的办法，按面板到焦平面的距离给每块面板选一个预先模糊过的贴图版本。不够用再考虑全屏的景深后期。
- 面板贴图的分辨率 = 面板在屏幕上最大时的像素尺寸 × `SCALE`。斜看时开各向异性过滤，防止小字糊掉。

## 活背景、光标、逐底色后期（视觉规范 v2，2026-10-01）
- `kit/ground.ts`：`Ground` 按 PAPER / INK / CLAY 画全屏活背景（视差网格、底鼓脉冲、纵深雾、运动条纹、半调网点、底色翻转）；`GlowLayer` 让 clay 元素在 INK 底上发光；`postFor(kind)` 是逐底色的后期预设。
- 用法：先 `ground.render(...)`，再画舞台（`new Stage(renderer, pw, ph, true)` 为透明海报、不清屏），最后叠加歌词层和发光层。
- `kit/cursor.ts`：clay 光标母题（`drawCursor`、`drawTrail`、`blink`）。
- `kit/lyrics-type.ts` 的绘制函数接受 `on`（所在底色），在 INK / CLAY 底上把字翻成 paper 色。

## Clawd

- 数据来自 `reference/clawd/clawd.json` 的 `terminal_welcome.pixels`（16×5）。
- `kit/clawd.ts` 导出 `pose(action, t, params)`，返回这一刻的像素网格和位移；`draw(...)` 把它画成锐利的方块（最近邻采样，不做任何平滑）。
- 动作库 A1–A13 的定义见 `docs/STORYBOARD.md`。动作只能移动像素、改变眼睛和手臂那几格，不改比例、不加细节。
- Clawd 可以画在海报上，也可以站在面板上（跟着面板一起做透视）。

## 共享的时间工具

放在 `app/src/kit/time.ts`：
- `shotTime(ctx)`：当前镜头的起止时间和进度
- `beatsSince(t, anchorTime)`：从某个锚点到现在过了几拍（按变速的逐拍网格算，不按固定 BPM）
- `onBeats(t, from, to)`：在一段时间里，每一拍触发一次的离散计数，用来做「每拍亮一格」这类效果
- `typed(text, t, t0, t1)`：打字效果，返回已经打出的字数

歌曲的速度从约 133 BPM 渐渐加快到约 138 BPM，所以**任何和节拍有关的计算都必须查逐拍网格**，不能拿 BPM 乘时间。

## 每个场景的验收（非视觉）
1. `bunx tsc --noEmit -p tsconfig.json` 无错误
2. 确定性：同一个 t 渲染两次，逐像素一致
3. 性能：每帧平均 < 25 ms（`bun scripts/render.ts perf`）
4. 整片导出不报错
5. 视觉：渲染静帧和短片交给 Tim 看，Tim 验收

## 场景文件约定（2026-10-01 实际形成的写法）
- 每个场景一个主文件 `scenes/sNN-<名字>.ts`；`timeline.ts` 按字母序取 `sNN-` 开头的第一个文件，所以**辅助代码放 `scenes/parts/sNN-*.ts`**（D 组有一个 `s09-z-shared.ts`，靠 z 排在后面，这是例外，以后别这么命名）。
- 引擎给每个镜头各建一个场景实例；一个场景的多个镜头共用一个**模块级 world 单例 + 引用计数**（见 `s08-commit.ts`），重资源只建一份。
- 时间点一律从对齐数据算（`kit/time.ts` 的 `wordTime`、`afterBeats` 等，或解析 `shots.json` 的锚点），不写死秒数。
- 渲染顺序：活背景 `Ground` → 舞台或 3D → 歌词层 → 发光层（`GlowLayer`，只在 INK 底）→ 返回 `postFor(kind)`（可逐场微调）+ 震屏。
- 每组有自己的测试 `app/tests/scene-<组>.test.ts`，覆盖时序和确定性。

## 歌词排版 v3（2026-10-01 开始实现）
设计见 TREATMENT「歌词排版 v3」。计划的公共模块：
- `kit/lyric-moves.ts`：动作库（网格落位、光标敲出、盖章、贴在物体上、雕刻、纵深风暴、沿路行走、堆叠、碎裂重组、计数器、整屏冲击），每个动作都是「(逐词状态, t) → 绘制」的纯函数。
- 声音到形态的映射：长音拉宽（Archivo 宽度 87.5→125）、人声包络驱动字重（300–900）、重读用 clay、底鼓微脉冲、上一句的残影。
- 逐词状态沿用 `kit/lyrics-type.ts` 的 `lyricsTypeState`（已经保证不会早于人声），预示的不透明度从 30% 提到 55%。
- 「贴在物体上」和「雕刻」需要把歌词画进 3D 表面的贴图里，由各场景调用（`Plate`）。
- 实现（2026-10-01）：唱出来的词一律用 `kit/vartype.ts` 的连续 Archivo（`varRun` / `fillRun`），不用 `F.archivo` 的离散实例；逐词形态来自 `new Voice(lyrics, audio).form(word, t)`，每句的重读词写在 `STRESS` 表里（按旋律定，不按响度）。参考实现：`s04-calendar.ts`（计数器 + OCTOBER 标题）、`s11-rain.ts`（纵深风暴 + 缺字）。

## 实施记录
- 2026-09-30 ～ 10-01：公共部件（C + X5–X8）、S08 参考场景（C）、视觉规范 v2 的公共部件（C）、18 场正式场景（C + Codex 7 组并行）全部完成，整片预览 v1 已交 T。
