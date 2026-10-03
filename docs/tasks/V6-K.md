# V6-K：v6 公共部件（歌词路径、字平面、交接 v2）

设计：C（Claude）。实现：Codex gpt-6.1-sol。**严格按本规格实现，不改设计**；规格没写到的细节，按「设计意图」一节的意思做，并在报告的「取舍」一节逐条列出。不截屏自评画面，报告只写技术事实。

先读：`docs/reference/pdoom-transitions-lyrics.md`（第 2 节和第 4 节 R2–R5 是本任务的依据）、`docs/ENGINE.md`、`app/src/kit/rig.ts`、`app/src/kit/vartype.ts`、`app/src/kit/lyric-moves.ts`（`Voice`、`heatColor`）、`app/src/kit/handoff.ts`、`app/src/scenes/s14-shaft.ts` 的 `WordPlane`。参考源码：`reference/pdoom/scenes/loss.ts`（`drawCanyonText`、`drawChartText` 里的 drop、`glyphTime`、`writeHead`）、`reference/pdoom/scenes/stack-kit.ts`（`TextPlane`、`TEXT_FRAG`）、`reference/pdoom/scenes/room-shrooms.ts`。

## 只改这些文件
新建：`app/src/kit/pathtext.ts`、`app/src/kit/wordplane.ts`、`app/src/kit/carry.ts`、`app/src/scenes/gallery-pathtext.ts`、`app/src/scenes/gallery-wordplane.ts`、`app/tests/kit-pathtext.test.ts`、`app/tests/kit-wordplane.test.ts`、`app/tests/kit-carry.test.ts`、`app/tests/handoff.test.ts`。
修改：`app/src/kit/handoff.ts`（只**追加**，现有 `HANDOFF` 常量一个字都不动，场景还在用）。
不许改任何场景文件、`engine/`、`timeline.ts`、`shots.json`。

## 设计意图（一句话）
歌词是长在世界上的东西：每个字母有自己被唱到的时刻、在 3D 里有位置和姿态、被「书写头」（clay 光标）写出来、出生时白热然后冷却、之后跟着世界一起动（被抬起、落下、碎掉）。交接物是一个屏幕空间的几何原语，两个场景用同一个函数算它，测试保证切点前后误差 ≤ 2 px。

---

## 1. 逐字母时刻（`pathtext.ts` 导出，`wordplane.ts` 和场景都用）

```ts
export interface GlyphTime { t0: number; t1: number }
/** Letter j of a word: when it is sung. */
export function letterTimes(word: Word, opts?: { spread?: number; maxSpan?: number }): GlyphTime[]
```
- 只对字母和数字计数（`Array.from(word.w)` 里 `/[\p{L}\p{N}]/u` 的字符）；标点、撇号、连字符跟随前一个字母的时刻（`t0` 相同、`t1` 相同），开头的标点（`“`、`’cause` 的 `’`）跟随第一个字母。
- 设字母数 n，词长 `dur = end - start`。铺开的时长 `span = dur <= 0.5 ? dur : min(dur * spread, maxSpan)`，默认 `spread = 0.8`、`maxSpan = 0.7`（照 pdoom spacetime 的长音规则）。字母 j：`t0 = start + span * j / n`，`t1 = start + span * (j + 1) / n`。
- 永远 `t0 >= word.start`（这是硬规则：字不早于人声）。

```ts
/** Arc-length write head: where the sung text has reached at t (pdoom loss.ts writeHead). */
export function writeHead(glyphs: PathGlyph[], t: number, s0?: number): number
```
- 按 `glyphs` 顺序：最后一个 `t >= t0` 的字母给出 `s + w * clamp((t - t0) / max(0.01, t1 - t0))`；一个都没开始时返回 `s0 ?? glyphs[0].s`。单调不减（测试）。

## 2. `kit/pathtext.ts`：沿 3D 路径逐字母排布

