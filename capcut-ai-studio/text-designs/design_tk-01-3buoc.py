#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mau tu thiet ke TK-01 "3 bước TẮM TRẮNG" — bo cuc theo anh mau user gui 2026-10-04 (ref-tk-01.png, 328x222):

    3  bước ______            so LON nghieng dam canh 2 dong: dong nho nghieng + gach ke keo dai toi het dong duoi
    3  TẮM TRẮNG              tieu de in hoa nghieng manh
  [ đơn giản, an toàn & hiệu quả ]   hop trang chu toi (loi ich / cam ket)
        ngay tại nhà!         dong chot

Font: ho Montserrat (OFL, du dau tieng Viet) — chon bang tuong quan voi anh mau (compare.py): so 3 = ExtraBold Italic,
"bước" = Light Italic, "TẮM TRẮNG" = Regular thang nghieng gia lap 11 do, dong cuoi = Regular, chu trong hop = Regular
gian -0.032 em.
CHUYEN DONG (nghia):
  0.00  "3" DAP xuong nhu con dau (phong 2.6x -> nay 1.06 -> 1)       = con so chot cua noi dung  | tieng: vut + thump
  0.22  "bước" hien theo net but (lo dan trai -> phai)                = buoc dau tien              | tieng: but sot soat
  0.42  gach ke KEO DAI theo net but                                   = con duong cac buoc         |   (cung tieng but)
  0.50  "TẮM TRẮNG" truot vao tung chu, MAU DA RAM -> TRANG SANG theo vet sang quet ngang + tia lap lanh
                                                                       = tam trang: da sam thanh trang | tieng: lap lanh + ting
  1.20  hop trang BUNG ra tu giua, chu loi ich noi len tung ky tu       = nhan cam ket               | tieng: pop
  1.70  "ngay tại nhà!" nay len tung chu                               = than thien, o nha          | tieng: chuong cua ding-dong
  3.30  ca khoi mo + thu nhe                                            = ket
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _lib import Font, Frame, text_node, frame_of, ref, write_template, ink_sheared, norm, bell, _t, _noise, _bp, SR  # noqa: E402,F401

TID = "tk-01-3buoc"
OUT = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else os.path.join("~/.capcut-studio/text_templates", TID))

# ---- SO DO tren anh mau (px anh 328x222) — compare.py / fit: font, em, goc trai-tren net muc, gian chu ----------------
F3 = Font("f1", "Montserrat-ExtraBoldItalic.ttf")
FLI = Font("f2", "Montserrat-LightItalic.ttf")
FRG = Font("f3", "Montserrat-Regular.ttf")
M = {
    "s1": dict(font=F3, text="3", em=82.12, x=49.5, y=56.75),
    "s2": dict(font=FLI, text="bước", em=28.65, x=110.75, y=57.0),
    # tieu de: Regular THANG + nghieng gia lap 11 do (tuong quan 0.948; Light 0.944; ban Italic that chi 0.67 — M / dau lech)
    "s3": dict(font=FRG, text="TẮM TRẮNG", em=29.029, x=105.75, y=87.25, ls=-0.005, italic=11),
    "s4": dict(font=FRG, text="đơn giản, an toàn & hiệu quả", em=19.419, x=33.5, y=134.0, ls=-0.032),
    "s5": dict(font=FRG, text="ngay tại nhà!", em=28.65, x=71.25, y=167.0),
}
BOX = (27.3, 127.8, 301.6, 157.6)       # hop trang (l, t, r, b) — mep = diem 50% do sang tren anh mau
LINE = (185.5, 78.07, 278.0, 78.93)     # gach ke: x tu sau "bước" toi het "TẮM TRẮNG"; tam y 78.5, day 0.86 px anh mau
WHITE = (0.99, 0.99, 1.0)
BOX_FILL = (0.988, 0.984, 0.988)
INK_DARK = (0.16, 0.16, 0.19)
TAN = (0.80, 0.62, 0.47)                # mau da ram truoc khi "tam trang"

fr = Frame(S=3.1, ref_center=(165.0, 126.0))
D = 3.6

nodes = {}
for sid, m in M.items():
    nodes[sid] = text_node(fr, sid, sid, m["font"], m["text"], m["em"], m["x"], m["y"], ls=m.get("ls", 0.0),
                           italic=m.get("italic", 0.0), fill=INK_DARK if sid == "s4" else WHITE)
fm = {sid: frame_of(fr, M[sid]["font"], M[sid]["text"], n) for sid, n in nodes.items()}

# ---- chuyen dong ----------------------------------------------------------------------------------------------------
n1 = nodes["s1"]
n1["keyframes"] = {
    "scale": [[0.0, 2.6 * n1["transform"]["scale"], 0, 0, 0.06, 0], [0.16, 0.9], [0.26, 1.06], [0.36, 1.0]],
    "alpha": [[0.0, 0.0], [0.07, 1.0]],
    "rotation": [[0.0, -12.0], [0.2, 2.0], [0.34, 0.0]],
}
nodes["s2"].update(start=0.22, duration=D - 0.22, reveal={"start": 0.0, "duration": 0.42, "from": "left", "soft": 26,
                                                          "ease": [0.3, 0.1, 0.3, 1]})
