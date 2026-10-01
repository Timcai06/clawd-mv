#!/usr/bin/env python3
"""Compose storyboard-vs-implementation sheets (called by app/scripts/compare.ts).

Each sheet: [keyframe | implementation still of the same shot] on top (960x540 each),
one still per shot of the scene below, all labelled. Also writes index.html.
"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

jobs = json.load(open(sys.argv[1]))
stills, out = sys.argv[2], sys.argv[3]
W, H, PAD, LAB = 960, 540, 8, 28
BG, FG = (24, 24, 24), (225, 225, 225)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 18)
except OSError:
    font = ImageFont.load_default()

def still(t):
    return Image.open(os.path.join(stills, "f_" + f"{t:.2f}".rjust(7, "0") + ".png"))

def fit(im, w, h):
    return im.convert('RGB').resize((w, h), Image.LANCZOS)

pages = []
for j in jobs:
    n = len(j['strip'])
    sw = (2 * W + PAD - (n - 1) * PAD) // n
    sh = sw * 9 // 16
    sheet = Image.new('RGB', (2 * W + 3 * PAD, PAD + LAB + H + PAD + LAB + sh + PAD), BG)
    d = ImageDraw.Draw(sheet)
    d.text((PAD, PAD + 4), f"{j['id']}  storyboard v2 (shot {j['shot']})", font=font, fill=FG)
    d.text((2 * PAD + W, PAD + 4), f"implementation  {j['shot']} @ {j['main']:.2f}s", font=font, fill=FG)
    sheet.paste(fit(Image.open(j['kf']), W, H), (PAD, PAD + LAB))
    sheet.paste(fit(still(j['main']), W, H), (2 * PAD + W, PAD + LAB))
    y = PAD + LAB + H + PAD
    for i, s in enumerate(j['strip']):
        x = PAD + i * (sw + PAD)
        d.text((x, y + 4), f"{s['id']} {s['t']:.2f}s", font=font, fill=FG)
        sheet.paste(fit(still(s['t']), sw, sh), (x, y + LAB))
    f = f"cmp-{j['id']}.png"
    sheet.save(os.path.join(out, f))
    pages.append(f)
    print(os.path.join(out, f))

html = ['<!doctype html><meta charset="utf-8"><title>Storyboard vs implementation</title>',
        '<style>body{background:#181818;color:#ddd;font:14px Menlo,monospace;margin:16px}img{width:100%;max-width:1944px;display:block;margin:0 0 28px}</style>']
html += [f'<h3 id="{p[4:-4]}">{p[4:-4]}</h3><img src="{p}">' for p in pages]
open(os.path.join(out, 'index.html'), 'w').write('\n'.join(html))