### 2.1 路径
```ts
export interface Path3 { pts: P3[]; cum: Float64Array; length: number }
export function path3(pts: P3[]): Path3                 // 按弧长参数化，cum[i] = 到第 i 点的弧长
export function pathAt(p: Path3, s: number): P3          // 二分查找 + 线性插值，s 夹在 [0, length]
export function tangentAt(p: Path3, s: number, h?: number): P3   // 中心差分，单位向量，h 默认 0.05
export function samplePath(f: (u: number) => P3, n: number): Path3  // 把参数曲线采成 n+1 个点
```

### 2.2 排版
```ts
export interface PathGlyph {
  ch: string; word: Word; wi: number;     // wi = 词在 words 里的序号
  s: number; w: number;                   // 起点弧长、世界里的字宽（按排版时的 axes）
  t0: number; t1: number;                 // letterTimes（再经 notBefore 修正）
  i: number;                              // 在整串里的序号
}
export interface PathLayout { glyphs: PathGlyph[]; s0: number; s1: number; capH: number }
export function layoutPath(words: Word[], o: {
  capH: number;                 // 世界单位的大写高
  s0?: number;                  // 起始弧长，默认 0
  axes?: Axes;                  // 排版用的轴（决定字宽），默认 { wdth: 100, wght: 800 }
  space?: number;               // 词间距（em），默认 0.32
  tracking?: number;            // 字距（em），默认 0
  upper?: boolean;              // 大写，默认 false
  notBefore?: (s: number) => number;   // 书写头到达弧长 s 的时刻；t0 = max(t0, notBefore(s))（pdoom glyphTime）
}): PathLayout
```
- 字宽用 `varRun`（大小 100 时的 advance 换算成世界单位：`w = adv100 * capH / capH100`），保留字偶距（kern）。词间距、字距按 em 换算成世界单位加在 s 上。

