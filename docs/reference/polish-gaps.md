# 阶段 9 ②：全片离 pdoom 还差什么（动效与细节），以及歌词怎么从「字幕」变成画面的一部分

C 2026-10-03 写，给 Tim 挑优先级。依据：全片 67 张静帧（`out/wip/survey/sheet0–5.png`，每场 3–6 张）、三次 COMMIT 冲击的对比帧（`out/wip/commits/sheet.png`）、我们 18 场的歌词与镜头代码、pdoom 源码（`reference/pdoom/scenes/`）和它的 `docs/TREATMENT.md`。只写技术事实和设计意图。

## 0. 先回答最重要的问题：为什么我们的歌词像一层字幕

### 0.1 实测原因（读代码和静帧得出）
1. **18 场里有 14 场用同一个画字函数**：`kit/lyric-moves.ts` 的 `setLine` + `drawSet`（或 `gridSnap`）。它的行为是：整个词在词首一次出现（110 ms 内上浮 6 %），摆在一条水平基线上，位置是屏幕坐标里写死的一个点（S01 `(96,1008)`、S03 `(232,972)`、S05 `(270−offset,738)`、S08/S13 顶部一行格子、S17 左上……），和画面里的物件没有几何关系。这就是字幕轨的定义：同一种排法、固定的位置、和画面无关。
2. **字是整词出现的，不是被「写」出来的**：没有逐字母的时刻；clay 光标在多数场景里是装饰，不是书写头（S01、S02、S05、S08 的光标和正在唱的词不在同一个位置）。
3. **字不跟世界动**：镜头推拉时字跟着整张画面一起缩放（因为画在同一张图上），但画面里的物件动、碎、翻、落的时候，字不参与；字的退场是 `Voice.presence` 的淡出（下一句开始后留 12 % 的残影一拍），也就是原地淡出。
4. **全片的字长得一样**：几乎全是 Archivo 74–100 px 的一行，同样的白热冷却、同样的上浮，没有随场景换「写法」（打字机、笔写、盖章、扫描、印在物体上）。
5. 对照 pdoom 的规则（`reference/pdoom/docs/TREATMENT.md`「Karaoke rules」）：*Each plate integrates the lyric graphically and differently: written by the spark, riding on a curve, typed as tokens, stamped on a form… The words are part of the image, not subtitles on top.* 以及「Typography」：*Avoid centred-everything subtitles except where it’s the point.* pdoom 18 个 plate 里，歌词的载体各不相同（见 `docs/reference/pdoom-transitions-lyrics.md` 第 2.2 节）。

### 0.2 设计：每句歌词是这一场里的一个物件，由书写头在画面里写出来，再被这个世界带走
五条规则，每场都要满足：
1. **载体**：每句挂在这一场已经有的物件上，坐标从物件算，不从屏幕算。S01 的终端输入行、S02 的通知卡、S03 的表格字段、S04 的日历地面、S05 正在读的代码行、S06 的清单、S07 的键帽、S08 的括号、S09 的示波器波形、S11 的雨、S12 的复印件、S13 的 git log、S15 的 ≤、S16 的骨牌、S17 的 PR 页面……**不再有漂在画面下方的那一行**。多数场景是平面的，载体是平面版式里的物件，不为此加 3D。
2. **书写头**：每个字母有自己被唱到的时刻（照 pdoom `loss.ts` 的 `glyphTime`：字母时刻 = 词内插值，但不早于书写头到达），书写头就是 clay 光标。按场景换四种书写头：**打字**（光标前进一格落一个字，照 `bureau.ts` 的 `drawTyped`：新字下沉 4 px 再弹回、行内微抖、前方有一个 clay 小三角指示下一击）、**笔写**（单线字体被笔画出来，照 `fuse.ts`/`open.ts` 的 `drawStrokeText` + `writtenLength`，我们的 `engine/stroke.ts` 已有）、**盖章**（照 `room.ts` 翻牌板逐字母盖章、`bureau.ts` 的 `drawSafeStamp`）、**扫描**（扫描头经过处显影，照 `spacetime.ts` 的 `drawScope`、`shoggoth.ts` 的 `updateBand`）。
3. **出生**：每个字母白热出生再冷却（已有 `heatColor`，改成逐字母）；出生动作由书写头决定（打字下沉、盖章从 1.7 倍砸下、笔写沿笔画长出）。
4. **长音形变跟着载体走**：长音不只是变宽（现在的 `Voice` 宽度 87.5→125），而是**按拍分档**变（照 pdoom 的 LIES 每拍换一档宽度、BOSS 宽 62→125 且字号 120→270），并且沿载体方向拉伸（波形上的字沿波形拉长，键帽上的字撑满键帽）。
5. **退场**：字随物件离开，不原地淡出。物件滚走字一起滚走（S05 平台、S12 复印件），物件碎字一起碎（S10 玻璃，已有），物件落字一起落（S03 表格，①里已做），被下一个物件盖住（S02 的卡片），被光标擦掉（S12「clear the cache」）。

