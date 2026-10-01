# V4-B：光标升级为火花（全片母题）

写给：Codex（gpt-6.1-sol，推理 high）。写的人：C（Opus）。验收：C 审代码和数据，Tim 看画面。
背景：`docs/reference/gap-v4-vs-pdoom.md` 的第 4 条和升级顺序 B。**必须在 V4-A 合并进 main 之后开始**（两个任务改同一批场景文件）。

## 目标（一句话）
clay 块光标是全片的笔。**它移动时要像 pdoom 的火花一样「烧」**：身后拖一条刚写出时白热、随后冷却成 clay 的细线，笔尖迸出几颗火星；它静止时照旧按拍闪烁。构图、镜头、时间一律不动。

## 先读
1. V4-A 的规格 `docs/tasks/V4-A-light.md`（发光规则：只有 clay 发光，纸色永不发光；`hot` token；GlowLayer 用法）。
2. pdoom 的火花实现（MIT，可以移植）：`reference/pdoom/scenes/_motifs.ts` 的 `sparkParticles`、`sparkHead`，以及 `reference/pdoom/scenes/loss.ts` 的 `drawTrail`（按年龄冷却的拖尾）。**注意它们的确定性写法**：粒子按出生时刻编号、速度由 hash 决定，位置由年龄直接算出，不累积状态。
3. 我们的光标：`app/src/kit/cursor.ts`（`drawCursor`、`drawTrail`、`blink`）。
4. `docs/ENGINE.md` 的「Motion blur and sampling」一节：变速发射必须按出生时刻取发射率（`rate` 是出生时刻的函数 + `rateMax`）。

## 规格

### B1 公共部件 `app/src/kit/spark.ts`（新建）
- `sparkParticles(lb: LineBatch, t, headAt: (t) => {x,y}|null, opts)`：从 pdoom 移植，颜色换成我们的 token：火星从 `hot` 冷却到 `clay`。用 `screen2D` 的加法混合 LineBatch。
- `heatTrail(lb: LineBatch, t, pathAt: (t) => {x,y}|null, opts: { from: number; width?: number; cool?: number })`：画出从 `from` 到 t 的笔迹，每一小段按自己被写出的时刻冷却：年龄 0 是 `hot`、`cool`（默认 0.4 秒）之后是 clay。仿照 pdoom `loss.ts` 的 `drawTrail`。
- `cursorSpark(c2d, glow2d, lb, t, at: (t) => {x,y,h}, o: { on: 'ink'|'paper'|'clay' })`：一个调用画完整的「火花光标」：
  - 块光标本体（沿用 `drawCursor`，尺寸不变）。
  - 速度 = 由 `at(t)` 和 `at(t − 1/60)` 算出（纯函数，不存状态）。速度超过 120 px/s 时，在光标左下角（笔尖）迸火星，发射率随速度增大（上限 140/s）。
  - INK 底：光标和火星画进 GlowLayer（强度 2.0）。PAPER 底：不发光，火星是 clay 色的短线、数量减半。CLAY 底：火星用 paper 色。
- 全部只由 t 决定；自适应运动模糊下可用（按 ENGINE.md 的规则写发射率）。

### B2 各场：让光标去「写」东西（只在下列地方，其他地方光标不变）
每一处都是：光标沿一条已经存在的路径移动，身后用 `heatTrail` 留下笔迹、笔尖用 `cursorSpark`。**路径、时间、终点都用场景里已有的数据**，不新编。

| 场景 | 已有的路径 | 做什么 |
|---|---|---|
| S01 | 开场光标 → 欢迎框边线（`bootState` 的 `frame` 进度） | 欢迎框的边线由光标画出：光标沿正在画出的那段边线的端点走，边线本身用 `heatTrail` 冷却 |
| S04 | clay 路线（`STREETS` + `cityState().travel`） | 路线头就是火花光标；路线用 `heatTrail`（3D 路线先投影到屏幕再画） |
| S06 | 三个勾的笔画（`drawTrail` 的三点路径） | 勾由火花光标画出，笔迹冷却 |
| S09 | 示波器扫描头（`scopeState().head`） | 扫描头换成火花光标；它身后的波形最近 0.4 秒用 `hot` 冷却 |
| S14 | 铅垂线下端（`headY`） | 下坠时光标迸火星（速度来自下坠），落定在 near 上时停止 |
| S15 | 第 42 行底部的 clay 线（`handoffIn` 的 rule） | 唱到 Snip 时，光标沿这条线从左到右快速划过（0.25 拍），划过的地方 `heatTrail`；划到断口时火星最多 |
| S16 | 骨牌之间的细弧线 | 光标在倒下的骨牌波前面沿弧线跑，弧线用 `heatTrail` |
| S17 | git 图上合并的那一笔（`graph()` 里 `join`） | 合并那一笔由火花光标画出 |

### 交接
所有光标的**最终位置和尺寸**必须和现在一样（`kit/handoff.ts` 的常量、各场的 `handoffIn`/`handoffOut`），火星和拖尾在交接帧的最后 1/60 秒内必须已经熄灭或只剩冷却后的 clay 线，以免下一场的第一帧对不上。

## 不许做的事
- 不改构图、镜头、时间、交接常量；不改 `engine/`。
- 不把光标变成别的形状（它仍然是 clay 块光标；火花是附加的）。
- 不在没有列出的场景里加火花。
- 不截屏自评画面，不对画面下审美结论。

## 文件范围
可以改：新建 `app/src/kit/spark.ts`；`app/src/kit/cursor.ts`（只加，不改已有函数的签名）；表里列出的场景文件和它们的 `scenes/parts/` 辅助文件；新增 `app/tests/kit-spark.test.ts`。

## 验收（非视觉，必须全部通过）
1. `bunx tsc` 无错误；`bun test tests` 全部通过；`storyboard-check` 0 过短 0 不递增。
2. 新增 `tests/kit-spark.test.ts`：同一个 t 调用两次输出的线段完全相同；改变调用顺序（先算 t=5 再算 t=3，与反过来）结果相同；速度为 0 时没有火星；`heatTrail` 在年龄 0 和年龄 > cool 时的颜色。
3. 性能：`bun scripts/render.ts perf` 整片平均每帧 < 25 ms，列出每场平均值；`--samples auto` 导出时，报告子帧数分布（火星不应让大量帧跳到 324）。
4. 确定性：挑 5 个时间点（1.5、12.0、45.5、103.4、123.6）渲两次静帧逐像素一致。
5. 交接测试全部通过；另外对表里每个场景，渲染它最后一帧和下一场第一帧，报告光标位置差（像素）。

## 交付给 Tim 看的东西
- 每个场景一段短片（含前后各 0.5 秒）：`out/codex/v4-b/<场景>.mp4`，用 `--samples auto --preset medium --crf 16`。
- 整片预览：`out/preview/clawd-mv-preview-v4b.mp4`（成片同画质）。
- 报告 `out/codex/v4-b-report.md`：只写技术事实（改了什么、验收结果、性能、需要 C 决定的问题）。

## Git
从 V4-A 合并后的 main 开新 worktree：`git worktree add ../clawd-mv-v4b -b codex/v4-b`，`bun install`，拷 `audio/song.wav`。做完在分支上提交，**不合并、不推送**。
