# V3 铺开：歌词 v3 + 分镜对齐 + 场景交接（Codex 分组任务）

写给：Codex（gpt-6.1-sol）。写的人：C（Opus）。验收：C 审代码和数据，Tim 看画面。

## 先读（按顺序）
1. `docs/TREATMENT.md` 最后一节「歌词 v3 与分镜对齐：定稿」——**这是规格本身**：层级规则、你这组每场的歌词机制、交接物。
2. `docs/STORYBOARD-TARGETS.md` 里你这组的行，和 `out/storyboard/v2/kf-SNN.png`（目标构图）。
3. 参考实现（照着写法做）：`app/src/scenes/s04-calendar.ts` + `parts/s04-city-model.ts`（计数器、OCTOBER 标题、相机写成纯函数）、`app/src/scenes/s11-rain.ts` + `parts/s11-deep.ts`（拉焦、缺字、整屏砸字）。
4. 公共模块（**只读**）：`kit/vartype.ts`（连续 Archivo：`varRun`、`fillRun`、`fitVar`）、`kit/lyric-moves.ts`（`Voice`、`setLine`、`drawSet`、`gridSnap`、`odometer`、`stamp`、`drawWithMissing`、`Plate`、`rollOn`）、`kit/handoff.ts`（交接常量）。
5. `docs/ENGINE.md`、`docs/ARCHITECTURE.md` 的「场景文件约定」。

## 分组和文件归属（只改自己组的文件）
| 组 | 场景 | 你可以改的文件 |
|---|---|---|
| A | S01 S02 S03 S04 | `scenes/s01-*` `s02-*` `s03-*` `s04-*`，`scenes/parts/s01-*` … `s04-*`，`tests/scene-a.test.ts`、`scene-b.test.ts` 里 S04 的部分、新建 `tests/scene-v3-a.test.ts` |
| B | S05 S06 S07 | `s05-*` `s06-*` `s07-*` 及其 parts，`tests/scene-b.test.ts` 里 S05 的部分、`scene-c.test.ts`，新建 `scene-v3-b.test.ts` |
| C | S08 S13 | `s08-*` `s13-*` 及其 parts，新建 `scene-v3-c.test.ts` |
| D | S09 S10 S11 S12 | `s09-*`（含 `s09-z-shared.ts`）`s10-*` `s11-*` `s12-*` 及其 parts（可删除不再用的 `parts/s11-storm.ts` 并改 `scene-d.test.ts`），`scene-s09-s12.test.ts`，新建 `scene-v3-d.test.ts` |
| E | S14 S15 | `s14-*` `s15-*` 及其 parts，`scene-e.test.ts`，新建 `scene-v3-e.test.ts` |
| F | S16 S17 | `s16-*` `s17-*` 及其 parts，`scene-f.test.ts`，新建 `scene-v3-f.test.ts` |
| G | S18 | `s18-*` 及其 parts，`kit/credits.ts`，`scene-g.test.ts`，新建 `scene-v3-g.test.ts` |

`kit/`、`engine/`、`timeline.ts`、`storyboard/`、`data/` 一律不改。缺接口就在报告里写清楚要什么，C 来加。

## 要做的事（每个场景）
1. **歌词**：按定稿表里本场的机制重写唱词。唱词只用 `Voice` + `vartype`；删除本场对 `lyricsTypeState`、`sungLine`、`drawLyricsLine`、`drawLyricsHook`、`X9Lyrics` 的调用。重读词用 `form.stress`（clay），不要自己另定。词在 `word.start` 之前不可见（`form.born` 已保证，别绕过）。一句歌词跨切点时，下一场接着显示这句已唱过的词。
2. **层级**：满足定稿的五条层级规则。在场景主文件里导出 `export const TYPE_LEVELS = { giant: <px 或 null>, lyric: <px>, label: <px> }`（各级的**大写高**，px），测试会检查。删掉装饰性的 mono 说明文字，同时最多两处标注。
3. **对齐分镜图**：按目标清单这一行做主导元素（大小、位置）、镜头角度、层次。主导元素占画面 ≥ 30%。
4. **交接**：从 `kit/handoff.ts` import 本场涉及的常量。上一场最后 1 拍把交接物移到常量位置；下一场第一帧从那里开始。在 parts 里导出纯函数 `handoffOut(t)` / `handoffIn(t)`，返回交接物在时间 t 的屏幕几何（和常量同样的字段）。
5. 时间一律从对齐数据和分镜锚点算（`wordTime`、`afterBeats`、`resolveStoryboard`），不写死秒数。

## 验收（全部非视觉，你自己跑完再交）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误；`bun test tests` 全部通过。
2. `tests/scene-v3-<组>.test.ts` 至少包含：
   - 交接：`handoffOut(出场最后一帧)`、`handoffIn(进场第一帧)` 与常量的差 ≤ 2 px（只测本组那一侧）。
   - 层级：`TYPE_LEVELS` 的歌词级在 50–110，标注级在 14–22（按大写高换算前的字号也行，写清楚），有巨字时巨字 ≥ 200 且 ≥ 歌词级 × 2.5。
   - 唱词时间：本场每个唱词的 `Voice.form(word, word.start - 0.01).born === 0`。
   - 确定性：同一 t 调两次纯状态函数结果相同，先跳到别的时间再回来也相同。
3. `grep -nE "lyricsTypeState|sungLine|drawLyricsLine|drawLyricsHook|X9Lyrics" app/src/scenes/<本组文件>` 无结果。
4. 性能：`bun scripts/render.ts perf --only <本组镜头 id> --from <起> --to <止>` 平均 < 25 ms/帧，报出数字。
5. 产物（给 Tim 看，不要自己评画面）：
   - `bun scripts/compare.ts --tag v3-<组> --scenes <本组场景>`
   - `bun scripts/render.ts video --from <起-0.5> --to <止+0.5> --preset veryfast --out ../out/v3-<组>/clip.mp4`
6. 不截屏自评画面，不对好不好看下结论。报告里只写技术事实：改了哪些文件、测试结果、每场 ms/帧、交接误差、需要 C 加的接口。

## 不要做
- 不改别组文件、不改 kit/engine；不推送；不用 fast 模式。
- 不加描边、发光（INK 底上的 clay 除外）、渐变、写实光影。
