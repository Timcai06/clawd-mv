# 交接提示词（2026-10-03，阶段 9「Claude 直接设计和开发」开始时用，云上会话）

新会话开始时，把下面整段贴进去。

---

你接手 clawd-mv（一支 2:40 的 MV，主角是 Clawd，画面全部由代码渲染，three.js，每一帧只由歌曲时间 t 决定）。**这一阶段你既是核心动效设计师，也是开发者**：每个效果都由你设计、由你亲手写代码、由你看自己的渲染迭代。**不要把设计或场景开发交给 Codex 或其它模型**（Tim：Codex 的设计能力比较弱）。目标是继续向 pdoom（`reference/pdoom/`，上游 MV）的质感靠近。沟通用中文。

## 先读（按顺序）
1. `CLAUDE.md`（项目约定）。
2. `docs/CONTEXT.md` 决策表**最后 5 行**：v5 方法、阶段 8 分工、不要为了 3D 而 3D、v6 回退；以及「Tim 的偏好」一节。
3. `docs/PLAN.md` 的阶段 7 进度、**阶段 8 结论**、阶段 9。
4. `docs/reference/pdoom-source-techniques.md`（pdoom 好在哪里，源码层面）和 **`docs/reference/pdoom-transitions-lyrics.md`**（pdoom 的场景交接和歌词怎么做，以及我们 18 场的对照；第 4 节的规则 R1–R7 仍然成立，只是 v6 的实现被回退了）。
5. `docs/ENGINE.md`、`docs/ARCHITECTURE.md`。

## 现状
- 代码是 **v5**（提交 `d50ec9b` 的画面，277 项测试通过）。整片预览 v5：`out/preview/clawd-mv-preview-v5.mp4`（本地文件，云上没有；需要时自己渲）。Tim 对 v5 的评价：「方向是对的」，但**场景衔接**和**歌词**明显不如 pdoom。
- **v6 尝试已整体回退**（存档在 git 标签 `v6-attempt`）。v6 把很多场改成了 3D 世界（实体字、光线步进、体积场景），Tim：「不要为了 3D 而 3D」「全部回退，这一版的 3D 我不满意」。v6 里**不改画面**的那部分思路是对的，可以按需重新做（不要整块恢复）：
  - 切点落在句与句之间（pdoom 的 `cut()`：句首词之前的最后一拍，容差 50 ms），不在句中切；`storyboard/shots.json` 要改锚点（v6 里改过 6 个，见 `docs/reference/pdoom-transitions-lyrics.md` 第 4 节表格）。
  - 跨切点的长音词：下一场只在原版面里唱完这个词，不重排整句。
  - 交接物是一个屏幕上的几何原语（点 / 线 / 缝 / 描边 / 矩形），上一场最后一拍收成它，下一场从它展开；两场用同一个函数算，测试切点前后误差 ≤ 2 px。
  - 公共部件可以从标签里取回参考：`git show v6-attempt:app/src/kit/pathtext.ts`（沿路径逐字母排字）、`wordplane.ts`、`carry.ts`。取回要先审一遍，按需要改，不要原样搬。

## 你对「pdoom 质感」的理解（Tim 认可这个方向；做之前再读一遍源码印证）
1. **形式服从歌词的含义**。loss 的图表变成地形，是因为唱的是「sudden drop in your training loss」；room 的翻牌板，是因为「Chinese room」。pdoom 里很大一部分是**平面版式**（hook 的满屏砸字、prompt 的输入框、bureau 的公文纸、dense 的挤压排版）。3D 只在它承载含义时出现。
2. **线的质感**：细线、刻线、版画；先算光，再把明暗换成线的疏密（只在用了 3D 的地方）；颜色克制（我们的 paper / ink / clay），**不靠发光、渐变、换底色修补**（夜景试验已被否定）。
3. **歌词逐字长在画面里**：每个字母有自己被唱到的时刻，书写头就是火花（我们的是 clay 光标），字出生时白热再冷却，之后跟着画面一起动、碎、落、被带走，不会原地淡出；长音一定有形变（变宽、变重、拉伸）。
4. **衔接**：切在句间；上一场把画面收成一个原语（点、线、缝、轮廓），下一场从它展开；切点前一拍细分加速、最后 0.1 s 定住。
5. **节奏和冲击**：每个词一次砸、冲击帧是底色和字色互换（不是 RGB 反相）、副歌三次的 COMMIT 逐次升级（pdoom 的 hook 四次：干净 → 反色 → 最小 → 最大）。
6. **冷幽默注释**：Plex Mono 小字，同屏不超过两处。

## 做法
1. **先问 Tim 这一阶段先做哪几章**（他说「部分章节」）。建议的顺序：① 全片切点按句间规则重排 + 每个切点的交接原语（只改衔接，不改画面）；② 每场歌词按第 3 条逐场升级（多数是平面的，逐字时刻、书写头、白热冷却、长音形变、跨切点）；③ Tim 指定的章节做更深的 pdoom 式优化。
2. 每改一场：先写清楚这一场的设计（含义 → 形式、镜头、歌词、衔接），再动手；改之前和改之后各渲一张同一时刻的静帧**并排**看，确认没有丢掉 v5 的层级和对比；做完渲一段短片发给 Tim。
3. 你可以看自己渲染的静帧和短片来迭代设计，但**不要对 Tim 说「好看」「完成」**，好不好由他定；报告只写技术事实和设计意图。
4. 每场做完都要满足：`cd app && bunx tsc --noEmit -p tsconfig.json` 无错、`bun test tests` 全过、`bun scripts/storyboard-check.ts` 0 过短 0 不递增、`bun scripts/render.ts perf --from … --to …` 每帧平均 < 25 ms。
5. 决策变了先改 `docs/`，再改代码。可以本地提交；**推送前必须问 Tim**。

## 云上环境要先确认的事（第一步就做，做不到的告诉 Tim）
- **渲染链路**：`app/scripts/render.ts` 用 playwright 驱动 `channel: 'chrome'`（Tim 的 Mac 上是系统 Chrome，GPU 是 Apple M5 Pro）。云上先确认有没有 Chrome / Chromium 和 WebGL2（可能要 `bunx playwright install chromium` 并改用 chromium，GPU 没有就是软件渲染，会慢很多）。先跑 `bun scripts/render.ts stills --t 12 --out ../out/wip/smoke` 看能不能出图，把耗时告诉 Tim。
- **音频**：`audio/song.wav`（母带）是 gitignored，云上没有。逐拍和逐词数据在 `data/audio.json`、`data/lyrics.json`（已提交），画面不受影响；渲视频用 `--noaudio`，或者请 Tim 把 wav 放进来。
- **中文字体**：片尾署名用 macOS 系统字体 PingFang SC，Linux 上没有；署名卡的最终渲染要在 Tim 的 Mac 上做，云上只验证布局。
- 仓库的本地进度要先推到 GitHub 云上才看得到——如果你看到的最新提交不是「Revert v6: app/ and storyboard/ back to v5」之后的文档提交，先告诉 Tim。
