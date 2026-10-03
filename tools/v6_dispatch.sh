#!/bin/bash
# Dispatch one V6 scene group to Codex in its own worktree.
# Usage: tools/v6_dispatch.sh <group> <effort> <spec1> [spec2 ...]   e.g. tools/v6_dispatch.sh g1 high V6-S01 V6-S02 V6-S03
set -e
g=$1; effort=$2; shift 2
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WT="$ROOT/../clawd-mv-v6$g"; BR="codex/v6-$g"
cd "$ROOT"
git worktree add -q "$WT" -b "$BR"
(cd "$WT/app" && bun install >/dev/null 2>&1)
mkdir -p "$WT/audio" && cp "$ROOT/audio/song.wav" "$WT/audio/"
specs=""; for s in "$@"; do specs="$specs docs/tasks/$s.md"; done
prompt="你在 clawd-mv 的 worktree 里工作，负责 V6 场景组 $g。设计规格：docs/tasks/V6-common.md（共同约定，先读）、docs/tasks/V6-cuts.md（交接表），以及本组的场景规格：$specs。严格按规格实现，不改设计；规格没写死的地方按该节的「设计意图」做，并在最终报告的「取舍清单」里逐条列出；做不到的地方停下来说明并按最接近设计意图的方式做。只改各规格「只改这些文件」允许的文件。公共部件（kit/pathtext、kit/wordplane、kit/carry、kit/handoff、kit/solidtype、kit/engrave-mat）发现缺功能时不要改 kit，写进报告。完成后跑 V6-common 第 7 节的全部验收，渲染规格列出的静帧和短片到 worktree 的 out/v6-$g/，在 worktree 里 git add + git commit，报告写到 worktree 内 out/codex/v6-$g-final.md（同时作为最终回复）。不要截屏自评画面，只报告技术事实。"
nohup codex exec -C "$WT" -m gpt-6.1-sol -c model_reasoning_effort="\"$effort\"" --approve-for-me -c sandbox_workspace_write.network_access=true -o "$ROOT/out/codex/v6-$g-final.md" "$prompt" < /dev/null > "$ROOT/out/codex/v6-$g.log" 2>&1 &
echo "dispatched $g ($effort) -> $WT"
