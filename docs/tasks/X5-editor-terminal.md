# X5：编辑器和终端组件（kit）

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x5-editor`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/ARCHITECTURE.md`（**组件约定以它为准**）、`docs/TREATMENT.md` 的「视觉规范」、`docs/STORYBOARD.md`（组件清单，以及编辑器、终端出现的镜头）、`docs/ENGINE.md`（尤其是 Layer2D、字体、4K 部分）、`app/src/theme.ts`。

视觉方向是「瑞士平面海报 × 高保真产品界面」。编辑器和终端是片中出现最多的物件，出现在 S02、S05、S08、S09、S12、S15、S18 等场景。样张在 `out/design/f1-fusion-commit.png`、`out/design/f2-fusion-red-tests.png`（worktree 里已放好），只作方向参考：**界面布局高保真、配色服从海报**。

## 要做的
1. **`app/src/kit/editor.ts`**：纯绘制函数 `drawEditor(ctx2d, box, state)`。`box` 是逻辑像素矩形；`state` 是普通对象，组件内部不读时间、不存状态（见 ARCHITECTURE）。state 的字段由你设计，至少要能表达：
   - 活动栏（图标：文件、搜索、源代码管理、运行、扩展），可以指定哪个处于激活状态
   - 侧栏两种模式：文件树（可展开的层级，展开到第几层由 state 决定）、源代码管理（提交输入框、Commit 按钮、提交列表；某一行可以高亮为「新提交」）
   - 标签页（多个，指定当前页）、面包屑路径
   - 代码区：行号、代码行、语法样式、当前行高亮（clay 色条，像样张那样）、光标（位置、是否可见）、**打字进度**（某一行只显示前 n 个字符）、从第几行开始显示（滚动）
   - 底部面板槽位：可以放终端（调用下面的终端组件）
   - 整体缩放：同一个编辑器可以画成全屏，也可以画成屏幕里的一小块
2. **`app/src/kit/terminal.ts`**：`drawTerminal(ctx2d, box, state)`。面板标签条（PROBLEMS / OUTPUT / TERMINAL …）、提示符、正在输入的命令（打字进度）、输出行。输出行支持测试结果：失败行（✗，用 `fail` 色）、通过行（✓，用 `pass` 色），汇总行（「19 failed」「19 passed」这类计数用对应的语义色）。
3. **`app/src/kit/syntax.ts`**：一个够用的 TypeScript 词法着色器（关键字、字符串、数字、注释、标识符、标点）。**不用彩虹色**：各类词只用 `ink` 的不同深浅（`INK_SOFT`）和字重区分；state 可以指定某一个词或某一段用 `clay` 强调。
4. **`app/src/kit/icons.ts`**：自己画的简单线性图标（不要用 VS Code 的图标或名字），用 Canvas2D 路径画，线宽随缩放。
5. **示例内容**：`app/src/kit/content.ts` 放片中要用到的代码和文件，都是和故事对得上的虚构内容：
   - 文件树：`src/calendar/month.ts` 等，路径要和分镜一致（S05-2：src → calendar → month.ts）
   - `month.ts` 的代码：`daysIn()`、`buildMonth()`、`render()` 这条调用链（S14 的调用栈要用），**第 42 行**必须是 `  for (let d = 0; d <= days; d++) {`（S15 的主角）
   - 提交列表：`fix: calendar loop` 这类提交，哈希用 7 位
   - 测试输出：19 个测试的名字（和日历相关，比如 `renders 31 days in October`）
6. **组件陈列页**（只用于出静帧，不进成片）：`app/src/scenes/gallery-editor.ts`、`gallery-terminal.ts`。用 `bun scripts/render.ts stills --gallery editor --t ...` 渲染（`--gallery` 参数和 `timeline.ts` 里的入口已经做好了）。陈列页要同时展示几种典型状态：全屏编辑器（文件树展开、第 42 行高亮）、源代码管理面板（新提交高亮）、小尺寸编辑器；终端的输入中、19 个失败、19 个通过。可以让 t 驱动打字进度，这样不同的 t 能出不同的静帧。

## 约束
- 只用 `theme.ts` 的 token，不写死颜色。`fail` / `pass` 只用在测试状态上。
- 字体：代码和终端用 IBM Plex Mono（`F.mono`），界面标签用 Archivo（`F.archivo`），见 `engine/type.ts`。
- 不做 3D、阴影、景深：那是 `kit/stage.ts` 的事（C 负责）。组件只画平面。
- 不要描边、贴纸、渐变、辉光，不要 VS Code 的品牌元素（红黄绿窗口按钮、图标、名字）。
- 画面只由输入的 state 决定。
- 只改：`app/src/kit/editor.ts`、`terminal.ts`、`syntax.ts`、`icons.ts`、`content.ts`、`app/src/scenes/gallery-editor.ts`、`gallery-terminal.ts`、`app/tests/kit-*.test.ts`。**不要改** `theme.ts`、`timeline.ts`、`scripts/render.ts`、`engine/`，需要改的话在报告里提出。
- 代码注释用英文，风格沿用上游。
- 不截屏自评，不对画面下审美结论；静帧交给 Tim 看。
- 小步提交到 `codex/x5-editor`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
2. 单元测试（`bun test tests/`）：词法着色器的分类；打字进度的截断；滚动和可见行的计算；第 42 行的内容正确。已有测试仍然通过。
3. 确定性：同一个 t 渲染两次静帧，解码后逐像素一致。
4. 性能：陈列页 `bun scripts/render.ts perf --gallery editor --from 0 --to 5` 每帧平均 < 25 ms（如果 `perf` 模式不支持 `--gallery`，在报告里说明，并用其他方法估算单个组件每次绘制的耗时）。
5. 给 Tim 看的静帧：`out/x5/editor/`、`out/x5/terminal/`，每个陈列页 4–6 张，覆盖上面列的状态；再各出一张 `--scale 2` 的 4K 静帧，检查小字在 4K 下有没有问题（只报告有没有报错、尺寸对不对）。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、state 的字段设计（给写场景的人看）、验收 1–5 的逐项结果、静帧路径、需要 C 改的地方（如果有）。
