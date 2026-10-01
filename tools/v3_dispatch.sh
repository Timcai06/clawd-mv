#!/bin/bash
# Start one Codex V3 rollout group in its own worktree. Usage: tools/v3_dispatch.sh <group> "<scenes>" [effort]
set -e
g=$1; scenes=$2; effort=${3:-high}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WT="$ROOT/../clawd-mv-v3$g"; BR="codex/v3-$g"
git -C "$ROOT" worktree add -q "$WT" -b "$BR"
mkdir -p "$WT/audio" "$WT/out" "$ROOT/out/codex"
cp "$ROOT/audio/song.wav" "$WT/audio/"
ln -s "$ROOT/out/storyboard" "$WT/out/storyboard"
(cd "$WT/app" && bun install --silent >/dev/null 2>&1)
codex exec -C "$WT" -m gpt-6.1-sol -c model_reasoning_effort="\"$effort\"" --approve-for-me \
  -c sandbox_workspace_write.network_access=true -o "$ROOT/out/codex/v3-$g-final.md" \
  "读 docs/tasks/V3-rollout.md 并完成第 $g 组（场景 $scenes）。第一优先是还原分镜图 out/storyboard/v2/kf-SNN.png 的构图和材质。只改该组归属的文件。完成后在 worktree 里 git commit（不要推送），最后的回复按任务说明的报告要求写技术事实。" \
  < /dev/null > "$ROOT/out/codex/v3-$g.log" 2>&1