nodes["s3"].update(start=0.5, duration=D - 0.5, textCase="upper",
                   charAnim={"type": "stagger_in", "start": 0.0, "duration": 0.42, "overlap": 0.45, "dx": -0.55, "dy": 0.0,
                             "rotation": 0.0, "scale": 1.0, "ease": [0.2, 0.8, 0.3, 1], "alphaEnd": 0.6},
                   colorSweep={"start": 0.3, "duration": 0.62, "from": list(TAN), "soft": 70, "angle": 22,
                               "ease": [0.45, 0, 0.55, 1], "glow": {"color": [1, 1, 1], "blur": 34, "alpha": 0.95}})
nodes["s4"].update(start=1.3, duration=D - 1.3,
                   charAnim={"type": "stagger_in", "start": 0.0, "duration": 0.5, "overlap": 0.35, "dx": 0.0, "dy": 0.45,
                             "rotation": 0.0, "scale": 1.0, "ease": [0.2, 0.8, 0.3, 1], "alphaEnd": 0.5})
nodes["s5"].update(start=1.7, duration=D - 1.7,
                   charAnim={"type": "stagger_in", "start": 0.0, "duration": 0.5, "overlap": 0.45, "dx": 0.0, "dy": 0.55,
                             "rotation": 0.0, "scale": 0.55, "ease": [0.34, 1.56, 0.64, 1], "alphaEnd": 0.35})

# ---- hinh bam theo chu (chu that dai / ngan -> hinh di theo) ---------------------------------------------------------
bx = [fr.px(BOX[0], BOX[1]), fr.px(BOX[2], BOX[3])]
box = {"type": "shape", "id": "box", "kind": "rect", "start": 1.2, "duration": D - 1.2, "fill": list(BOX_FILL), "radius": 2,
       "box": {"l": ref("s4", "l", bx[0][0], fm["s4"]), "r": ref("s4", "r", bx[1][0], fm["s4"]),
               "t": ref("s4", "t", bx[0][1], fm["s4"]), "b": ref("s4", "b", bx[1][1], fm["s4"])},
       "reveal": {"start": 0.0, "duration": 0.32, "from": "center", "ease": [0.2, 0.9, 0.25, 1]},
       "keyframes": {"alpha": [[0.0, 0.0], [0.06, 1.0]]}}
lx = [fr.px(LINE[0], LINE[1]), fr.px(LINE[2], LINE[3])]
line = {"type": "shape", "id": "line", "kind": "rect", "start": 0.42, "duration": D - 0.42, "fill": list(WHITE), "minWidth": 40,
        "box": {"l": ref("s2", "r", lx[0][0], fm["s2"]), "r": ref("s3", "r", lx[1][0], fm["s3"]),
                "t": ref("s2", "base", lx[0][1], fm["s2"]), "b": ref("s2", "base", lx[1][1], fm["s2"])},
        "reveal": {"start": 0.0, "duration": 0.48, "from": "left", "soft": 10, "ease": [0.3, 0.2, 0.2, 1]}}
spk_c = (fm["s3"]["r"] + 34, fm["s3"]["inkT"] - 6)
spark = {"type": "shape", "id": "spark", "kind": "sparkle", "start": 1.18, "duration": 0.85, "fill": list(WHITE),
         "box": {"l": ref("s3", "r", spk_c[0] - 30, fm["s3"]), "r": ref("s3", "r", spk_c[0] + 30, fm["s3"]),
                 "t": ref("s3", "inkT", spk_c[1] - 30, fm["s3"]), "b": ref("s3", "inkT", spk_c[1] + 30, fm["s3"])},
         "keyframes": {"scale": [[0.0, 0.0], [0.16, 1.2], [0.3, 0.9], [0.55, 1.0], [0.85, 0.0]],
                       "rotation": [[0.0, -40.0], [0.85, 50.0]]},
         "shadow": {"color": [1, 1, 1], "alpha": 0.9, "distance": 0, "angle": 0, "smoothing": 18}}

content = {"type": "group", "id": "content", "start": 0.0, "duration": D, "sourceStart": 0.0,
           "transform": {"x": 0.0, "y": 0.0, "scale": 1.0, "rotation": 0.0},
           "keyframes": {"alpha": [[3.3, 1.0], [D, 0.0]], "scale": [[3.3, 1.0], [D, 0.96]]},
           "children": [nodes["s1"], nodes["s2"], line, nodes["s3"], spark, box, nodes["s4"], nodes["s5"]]}
