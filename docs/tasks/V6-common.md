# V6 场景任务的共同约定（每个 V6-SNN 任务都先读这一份）

设计：C（Claude）。实现：Codex gpt-6.1-sol。

## 0. 纪律（Tim 2026-10-03）
- **严格按设计规格实现，不改设计。** 规格里的数字、时刻、缓动、构图、交接物都是设计，不是建议。实现中发现规格自相矛盾或做不到，**停下来在报告里说明**，按最接近设计意图的方式做，并列进「取舍清单」。
- 规格没写死的细节（例如刻线的具体间距、某个常量的微调），按该节写的「设计意图」决定，并逐条列进「取舍清单」。
- 不截屏、不看画面下审美结论。报告只写技术事实：做了什么、测试数、性能数字、静帧和短片的路径、取舍清单。

## 1. 先读
`docs/tasks/V6-cuts.md`（交接表，必读）、`docs/reference/pdoom-transitions-lyrics.md`（第 2、4 节）、`docs/reference/pdoom-source-techniques.md`、`docs/ENGINE.md`、`docs/ARCHITECTURE.md`。
写法样板：`scenes/s15-line42.ts` + `parts/s15-world.ts` + `kit/raymarch.ts`（光线步进 + 光照转刻线 + CPU/GPU 双写的世界）；`scenes/s04-calendar.ts` + `parts/s04-city-model.ts`（真实光照、阴影）；`scenes/s14-shaft.ts`（字贴在 3D 平面上、按拍分段的镜头）。
公共部件：`kit/pathtext.ts`（沿 3D 路径逐字母排布）、`kit/wordplane.ts`（字的 3D 平面）、`kit/carry.ts`（跨切点的词）、`kit/handoff.ts`（`CUT` 常量、`Prim`、`exitEnvelope`、`accelerando`）、`kit/rig.ts`、`kit/raymarch.ts`、`kit/clawd3d.ts`、`kit/spark.ts`、`kit/vartype.ts`、`kit/lyric-moves.ts`（`Voice`）。

## 2. v5 方法（每场都必须遵守）
1. **数学世界**写在 `parts/sNN-world.ts`：几何函数 CPU（TS）和 GPU（GLSL 字符串）各一份，同名同参数，数值一致（测试：随机 200 个点，CPU 和 GLSL 的翻译版在 JS 里重算误差 < 1e-4；GLSL 版本用字符串常量导出，测试里用一个简单的 GLSL→JS 对照函数，或者把同一组常量喂给两边并比较少量关键点在两边的手算值——具体做法写进取舍清单）。镜头、字、Clawd、光标的位置都向世界函数查询。
2. 渲染用三种方式之一：光线步进（`kit/raymarch.ts`）、位移网格、自写投影细线（`LineBatch` / Canvas + `Rig.proj`）。
3. **先算光，再把光照换算成刻线疏密**（`engraveTone` 或同等做法）：形体、阴影、光源方向是真的，样子是版画。不靠改底色、加发光、加渐变修补（Tim：颜色不是问题）。
4. 镜头是分段的 3D 函数（`Cam` 值，`mixCam` 混合），每段的边界挂在词或拍上（用 `lyrics`/`audio` 算，不写死秒数），写明缓动。
5. 构图测试量**投影后的包围盒**，不量 2D 常量。

## 3. 歌词（R5）
- 唱出来的词长在世界上：`kit/pathtext.ts`（路径上，stand / lie）、`kit/wordplane.ts`（3D 平面）、或刻进实体（着色器里按字的平面切刻线，照 pdoom shoggoth）。每场规格写明每句的载体。
- `layoutPath` 的 `axes` 传函数 `(w) => voice.form(w, w.end).axes`（每个词按唱完时的轴占位），绘制时 `axes: (g, t) => voice.form(g.word, t).axes`：长音词在唱的过程中从窄长到正好填满自己的位置，不压到相邻的字。
- 逐字母时刻（`letterTimes`），字母不早于它的时刻出现；白热冷却（`heatColor`）；长音词随 `Voice.form(...).axes` 变宽变重。
- 正对镜头的平面排版（`drawSet` / `gridSnap` / `fillRun` 直接画在屏幕上）只允许用于**机器的声音**（终端、打字、Mono），规格里会写明。
- 层级：每个镜头一个主导元素；字号最多三级（巨字 / 歌词 / 标注），歌词大写高 50–110 px（投影后），标注 Plex Mono 14–22 px、同屏 ≤ 2 处。
- 字有寿命：出现 → 白热 → 冷却 → **随世界离开**（被带走、碎、落、被盖住），不许原地淡出。
- 跨切点的词按 `V6-cuts.md` 的 carry 规则做，不重排整句。

## 4. 交接（R2–R4）
按 `V6-cuts.md` 的对应行实现 `exitPrim(t)` / `entryPrim(t)`，注册到 `app/tests/handoff.test.ts` 的 `CUTS`（只追加自己负责的条目）。最后一拍用 `exitEnvelope`；写了「速度接上」的切点要测速度方向。

## 5. 光标（R6）
每场的 clay 光标按 `V6-cuts.md` 的「光标接力」表扮演角色。光标的屏幕位置由一个纯函数 `cursorAt(t)` 给出（导出，测试用），并且它就是该场歌词的书写头（`writeHead` 投影出来的点）或规格写明的角色。

## 6. 文件归属
只改规格「只改这些文件」里列出的文件。一般是：`scenes/sNN-*.ts`、`scenes/parts/sNN-*.ts`（新建或改）、`tests/scene-v6-sNN.test.ts`（新建）、`tests/handoff.test.ts`（只追加自己的 CUTS 条目）。旧的 `tests/scene-*.test.ts` 里测本场旧行为、和新设计冲突的断言：删掉或改成新设计的断言，并在报告里逐条列出（不许为了让测试通过去改设计）。
**不许改**：`kit/`（发现公共部件缺功能，写进报告，由 C 改）、`engine/`、`timeline.ts`、`storyboard/shots.json`、别的场景。

## 7. 验收（每场都要，报告里贴数字）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错。
2. `bun test tests` 全部通过；本场新测试至少覆盖：确定性（同一 t 两次调用世界函数 / 镜头 / 歌词排版结果完全相等）；规格里列出的每一条构图包围盒；每个词的第一个字母不早于 `word.start`；交接 `CUTS`；carry；规格列出的其它可测项。
3. `bun scripts/storyboard-check.ts` 0 过短 0 不递增。
4. `bun scripts/render.ts perf --from <场景起点> --to <终点>` 每帧平均 < 25 ms（报告实测值）；整片 `perf` 也跑一遍。
5. 交付物（放 worktree 的 `out/v6-<组>/`）：规格列出的静帧（`render.ts stills`）；本场完整短片 + 前后切点各 ±1 s 的短片（`render.ts video --preset veryfast`，前一场 / 后一场用当时 main 上的版本）。
6. 报告 `out/codex/v6-<组>-final.md`：做了什么、测试数、性能、交付物路径、**取舍清单**、**规格里做不到的地方**。