### 2.3 绘制
```ts
export interface PathTextStyle {
  mode: 'stand' | 'lie';
  // stand：字直立在路径上，像 loss 的峡谷字。屏幕上的字宽 = 该字首尾两点投影后的距离（透视压缩），字高 = 投影尺度 × capH，
  //        角度 = 屏幕切线角，夹在 ±maxAngle。up 方向（世界）决定「直立」：默认 (0,1,0)。
  // lie：字平躺在路径所在的面上，像路面标线。用 planeAffine：ux = 切线，uy = normal(s) × 切线（按右手系，保证字不镜像），
  //        字的基线在路径上。
  up?: P3;                       // stand 用，默认 (0,1,0)
  normal?: (s: number) => P3;    // lie 用，必填
  lift?: number;                 // 沿 up（stand）或 normal（lie）抬起的世界距离，默认 0
  maxAngle?: number;             // 默认 0.7 rad
  minPx?: number; maxPx?: number;// 屏幕大写高夹值，默认 10 / 400
  base: ThemeKey; on: On;        // 冷却后的颜色和底色：用 heatColor(base, on, age)，age = t - t0
  axes?: (g: PathGlyph, t: number) => Axes;   // 每帧的轴（通常来自 Voice.form(g.word, t).axes）；不给就用排版轴
  // 字宽随轴变化时：绘制宽度按当前轴的 advance / 排版 advance 缩放，弧长位置不变（字不挤来挤去）
  outline?: { color: string; px: number };    // 先描一圈底色描边再填（pdoom 峡谷字 16 px ink 描边），默认无
  pop?: number;                  // 出生弹起时长 s，默认 0.16：纵向 0.3 → 1，ease.outBack
  offset?: (g: PathGlyph, t: number) => { d?: P3; spin?: number; alpha?: number; scale?: number } | null;
  // 字的后半生由场景决定：d 世界位移（下落、被抛出）、spin 屏幕平面内旋转（弧度）、alpha、scale。返回 null = 不画。
  visible?: (p: P3) => boolean;  // 遮挡：场景用 CPU 版的世界函数判断该点是否被挡（例如在地形下面），false 就不画
}
export interface PathTextFrame {
  bbox: { x: number; y: number; w: number; h: number } | null;   // 本帧画出的所有字的屏幕包围盒（构图测试用）
  head: { x: number; y: number; s: number } | null;              // 书写头的屏幕位置（光标/火花贴在这里）
  drawn: number;                                                 // 画了几个字
}
export function drawPathText(c: CanvasRenderingContext2D, rig: Rig, path: Path3, lay: PathLayout, t: number, st: PathTextStyle): PathTextFrame
```
行为细节（都要实现，都要测）：
- `t < g.t0` 的字不画。`heat = exp(-(t - t0) / 0.28)`，颜色用 `heatColor`。
- 每个字用 `varGlyph` + `tracePath` 画（连续 Archivo）。**缓存**：按 `ch + 轴量化到 wdth 0.5、wght 5` 缓存 `Path2D`（字号 100、原点左基线），之后只用 `setTransform` 摆放；缓存容量上限 4096，满了整个清掉。
- stand 模式：取 `a = pathAt(s)`、`b = pathAt(s + w)`，都加 `lift * up`，投影 `qa、qb`；任一为 null 或 `qb.x < qa.x`（字背对镜头）就不画；`adv = |qb - qa|`；`size = clamp(0.5 * (qa.s + qb.s) * capH, minPx, maxPx)`（屏幕大写高）；变换：平移到 `qa`、旋转 `clamp(atan2, ±maxAngle)`、x 缩放 `adv / advAt100`、y 缩放 `size / capAt100 * popY`。
- lie 模式：`planeAffine(rig, pathAt(s) + lift*normal, tangent, uy, m)`，其中 `m` 让字号 100 的 cap 高 = capH 世界单位。
- `offset` 的 `d` 在投影前加到 a、b（或 lie 的锚点）上；`spin` 绕字的中心转。
- 不改 `c` 的状态（save/restore），不清画布。
- 性能：80 个字、stand 模式、轴每帧变化时，`drawPathText` 每帧 ≤ 2.5 ms（测试里在 Bun 下用假的 CanvasRenderingContext2D 计时只测 JS 部分，≤ 1.5 ms；真实画布耗时在陈列页里用 `render.ts perf` 报告）。

## 3. `kit/wordplane.ts`：字的 3D 平面（S14 WordPlane 的升级，照 pdoom TextPlane）

