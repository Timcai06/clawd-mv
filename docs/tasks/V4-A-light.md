# V4-A：光和材质（全片）

写给：Codex（gpt-6.1-sol，推理 high）。写的人：C（Opus）。验收：C 审代码和数据，Tim 看画面。
背景：`docs/reference/gap-v4-vs-pdoom.md` 的第 2 条和升级顺序 A。Tim 2026-10-01 认可先做 A、B。

## 目标（一句话）
**构图、镜头、时间一律不动**，只给画面加「光」和「印刷质感」：墨蓝底的场景里 clay 元素真正发光；唱出来的字刚出现时白热、随后冷却；纸面场景有纤维和油墨压印的质感。

## 先读
1. `docs/ENGINE.md`（确定性、运动模糊、4K 规则、`FRAG_PX`/`pxLine`）、`docs/ARCHITECTURE.md`。
2. `app/src/kit/ground.ts`（`Ground`、`GlowLayer`、`postFor`）、`app/src/theme.ts`（`POSTER_POST`）、`app/src/engine/post.ts`（bloom 参数）。
3. 已经在用发光的参考：`app/src/scenes/s14-shaft.ts`（`GlowLayer` + bloom 0.55）、`app/src/scenes/s01-boot.ts`。
4. pdoom 的做法（只读参考）：`reference/pdoom/scenes/loss.ts` 的 `heatCss`（白热 → 冷却）和 `reference/pdoom/docs/TREATMENT.md` 的 Palette 一节（「只有 signal/ember 超过约 0.85 线性值，骨色字永远不发光」）。

## 规格

### A1 墨蓝底（INK）场景的发光
涉及：S01、S05、S07、S09、S11、S13（墨蓝部分）、S14、S15（墨蓝部分，`s.paper` 为 false 时）、S18（夜里，天亮之前）。
- 去掉这些场景 `render()` 返回值里的 `bloom: 0` 覆盖，改用 `postFor('ink')` 的 bloom 参数（threshold 0.95）。S07 现在的 `bloom: 0.15, bloomThreshold: 1.1` 也改为统一参数。S14 保持现状（已经是目标效果）。
- **只有 clay 发光**：每个场景里 clay 色的元素（光标、扫描头、clay 线条、clay 色的唱词、Clawd 的身体、雨里的 clay 竖条、第 42 行的 clay 线等）**额外**画进一个 `GlowLayer`，用 `glow.composite(ctx, out, 强度)` 叠加，强度 1.4–2.2（Clawd 用 0.25 透明度的光晕，和 S01 一样，不要把 Clawd 本身变亮）。纸色（paper）的字和线**不进** GlowLayer，必须保持清晰不发光。
- 同一个场景里纸面 / clay 满屏的部分（S13 的 clay 半边、S15 天亮后的纸面）不加发光。clay 满屏本身的线性值低于阈值，不会被 bloom 影响，不要人为提亮它。
- INK 场景加轻微色散 `ca: 0.6`（S14 除外）。

### A2 唱词的「白热 → 冷却」
- 在 `kit/lyric-moves.ts` 的 `WordForm` 上新增字段 `age: number`（= t − word.start，出生前为负），在 `Voice.form()` 里算。
- `drawSet`、`gridSnap`、`stamp` 以及 `kit/vartype.ts` 之外各场自己画唱词的地方（用 `form.born` 判断出生的地方），统一调用一个新的纯函数 `heatColor(base: ThemeKey, on: On, age: number): string`（放在 `kit/lyric-moves.ts`）：
  - INK 底：出生瞬间是白热色 `rgb(255,243,224)`，在 0.28 秒内按指数（`exp(-age/0.28)`）冷却到原来的颜色。
  - PAPER 底：出生瞬间是 clay 色，同样 0.28 秒冷却到原来的颜色（ink 或 clay）。
  - CLAY 底：出生瞬间 paper 色，冷却到原来的颜色。
  - 本来就是 clay 的重读词：INK 底上白热冷却到 clay，并且这个词同时画进该场的 GlowLayer。
