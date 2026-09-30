# X6：第二批组件（测试列表、提交哈希和 git log、待办清单、通知、issue 卡片、日历网格）

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x6-kit2`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/ARCHITECTURE.md`（组件约定）、`docs/TREATMENT.md` 的「视觉规范」、`docs/STORYBOARD.md`（组件清单，以及下面这些组件出现的镜头）、`app/src/theme.ts`。

**第一批组件（X5）已经合并**：`app/src/kit/editor.ts`、`terminal.ts`、`syntax.ts`、`icons.ts`、`content.ts`，以及陈列页 `scenes/gallery-editor.ts`、`gallery-terminal.ts`。这一批**沿用同样的写法**：纯绘制函数 `drawXxx(ctx2d, box, state)`，state 是普通对象，组件不读时间、不存状态；共享内容放 `content.ts`；每个组件配一个陈列页和单元测试。陈列页必须返回 `{ ...POSTER_POST, hud: 0 }`（`theme.ts`），否则颜色会被引擎默认的后期处理改掉。

## 要做的组件
1. **测试列表** `kit/testlist.ts`（S10、S13、S16）：19 行测试（名字用 `content.ts` 里已有的）。每行的状态：未运行、运行中、失败（`fail` 色 ✗）、通过（`pass` 色 ✓）。要能表达：
   - 逐行刷出（前 n 行可见）
   - 「碎开」：每行拆成若干平面碎片，由 state 给出碎裂进度 0..1。碎片的形状和飞散方向用固定种子的伪随机（`mulberry32`），同一个进度永远画出同一个画面
   - 「抽搐」：每行的偏移由 state 给出的 phase 用 hash 算出，也要确定
   - 逐条变绿：前 n 行通过，其余失败
   - 计数（「19 failed」「19/19 passed」）
2. **提交哈希和 git log** `kit/gitlog.ts`（S08、S13、S17）：
   - 单条哈希「弹出」：一个大号的 7 位哈希加上提交信息，state 给出弹出进度（缩放、位移），配色可以指定为 ink 或 clay（金色哈希用 clay）
   - git log 列表：一行一条（哈希、信息、时间），可以一条条往上堆；堆满以后继续往里塞，把整块挤出画框（state 给出行数和溢出量）
3. **待办清单** `kit/todo.ts`（S06）：三项；每项的状态：未勾选、勾选中（进度）、已勾选（加删除线）。样式参考 Claude Code 的 todo 列表（☐ / ☑），但配色服从海报。
4. **通知** `kit/notify.ts`（S02、S18）：右下角弹出的通知卡片，比如 `Issue #1031 · calendar`；state 给出弹出进度（带一次回弹）。
5. **issue 卡片** `kit/issue.ts`（S03）：标题（打字进度）、`bug` 标签（state 给出「盖章」进度：从大到小落下）、一张附图（日历缩略图，调用下面的日历组件），附图上一个圆圈按进度画出来（描出圆弧，这不属于被禁用的「描边」，它是画面里的一个标记动作）。
6. **日历网格** `kit/calendar.ts`（S03、S04、S08、S15、S17、S18）：月份标题、星期表头、日期格子。要能表达：
   - 格子数量可变（31 格，或者多出第 32 格）
   - 每格的状态：普通、亮起（clay）、「错误」（第 32 格闪烁，由 state 给出闪烁相位）
   - 第 32 格「弹出」和「像气泡一样破掉」（进度 0..1，确定性的碎片）
   - 翻页（Oct 31 → Nov 1）：state 给出月份和翻页进度
   - 缩略图尺寸（放进 issue 卡片）和全屏尺寸都要能用。平铺成地面的透视效果**不需要**做，那是舞台层（`kit/stage.ts`，C 负责）把它贴到 3D 平面上

内容（测试名、提交信息、issue 标题、日期等）都放进 `content.ts`，要和故事、分镜对得上：issue 是 #1031，第二天是 #1032；提交信息包括 `fix` / `fix` / `fix a bit` / `fix: calendar loop`；PR 标题 `Fix October 32nd`。

## 陈列页
每个组件一个：`scenes/gallery-testlist.ts`、`gallery-gitlog.ts`、`gallery-todo.ts`、`gallery-notify.ts`、`gallery-issue.ts`、`gallery-calendar.ts`。用 t 驱动各种进度，这样不同的 t 能出不同状态的静帧。

## 约束
- 只用 `theme.ts` 的 token；`fail` / `pass` 只用在测试状态上。
- 字体：`F.mono`、`F.archivo`（`engine/type.ts`）。
- 不做 3D、阴影、景深（舞台层的事）。不要描边、贴纸、渐变、辉光、VS Code 品牌元素。
- 只改：上面列出的 `kit/*.ts` 新文件、`kit/content.ts`（只能**新增**内容，不改已有导出的含义）、`scenes/gallery-*.ts` 新文件、`app/tests/kit-*.test.ts` 新文件。其他文件不动；需要改的话在报告里提出。
- 代码注释用英文，风格沿用上游。不截屏自评；静帧交给 Tim 看。
- 小步提交到 `codex/x6-kit2`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
2. `bun test tests/` 全部通过（已有 24 项加上新增的）。测试覆盖：碎裂和抽搐的确定性（同样的输入产生同样的碎片坐标）、日历格子数和第 32 格、计数文字、git log 溢出计算。
3. 确定性：每个陈列页同一个 t 渲染两次，解码后逐像素一致。
4. 性能：每个陈列页每帧平均 < 25 ms。
5. 静帧：`out/x6/<组件名>/`，每个陈列页 4–6 张 1080p。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、每个组件的 state 字段、验收 1–5 的逐项结果、静帧路径、需要 C 改的地方。
