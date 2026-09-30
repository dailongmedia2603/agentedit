#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO TIENG MOTION GRAPHICS tu tong hop (whoosh, swoosh, pop, click, boom, riser, ding, go phim).

Kho SFX nguoi dung chu yeu la tieng meme (Myinstants) — thieu nhom tieng "dau cham cau" cho
chu va do hoa bay vao, thu editor dung dac dac trong video nhu mau1.mp4. Tong hop bang numpy
(khong ban quyen, khong can mang), ghi WAV vao ~/.capcut-studio/sfx/ va dang ky vao
sfx_library.json voi id co dinh "kit-*" -> dung duoc o CA hai luong (B7 chon, lop do hoa goi).
"""
import os
import wave
import numpy as np

import engine

SR = 44100
KIT = {
    "kit-whoosh": ("Whoosh (luot qua)", "neutral", "Chu / hinh / anh BAY VAO khung, doi bo cuc, chuyen canh nhanh", ["whoosh", "transition"]),
    "kit-swoosh": ("Swoosh ngan", "neutral", "Chu truot vao nhanh, lat the, doi y nho", ["swoosh", "transition"]),
    "kit-pop": ("Pop bat ra", "positive", "Icon / huy hieu / sticker / chu nho BAT RA", ["pop", "ui"]),
    "kit-click": ("Click", "neutral", "Bam nut, danh dau, hien tung muc danh sach, con tro", ["click", "ui"]),
    "kit-boom": ("Boom tram (impact)", "punch", "Chu nhan LON dap vao, cau chot, con so soc", ["boom", "impact", "punch"]),
    "kit-riser": ("Riser (don toi)", "neutral", "Don cang truoc khi tiet lo / truoc chu nhan / truoc hook", ["riser", "build"]),
    "kit-ding": ("Ding sang", "positive", "Tiet lo con so / dap an dung / diem tich cuc", ["ding", "reveal"]),
    "kit-typing": ("Go phim", "neutral", "Chu hien kieu go phim / the prompt sang dan", ["typing", "ui"]),
}


def _env(n, attack, release, peak=0.5):
    t = np.linspace(0, 1, n)
    up = np.clip(t / max(1e-4, attack), 0, 1)
    down = np.clip((1 - t) / max(1e-4, release), 0, 1)
    e = np.minimum(up, down)
    return e ** 1.5


def _bandpass_sweep(x, f0, f1, q=1.2):
    """Loc bang thong co tan so trung tam truot f0 -> f1 (biquad tung mau)."""
    n = len(x)
    y = np.zeros(n)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(n):
        f = f0 * (f1 / f0) ** (i / n)
        w = 2 * np.pi * f / SR
        alpha = np.sin(w) / (2 * q)
        b0, b2 = alpha, -alpha
        a0, a1, a2 = 1 + alpha, -2 * np.cos(w), 1 - alpha
        yi = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1 = x1, x[i]
        y2, y1 = y1, yi
        y[i] = yi
    return y


def _norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def synth(kind, seed=7):
    rng = np.random.default_rng(seed)
    if kind == "kit-whoosh":
        n = int(SR * 0.5)
        x = _bandpass_sweep(rng.standard_normal(n), 350, 3200, 1.0) * _env(n, 0.62, 0.38)
    elif kind == "kit-swoosh":
        n = int(SR * 0.28)
        x = _bandpass_sweep(rng.standard_normal(n), 1200, 7000, 1.4) * _env(n, 0.45, 0.55)
    elif kind == "kit-pop":
        n = int(SR * 0.13)
        t = np.arange(n) / SR
        f = 1150 * np.exp(-t / 0.035) + 260
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04)
        x[:120] += rng.standard_normal(120) * 0.25
    elif kind == "kit-click":
        n = int(SR * 0.05)
        t = np.arange(n) / SR
        x = rng.standard_normal(n) * np.exp(-t / 0.004) * 0.6 + np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.008)
    elif kind == "kit-boom":
        n = int(SR * 1.1)
        t = np.arange(n) / SR
        f = 38 + 30 * np.exp(-t / 0.08)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)
        hit = _bandpass_sweep(rng.standard_normal(n), 900, 120, 0.8) * np.exp(-t / 0.06) * 0.8
        x = np.tanh((body + hit) * 2.2)
    elif kind == "kit-riser":
        n = int(SR * 0.9)
        t = np.arange(n) / SR
        noise = _bandpass_sweep(rng.standard_normal(n), 300, 6000, 1.1)
        tone = np.sin(2 * np.pi * np.cumsum(220 * (6 ** (t / t[-1]))) / SR) * 0.35
        x = (noise + tone) * (t / t[-1]) ** 2.2
        x[-400:] *= np.linspace(1, 0, 400)
    elif kind == "kit-ding":
        n = int(SR * 0.9)
        t = np.arange(n) / SR
        x = (np.sin(2 * np.pi * 1568 * t) + 0.45 * np.sin(2 * np.pi * 3136 * t) + 0.2 * np.sin(2 * np.pi * 2350 * t)) * np.exp(-t / 0.28)
        x[:60] *= np.linspace(0, 1, 60)
    elif kind == "kit-typing":
        n = int(SR * 0.7)
        x = np.zeros(n)
        pos = 0
        while pos < n - 3000:
            m = int(SR * 0.03)
            tt = np.arange(m) / SR
            clk = rng.standard_normal(m) * np.exp(-tt / 0.003) + 0.4 * np.sin(2 * np.pi * rng.uniform(1800, 3200) * tt) * np.exp(-tt / 0.006)
            x[pos:pos + m] += clk * rng.uniform(0.5, 1.0)
            pos += int(SR * rng.uniform(0.06, 0.11))
    else:
        raise ValueError(kind)
    return _norm(x)


def _write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def ensure_kit():
    """Tao (neu thieu) + dang ky bo tieng vao kho SFX. Tra danh sach id co san."""
    os.makedirs(engine.SFX_DIR, exist_ok=True)
    lib = engine._load_lib()
    items = lib.get("sfx", [])
    have = {e.get("id") for e in items}
    changed = False
    for sid, (name, emo, use_when, tags) in KIT.items():
        path = os.path.join(engine.SFX_DIR, sid + ".wav")
        if not os.path.isfile(path):
            _write_wav(path, synth(sid))
        if sid not in have:
            items.append({"id": sid, "name": name, "file": path, "source": "tong_hop",
                          "emotion": emo, "use_when": use_when, "tags": tags})
            changed = True
    if changed:
        lib["sfx"] = items
        engine._save_lib(lib)
    return list(KIT)


# ho tieng (goi y "sfx" cua lop do hoa) -> id trong kho
FAMILY = {"whoosh": "kit-whoosh", "swoosh": "kit-swoosh", "pop": "kit-pop", "click": "kit-click",
          "boom": "kit-boom", "impact": "kit-boom", "punch": "kit-boom", "riser": "kit-riser",
          "ding": "kit-ding", "typing": "kit-typing"}


def family_file(name):
    sid = FAMILY.get(str(name or "").strip().lower())
    if not sid:
        return None, None
    path = os.path.join(engine.SFX_DIR, sid + ".wav")
    if not os.path.isfile(path):
        ensure_kit()
    return (sid, path) if os.path.isfile(path) else (None, None)
