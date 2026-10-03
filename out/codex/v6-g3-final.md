# V6 g3 / S08 最终报告

tim，S08 实现、23 张静帧和 4 段短片已完成。本组技术检查通过；**C7 与现有 S07 的交接、C8 与现有 S09 的 machine carry 尚未完成跨组验收**。以下列出规格冲突和公共部件缺口，不将全部设计验收标记为通过。未截图、未查看画面作审美结论。

- Worktree：`/Users/tim/DEV/clawd-mv-v6g3`
- 分支：`codex/v6-g3`；起点：`93a731cf02f609b473b8dd275ffd7200af91b476`
- 代码提交：`0ebdaaf1a8937bc7ef75bdea7500e33ef68a1223`；本报告另行提交。
- 依据：`V6-common.md`、`V6-cuts.md`、`V6-S08.md` 及指定参考文档。

## 实现

将 S08 重写为十二个镜头共享的印刷世界：48×27 纸面、768×432 段位移网格、4096×2304 PRINT/DEBOSS 贴图、真实方向光和阴影、实体铅字、两次 COM-MIT 冲击与叠印、三对嵌套括号、Clawd 四腿压印、走纸与倒卷、笔记本屏幕、月历预览、CRT 收线和 machine carry。

世界、镜头、纸面坐标、压印、Clawd、光标与 carry 使用时间纯函数。贴图缓存仅依赖固定事件集合与洪墨半径；随机 seek 时重新构建，不依赖绘制历史。保留 `s08-print.ts` 中 S13 仍使用的旧公共导出。

仅提交以下七个允许的源文件/测试文件及本报告：

- `app/src/scenes/s08-commit.ts`
- `app/src/scenes/parts/s08-world.ts`（新增）
- `app/src/scenes/parts/s08-layout.ts`
- `app/src/scenes/parts/s08-print.ts`
- `app/tests/scene-v6-g3.test.ts`（新增，19 项测试）
- `app/tests/handoff.test.ts`（追加本组 C7/C8 条目）
- `app/tests/scene-v3-c.test.ts`（删除旧 S08 冲突断言）

`kit/`、`engine/`、`timeline.ts`、`shots.json`、其他场景及 `scene-c.test.ts` 无本组改动。

## 验收数字

| 检查 | 结果 |
|---|---|
| `bunx tsc --noEmit -p tsconfig.json` | 0 错误 |
| `bun test tests` | 346 pass / 1 skip / 0 fail；347 项、45 文件、28,910 次断言 |
| `bun scripts/storyboard-check.ts` | 80 镜头；0 过短、0 不递增 |
| CPU / 导出 GLSL 函数翻译版 | 随机 200 点；误差均 < 1e-4 |
| A/E 八次压印实体投影宽 | 均 ≥ 70%；除开场 I 外为 1535.22–1538.62px，约 80% |
| COMMIT / 三对括号整体投影宽 | 1766.40px（92%）/ 1689.60px（88%）|
| C/D 字母投影大写高 | 79.9999626–80.0000000px |
| NEVER / QUIT / ’CAUSE / IT / WORKS 印痕投影高 | 70.65 / 68.28 / 101.69 / 85.30 / 91.30px |
| 两处 Plex 哈希标注 | CRT 前投影大写高 14–22px |
| 两次 MIT 后 0.3s 实际 PRINT 洪墨覆盖率 | 99.998744% / 99.998568%，排除 DEBOSS 非零像素 |
| 两次 DEBOSS 最大编码 / 对应压深 | 64 / 0.12；96 / 0.18 世界单位，无编码饱和 |
| FIT 最外括号 | 在 `fit.start` 精确到目标，位置误差 0；全纸统一弹簧位移 |
| TAP | 13 个英文字母 + 2 个连字符，15 次严格递增压印；腿序 1-3-2-4，脚的位置与印痕相符 |
| C8 线交接 | 五对相邻子帧最大误差 0.00722335px，size 误差 0 |
| machine 出场 carry | 末帧仿射逐项等于 `carryLayout(CUT.machine08 + 冻结 Voice 轴)` |
| 随机 seek | 两张贴图 SHA-256 相等；26.96、32.70、38.00、43.30s 四处帧 SHA-256 相等 |
| 末帧像素 | 43.308856823s；横线 3840 个像素，即 1920×2；线与 carry 外残留 0 像素 |
| GPU | ANGLE / Metal / Apple M5 Pro；场景错误 0，WebGL error 0 |

唯一 skip 是既有 `storyboard-whisper.test.ts`：缺少 `analysis/work/c1/whisper_turbo_quick.json`。浏览器记录的唯一资源错误为 `favicon.ico` 404；未改范围外资源。

性能使用冻结版本、1920×1080、60Hz 采样、每帧 1 个子帧，包含 GPU 同步和像素读回，串行执行：

| 范围 | 帧数 | 平均 ms | P50 | P95 | 最大 ms |
|---|---:|---:|---:|---:|---:|
| S08：24.729–43.326s | 1116 | 20.2 | 11.7 | 117.4 | 172.9 |
| 整片：0–160.6s | 9636 | 13.7 | 9.4 | 31.1 | 206.4 |