```ts
export interface WordPlaneOpts {
  capH: number;                  // 世界单位的大写高
  axes?: Axes;                   // 默认 { wdth: 87.5, wght: 900 }
  tracking?: number;             // em
  texCap?: number;               // 贴图里的大写高（逻辑 px），默认 160；实际贴图乘 SCALE
  ax?: number; ay?: number;      // 锚点：墨框的 x 比例（0 左 1 右）、大写高的 y 比例（0 基线 1 顶），默认 0、0.5
  outline?: number;              // G 通道描边宽度（em），默认 0.018
  engrave?: boolean;             // 刻字模式，见下
}
export class WordPlane {
  readonly mesh: THREE.Mesh; readonly w: number; readonly h: number;   // 墨框的世界宽、大写高
  readonly glyphU: { u0: number; u1: number }[];                        // 每个字母在贴图 u 上的范围（卡拉 OK 按字母走）
  constructor(text: string, o: WordPlaneOpts)
  set(u: Partial<{
    prog: number;     // 已唱到的 u（0..1，墨框内）；用 karaoke() 算
    dir: 1 | -1;      // 1 左到右，-1 右到左（disobey 式）
    feather: number;  // 默认 0.04
    cDim: RGB; cSung: RGB; cDone: RGB;   // 线性 RGB
    aDim: number;     // 未唱部分的不透明度，默认 0.35
    done: number;     // 0..1 唱完后冷却成 cDone
    heat: number;     // 0..1 白热（叠加 C_HOT），新唱到的字母自己会白热，见下
    opacity: number;
    tone: number;     // 刻字模式的光照明暗 0..1（场景算 dot(N,L) 传进来）
    hatchAngle: number; hatchPx: number;  // 刻线方向（屏幕弧度）、间距（逻辑 px），默认 0.6、5
  }>): void
  karaoke(word: Word, t: number): number          // 用 letterTimes 和 glyphU 算 prog：字母 j 在 [t0,t1] 内从 u0 走到 u1
  letters(): WordPlane[]                          // 拆成每个字母一个平面（位置和整词完全重合），给逐字母脱队用
  dispose(): void
}
```
- 贴图：黑底，R = 填充，G = 描边（照 TextPlane）；用 `varRun` + `fillRun` 画；`SCALE` 倍分辨率，mipmap，各向异性 8。
- 着色器（`RawShaderMaterial`，GLSL3，透明、不写深度、测深度）：
  - 已唱部分 = `cSung`，并且新唱到的那一小段（`prog` 前沿后 0.08 u 内）向 `C_HOT` 白热；未唱部分 = `cDim * aDim`；`done` 把整体冷却到 `cDone`。
  - 刻字模式（`engrave: true`）：填充不是实色，而是刻线：`cov = hatch 覆盖率(tone)`，暗处线粗、亮处线细（用 `GLSL_COMMON` 的 `hatch`/`engrave` 逻辑，线宽用 `pxLine` 保证 4K 一致）；描边（G）始终是实线。意图：字和 v5 的世界一样是「先算光再换成线」。
- 4K：`texCap * SCALE`；同一个 t 渲染两次逐像素一致。

## 4. `kit/carry.ts`：跨切点的词（R2）

照 `room-shrooms.ts`：上一场把正在唱的长音词送到一个固定的屏幕版面，下一场开头在同一个版面里把它唱完，然后交给自己的世界。两场 import 同一个函数。

```ts
export interface CarrySpec {
  text: string;                  // 显示的词（含标点），如 'machine'
  size: number;                  // 屏幕大写高 px（切点时）
  axes: Axes;                    // 切点时的轴
  x: number; y: number;          // 墨框左下（基线）在屏幕上的位置，逻辑 px
  tracking?: number;             // em
  color: ThemeKey;
}
export interface GlyphAffine { a: number; b: number; c: number; d: number; e: number; f: number; ch: string; i: number }
/** Per-letter affines (canvas px, font size 100, origin left baseline) in the carry layout at scale k (1 = at the cut). */
export function carryLayout(spec: CarrySpec, k?: number): GlyphAffine[]
/** Same, with a deterministic per-letter drift d (0..1): small rotation ±0.05 rad, lift ≤ 0.06 em; used while the note is still held. */
export function carryDrift(spec: CarrySpec, t: number, d: number): GlyphAffine[]
export function drawCarry(c: CanvasRenderingContext2D, spec: CarrySpec, aff: GlyphAffine[], alpha?: number): void
/** Blend from any per-letter affine (e.g. the word's pose on a 3D plane) into the carry layout. */
export function lerpAffines(a: GlyphAffine[], b: GlyphAffine[], k: number): GlyphAffine[]
```
- 测试：`carryLayout(spec, 1)` 的墨框和 `varRun(spec.text, …)` 在 (x, y) 处的墨框误差 ≤ 0.5 px；`lerpAffines(a, b, 0)` = a、`(…, 1)` = b；`carryDrift(d=0)` = `carryLayout`。

## 5. `kit/handoff.ts` v2（追加，不动现有常量）

