# 交接提示词（2026-10-04，阶段 9 ③「事件驱动」，Tim 的 Mac 本地会话）

新会话开始时，把下面整段贴进去。

---

你接手 clawd-mv：一支 2:40 的 MV，主角是 Clawd（Claude Code 的橙色像素小螃蟹），画面全部由代码渲染（three.js 网页程序，每一帧只由歌曲时间 t 决定）。

**这一阶段你既是核心动效设计师，也是开发者**：每个效果都由你设计、由你亲手写代码、由你看自己的渲染来迭代。不要把设计或场景开发交给 Codex 或其它模型（Tim：Codex 的设计能力比较弱）。目标是继续向 pdoom（`reference/pdoom/`，上游 MV）的质感靠近。沟通用中文。

## 一、先读（按顺序）
1. `CLAUDE.md`（项目约定）。
2. `docs/PLAN.md`：**阶段 9 全部**（①切点与交接、②歌词换载体第 1–5 批、③事件驱动）和其后的「2026-10-04 清理」。
3. `docs/CONTEXT.md`：决策表里「不要为了 3D 而 3D」「v6 回退」之后的各行，尤其「② 第 1–5 批」和「③ 事件驱动」；以及「Tim 的偏好」一节。
4. `docs/reference/event-tables.md`：③ 的规则和 S17 中段、S05 两场样板的事件表。**接下来每场都按这个格式写。**
5. `docs/CUTS.md`（切点与交接原语）、`docs/reference/polish-gaps.md`（② 的问题清单）。
6. `docs/reference/pdoom-source-techniques.md`、`docs/reference/pdoom-transitions-lyrics.md`（pdoom 好在哪里；后者第 4 节的 R1–R7 已在 ① 落地）。
7. `docs/ENGINE.md`、`docs/ARCHITECTURE.md`。

## 二、现状（2026-10-04，`main`）
- 代码 = v5 的画面 + 阶段 9 的 ①②③：
  - ① 切点落在句间（`snap: "cut"`），17 个切点都有几何交接原语，`tests/handoff.test.ts` 实测误差 ≤ 0.01 px。Tim 已验收。
  - ② 歌词长在画面里：`kit/inscribe.ts`（逐字母书写）、`kit/impact.ts`（冲击）、`kit/hookslam.ts`（三次 COMMIT 逐次升级），各场换了载体。
  - ③ 事件驱动：S17 中段 PR 页面、S05 读码两段样板（Tim 2026-10-04 认可）；随后 S13、S12、S08、S15 按事件表改完（`docs/reference/event-tables.md` 末节）。
- 检查：tsc 0 错，`bun test tests` 321 过 0 失败，分镜检查 0 过短 0 不递增。
- **整片预览 v7**（`out/preview/clawd-mv-preview-v7.mp4`）是 ③ 全部改完后的整片，**待 Tim 看**。v6 是从 `77d383a`（② 第 5 批）渲的；它和阶段 8 回退掉的「v6 尝试」（标签 `v6-attempt`，3D 世界版）不是一回事。
- Tim 看完 v6 整片的意见：有几场「只是单纯的字幕在那里有一点动效」，和 pdoom 差距不小。这就是 ③ 要解决的问题：词是触发器，每句让世界发生 ≥ 2 件事，镜头按词换机位。
- 未定、等 Tim：S04（3D 城市）沿街铺字的方案；S07 键帽上的字偏小偏浅；S18 睡觉闭眼、S08 反色 Clawd、像素 < 14 px 的场（见 PLAN 阶段 9 眼睛检查那条）。

