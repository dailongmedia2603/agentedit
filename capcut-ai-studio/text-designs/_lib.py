#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bo dung MAU CHU TU THIET KE cho Kho Text (khong tu preset CapCut).

Mot mau = 1 file design_<id>.py goi cac ham duoi day -> ghi thu muc mau (template.json + fonts/ + audio/) dung schema
remotion-src/textTemplate/spec.ts, ve bang chinh TextTemplate.tsx. Quy uoc giu NGUYEN nhu preset CapCut:
  - co chu = CHIEU CAO DONG font: size (don vi CapCut) * 6.21 px @1080 * scale; em = chieu cao dong / lineEm
  - toa do transform: x = nua chieu rong, y = nua chieu cao, truc y huong LEN; tam node = tam (be ngang chu, dong font)
  - CapCut / renderer KHONG kern -> do be ngang bang tong advance tung ky tu
Vi tri / co lay tu SO DO tren anh mau (khop tung thanh phan bang tuong quan, xem compare.py) -> khong dat tay.
Am thanh tong hop bang numpy (khong ban quyen, khong can mang) — moi tieng gan voi NGHIA cua chuyen dong.
"""
import os
import json
import shutil
import wave

import numpy as np
from PIL import ImageFont

LINE_PER_SIZE = 6.21  # KHOP TextTemplate DEFAULT_TUNE.linePerSize
SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")


class Font:
    def __init__(self, fid, file):
        self.id = fid
        self.file = file
        self.path = os.path.join(FONT_DIR, file)
        self.ft = ImageFont.truetype(self.path, 1000)
        a, d = self.ft.getmetrics()
        self.asc, self.desc = a / 1000.0, d / 1000.0
        self.line_em = self.asc + self.desc  # chieu cao dong / em (metric hhea — trinh duyet dung cung so nay)

    def advance(self, text, ls=0.0):
        """be ngang (theo em) khong kern + gian chu ls (em) sau MOI ky tu (nhu canvas letterSpacing)"""
        return sum(self.ft.getlength(c) for c in text) / 1000.0 + ls * len(text)

    def ink(self, text):
        """khung net muc (theo em) so voi goc (dau dong, duong chan chu), y huong xuong"""
        x, l, t, r, b = 0.0, 1e9, 1e9, -1e9, -1e9
        for c in text:
            bb = self.ft.getbbox(c, anchor="ls")
            if bb[2] > bb[0]:
                l, t, r, b = min(l, x + bb[0] / 1000.0), min(t, bb[1] / 1000.0), max(r, x + bb[2] / 1000.0), max(b, bb[3] / 1000.0)
            x += self.ft.getlength(c) / 1000.0
        return l, t, r, b


def ink_sheared(font, text, deg):
    """khung net muc (theo em) khi NGHIENG GIA LAP deg do quanh tam net muc (KHOP drawText: italicPivot < 0) —
    do bang anh (goc duoi trai cua chu nghieng phu thuoc hinh chu, khong suy duoc tu khung thang)"""
    import math
    from PIL import Image, ImageDraw
    if not deg:
        return font.ink(text)
    k = math.tan(math.radians(deg))
    ft = ImageFont.truetype(font.path, 400)
    l, t, r, b = font.ink(text)
    cy = (t + b) / 2 * 400
    pad = 300
    W = int((r - l) * 400 + 2 * pad)
    img = Image.new("L", (W, 1200), 0)
    d = ImageDraw.Draw(img)
    x = pad - l * 400
    base = 600
    for c in text:
        d.text((x, base), c, font=ft, fill=255, anchor="ls")
        x += ft.getlength(c)
    # x_ra = x_vao - k * (y - (base + cy))  -> anh nguoc: x_vao = x_ra + k * (y - base - cy)
    sh = img.transform(img.size, Image.AFFINE, (1, k, -k * (base + cy), 0, 1, 0), resample=Image.BILINEAR)
    bb = sh.point(lambda v: 255 if v > 100 else 0).getbbox()
    x0 = pad - l * 400
    return ((bb[0] - x0) / 400.0, (bb[1] - base) / 400.0, (bb[2] - x0) / 400.0, (bb[3] - base) / 400.0)


class Frame:
    """Doi toa do anh mau (px) -> khung mau W x H: phong S lan, tam khoi chu anh mau -> tam (cx, cy) khung."""

    def __init__(self, S, ref_center, W=1080, H=1920, center=None):
        self.S, self.rc, self.W, self.H = S, ref_center, W, H
        self.c = center or (W / 2.0, H / 2.0)

    def px(self, x, y):
        return (x - self.rc[0]) * self.S + self.c[0], (y - self.rc[1]) * self.S + self.c[1]

    def tr(self, X, Y):
        return {"x": round((X - self.W / 2.0) / (self.W / 2.0), 6), "y": round(-(Y - self.H / 2.0) / (self.H / 2.0), 6),
                "scale": 1.0, "rotation": 0.0}


def text_node(fr, nid, slot, font, text, em_ref, ink_x0, ink_y0, ls=0.0, fill=(1, 1, 1), italic=0.0, **extra):
    """Node chu dat sao cho goc trai-tren NET MUC = (ink_x0, ink_y0) tren anh mau, em = em_ref px anh mau.
    italic = do nghieng GIA LAP (font thang nghieng bang ma tran, nhu CapCut italic_degree)."""
    em = em_ref * fr.S
    l, t, _, _ = ink_sheared(font, text, italic)
    X0, Y0 = fr.px(ink_x0, ink_y0)
    start_x = X0 - l * em          # dau dong (advance)
    base_y = Y0 - t * em            # duong chan chu
    total = font.advance(text, ls) * em
    cx = start_x + total / 2.0
    cy = base_y - (font.asc - font.desc) / 2.0 * em  # tam dong font (KHOP drawText: base = cy + (asc - desc) / 2)
    n = {"type": "text", "id": nid, "slot": slot, "start": 0.0, "duration": 99.0, "font": font.id,
         "size": round(em * font.line_em / LINE_PER_SIZE * (1080.0 / fr.W), 4), "fill": [round(v, 4) for v in fill],
         "transform": fr.tr(cx, cy)}
    if ls:
        n["letterSpacing"] = ls
    if italic:
        n["italicDegree"] = italic
        n["runs"] = [{"len": len(text), "font": font.id, "size": n["size"], "fill": n["fill"], "italic": True}]
    n.update(extra)
    return n


def frame_of(fr, font, text, node):
    """Khung (px khung mau) cua node o vi tri nghi: l r t b base inkT inkB — de tinh do lech cua hinh bam chu."""
    em = node["size"] * LINE_PER_SIZE * (fr.W / 1080.0) / font.line_em
    cx = fr.W / 2.0 + node["transform"]["x"] * fr.W / 2.0
    cy = fr.H / 2.0 - node["transform"]["y"] * fr.H / 2.0
    total = font.advance(text, node.get("letterSpacing") or 0) * em
    base = cy + (font.asc - font.desc) / 2.0 * em
    _, t, _, b = font.ink(text)
    return {"l": cx - total / 2, "r": cx + total / 2, "cx": cx, "t": cy - font.line_em * em / 2, "b": cy + font.line_em * em / 2,
            "cy": cy, "base": base, "inkT": base + t * em, "inkB": base + b * em}


def ref(slot, edge, value_px, frm, W=1080):
    """SlotRef sao cho canh = value_px (px khung mau) khi chu la chu mau -> off = chenh lech (don vi khung 1080)."""
    return {"slot": slot, "edge": edge, "off": round((value_px - frm[edge]) * 1080.0 / W, 3)}


# ---------------------------------------------------------------------------------------------------------------
# AM THANH (numpy) — moi ham tra mang float mono SR
# ---------------------------------------------------------------------------------------------------------------
def _t(d):
    return np.arange(int(d * SR)) / SR


def _noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def _bp(x, lo, hi):
    """loc thong dai bang FFT (du cho tieng ngan)"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.clip((f - lo * 0.8) / (lo * 0.2 + 1e-9), 0, 1) * np.clip((hi * 1.25 - f) / (hi * 0.25 + 1e-9), 0, 1)
    return np.fft.irfft(X * m, len(x))


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def bell(freq, d, decay, partials=((1, 1), (2.76, 0.35), (5.4, 0.18), (8.93, 0.08)), seed=0):
    """chuong / ting: cac hoa am khong dieu hoa giam dan (chuong kim loai)"""
    t = _t(d)
    x = sum(a * np.sin(2 * np.pi * freq * k * t) * np.exp(-t * decay * (1 + 0.6 * (k - 1))) for k, a in partials)
    att = np.clip(t / 0.003, 0, 1)
    return x * att


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    st = (np.stack([x, x], 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(st.tobytes())


# ---------------------------------------------------------------------------------------------------------------
def write_template(out_dir, spec, fonts, sounds):
    """Ghi thu muc mau: fonts/ (chep tu text-designs/fonts + giay phep OFL), audio/ (WAV), template.json."""
    os.makedirs(os.path.join(out_dir, "fonts"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "audio"), exist_ok=True)
    for f in fonts:
        shutil.copy2(f.path, os.path.join(out_dir, "fonts", f.file))
    lic = os.path.join(FONT_DIR, "OFL.txt")
    if os.path.isfile(lic):
        shutil.copy2(lic, os.path.join(out_dir, "fonts", "OFL.txt"))
    spec["fonts"] = [{"id": f.id, "file": "fonts/" + f.file} for f in fonts]
    spec["audio"] = []
    for name, (start, x, vol) in sounds.items():
        write_wav(os.path.join(out_dir, "audio", name + ".wav"), x)
        spec["audio"].append({"file": "audio/%s.wav" % name, "start": round(start, 4), "duration": round(len(x) / SR, 4),
                              "sourceStart": 0.0, "volume": vol, "fadeIn": 0.0, "fadeOut": 0.0})
    with open(os.path.join(out_dir, "template.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    return out_dir
