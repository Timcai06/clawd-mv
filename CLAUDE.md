# clawd-mv：项目约定

一支约 2 分钟的原创英文歌 MV。主角是 Clawd（Claude Code 的橙色像素小螃蟹），在类 VS Code 编辑器里写代码。个人非商业作品，不参赛。

画面全部由代码渲染：three.js 网页程序，每一帧只由歌曲时间 t 决定。底子是 [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)（MIT），我们用的上游 commit 记在 `reference/pdoom/UPSTREAM_COMMIT`。

**当前进度和下一步看 `docs/PLAN.md`。** 每完成一个阶段，先更新 PLAN.md。

## 协作规矩（和 Tim 的全局约定一致，这里重复一遍）

- **视觉由 Tim 亲自验收。** 不截屏、不录屏去自查画面，不对构图、节奏、好不好看下结论。只报告技术事实：报错、时间点、每帧耗时、像素统计、ffprobe 结果。要给 Tim 看画面就渲染 stills 或短片，交给他看。
  - `docs/ENGINE.md` 继承自上游，上游写的是「让 agent 看 PNG」，本项目不这么做。
- **听不到声音。** 音乐只报数据：BPM 稳定性、段落边界、响度、Whisper 转写和歌词的吻合率。听感由 Tim 判断。
- **可以本地提交，推送前必须问 Tim。**
- **主动质疑**：先核实（读代码、跑数据），再给分级的怀疑清单，同时说明哪些点不怀疑。
- **文档先行**：决策改了就先改 `docs/`，再改代码。文档不能过时，也不能当挡箭牌。
- 重活可以交给 Codex：Claude 写提示词、审查、验证，Tim 拍板。
- 沟通用中文。代码注释沿用上游的英文风格。

## 目录

- `docs/PLAN.md`：阶段计划和状态（先读这个）
- `docs/TREATMENT.md`：故事、结构、歌词和画面对照、Suno 风格描述、视觉规范（阶段 1、4 的主文档）
- `docs/ENGINE.md`：引擎和场景 API（写场景前必读）
- `app/`：渲染器（bun + Vite + three.js）。`src/engine/` 是引擎，`src/scenes/` 放我们的场景，`src/timeline.ts` 是剪辑表
- `analysis/`：上游的 Python 分析脚本（Demucs 分离、逐词对齐、拍点）。**里面有大量针对 pdoom 那首歌写死的参数**（`analyze.py` 的 `SECTION_BARS`、`align.py` 的手工锚点），阶段 3 要按我们的歌重写
- `tools/make_placeholder.py`：生成占位用的节拍音轨和数据（真歌到位后删除）
- `audio/song.mp3`：当前是占位的节拍音轨。Suno 的候选版本放在 `audio/candidates/`（已 gitignore）
- `data/*.approx.json`：占位数据。阶段 3 生成的 `data/audio.json`、`data/lyrics.json` 会优先加载
- `reference/pdoom/`：上游的场景代码、分镜文档、时间线、原曲（原曲是别人的作品，已 gitignore，只供本地参考和分析）

## 常用命令

```sh
cd app && bunx vite                      # 预览 http://localhost:5173 ，?t=23 从指定时间开始
cd app && bunx tsc --noEmit -p tsconfig.json
cd app && bun scripts/render.ts video --from 0 --to 12 --preset veryfast --out ../out/test.mp4
cd app && bun scripts/render.ts stills --t 5,10 --out ../out/wip/x   # 给 Tim 看的静帧
```

浏览器日志里会有一条 404：引擎先找 `data/audio.json` 找不到，再回退到 `.approx.json`，属于正常现象。

## Suno 的事实（2026-09-30 核实，会变）

- Tim 开的是 Pro（10 美元/月）：可以用 v6 和 v6-wild，每月下载 20 首，付费期间生成的歌可以商用。
- 免费版生成的歌不能下载。所以定稿必须在付费期间生成。
- 分轨不依赖 Suno：用 Demucs 在本地分离。
- v6 是 2026-09-09 才发布的，网上多数提示词教程针对旧模型，不一定适用。
