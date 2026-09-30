#!/bin/bash
# Merge a finished Codex scene group: save its out/ artefacts, merge its branch, typecheck + test,
# then remove the worktree. Usage: tools/merge_group.sh <letter>
set -e
g=$1; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WT="$ROOT/../clawd-mv-v2$g"; BR="codex/v2-$g"
mkdir -p "$ROOT/out/wip/v2-$g"; cp -R "$WT/out/v2-$g/." "$ROOT/out/wip/v2-$g/" 2>/dev/null || true
cd "$ROOT"
git merge --no-ff -q "$BR" -m "Merge scene group $g (visual spec v2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
(cd app && bunx tsc --noEmit -p tsconfig.json && bun test tests 2>&1 | tail -1)
git worktree remove --force "$WT" && git branch -d "$BR" >/dev/null
echo "merged $g -> $(git rev-parse --short HEAD)"
