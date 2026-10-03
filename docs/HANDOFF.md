# 交接提示词（2026-10-03，阶段 9「Claude 直接设计和开发」，云上会话）

新会话开始时，把下面整段贴进去。

---

你接手 clawd-mv：一支 2:40 的 MV，主角是 Clawd（Claude Code 的橙色像素小螃蟹），画面全部由代码渲染（three.js 网页程序，每一帧只由歌曲时间 t 决定）。

**这一阶段你既是核心动效设计师，也是开发者**：每个效果都由你设计、由你亲手写代码、由你看自己的渲染来迭代。不要把设计或场景开发交给 Codex 或其它模型（Tim：Codex 的设计能力比较弱）。目标是继续向 pdoom（`reference/pdoom/`，上游 MV）的质感靠近。沟通用中文。

## 一、先读（按顺序）
1. `CLAUDE.md`（项目约定）。
2. `docs/CONTEXT.md`：决策表**最后 5 行**（v5 方法、阶段 8 分工、不要为了 3D 而 3D、v6 回退；它们取代更早的分工规则），以及「Tim 的偏好」一节。
3. `docs/PLAN.md`：阶段 7 的进度、**阶段 8 结论**、阶段 9。
4. `docs/reference/pdoom-source-techniques.md`：pdoom 好在哪里（源码层面）。
5. `docs/reference/pdoom-transitions-lyrics.md`：pdoom 的场景交接和歌词怎么做，以及我们 18 场的对照。第 4 节的规则 R1–R7 仍然成立，只是 v6 的实现已被回退。
6. `docs/ENGINE.md`、`docs/ARCHITECTURE.md`。

## 二、现状
- 代码是 **v5**（提交 `d50ec9b` 的画面，277 项测试通过），和整片预览 v5（Tim 本机的 `out/preview/clawd-mv-preview-v5.mp4`）逐帧一致。Tim 对 v5 的评价：「方向是对的」，但**场景之间的衔接**和**歌词**明显不如 pdoom。
- **v6 尝试已整体回退**，存档在 git 标签 `v6-attempt`。v6 把很多场改成了 3D 世界（实体字、光线步进、体积场景），Tim 的评价：「不要为了 3D 而 3D」「全部回退，这一版的 3D 我不满意」。
- v6 里**不改画面**的那部分思路是对的，可以按需重新做（不要整块恢复）：
  - **切点落在句与句之间**（pdoom 的 `cut()`：句首词之前的最后一拍，容差 50 ms），不在句中切。需要改 `storyboard/shots.json` 的锚点（v6 改过 6 个切点，见 `pdoom-transitions-lyrics.md` 第 4 节的表）。
  - **跨切点的长音词**：下一场只在原版面里唱完这个词，不重排整句。
  - **交接物是一个屏幕上的几何原语**（点、线、缝、描边、矩形）：上一场最后一拍把画面收成它，下一场从它展开；两场用同一个函数算，测试切点前后误差 ≤ 2 px。
  - 公共部件可以从标签里取回参考：`git show v6-attempt:app/src/kit/pathtext.ts`（沿路径逐字母排字）、`wordplane.ts`、`carry.ts`。取回前先审一遍，按需要改，不要原样搬。

## 三、对「pdoom 质感」的理解（Tim 认可这个方向；动手前再读一遍源码印证）
1. **形式服从歌词的含义**。loss 的图表变成地形，是因为唱的是「sudden drop in your training loss」；room 的翻牌板，是因为「Chinese room」。pdoom 里很大一部分是**平面版式**：hook 的满屏砸字、prompt 的输入框、bureau 的公文纸、dense 的挤压排版。3D 只在它承载含义时出现。
2. **线的质感**：细线、刻线、版画。用了 3D 的地方，先算光，再把明暗换成线的疏密。颜色克制（paper、ink、clay 三色），不靠发光、渐变、换底色修补（夜景试验已被否定）。
3. **歌词逐字长在画面里**：每个字母有自己被唱到的时刻，书写头就是 clay 光标；字出生时白热再冷却，之后跟着画面一起动、碎、落、被带走，不原地淡出；长音一定有形变（变宽、变重、拉伸）。
4. **衔接**：切在句间；上一场把画面收成一个原语，下一场从它展开；切点前一拍细分加速，最后 0.1 s 定住。
5. **节奏和冲击**：每个词一次砸；冲击帧是底色和字色互换（不是 RGB 反相）；副歌三次的 COMMIT 逐次升级（pdoom 的 hook 四次：干净 → 反色 → 最小 → 最大）。
6. **冷幽默注释**：IBM Plex Mono 小字，同屏不超过两处。