spec = {"id": TID, "name": "3 bước TẮM TRẮNG (TK-01)", "version": 1, "width": fr.W, "height": fr.H, "fps": 30, "duration": D,
        "source": {"kind": "design", "name": "TK-01 so lon + tieu de + hop loi ich", "ref": "ref-tk-01.png"},
        "slots": [{"id": "s1", "role": "con số lớn (số bước / số lượng)", "sample": "3", "accept": "number", "room": 1.7},
                  {"id": "s2", "role": "đơn vị / từ đi kèm con số (chữ nhỏ nghiêng)", "sample": "bước"},
                  {"id": "s3", "role": "tiêu đề chính IN HOA (từ khoá)", "sample": "TẮM TRẮNG"},
                  {"id": "s4", "role": "lợi ích / cam kết (trong hộp trắng, dài nhất)", "sample": "đơn giản, an toàn & hiệu quả"},
                  {"id": "s5", "role": "câu chốt ngắn", "sample": "ngay tại nhà!"}],
        "readingOrder": ["s1", "s2", "s3", "s4", "s5"],
        "root": {"type": "group", "id": "root", "start": 0, "duration": D, "sourceStart": 0,
                 "transform": {"x": 0.0, "y": 0.0, "scale": 1.0, "rotation": 0.0}, "children": [content]}}


# ---- am thanh -------------------------------------------------------------------------------------------------------
def snd_stamp():
    """vut ngan (0 -> 0.16s, luc so 3 lao xuong) + thump tram + tieng tach luc dap"""
    hit = 0.16
    x = np.zeros(int(0.8 * SR))
    t = _t(hit)
    w = _bp(_noise(len(t), 1), 900, 5000) * (t / hit) ** 2.2 * 0.35
    x[:len(t)] += w
    tt = _t(0.6)
    f = 55 + 95 * np.exp(-tt * 28)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7.5)
    click = _bp(_noise(len(tt), 2), 2000, 9000) * np.exp(-tt * 140) * 0.5
    i = int(hit * SR)
    x[i:i + len(tt)] += thump + click
    return norm(x, 0.9)


def snd_pen():
    """but sot soat theo luc "bước" + gach ke hien (0.22 -> 0.9s)"""
    d = 0.68
    t = _t(d)
    n = _bp(_noise(len(t), 3), 2500, 7000)
    grain = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 17 * t + 2 * np.sin(2 * np.pi * 3 * t)))
    env = np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.18, 0, 1)
    return norm(n * grain * env, 0.5)


def snd_shimmer():
    """lap lanh theo vet sang (0.8 -> 1.45s): chuoi ting cao ngau nhien day dan + hoi gio sang"""
    d = 1.1
    x = np.zeros(int(d * SR))
    rng = np.random.default_rng(5)
    for k in range(26):
        st = 0.62 * (k / 26) ** 0.8 + rng.uniform(-0.02, 0.02)
        p = bell(rng.uniform(3000, 7500), 0.35, 22, partials=((1, 1), (2.0, 0.2)), seed=k) * rng.uniform(0.25, 0.6)
        i = max(0, int(st * SR))
        x[i:i + len(p)] += p[:len(x) - i]
    t = _t(d)
    air = _bp(_noise(len(t), 6), 5000, 12000) * np.sin(np.pi * np.clip(t / 0.7, 0, 1)) * 0.25
    return norm(x + air, 0.55)


def snd_ting():
    """tia lap lanh bat ra (1.2s)"""
    return norm(bell(2637, 0.9, 6.5) + 0.5 * bell(3951, 0.9, 9), 0.5)


def snd_pop():
    """hop trang bung ra (1.2s): bong bong 300 -> 900 Hz"""
    t = _t(0.16)
    f = 300 + 600 * np.clip(t / 0.045, 0, 1)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32) * np.clip(t / 0.003, 0, 1), 0.7)


def snd_doorbell():
    """chuong cua 'ding - dong' (ngay tại nhà!)"""
    a = bell(1319, 1.1, 3.6, partials=((1, 1), (2.0, 0.25), (3.0, 0.08)))
    b = bell(1047, 1.4, 3.0, partials=((1, 1), (2.0, 0.25), (3.0, 0.08)))
    x = np.zeros(int(1.75 * SR))
    x[:len(a)] += a
    i = int(0.3 * SR)
    x[i:i + len(b)] += b
    return norm(x, 0.6)


sounds = {  # (gio bat dau, tieng, am luong) — tong tron dinh < 0 dBFS
    "stamp": (0.0, snd_stamp(), 0.8),
    "pen": (0.22, snd_pen(), 0.95),
    "shimmer": (0.78, snd_shimmer(), 0.6),
    "ting": (1.2, snd_ting(), 0.45),
    "pop": (1.2, snd_pop(), 0.45),
    "doorbell": (1.72, snd_doorbell(), 0.6),
}

FONTS = [F3, FLI, FRG]

if __name__ == "__main__":
    write_template(OUT, spec, FONTS, sounds)
    print("ok", OUT)