S08 平均值低于 25ms 门槛，P95 尖峰仍存在。完整日志在 [logs](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/logs)，像素数据在 [verification.json](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/verification.json)。

## 交付物

静帧位于 [stills](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/stills)，全部 1920×1080；命名为 `f_<时间补零到7位>.png`：

`24.74, 24.90, 25.00, 25.50, 26.10, 26.70, 26.96, 27.30, 28.60, 29.70, 30.38, 31.40, 32.20, 32.70, 34.00, 35.30, 37.69, 38.00, 39.80, 41.30, 42.86, 43.10, 43.30`。

| 短片 | 帧数 / 时长 |
|---|---|
| [完整 S08](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/s08-complete.mp4) | 1116 / 18.6s |
| [规格 24.2–44.0s](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/s08-24.2-44.0.mp4) | 1188 / 19.8s |
| [C7 前后各 1s](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/c7-23.729-25.729.mp4) | 120 / 2s |
| [C8 前后各 1s](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/c8-42.326-44.326.mp4) | 120 / 2s |

均为 H.264、1920×1080、60fps、`--preset veryfast --samples 1`；原曲 `audio/song.wav` 导出 AAC 48kHz 双声道。帧区间由渲染器按 60fps 四舍五入。渲染各短片前逐次核对相邻 S07/S09 文件与当时 main 零差异；四次 main 均为 `9710d97c760fbed1f153826dda55b087e161d0b4`，记录在 `logs/adjacent-main.log`。

文件尺寸、视频流元数据和全部 SHA-256 在 [artifacts.json](/Users/tim/DEV/clawd-mv-v6g3/out/v6-g3/artifacts.json)。二进制交付物及辅助核验脚本保存在 worktree 的忽略目录；代码与本报告进入 Git。

## 取舍清单

1. **几何核验**：直接提取导出的 `S08_GLSL` 函数体，翻译少量 GLSL 语法后在 JS 重算 `depthMap / impactPit / heightAt / paperPoint`。随机 200 点比较；真实 GPU 另做编译、错误和像素核验。这不等同于逐点读回 GPU 浮点坐标。
2. **纸面压深**：采用顶点位移和高度贴图有限差分法线；每个完整遮罩编码 32，代表 0.06 深度，叠印累加。8 位边缘抗锯齿存在量化；固定分辨率独立于 SCALE。
3. **缓存**：相同事件签名跳过重画/上传；变化时两张贴图从空白重建，不做依赖播放顺序的累计画布。以 `willReadFrequently` 固定 Canvas CPU 光栅后端，避免读回后 Chrome 切换后端导致 seek 哈希改变。
4. **照明细节**：保留显式方向 `(-0.8,0.27,0.55)`、环境光 0.1；方向光强度 1.8、2048 阴影图，实体曲线细分 4、无 bevel。纸面刻线角度 0.6、间距 5px。
5. **未规定的弹性**：压印使用 12Hz、阻尼 0.45 的 `springStep`，0.2s 收束；局部下陷半径取 `max(capH,width/2)`，幅度 0.02；FIT 使用负半径标记全纸一致的 0.03 弹簧位移。
6. **铅字正反面**：将字体 XY 面旋转 −π/2，使纸上的字方向正确、下侧印面朝 −y、厚度向 +y；开场镜头拍上侧 clay 面。贴纸时的下侧印面无法同时被上方镜头拍到。
7. **开场 C7 与冲击**：优先保留第一帧 clay 入场面，开场 I 的白热在首帧内关闭，两帧反色延后一个帧号开始；其他压印的冲击及 MIT 时刻保持原定值。
8. **未固定的物理字高**：A/E 的 I 为 6、其余为 3.1，COMMIT 为 4.5；镜头解投影宽 80% / 92%。C/D 按实际触纸镜头求解 80px 字高，不将画面常量当作几何构图断言。
9. **歌词槽位**：C/D 用唱完时 Voice 轴、物理 cap 2.2 预留槽位，再按触纸镜头求实际铅字尺寸；普通整词 cap 为 1.6。保留字体基线位置及标点字形。
10. **词首与镜头锚点**：严格采用歌词实际起点压印，不把词首改为快切时间；例如 Every 在括号镜头锚点前开始，第一 TAP 字母也早于 `T.tap1`。镜头仍按分镜锚点切。
11. **逐字母例外**：A/E 整词在词首一次压下，COMMIT 整块在 MIT 压下；实体铅字按规格提前落入世界，印痕等到触纸时写入。C 与 TAP 的印痕遵循逐字母时刻。实体提前出现与共同 R5 的绝对“不早出现”约束存在冲突。
12. **TAP 连字符**：使用 `letterTimes(...,{spread:1,maxSpan:2.25})` 的十三个字母锚点；两条连字符放在相邻字母时刻中点，逗号不进入敲印行，形成十五次严格递增接触。
13. **Clawd 跳入与步进**：0.5 拍抛物线结束于第一个 TAP 字母，使第一印痕有对应腿接触；通过身体位置补偿固定腿横向偏移。接触先于 `T.tap1`，身体的逐步 x 位移并非始终向右；短连字符间隔导致相邻腿动作窗口重叠，接触时优先选对应腿。
14. **括号轨迹**：未规定的嵌套间距取 1.5、画外横向弧跨度 18、最外预留间隙 0.6；左右对称、三对按拍落位，最外在 `fit.start` 精确合拢。
15. **走纸**：对拍位置积分 `ease.inCubic` 速度，负 z 方向最终达到 6 单位/拍；倒卷用 Hermite 曲线，回卷初速 +6、MIT2 速度 0、位置严格 0。倒卷开始处速度瞬间换向。
16. **固定印痕与长音**：印痕保持唱完时的轴；WORKS 悬停期间拉宽，末 0.14s 下落，词尾才压印。白热/冷却作用于实体铅字，PRINT 保留固定油墨，不使旧印痕原地淡出。
17. **哈希**：Plex Mono 500，沿纸面仿射打字，0.5 拍完成；最多两行。因 `pathtext` 没有字体参数，局部使用其共享的 `planeAffine`，按实际 Plex H 字高限制 14–22px，CRT 开始后随显示内容压扁。
18. **笔记本与预览**：纸面绕 z=13.5 铰链转 75°，对应与键盘前向的 105°夹角；不缩放世界。键顶高 0.445；月历 7×5，日期 1–32、第32格划叉，余下三格空白。
19. **CRT 与 carry**：只压扁纸面显示内容，边框、键盘、Clawd 和悬浮铅字保持实体；最终不透明横线遮住其余世界。machine 在切前半拍从实际顶面仿射转到指定版面，仅绘制已到出生时刻的字母；末帧完全对齐 kit 的目标仿射。
20. **公共材质缺口**：通过 S08 局部 shader 包装，按 PRINT 区域把 clay 上刻线换成 paper；未改公共 kit。Clawd 使用指定 `VoxelClawd` 的现有真实光照着色器，未增加其不具备的版画刻线功能。
21. **旧测试变更**：删除 S08-2 的 v3 COMMIT/Clawd 参考包围盒、开场 72px 光标、旧的退场线轨迹及 S08 旧布局 seek 循环；保留字号层级、Voice 检查及全部 S13 断言。新几何、压印、seek 与交接测试替代旧设计断言。