## 四、第一件事：开头 Clawd 没有眼睛（Tim 指定先修）
S01 欢迎框里的 Clawd（`app/src/scenes/s01-boot.ts`，0–5.6 s）用的是睡姿 `A1`：`app/src/kit/clawd.ts` 的 `eyes(cells, 'closed')` 把眼睛那两格填成了身体色，所以整只是实心的，看不到眼睛。CONTEXT 里的规则是「眼睛是凹进去的暗坑，任何底色上都是最暗的颜色；闭眼只用于睡觉」，而 Tim 要开头就能看到眼睛。
- 先读 `kit/clawd.ts` 和 S01、S02（S02 用 `A2` 唤醒），设计一个开头就有眼睛的方案。例如：开场就是睁眼的待机姿态；或者仍是睡着，但眼睛保持两个暗的凹坑，唱到 ping 时睁开。
- 顺便检查全片其它场的 Clawd：眼睛在各种底色上是否都看得见（规则：主镜头里一个像素 ≥ 14 逻辑 px，眼睛必须是画面里最暗的颜色）。
- 改完请 Tim 在 Mac 上渲 0–7 s 的短片验收（见第六节）。

## 五、之后的做法
1. **修完眼睛后，问 Tim 这一阶段先做哪几章。** 建议的顺序：
   - ① 全片切点按句间规则重排，加上每个切点的交接原语（只改衔接，不改画面）；
   - ② 每场歌词按第三节第 3 条逐场升级（多数场景是平面的：逐字时刻、书写头、白热冷却、长音形变、跨切点）；
   - ③ Tim 指定的章节做更深的 pdoom 式优化。
2. **每改一场**：
   - 先写清楚这一场的设计（含义 → 形式、镜头、歌词、衔接），再动手；
   - 改之前和改之后各出一张同一时刻的静帧，**并排**对比，确认没有丢掉 v5 的层级和对比；
   - 做完请 Tim 渲一段短片验收。
3. 你可以看自己渲染的静帧和短片来迭代设计，但**不要对 Tim 说「好看」「完成」**，好不好由他定。报告只写技术事实和设计意图。
4. 每场做完都要满足：
   - `cd app && bunx tsc --noEmit -p tsconfig.json` 无错；
   - `bun test tests` 全过；
   - `bun scripts/storyboard-check.ts` 0 过短、0 不递增；
   - `bun scripts/render.ts perf --from … --to …` 每帧平均 < 25 ms（在 Tim 的 Mac 上测）。
5. 决策变了先改 `docs/`，再改代码。可以本地提交；**推送前必须问 Tim**。

## 六、云上环境：开发在云上，正式渲染在 Tim 的 Mac 上
- **正式渲染一律在 Tim 的 Mac 上做**：给 Tim 验收的短片、整片预览、性能测试（GPU 是 Apple M5 Pro）。你改好、测试通过、问过 Tim 并推送后，把要渲的命令写给他，例如：
  - `cd app && bun scripts/render.ts video --from 0 --to 7 --samples auto --preset medium --crf 18 --out ../out/review/<名字>.mp4`
  - 整片预览：`cd app && bun scripts/render.ts video --samples auto --preset medium --crf 16 --out ../out/preview/<名字>.mp4`
- **你自己迭代时**可以在云上渲静帧看：第一步先试 `cd app && bun scripts/render.ts stills --t 3.5 --out ../out/wip/smoke`。`render.ts` 用 playwright 驱动 `channel: 'chrome'`；云上如果没有 Chrome，可以装 Chromium（`bunx playwright install chromium`）并在本地临时改用它，**这个改动不要提交**（Tim 的 Mac 用系统 Chrome）。没有 GPU 时是软件渲染，会很慢：只渲关键几帧，不要在云上渲整段视频。云上出不了图的话，就请 Tim 在 Mac 上渲静帧给你。
- **音频**：`audio/song.wav`（母带）已经提交进仓库；逐拍和逐词数据在 `data/audio.json`、`data/lyrics.json`。
- **中文字体**：片尾署名用 macOS 系统字体 PingFang SC，Linux 上没有；署名卡只能在 Tim 的 Mac 上渲。
- 如果你看到的最新提交早于「Handoff: full prompt (Mac renders, song.wav in repo)」，说明本地进度没推上来，先告诉 Tim。
