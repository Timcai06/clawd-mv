# clawd-mv：项目约定

一支约 2 分钟的原创英文歌 MV。主角是 Clawd（Claude Code 的橙色像素小螃蟹），在类 VS Code 编辑器里写代码。个人非商业作品，不参赛。

画面全部由代码渲染：three.js 网页程序，每一帧只由歌曲时间 t 决定。底子是 [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（MIT），我们用的上游 commit 记在 `reference/pdoom/UPSTREAM_COMMIT`。

**新会话先读 `docs/HANDOFF.md`（当前阶段的开场提示），再读 `docs/CONTEXT.md`（为什么这么做、已定的决策、Tim 的偏好、开放问题），再读 `docs/PLAN.md`（当前进度和下一步）。** 每完成一个阶段，先更新 PLAN.md；决策有变，更新 CONTEXT.md。

## 协作规矩（和 Tim 的全局约定一致，这里重复一遍）

- **最终验收只由 Tim 做。** 从 v4 起（Tim 2026-10-01）Claude 是核心设计师，**可以看自己渲染的静帧和短片来做设计迭代**，用自己的审美判断；但不对 Tim 宣称「好看」「完成」，好不好由 Tim 定。报告里照常给技术事实：报错、时间点、每帧耗时、ffprobe 结果。
  - `docs/ENGINE.md` 继承自上游，上游写的是「让 agent 看 PNG」，本项目不这么做。
- **听不到声音。** 音乐只报数据：BPM 稳定性、段落边界、响度、Whisper 转写和歌词的吻合率。听感由 Tim 判断。
- **可以本地提交，推送前必须问 Tim。**
- **主动质疑**：先核实（读代码、跑数据），再给分级的怀疑清单，同时说明哪些点不怀疑。
- **文档先行**：决策改了就先改 `docs/`，再改代码。文档不能过时，也不能当挡箭牌。
- v4 阶段场景设计和实现都由 Claude（Opus）亲自做；Codex 只在 Claude 明确指派时做纯工具活。
- 沟通用中文。代码注释沿用上游的英文风格。

## 目录

- `docs/PLAN.md`：阶段计划和状态（先读这个）
- `docs/TREATMENT.md`：故事、结构、歌词和画面对照、Suno 风格描述、视觉规范（阶段 1、4 的主文档）
- `docs/ENGINE.md`：引擎和场景 API（写场景前必读）
- `docs/HANDOFF.md`：最近一次交接时给新会话的开场提示词
- `docs/ARCHITECTURE.md`：本项目在引擎之上的组织方式（分镜驱动的时间线、场景文件约定、公共部件）
- `docs/STORYBOARD.md`：分镜表（场景、镜头、Clawd 动作库、组件清单）
- `docs/tasks/`：交给 Codex 的任务说明
- `reference/clawd/`：Clawd 官方形象（以终端欢迎界面为准）
- `app/`：渲染器（bun + Vite + three.js）。`src/engine/` 是引擎；`src/kit/` 是公共部件（活背景、光标、舞台、Clawd、各种界面组件、歌词层、时间工具）；`src/scenes/sNN-*.ts` 是 18 个正式场景（辅助代码在 `scenes/parts/`），`gallery-*.ts` 是组件陈列页（`--gallery 名字`）；`src/timeline.ts` 从分镜数据生成剪辑表；`src/theme.ts` 是色板 token
- `storyboard/`：`shots.json`（分镜数据，剪辑的唯一来源）、`keyframes.json`（分镜图提示词）
- `tools/`：`storyboard_md.py`（由分镜数据生成 STORYBOARD.md 的表格）、`render_keyframes.sh` 和 `keyframe_sheet.py`（生成分镜图和总览）、`merge_group.sh`（合并 Codex 组的分支）
- `out/`（gitignored）：`preview/` 整片预览，`storyboard/v2/` 分镜图 v2，`wip/` 各种中间产物，`codex/` Codex 的日志和交付报告
- `analysis/`：上游的 Python 分析脚本（Demucs 分离、逐词对齐、拍点）。**里面有大量针对 pdoom 那首歌写死的参数**（`analyze.py` 的 `SECTION_BARS`、`align.py` 的手工锚点），阶段 3 要按我们的歌重写
- `audio/song.wav`：定稿歌的母带拷贝（gitignored；原件在 `audio/candidates/c1-works-on-my-machine.wav`）。`audio/song.mp3` 是占位音轨，只在没有母带时使用
- `data/audio.json`、`data/lyrics.json`：定稿歌的逐拍网格和逐词对齐（已提交）
- `reference/pdoom/`：上游的场景代码、分镜文档、时间线、原曲（原曲是别人的作品，已 gitignore，只供本地参考和分析）

## 常用命令

```sh
cd app && bun test tests                  # 单元测试
cd app && bun scripts/storyboard-check.ts   # 分镜锚点检查（0 过短、0 不递增）
cd app && bun scripts/render.ts video --samples auto --preset medium --crf 16 --out ../out/preview/x.mp4   # 整片预览，成片同画质
cd app && bunx vite                      # 预览 http://localhost:5173 ，?t=23 从指定时间开始
cd app && bunx tsc --noEmit -p tsconfig.json
cd app && bun scripts/render.ts video --from 0 --to 12 --preset veryfast --out ../out/test.mp4
cd app && bun scripts/render.ts stills --t 5,10 --out ../out/wip/x   # 给 Tim 看的静帧
```

浏览器日志里会有一条 404，是 `favicon.ico`，属于正常现象。

## Suno 的事实（2026-09-30 核实，会变）

- Tim 开的是 Pro（10 美元/月）：可以用 v6 和 v6-wild，每月下载 20 首，付费期间生成的歌可以商用。
- 免费版生成的歌不能下载。所以定稿必须在付费期间生成。
- 分轨不依赖 Suno：用 Demucs 在本地分离。
- v6 是 2026-09-09 才发布的，网上多数提示词教程针对旧模型，不一定适用。