## 规格里做不到的地方

- **跨组 C7 未通过**：现有 main 的 S07 仍交出 72px 光标；与要求的全屏 Enter 面相比，旧原语误差 1102.608976px、size 误差 0.979375。`CUTS` 的 C7 条目明确写为“V6 contract; S07 implementation pending”，契约侧测试通过不代表实际 S07 已通过。
- **跨组 C8 carry 未通过**：S08 已交出 machine-only `{x:96,y:470,size:110}`；现有 S09 在 `(96,427)` 用 size 96 接收整句歌词，无法逐项相等。线原语可以通过，carry 需要 S09 组迁移；未越权修改 S09。
- **A/E 的两种尺寸要求不兼容**：固定 Archivo/Voice 字形比例、俯角 1.15、宽约80%时，不能让所有词同时高约518.4px。非 I 实体投影高 381.23–564.17px，第二次 I 为2903.41px；开场贴面 I 为13634.78×37031.21px。保留字体比例、宽度构图和开场铺满要求。
- **TAP 字数冲突**：`TAP-TAP-TAPPING` 实际为13个英文字母加2个连字符，不能同时满足“13个含连字符”与完整拼写、连字符也敲；公共 `letterTimes` 又把标点并到相邻字母时刻。按完整拼写做15次接触。
- **跳入时刻与第一字母冲突**：若从 `T.tap1` 才跳0.5拍，就无法在更早的第一字母时刻触纸。采用提前跳入并准时落地；固定腿序、笔直字行和逐字宽向右身体运动也无法同时保持，优先保证脚与字母落点及接触时刻。
- **光方向数字冲突**：给定方向归一化后的仰角约15.55°，与文字14°不完全一致；保留显式向量。
- **开场颜色与共同白热/反色冲突**：第一帧必须是 clay 刻线场，同时要求压印瞬间白热和两帧反色会改变该场。优先 C7 第一帧，首个 I 的效果按取舍第7项执行。
- **公共部件缺功能**：`pathtext` 不支持 Plex 字体选择；`engraveMaterial` 没有按贴图区分刻线 ink 色的公开接口；`VoxelClawd` 没有将光照转换为刻线的接口；`SolidText` 没有可分离、可独立调色的正反印面。均未修改 kit，请公共部件负责人处理。

<oai-mem-citation>
<citation_entries>
MEMORY.md:140-141|note=[V6 design and narrow implementation boundary]
MEMORY.md:136-136|note=[design ownership overridden by this explicit scene assignment]
</citation_entries>
<rollout_ids>
</rollout_ids>
</oai-mem-citation>
