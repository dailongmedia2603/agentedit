#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DO KHOP 1 thanh phan chu tren ANH MAU: thu tung font (+ nghieng gia lap) x co x gian chu x vi tri, chon tuong quan
cao nhat voi anh mau -> so do dua vao design_<id>.py (font, em px anh mau, goc trai-tren net muc, ls, italic).

  python text-designs/fit_ref.py ref.png "TẮM TRẮNG" --ink 107,86,279,116 --fonts Montserrat-LightItalic.ttf,Montserrat-Regular.ttf
         [--italic 0,8,11,14] [--inv] [--bg 39,37,66] [--fg 245] [--halfres]
  --ink   khung net muc uoc luong (px anh mau) — chi can gan dung, script tu do quanh do
  --italic 0 = font nhu goc; > 0 = font THANG nghieng gia lap (KHOP renderer: nghieng quanh tam net muc)
  --inv   chu TOI tren nen sang (vd chu trong hop trang)
  --halfres anh mau la ban phong 2x tu anh nho (hang / cot lap doi) -> lam mo ban dung tuong tu
Ve tung ky tu theo advance (KHONG kern — giong CapCut / TextTemplate). Font tim trong text-designs/fonts/.
"""
import os
import sys
import json
import math
import argparse

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SS = 8  # sieu mau


def ref_map(L, box, bg, fg, inv):
    x0, y0, x1, y1 = box
    c = L[y0:y1, x0:x1]
    return np.clip((c - fg) / (bg - fg), 0, 1) if inv else np.clip((c - bg) / (fg - bg), 0, 1)


def draw(font, size, text, box, ox, oy, ls, deg, halfres):
    """ve chu trang sao cho goc trai-tren net muc (sau khi nghieng) = (ox, oy) px anh mau -> ban do 0..1 cua box"""
    x0, y0, x1, y1 = box
    W, H = (x1 - x0) * SS, (y1 - y0) * SS
    ft = ImageFont.truetype(font, max(1, int(round(size * SS))))
    xs, acc = [], 0.0
    for ch in text:
        xs.append(acc)
        acc += ft.getlength(ch) + ls * size * SS
    bbs = [ft.getbbox(ch, anchor="ls") for ch in text]
    pad = W
    big = Image.new("L", (W + 2 * pad, 3 * H), 0)  # du cao cho chu to hon khung do (dau / net tren khong bi cat)
    d = ImageDraw.Draw(big)
    base = 2 * H
    for i, ch in enumerate(text):
        d.text((pad + xs[i], base), ch, font=ft, fill=255, anchor="ls")
    if deg:
        inkT = base + min(b[1] for b in bbs if b[3] > b[1])
        inkB = base + max(b[3] for b in bbs if b[3] > b[1])
        k = math.tan(math.radians(deg))
        big = big.transform(big.size, Image.AFFINE, (1, k, -k * (inkT + inkB) / 2, 0, 1, 0), resample=Image.BILINEAR)
    arr = np.asarray(big)
    cols = np.where(arr.max(0) > 40)[0]
    rows = np.where(arr.max(1) > 40)[0]
    if not len(cols):
        return np.zeros((y1 - y0, x1 - x0)), 0
    sx = cols.min() - (ox - x0) * SS
    sy = rows.min() - (oy - y0) * SS
    out = Image.fromarray(arr).crop((int(round(sx)), int(round(sy)), int(round(sx)) + W, int(round(sy)) + H))
    small = out.resize((x1 - x0, y1 - y0), Image.BOX)
    if halfres:
        small = small.resize((max(1, (x1 - x0) // 2), max(1, (y1 - y0) // 2)), Image.BOX).resize((x1 - x0, y1 - y0), Image.BILINEAR)
    return np.asarray(small).astype(float) / 255, (cols.max() - cols.min()) / SS


def corr(a, b):
    a = a - a.mean()
    b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ref")
    ap.add_argument("text")
    ap.add_argument("--ink", required=True)
    ap.add_argument("--fonts", required=True)
    ap.add_argument("--italic", default="0")
    ap.add_argument("--inv", action="store_true")
    ap.add_argument("--bg", default=None, help="mau nen (r,g,b) — mac dinh: trung vi 4 hang mep anh")
    ap.add_argument("--fg", type=float, default=245.0, help="do sang chu (chu sang) / nen hop (--inv)")
    ap.add_argument("--halfres", action="store_true")
    a = ap.parse_args()
    im = np.asarray(Image.open(a.ref).convert("RGB")).astype(float)
    L = im.mean(2)
    bg = float(np.mean([float(v) for v in a.bg.split(",")])) if a.bg else float(np.median(np.concatenate([L[:4].ravel(), L[-4:].ravel()])))
    if a.inv:
        bg, fg = 70.0, 250.0  # chu toi (~70) tren hop trang (~250)
    else:
        fg = a.fg
    ink = [float(v) for v in a.ink.split(",")]
    box = (int(ink[0]) - 6, int(ink[1]) - 6, int(ink[2]) + 7, int(ink[3]) + 7)
    R = ref_map(L, box, bg, fg, a.inv)
    degs = [float(v) for v in a.italic.split(",")]
    res = []
    for fname in a.fonts.split(","):
        font = fname if os.path.isfile(fname) else os.path.join(HERE, "fonts", fname)
        ft = ImageFont.truetype(font, 1000)
        bb = ft.getbbox(a.text, anchor="ls")
        s0 = (ink[3] - ink[1]) / ((bb[3] - bb[1]) / 1000.0)
        best = (-1,)
        for deg in degs:
            for s in np.arange(s0 * 0.88, s0 * 1.12, s0 * 0.02):
                for ls in np.arange(-0.06, 0.121, 0.01):
                    for dx in np.arange(-2, 2.01, 0.5):
                        for dy in (-1, -0.5, 0, 0.5, 1):
                            M, _ = draw(font, s, a.text, box, ink[0] + dx, ink[1] + dy, ls, deg, a.halfres)
                            v = corr(M, R)
                            if v > best[0]:
                                best = (v, s, ls, ink[0] + dx, ink[1] + dy, deg)
        v, s, ls, ox, oy, deg = best
        for d2 in sorted({deg - 1, deg, deg + 1}) if deg else [0]:
            for s2 in np.arange(s * 0.985, s * 1.016, s * 0.005):
                for l2 in np.arange(ls - 0.01, ls + 0.011, 0.005):
                    for dx in np.arange(-0.75, 0.76, 0.25):
                        for dy in np.arange(-0.5, 0.51, 0.25):
                            M, _ = draw(font, s2, a.text, box, ox + dx, oy + dy, l2, d2, a.halfres)
                            vv = corr(M, R)
                            if vv > best[0]:
                                best = (vv, s2, l2, ox + dx, oy + dy, d2)
        r = {"font": os.path.basename(font), "corr": round(best[0], 4), "em": round(float(best[1]), 3), "ls": round(float(best[2]), 4),
             "x": float(best[3]), "y": float(best[4]), "italic": float(best[5])}
        res.append(r)
        print(json.dumps(r, ensure_ascii=False), flush=True)
    res.sort(key=lambda r: -r["corr"])
    print("TOT NHAT:", json.dumps(res[0], ensure_ascii=False))


if __name__ == "__main__":
    main()