```ts
export type Prim =
  | { kind: 'point'; x: number; y: number; r: number }                       // 火花、光标点
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number; w: number } // flatline、基线、删除线
  | { kind: 'rect'; x: number; y: number; w: number; h: number; roll?: number }  // 面、键帽、骨牌面
  | { kind: 'carry'; spec: CarrySpec };                                     // 跨切点的词
export interface Cut {
  id: string;                    // 'S01>S02'
  out: string; in: string;       // 场景 id
  /** 两边各自导出的纯函数：给定 t，返回该场在 t 时刻交接物的屏幕原语（只在切点附近有定义）。 */
}
/** Distance between two prims of the same kind: max over corresponding points (px) and relative size error. */
export function primError(a: Prim, b: Prim): { px: number; size: number }
/** Last-beat envelope for the outgoing scene (R4): still = 1 in the final 0.1 s (camera shake/zoom must be 0), gain ramps 1 → peak over the final 90 ms. */
export function exitEnvelope(t: number, end: number, peak?: number): { still: number; gain: number }
/** Beat subdivisions accelerating into a cut (R4): eighths from t0, sixteenths from tSwitch, until end. Returns the times. */
export function accelerando(audio: AudioData, t0: number, tSwitch: number, end: number): number[]
```
- `primError`：point 比圆心和 r；line 比两端点（端点可交换，取较小）和 w；rect 比四角和 w/h；carry 比每个字母仿射作用在 (0,0)、(advance,0)、(0,-cap) 三点后的位置。
- 新建 `app/tests/handoff.test.ts`：先只放 `primError`、`exitEnvelope`、`accelerando` 的单元测试，并留一个 `CUTS` 注册表（空数组 + 类型）和一个遍历它的测试：每个注册的切点，用两场导出的 `exitPrim(t)`、`entryPrim(t)` 在 `[cut - 1/60, cut]` 和 `[cut, cut + 1/60]` 上求值，要求 `px ≤ 2`、`size ≤ 0.02`。之后各场任务往表里加条目。

## 6. 陈列页（给 C 看画面用，Codex 只报技术事实）
- `gallery-pathtext.ts`（`?gallery=pathtext`）：ink 底，一条 3D 正弦山脊路径（stand 模式）上排我们的 `There’s a thirty-second day in October`（从 `lyrics.get` 取真实时间），镜头沿路径慢推（`orbitCam`），书写头处画 `cursorSpark`；同屏下方一条平面螺旋路径用 lie 模式排同一句。时间轴就是歌曲时间（10.0–14.0 s 循环）。
- `gallery-wordplane.ts`（`?gallery=wordplane`）：三块平面在 3D 里缓慢转：普通卡拉 OK（`commit`）、右到左（`machine`）、刻字模式（tone 随转角 = dot(N, L)）；外加 `letters()` 拆开后每个字母依次脱队下落。
- 静帧：`cd app && bun scripts/render.ts stills --t 11,12,13 --gallery pathtext --out ../out/v6-k/pathtext`；短片用 `video --gallery … --from --to`。短片各 4 秒放 `out/v6-k/`。

## 7. 验收（全部要过，报告里贴数字）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错。
2. `bun test tests` 全部通过（现有 277 项 + 新增）。新增测试至少覆盖：letterTimes 的规则（标点跟随、长音 0.8/0.7、不早于词首）；writeHead 单调；layoutPath 的弧长连续、notBefore 生效；stand 模式投影：用一个已知相机，字的屏幕宽 = 首尾投影距离（误差 ≤ 0.5 px）、角度夹值；lie 模式不镜像（变换行列式 > 0）；背对镜头不画；同一 t 两次调用输出（记录下来的 setTransform 序列）完全一致；缓存上限；WordPlane 的 karaoke 在字母边界上的值；carry 和 handoff 的测试见上。
3. `bun scripts/storyboard-check.ts` 0 过短 0 不递增。
4. `bun scripts/render.ts perf`（整片）每帧平均 < 25 ms，并单独报告两个陈列页的每帧耗时。
5. 报告 `out/codex/v6-k-final.md`：做了什么、每个导出的签名、测试数、性能数字、静帧和短片路径、**取舍清单**（规格没写死、你自己决定的每一处）。不写「好看」之类的评价。
