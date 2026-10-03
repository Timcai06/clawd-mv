#!/bin/bash
# Merge a reviewed V6 group: keep its out/ artefacts, merge the branch, typecheck + test, remove the worktree.
# Usage: tools/v6_merge.sh <group>     (e.g. k, k2, g1)
set -e
g=$1; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WT="$ROOT/../clawd-mv-v6$g"; BR="codex/v6-$g"
mkdir -p "$ROOT/out/wip/v6-$g"
cp -R "$WT/out/." "$ROOT/out/wip/v6-$g/" 2>/dev/null || true
cd "$ROOT"
git merge --no-ff -q "$BR" -m "Merge V6 group $g

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
(cd app && bunx tsc --noEmit -p tsconfig.json && bun test tests 2>&1 | tail -3 && bun scripts/storyboard-check.ts | tail -3)
git worktree remove --force "$WT" && git branch -d "$BR" >/dev/null
echo "merged $g -> $(git rev-parse --short HEAD)"