## 三、对「pdoom 质感」的理解（Tim 认可这个方向；动手前再读一遍源码印证）
1. **形式服从歌词的含义**。loss 的图表变成地形，是因为唱的是「sudden drop in your training loss」；room 的翻牌板，是因为「Chinese room」。pdoom 里很大一部分是**平面版式**：hook 的满屏砸字、prompt 的输入框、bureau 的公文纸、dense 的挤压排版。3D 只在它承载含义时出现。
2. **线的质感**：细线、刻线、版画。用了 3D 的地方，先算光，再把明暗换成线的疏密。颜色克制（paper、ink、clay 三色），不靠发光、渐变、换底色修补（夜景试验已被否定）。
3. **歌词逐字长在画面里**：每个字母有自己被唱到的时刻，书写头就是 clay 光标；字出生时白热再冷却，之后跟着画面一起动、碎、落、被带走，不原地淡出；长音一定有形变（变宽、变重、拉伸）。
4. **衔接**：切在句间；上一场把画面收成一个原语，下一场从它展开；切点前一拍细分加速，最后 0.1 s 定住。
5. **节奏和冲击**：每个词一次砸；冲击帧是底色和字色互换（不是 RGB 反相）；副歌三次的 COMMIT 逐次升级（pdoom 的 hook 四次：干净 → 反色 → 最小 → 最大）。
6. **冷幽默注释**：IBM Plex Mono 小字，同屏不超过两处。

## 四、第一件事：等 Tim 看 v7 整片
- Tim 看完 v7 后，按他的意见逐场改。
- 还没动、可能要做的：S06（11.4 %，已有 CHECK 砸字）、S14 两句（暗场，镜头在钻，数值偏低但抽帧有变化）、S12「Clear the cache」（8.8 %）、S15「There it is」（8.0 %）。逐句变化率的做法见 `event-tables.md` 末节。

## 五、之后的做法
1. **每改一场**：
   - 先写事件表（关键词 → 世界里 ≥ 2 件事 → 镜头关键帧 → Clawd 的动作），再动手；
   - 改前和改后各出一张同一时刻的静帧，**并排**对比，确认没有丢掉原有的层级和对比；再量一下逐句的画面变化率（做法见 CONTEXT「③ 事件驱动」）；
   - 做完请 Tim 渲一段短片验收。
2. 你可以看自己渲染的静帧和短片来迭代设计，但**不要对 Tim 说「好看」「完成」**，好不好由他定。报告只写技术事实和设计意图。
3. 每场做完都要满足：
   - `cd app && bunx tsc --noEmit -p tsconfig.json` 无错；
   - `bun test tests` 全过；
   - `bun scripts/storyboard-check.ts` 0 过短、0 不递增；
   - `bun scripts/render.ts perf --from … --to …` 每帧平均 < 25 ms。
   - 切点前后的交接原语不能被破坏（`tests/handoff.test.ts`）。
4. 决策变了先改 `docs/`，再改代码。可以本地提交；**推送前必须问 Tim**。

## 六、环境
- 现在在 Tim 的 Mac 上直接开发（仓库 `/Users/tim/DEV/clawd-mv`，分支 `main`；旧的云端 worktree 和分支已在 2026-10-04 删除）。GPU 是 Apple M5 Pro，静帧、短片、整片、性能测试都可以在本机跑。
  - 短片：`cd app && bun scripts/render.ts video --from A --to B --samples auto --preset medium --crf 18 --out ../out/review/<名字>.mp4`
  - 整片预览（约 15 分钟）：`cd app && bun scripts/render.ts video --samples auto --preset medium --crf 16 --out ../out/preview/clawd-mv-preview-v7.mp4`
  - 静帧：`cd app && bun scripts/render.ts stills --t 5,10 --out ../out/wip/<名字>`
- `out/` 在 2026-10-04 清理过，只剩 `preview/`（整片 v1–v6）、`storyboard/`、`design/`；`wip/`、`review/` 用到时会自动建。
- **音频**：`audio/song.wav`（母带）已提交；逐拍和逐词数据在 `data/audio.json`、`data/lyrics.json`。
- **中文字体**：片尾署名用 macOS 系统字体 PingFang SC。
- 如果在云上会话里接手：`render.ts` 用 playwright 驱动 `channel: 'chrome'`，云上没有 Chrome 时可临时改用 Chromium（不要提交这个改动）；没有 GPU 只渲关键几帧，短片和整片请 Tim 在 Mac 上渲；署名卡只能在 Mac 上渲。