### 0.3 工具：一个公共部件 `kit/inscribe.ts`（纯函数，平面）
- `inscription(text, font, size, words)` → 每个字形的 x、宽度、所属词、唱到时刻（词内按字母均分，长音只铺前 80 %，照 pdoom spacetime）。
- `carrier(t)`：场景提供的函数，返回这一刻从「字的局部坐标」到屏幕的仿射（平移、旋转、缩放、切变），或者一条路径 `(s) → {x, y, angle}`（波形、雨的斜线、骨牌的弧）。
- `head`：`'type' | 'pen' | 'stamp' | 'scan'`，决定字母出现的时刻、出生动作、书写头光标画在哪里（光标就画在下一个要出现的字母前，替代各场各写一份的 `drawCursor`）。
- `exit(t)`：场景提供的退场变换（跟着物件的仿射走，或者碎片/下落函数）；没有 `presence` 淡出。
- 测试：每个字母不早于它的时刻出现；书写头的位置 = 最后一个已出生字母的右边；同一个 t 渲染两次一致。
- 这个部件替代 `drawSet` / `gridSnap` 在各场的用法；`drawSet` 保留给终端、日志这类机器文字。

## 1. 全片共性问题（按影响排序）

| # | 问题 | 学 pdoom 的哪一处 | 打算怎么改 | 影响 |
|---|---|---|---|---|
| G1 | 歌词是字幕（见第 0 节） | `TREATMENT.md`「Karaoke rules」；`loss.ts` `glyphTime`/`drawChartText`；`bureau.ts` `drawTyped`；`prompt.ts` `drawTokens`；`fuse.ts` `drawFuseText`；`room.ts` 翻牌板 | 先做 `kit/inscribe.ts`，再逐场换载体（第 2 节每场的第一条） | 最高 |
| G2 | 三次 COMMIT 几乎是同一张画：都是 clay 场 + 满屏 COMMIT；前面的「I need one more」是一行小字（实测 25.0 / 69.0 / 114.7 s） | `hook.ts` 的 `render`（四次换底色、2 帧反色冲击、按次数的震幅 7/13/0/20）、`slam`/`retrig`（第 4 次每拍重砸）、`echoes`（6 层描边回声）、`drawUP`（UPPING 逐字母上冲、速度拉伸） | 每次都改成「一词一砸」满屏：I / NEED / ONE / MORE / COM·MIT，词随底鼓和重读砸下。第 1 次（S08）干净：paper 底 ink 字，砸一次，震 7 px；第 2 次（S13）反色：ink 底 clay 字，MORE 逐字母上冲，MIT 砸下时 2 帧调色板互换，震 13 px，COMMIT 叠 3 层描边回声；第 3 次（S17「one LAST commit」）最大：底色按八分音符在 paper/ink/clay 间频闪，每拍重砸，6 层回声，LAST 单独放大到最大字号，震 20 px，砸完全片唯一一拍完全静止再进「Pull request」 | 最高 |
| G3 | 冲击没有挂在鼓上：18 场里较多读底鼓/军鼓的只有 S04、S06、S07、S17（其余 0–2 处，9 场为 0）；只有 S08、S13、S15 有震屏；pdoom 每个词或音节都有冲击 | `hook.ts` `render`（每个词 2 帧反色、`shake = [0,7,13,0,20][n] * pulse`）；`bureau.ts` `shake`（盖章 30、音节 5）；`room.ts` 的 `beatP`/`sixteenth`（每拍 3 px、16 分音符 5 px） | 公共部件 `kit/impact.ts`：给一组冲击时刻（底鼓、军鼓、重读音节、盖章），返回震屏、推拉的 kick 和「冲击帧 = 调色板互换」的开关；每场按语义挑用哪几种，最后 0.1 s 归零（已有规则） | 高 |
| G4 | 长音只是平滑变宽，不按拍分档，也不随载体拉伸 | `shoggoth.ts` LIES 每拍换宽度；`loss.ts` `drawServantBoss`（BOSS 宽 62→125、字号 120→270）；`hook.ts` 第 4 次 UPPING 每个八分音符发射一份 | `Voice.form` 加 `steps`：长音（≥ 0.6 s）每拍跳一档宽度和字号（`ease.outExpo` 0.08 s 跳到位），并交给 `inscribe` 的载体方向 | 高 |
| G5 | 场内动作多是平滑漂移，少有「停住再猛动」 | `TREATMENT.md`「Tone」：*strong eases (outExpo, inOutCubic, springs), holds, then snaps*；`room.ts` 每拍切镜；`leftturn.ts` `whipAt` | 每场的 lens/相机改成「按拍分段 + 段间 outExpo 猛切 + 段内几乎静止」，替代现在的长 `inOutCubic` 漂移（S01、S03、S05、S09、S11、S16、S18 最明显） | 中 |
| G6 | 段落内没有细分加速：只有切点前做了（①），段落内的高潮（「check, check, check」「run it again」「green and green…」）没有 | `room.ts` 分叉每 8 分音符翻倍、FOOM 改 16 分；`hook.ts` 第 4 次每拍重砸 | 这几处按 8 分 → 16 分音符加密冲击和镜头跳动 | 中 |

