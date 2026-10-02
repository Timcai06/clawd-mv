# 交接提示词（2026-10-03，阶段 8「v5 第二阶段：剩余场景 + 场景交接 + 歌词」开始时用）

新会话开始时，把下面整段贴进去。

---

你接手 clawd-mv，这一阶段你是**唯一的核心设计师和执行者**。沟通用中文。

**先读（按顺序）**：`CLAUDE.md`；`docs/CONTEXT.md` 决策表最后 8 行（v4 方向改定、夜景试验被否定、**v5 方法（定）**、v5 下一阶段重点）；`docs/PLAN.md` 的阶段 7 进度和**阶段 8**；`docs/reference/pdoom-source-techniques.md`（pdoom 好在哪里，源码层面）；`docs/ENGINE.md`、`docs/ARCHITECTURE.md`。

**现状**：整片预览 v5 是 `out/preview/clawd-mv-preview-v5.mp4`。Tim：「这一轮方向是对的」。已经按 v5 方法重做的场景，就是这一阶段的写法样板：
- **S15**（`scenes/s15-line42.ts` + `parts/s15-world.ts` + `kit/raymarch.ts`）：光线步进的 ≤ 实体，光照换算成雕刻线，字刻在面上，从第 42 行的 `<=` 钻进去变成实体。
- **S09**（`parts/s09-world.ts`）：示波器余辉堆成山脊地形。**S10**（`parts/s10-world.ts`）：玻璃板实体碎裂，落进 S11 的雨。**S04**：真实光照，阴影对 32 栋楼求交。**S07**：键盘浪的高度场阴影。**S17**（`parts/s17-world.ts`）：真实设备墙。**S14**：调用栈（Tim 早先认可）。
- 公共部件：`kit/rig.ts`（相机、投影、`planeAffine`）、`kit/raymarch.ts`、`kit/clawd3d.ts`（体素 Clawd，眼睛是凹坑）、`kit/lens.ts`（平面场景的 2D 镜头）、`kit/spark.ts`（光标火花）、`kit/note.ts`（冷幽默注释）、`kit/glyphs.ts`（SDF 字形场，还没用上）。

**v5 方法（Tim 认可，必须遵守）**：每场先定义一个**数学世界**（GPU 和 CPU 共用的几何函数，写在 `parts/sNN-world.ts`）；用光线步进、位移网格或自写投影细线渲染；**先算光，再把光照换算成雕刻线的疏密**；字和镜头都长在这个世界上；镜头是按词和拍分段的 3D 函数；**v2 分镜图的构图是落点**，构图测试改成量投影后的包围盒。颜色不是问题（夜景试验已被否定），不要靠改底色、加发光来修补。

**这一阶段的目标（Tim 2026-10-03）**：
1. **场景之间的衔接**明显不如 pdoom。
2. **歌词**作为动画的重要组成部分，设计比 pdoom 差不少。
3. 剩下的场景继续按 v5 方法优化：S01–S03、S05、S06、S08、S12、S13、S16、S18。

**做法**（细节见 PLAN 阶段 8）：
1. **先研究，再动手**。读 pdoom 源码（`reference/pdoom/scenes/`、`reference/pdoom/app-timeline.ts`），写 `docs/reference/pdoom-transitions-lyrics.md`，内容三块：
   - pdoom 的交接：出口几何如何成为下一场的入口、切点怎么选、切点前怎么堆张力。重点看 `hook.ts` 顶部的交接常量，`room-shrooms.ts` 两场共享的版面，`loom→ilya` 的递归直接落在下一场第一帧，`shoggoth` 的 flatline，火花在各场之间的接力。
   - pdoom 的歌词：每场的载体和逐字同步方法。重点看 loss 沿 3D 曲线逐字排布、drop 沿下落轨迹排、stack 的 TextPlane、room 的翻牌板、shoggoth 刻进生物体的字、fuse 沿导火索燃烧并按真实音高弯弦、dense 的挤压和破框、loom 的 token 树、hook 四次逐次升级。
   - 我们 18 场逐场对照：现在的歌词载体、现在的交接物、和 pdoom 差在哪里、打算怎么改。

   写完先给我看，再动手。
2. 做公共部件：`kit/pathtext.ts`（沿 3D 路径逐字排布：透视、切线方向、逐字出现、白热冷却），以及字的 3D 平面（S14 的 WordPlane 升级版）。
3. 逐场重做，每场同时改三件事：v5 世界、歌词长在世界上、和前后场的几何交接。副歌三次（S08、S13、S17）的 COMMIT 冲击，要像 pdoom 的 hook 那样逐次升级。每场做完出短片直接发给我。
4. 全部做完，出整片预览 v6（和成片同画质）。

**协作规矩**：
- 你可以看自己渲染的静帧和短片来迭代设计，但不要对我说「好看」「完成」，好不好由我定。报告只写技术事实和设计意图。
- 场景的设计和实现都由你亲自做。Codex 只在你明确指派时做纯工具活。
- 可以本地提交，推送前必须问我。
- 决策变了先改 `docs/`，再改代码。
- 每场做完都要满足：`cd app && bunx tsc --noEmit -p tsconfig.json` 无错误、`bun test tests` 全部通过、`bun scripts/storyboard-check.ts` 0 过短 0 不递增、`bun scripts/render.ts perf` 每帧平均 < 25 ms。
