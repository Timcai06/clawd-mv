# V6 分组（C 定；每组一个 worktree，互不改同一批文件）

| 组 | 规格 | 推理强度 | 依赖 |
|---|---|---|---|
| K | V6-K（pathtext、wordplane、carry、handoff v2） | xhigh | — |
| K2 | V6-K2（solidtype、engrave-mat） | high | — |
| g1 | V6-S01、V6-S02、V6-S03 | xhigh | K、K2 |
| g2 | V6-S04、V6-S05、V6-S06、V6-S07 | xhigh | K、K2 |
| g3 | V6-S08 | xhigh | K、K2 |
| g4 | V6-S09、V6-S10、V6-S11、V6-S12 | high | K、K2 |
| g5 | V6-S13（+ S14 只加导出） | xhigh | K、K2 |
| g6 | V6-S15（+ S14 只加导出）、V6-S16 | high | K、K2 |
| g7 | V6-S17、V6-S18 | xhigh | K、K2 |

共享文件：`tests/handoff.test.ts`（各组只追加自己的 `CUTS` 条目，合并时 C 解决冲突）、`scenes/s14-shaft.ts`（g5、g6 各加一个导出函数）。
跨组的交接（C3 g1→g2、C7 g2→g3、C8 g3→g4、C12 g4→g5、C13 g5→S14、C15/C16 g6、C16 g6→g7）两边各自对着 `kit/handoff.ts` 的 `CUT` 常量实现；全部合并后由 C 跑 `handoff.test.ts` 联调。
派发：`tools/v6_dispatch.sh <组> <强度> <规格…>`；合并：审查通过后 `tools/v6_merge.sh <组>`。