## 2. 逐场清单（每场按影响排序；「载体」一条都属于 G1）

| 场 | # | 问题 | 学 pdoom 的哪一处 | 打算怎么改 | 影响 |
|---|---|---|---|---|---|
| S01 | 1 | 「Nine o’clock, a」是左下角一行字，和欢迎框无关 | `prompt.ts` `drawTokens`（提示框里逐 token 打字）、`open.ts` `drawLyrics`（第一句由笔写出） | 写进欢迎框底部的输入行 `> _`：光标就是终端光标，按唱逐字母打出（Plex Mono，这是打字的机器声音）；C1 的共享版面 `LINE01` 改到这一行，S02 接着在原处 | 高 |
| | 2 | 镜头是长拉远 + 推近，中间 2 秒几乎不动 | `open.ts` `buildCamera`（按拍的分镜） | 框每画完一条边、标题每出一行，镜头按拍跳一档 | 中 |
| S02 | 1 | 「on my screen」是底部格子，和通知卡无关 | `prompt.ts` 文字在框内；`room.ts` 翻牌盖章 | 印进通知卡的正文行：卡片弹出时逐字母盖上去，`screen` 撑满卡宽；卡飞向顶栏时字跟卡走（①的 C2 交接不变） | 高 |
| S03 | 1 | 「Got a bug report,」整词印在表格上（载体对，写法不对）；「the weirdest I’ve seen」是底部一行 | `bureau.ts` `drawTyped`（打字机逐字母、下一击指示三角）、`drawSafeStamp` | 标题改成打字机逐字母敲进表格标题栏（大号仍是 Archivo，节奏照 `drawTyped`）；「the weirdest I’ve seen」打进 ACTUAL 字段；BUG 章保留 | 高 |
| | 2 | BUG 章只有一次落下 | `bureau.ts` `shake`（盖章 30 px）+ `stampSafe` 的 1.7→1 缩放 | 章落在军鼓上：1.7→1 `outExpo` 0.12 s、震 20 px、纸面被压出一圈暗边 | 中 |
| S04 | 1 | 「There’s a thirty-second」是城市上方一行浮字 | `loss.ts` `drawChartText`（字骑在曲线上，由火花写出）；`leftturn.ts` 路标被火花刷出来 | 字刷在日历地面上（仿射贴到地面，平面贴图，不加新 3D）：计数光标沿街走过一格写一个字母；`thirty-second` 继续由计数器承担 | 高 |
| | 2 | 32 号楼升起的那一下没有冲击 | `ascent.ts` 蛇眼「boom」的冲击波 + 震屏 | 楼顶到位在底鼓上：一道地面冲击波（等高线环向外扩）+ 震 10 px | 中 |
| S05 | 1 | 「So I crack my claws…」在一条平台框里，像字幕条 | `fuse.ts` `drawFuseText`（字排在导火索上，随燃烧变灰）| 去掉框：字母就站在 Clawd 走的那行代码上，读码光标的下划线经过时字母显影；读过的部分随平台向左滚出画面 | 高 |
| | 2 | 「claws」只是手臂举起 | `hook.ts` `slam` | 「claws」砸一下：两只手臂在重读音节上张开 1 像素 + 镜头 kick | 低 |
| S06 | 1 | 清单是整词出现（载体对，写法不对） | `open.ts` 笔写、`engine/stroke.ts` `writtenLength` | 清单文字改成单线字体由绘图仪的笔写出（笔 = 光标），三个勾保持；CHECK 巨字三次加重（已有） | 中 |
| S07 | 1 | 键帽上的词整词亮起 | `room.ts` 每个字母盖章时板子抖一下 | 词按字母逐键按下（一个键帽一个词，字母在按下时逐个亮），按下的键在底鼓上下沉 | 中 |
| S08 | 1 | 副歌前半「I need one more」是顶部一行小格子，35.6 s 一帧几乎是空纸 | `hook.ts` `drawIM`/`drawMY`（一词一砸满屏）、`guides`（字体标本参考线） | 见 G2 第 1 次；空纸那一拍改成光标在括号里等待、再砸 | 最高 |
| | 2 | 「Every bracket’s gonna fit」的括号是装饰 | `dense-press.ts` 的安全框被字撑破 | 括号真的合拢：词唱到时两侧括号 `outExpo` 夹住它，`fit` 时正好卡住 | 高 |
| | 3 | 「Tap-tap-tapping」 | `bureau.ts` `drawTyped` | 每个 tap 在军鼓上敲下一个字母块（键盘已在画面里） | 中 |
| S09 | 1 | 「So I run the tests…」是波形上方的一行字 | `spacetime.ts` `drawScope`（字骑在扫描线上）、TREATMENT「spacetime」第 1 段 | 每个字母的基线 = 波形在该 x 的高度，扫描头经过时写出；`pass` 停在扫描头上闪（已有位置） | 高 |
| S10 | 1 | 玻璃条上的词整词出现 | `room.ts` 逐字母盖章 | 逐字母出现在玻璃上；碎裂时字母跟着各自的碎片（已有碎片带字） | 中 |
| S11 | 1 | 「Stack traces falling like rain」是一行倾斜浮字，带模糊对焦 | `loss.ts` 的「drop」：四个字母沿下落轨迹竖排，位置 = 火花在那一刻的下落位置 | 每个字母作为一滴雨沿雨的斜线落下，在唱到它的时刻落到它的位置；句尾之后继续落出画面 | 高 |
| | 2 | 镜头 0 个缓动（只有匀速漂移） | `TREATMENT.md`「Tone」 | 在「Undefined」两次冲击上各一次猛推 + 停 | 中 |
| S12 | 1 | 「again」只是重复排字 | `bureau.ts` `remapB`（最后一拍按重映射时间重渲 3 次，口吃） | 第三个「again」用时间重映射口吃 3 次（画面倒回、重放，越来越快） | 高 |
| | 2 | 「Run it again」印在复印件旁边 | `bureau.ts` 表格字段 | 印在每一张复印件上，复印一代糊一代（已有复印退化） | 中 |
| | 3 | 「clear the cache」 | — | 光标从右向左擦掉复印件上的字（擦的就是缓存） | 中 |
| S13 | 1 | 第 2 次 COMMIT 和第 1 次几乎一样 | 见 G2 | 见 G2 第 2 次 | 最高 |
| | 2 | 「Fix, and fix, and fix a bit」是斜着的白字，旁边就有 git log 却没用上 | `prompt.ts` token 打字 | 每个「fix」作为一条新的提交信息打进 git log 那一列（Mono），log 上滚一行；歌词就是 log | 高 |
| | 3 | 「But it works on my machine」印在底部 | `bureau.ts` 盖章 | 印在 local ✓ / CI ✗ 两张卡上（`works on my` 在 local 卡，`machine` 盖在两卡之间） | 中 |
| S14 | — | Tim 认可过，不动 | | | |
| S15 | 1 | 「Snip the extra line and set」是左侧一列竖排词 | `bureau.ts` 被划掉的冯诺依曼图 | 这几个词写在被剪的那行代码上（`<=` 那一行），剪刀（光标）经过时被剪开 | 中 |
| S16 | 1 | 连接词（goes, and, and two…）一次一个出现在右上角 | `fuse.ts` 每个词点燃一段 | 连接词写在骨牌的地面线上，骨牌倒下的波前就是书写头 | 中 |
| | 2 | 「green and green…」加速段没有细分 | `room.ts` 分叉 8 分 → 16 分 | 骨牌倒下的冲击从每拍改成每 8 分、最后 16 分音符，镜头跟着跳 | 中 |
| S17 | 1 | 第 3 次 COMMIT 和前两次一样 | 见 G2 | 见 G2 第 3 次 | 最高 |
| | 2 | 「Pull request, and」「Then you wrote,」是左上一行字 | `prompt.ts` 文本框打字 | 打进 PR 页面的标题栏和评论框（Mono 的输入 + Archivo 的唱词），「Looks good to me」作为评论被盖上 approved 章 | 高 |
| | 3 | 「and now we’re free」是底部一行 | — | 合并的拉链头（光标）经过时，字母从 diff 里被释放出来 | 中 |
| S18 | 1 | 尾奏没有歌词对齐（oh 未对齐），画面只有星图 | `outro.ts` 一拍一个值的递进 | 不改歌词；星按拍点亮改成「停住再猛动」 | 低 |

