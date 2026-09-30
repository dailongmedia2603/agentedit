#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""logo-agent-edit.png (nen trong suot) -> icon_1024.png + icon.iconset + icon.icns (macOS).

Than icon (vung khong trong suot, bo quang sang mo o vien) duoc dat vua khung 824x824 o giua canvas
1024 — luoi icon chuan macOS, de icon khong to hon cac app khac tren Dock / Launchpad.
Chay: <venv python> build/make_icon.py  (can Pillow + lenh iconutil cua macOS)
"""
import os
import shutil
import subprocess
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "logo-agent-edit.png")
BODY = 824          # kich thuoc than icon trong canvas 1024 (luoi Apple)

src = Image.open(SRC).convert("RGBA")
# bbox theo alpha DAM (>=200): bo quang sang mo ngoai than icon khi can giua
body = src.split()[3].point(lambda a: 255 if a >= 200 else 0).getbbox() or (0, 0) + src.size
bw, bh = body[2] - body[0], body[3] - body[1]
scale = BODY / float(max(bw, bh))
big = src.resize((round(src.width * scale), round(src.height * scale)), Image.LANCZOS)
cx = (body[0] + bw / 2.0) * scale
cy = (body[1] + bh / 2.0) * scale
canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
canvas.alpha_composite(big, (round(512 - cx), round(512 - cy)))
canvas.save(os.path.join(HERE, "icon_1024.png"))

iconset = os.path.join(HERE, "icon.iconset")
shutil.rmtree(iconset, ignore_errors=True)
os.makedirs(iconset)
for s in (16, 32, 128, 256, 512):
    canvas.resize((s, s), Image.LANCZOS).save(os.path.join(iconset, "icon_%dx%d.png" % (s, s)))
    canvas.resize((s * 2, s * 2), Image.LANCZOS).save(os.path.join(iconset, "icon_%dx%d@2x.png" % (s, s)))
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(HERE, "icon.icns")], check=True)

# ban nho cho giao dien (thanh tren cung): ca than icon, cat sat, 256px
tight = src.crop(body).resize((256, 256), Image.LANCZOS)
ui_dir = os.path.join(HERE, "..", "src", "assets")
os.makedirs(ui_dir, exist_ok=True)
tight.save(os.path.join(ui_dir, "logo.png"))
print("body bbox", body, "-> icon.icns + src/assets/logo.png")
