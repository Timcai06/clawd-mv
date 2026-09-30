# X2：清理引擎里上游 pdoom 的残留

- 负责：X（Codex）实现，C（Claude）审查
- 分支：`codex/x2-cleanup`（独立 worktree）。只提交到这个分支，**不要推送，不要合并到 main**
- 状态：2026-09-30 派出

## 背景
先读 `CLAUDE.md`、`docs/ENGINE.md`。引擎（`app/`）来自 pdoom-video，里面还留着那首歌专用的东西。它们不影响运行，但会误导后来写场景的人。

## 要做的
1. **删掉 P(doom) 读数**：`app/src/engine/hud.ts` 里的 `PDoom` 类、`formatPDoom`、`drawReadout`，HUD 里的角落读数（`readout`、`pdoomOverride`）；`post.ts` 里的 `pdoom`、`pdoomText`、`hudCorruption`；`engine.ts` 里对它们的引用。HUD 的其余部分（裁切框、字幕）保留，行为不变。
2. **改名**：`window.__pdoom` 改成 `window.__clawd`（`main.ts`、`scripts/render.ts`）；环境变量 `PDOOM_NO_HMR` 改成 `CLAWD_NO_HMR`（`vite.config.ts` 等所有用到它的地方）。
3. **注释**：`app/` 里专门讲 pdoom 那首歌的注释（比如 `lyrics.ts` 里 `'p(doom)'` 这种例子），换成中性的例子。`palette.ts` 的**配色不要动**（阶段 4 会整体替换），只把专门讲 P(doom) 的注释改成中性的。`timeline.ts` 里指向 `reference/pdoom/app-timeline.ts` 的注释保留，那是有意的参考。
4. **文档**：`docs/ENGINE.md` 里提到 P(doom) HUD、`PDOOM_NO_HMR`、`pdoomText`、`hudCorruption` 的地方同步更新。只改这些，不改别的内容。

## 验收（都不看画面）
1. `cd app && bunx tsc --noEmit -p tsconfig.json` 无错误。
2. `grep -rniE "pdoom|p\(doom\)" app/src app/scripts app/vite.config.ts app/index.html` 只剩 `timeline.ts` 那一处有意保留的参考。
3. **输出不变**：动手之前，先在 main 的状态下渲染静帧 `bun scripts/render.ts stills --t 0.5,5,22.3,61.8,110 --out <临时目录>/before`；改完后用同样的参数渲染 `after`。逐张比较**解码后的像素**（不是比较文件字节），要求完全一致。报告每张图的比较结果。不一致就查原因并报告，不要为了一致去改测试。
4. 5 秒短片 `bun scripts/render.ts video --from 20 --to 25 --preset veryfast --out <临时目录>/x2.mp4` 能正常跑完。报告帧数、时长，以及日志里除了那条预期中的 `data/audio.json` 404 以外的所有报错。

## 约束
- 只改 `app/` 和 `docs/ENGINE.md`。
- 代码注释用英文，风格沿用上游。
- 不截屏，不对画面下结论。
- 小步提交到 `codex/x2-cleanup`，提交信息用英文，结尾加一行 `Co-Authored-By: Codex <noreply@openai.com>`。

## 交付
最后一条消息给出：改了哪些文件（每个一句话）、验收 1–4 的逐项结果、没做的和发现的其他问题。