- 这是全片唱词的统一行为。不改字号、位置、轴、出现时间。

### A3 纸面（PAPER）场景的印刷质感
涉及：S02、S03、S04、S06、S08（纸面部分）、S10、S12、S16、S17（纸面部分）、S15/S18 的纸面部分。
- 新建 `kit/print-overlay.ts`：一个全屏 `FSPass`，在场景最后用 multiply 方式叠在整帧上（在 `comp.draw` 之后、`return` 之前），强度参数默认 0.05。内容：纸纤维（细长的方向性噪声）、油墨压印的不均匀（低频斑驳）、极少量的随机墨点。必须用 `FRAG_PX`（4K 下尺寸不变），噪声只依赖像素坐标（**不随时间变化**，纸是静止的纸），这样不会给自适应采样增加负担。
- 对 clay 填色的大面积（S08 的 clay 满屏、S13 的 clay 半边、S17 的 clay 满屏）用同一个叠加，强度 0.04。
- 不改 `Ground` 的现有参数。

## 不许做的事
- 不改任何构图、位置、尺寸、镜头（`kit/lens.ts` 的参数和各场 `view()` / `lensView()` / `camera()`）、时间、交接常量（`kit/handoff.ts`）。
- 不改 `engine/` 下的文件。需要的话在报告里提出。
- 不加新颜色。白热色 `rgb(255,243,224)` 是唯一新增的颜色值，写在 `theme.ts` 里作为 token `hot`。
- 不在画面里加新元素（注释、粒子、线条都不加；粒子是 V4-B 的事）。
- 不截屏自评画面，不对画面下审美结论。

## 文件范围
可以改：`app/src/theme.ts`（只加 `hot` token）、`app/src/kit/lyric-moves.ts`、`app/src/kit/ground.ts`（如需在 `postFor` 里调参数）、新建 `app/src/kit/print-overlay.ts`、`app/src/scenes/s*.ts` 和 `app/src/scenes/parts/s*.ts`（只做上面说的改动）、`app/tests/` 里新增 `kit-heat.test.ts`。

## 验收（非视觉，必须全部通过）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
2. `cd app && bun test tests` 全部通过（现在是 241 项），并新增 `tests/kit-heat.test.ts`：`heatColor` 在 age<0、age=0、age=0.28、age=2 时的值；`Voice.form().age` 的值。
3. `cd app && bun scripts/storyboard-check.ts`：0 过短、0 不递增。
4. 性能：`cd app && bun scripts/render.ts perf` 整片平均每帧 < 25 ms（现在约 8–10 ms），报告每场的平均值。
5. 确定性：挑 5 个时间点（12.4、50.9、92.0、109.0、140.0），同一时间渲染两次静帧，逐像素一致（写一个小脚本比较，或用 `stills` 渲两次再比 PNG）。
6. 交接没变：现有交接测试全部通过（它们在 `tests/scene-v3-*.test.ts` 里）。

## 交付给 Tim 看的东西
- 静帧：`cd app && bun scripts/render.ts stills --t 2.5,6.2,9.5,12.0,15.5,19.8,22.5,27.0,33.0,46.5,50.9,54.0,61.0,70.0,84.5,92.0,101.0,109.0,116.0,124.0,128.5,140.0,156.0 --out ../out/codex/v4-a/stills`
- 整片预览（成片同画质）：`cd app && bun scripts/render.ts video --samples auto --preset medium --crf 16 --out ../out/preview/clawd-mv-preview-v4a.mp4`
- 报告 `out/codex/v4-a-report.md`：改了哪些文件、每条规格怎么实现的、验收 1–6 的结果（原样贴命令输出的关键行）、每场的 perf、遇到的问题和需要 C 决定的地方。**只写技术事实。**

## Git
在独立 worktree 和分支上做：`git worktree add ../clawd-mv-v4a -b codex/v4-a`，先 `cd ../clawd-mv-v4a/app && bun install`，把 `audio/song.wav` 拷进 worktree 的 `audio/`。做完在分支上提交，**不合并、不推送**，由 C 审查后合并。
