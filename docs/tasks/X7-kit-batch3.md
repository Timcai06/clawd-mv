# X7：第三批组件（欢迎框、调用栈、PR / diff / git graph、设备框、键盘、文字粒子）

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x7-kit3`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/ARCHITECTURE.md`（组件约定）、`docs/TREATMENT.md` 的「视觉规范」、`docs/STORYBOARD.md`（组件清单和对应镜头）、`app/src/theme.ts`。

第一、二批组件（X5、X6）已合并在 `app/src/kit/`。**写法完全照它们**：纯绘制函数 `drawXxx(ctx2d, box, state)`；组件不读时间、不存状态；内容放 `content.ts`（只新增）；每个组件一个陈列页（返回 `{ ...POSTER_POST, hud: 0 }`）和单元测试；需要伪随机就用固定种子（`mulberry32` / `hash`），同样的 state 永远画出同样的画面。

## 要做的组件
1. **欢迎框** `kit/welcome.ts`（S01、S18）：Claude Code 启动时的欢迎框。有边框的面板，逐行打印出来（state 给出打出的行数和字数）；框里给 Clawd 留一个位置（Clawd 由调用方用 `kit/clawd.ts` 画，组件只返回这个位置的矩形）。文案是片中虚构的，例如 `✻ Welcome to Claude Code`、`cwd: ~/calendar`。配色服从海报，不要照抄终端的真实配色。
2. **调用栈** `kit/callstack.ts`（S14）：一层层的栈帧横条（函数名 + 文件:行号，用 `content.ts` 里已有的 `CALL_STACK`，最底层是 `daysIn (month.ts:42)`）。要能表达：从第几层到第几层可见（下沉时的滚动）；旁边的「楼层号」；最底层某一行的「发光」程度 0..1。注意：发光不能用辉光效果（视觉规范禁用），用 clay 色块的亮度或面积变化来表达。
3. **PR 页面和 diff** `kit/pr.ts`（S17）：标题 `Fix October 32nd`、`+1 −1` 统计、diff 区（`- for (let d = 0; d <= days; d++) {` 与 `+ for (let d = 0; d < days; d++) {`；删除行用 `fail`、新增行用 `pass`。**这是语义色在测试之外的唯一例外**，C 已确认 diff 也算「对错状态」）；评审者头像（简单几何形，不画人脸）和「✓ LGTM」的弹出进度；合并按钮（按下进度）。
4. **git graph** `kit/gitgraph.ts`（S17）：主线和一条分支，分支上几个提交点；state 给出「汇入」进度（分支线弯回主线），以及彩纸的进度。彩纸是平面小矩形，用固定种子生成，颜色只用 ink、clay、paper。
5. **设备框** `kit/devices.ts`（S17）：电脑、平板、手机三种平面外框（不写实，几何化），每个里面能调用一个内容绘制回调（比如画一个 31 天的日历）。另外提供「设备墙」布局函数：给定 16×5 的像素图（Clawd 的 `terminal_welcome.pixels`），返回每台设备在画面里的位置和类型，使整面墙拼成 Clawd 的形状（每个 `O`、`D` 像素对应一台设备）。
6. **键盘** `kit/keyboard.ts`（S07）：俯视的平面键盘（标准布局，几何化）；每个键帽的下沉量由 state 给出（数组，或给一个「波浪」相位，由组件按键的位置换算）；可以高亮某个键（Enter）。
7. **文字粒子** `kit/textrain.ts`（S11）：堆栈文字（`at daysIn (month.ts:42)` 这类行）像雨一样从上往下落；state 给出时间参数 `phase`（由场景用 t 算好传入）、密度、速度、倾斜角。每一滴的位置必须完全由 `phase` 和固定种子算出来，不能积累状态。另外一个大号单词「砸下」的效果（undefined 砸下来）：给出下落进度和落地后的压扁进度。

内容都要和故事对得上：issue #1031；修复是把 `<=` 改成 `<`；PR 标题 `Fix October 32nd`。

## 陈列页
每个组件一个：`scenes/gallery-welcome.ts`、`gallery-callstack.ts`、`gallery-pr.ts`、`gallery-gitgraph.ts`、`gallery-devices.ts`、`gallery-keyboard.ts`、`gallery-textrain.ts`。用 t 驱动各种进度。

## 约束
- 只用 `theme.ts` 的 token。`fail` / `pass` 只用在测试状态和 diff 上。
- 字体：`F.mono`、`F.archivo`。不做 3D、阴影、景深。不要描边、贴纸、渐变、辉光、VS Code 品牌元素。
- 只改：上面列出的 `kit/*.ts` 新文件、`kit/content.ts`（只新增）、`scenes/gallery-*.ts` 新文件、`app/tests/kit-*.test.ts` 新文件。其他文件不动；需要改的话在报告里提出。
- 代码注释用英文，风格沿用上游。不截屏自评；静帧交给 Tim 看。
- 小步提交到 `codex/x7-kit3`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
2. `bun test tests/` 全部通过（已有 46 项加新增）。覆盖：文字雨和彩纸的确定性、设备墙的设备数等于 Clawd 的像素数、调用栈最底层是 `month.ts:42`、diff 内容。
3. 确定性：每个陈列页同一个 t 渲染两次，解码后逐像素一致。
4. 性能：每个陈列页每帧平均 < 25 ms。
5. 静帧：`out/x7/<组件名>/`，每个陈列页 4–6 张 1080p。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、每个组件的 state 字段、验收 1–5 的逐项结果、静帧路径、需要 C 改的地方。