## 3. 细节（层级、字距、注释、颜色）
- 注释：每场 0–1 处（`drawNote`），符合「同屏不超过两处」，不用改。
- 层级：S15 左列竖排词和 ≤ 上的刻字、S17 顶部小字和巨大的 diff 字之间出现第四级字号；按 G1 换载体后自然消失。
- 字距：大号 Archivo（S03 标题、S16 GREEN、S17 MERGED）没有按字号收紧字距；pdoom `TREATMENT.md`「Typography」要求大字紧排。给 `varRun` 的大于 300 px 的字加负字距（−1 % 到 −3 %，按字号插值）。
- 颜色：没有发现靠发光或渐变修补的地方；S17 的 diff 巨字用 fail/pass 的淡色，属于允许的语义色。

## 4. 建议的批次（Tim 挑）
1. **工具 + 样板**：`kit/inscribe.ts` + `kit/impact.ts`，先在 S03（打字）和 S09（扫描、骑在波形上）各做一场，给 Tim 看「歌词不像字幕」的方向对不对。
2. **三次 COMMIT 升级**（S08、S13、S17，G2）。
3. **主歌一**：S01、S02、S04、S05、S06、S07 换载体。
4. **副歌后的桥段**：S10、S11、S12、S15、S16、S17 的其余条目。
5. 全片的 G4（长音分档）、G5（停住再猛动）、G6（段落内加速）、大字字距。
