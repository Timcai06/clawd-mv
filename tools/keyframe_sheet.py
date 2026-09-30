"""Contact sheet of the storyboard keyframes in out/storyboard/ (labelled with scene id and name)."""
import glob, json, pathlib
from PIL import Image, ImageDraw, ImageFont
ROOT = pathlib.Path(__file__).resolve().parent.parent
names = {s['id']: s['name'] for s in json.load(open(ROOT / 'storyboard/shots.json'))['scenes']}
import sys
src = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'out/storyboard/v2')
files = sorted(glob.glob(str(src / 'kf-S*.png')))
cols, w, h, lab = 3, 800, 450, 44
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + lab)), (242, 239, 233))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 26)
except OSError:
    font = ImageFont.load_default()
for i, f in enumerate(files):
    sid = pathlib.Path(f).stem.split('-')[1]
    x, y = (i % cols) * w, (i // cols) * (h + lab)
    sheet.paste(Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS), (x, y + lab))
    d.text((x + 12, y + 8), f'{sid}  {names.get(sid, "")}', fill=(27, 42, 74), font=font)
out = src / 'keyframes-sheet.png'
sheet.save(out)
print(len(files), 'frames ->', out)
