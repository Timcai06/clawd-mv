#!/bin/bash
# Render storyboard keyframes (storyboard/keyframes.json) sequentially with the gpt-image-2 skill.
# Usage: tools/render_keyframes.sh [ID ...]   (default: all frames; existing PNGs are skipped)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$HOME/.claude/skills/gpt-image-2/scripts/gen.sh"
IDS=$(python3 -c "import json,sys;d=json.load(open('$ROOT/storyboard/keyframes.json'));print(' '.join(f['id'] for f in d['frames']))")
[ $# -gt 0 ] && IDS="$*"
for id in $IDS; do
  out="$ROOT/out/storyboard/kf-$id.png"
  [ -s "$out" ] && { echo "skip $id"; continue; }
  prompt=$(python3 -c "import json;d=json.load(open('$ROOT/storyboard/keyframes.json'));f=[x for x in d['frames'] if x['id']=='$id'][0];print(d['style']+' '+f['prompt'])")
  echo "== $id $(date +%H:%M:%S)"
  bash "$GEN" --ref "$ROOT/out/design/f1-fusion-commit.png" --ref "$ROOT/reference/clawd/clawd-canonical.png" \
    --out "$out" --timeout-sec 400 --prompt "$prompt" 2>&1 | tail -1
done
echo DONE
