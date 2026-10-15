#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO CUC CHU THAT TRONG MAU KHO TEXT (sidecar/tpl_layout.py, 2026-10-15): khong de chu (do NET CHU THAT tung chu cai),
giu quan he + thu tu cua mau, hop di theo o chu, giu khung nghi theo cum loi noi (tplHold), bo chu anh AI trung mau.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_tpl_layout.py      (can ffmpeg; khong goi AI)
Mau gia lap: template.json tu viet + font he thong (Arial Bold).
"""
import os
import sys
import json
import shutil
import subprocess

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import text_lib             # noqa: E402
import text_tpl             # noqa: E402
import tpl_layout as TL     # noqa: E402
import motion_design as MD  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


FONT = next((f for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Unicode.ttf")
             if os.path.isfile(f)), None)
assert not os.path.isfile(text_lib.TEXT_LIB), "chay voi HOME=$(mktemp -d) — khong dung kho that"


def node(slot, x, y, scale, start=0.0, dur=3.0, **kw):
    n = {"type": "text", "id": "n_%s_%s" % (slot, x), "slot": slot, "start": start, "duration": dur, "font": "f1",
         "size": 15, "fill": [1, 1, 1], "transform": {"x": x, "y": y, "scale": scale, "rotation": 0}}
    n.update(kw)
    return n


def group(children, start=0.0, dur=3.0):
    return {"type": "group", "id": "g%d" % id(children), "start": start, "duration": dur, "sourceStart": 0,
            "children": children}


def make_template(tid, slots, nodes, audio=None):
    d = os.path.join(text_lib.TEXT_DIR, tid)
    os.makedirs(os.path.join(d, "fonts"), exist_ok=True)
    shutil.copy(FONT, os.path.join(d, "fonts", "a.ttf"))
    spec = {"id": tid, "name": tid, "version": 1, "width": 1080, "height": 1920, "fps": 30, "duration": 3.0,
            "slots": [{"id": s, "role": "", "sample": t} for s, t in slots], "fonts": [{"id": "f1", "file": "fonts/a.ttf"}],
            "audio": audio or [],
            "root": {"type": "group", "id": "root", "start": 0, "duration": 3.0, "sourceStart": 0, "children": nodes}}
    with open(os.path.join(d, "template.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False)
    text_lib.register_from_dir(d)
    text_lib.text_update(tid, summary="mau thu %s" % tid, use_when="nhan tu khoa", energy="vua",
                         slot_roles=[{"id": s, "role": "o %s" % s, "max_len": "<= 3 tu"} for s, _ in slots])
    return text_lib.get_template(tid), text_tpl.load_spec(text_lib.get_template(tid))


def final_masks(row, spec, texts, lay):
    """Mat na + tung chu cai cua moi o O VI TRI CUOI (de kiem doc lap voi buoc go de)."""
    geo = text_tpl.geometry(row, spec)
    star = [h for h in TL.visible(spec, geo["t_star"]) if h[0]["type"] == "text"]
    out = {}
    for sid, L in lay["slots"].items():
        m, gl = np.zeros(TL._frame_shape(spec), bool), []
        for h in [h for h in star if h[0]["slot"] == sid]:
            TL.raster_text(spec, geo["dir"], h, texts[sid], L["scale"], m, gl)
        sh = (L["dx"] * TL.RES, L["dy"] * TL.RES)
        out[sid] = (TL._shift(m, *sh), gl, sh)
    return out


def bbox(m):
    ys, xs = np.nonzero(m)
    return (xs.min(), ys.min(), xs.max(), ys.max()) if len(ys) else None


# ---------------------------------------------------------------------------
print("[1] chu cai lon khac hinh (mau 'L' -> chu that 'T'): o nho nam goc trong cua 'L' bi thanh ngang cua 'T' de -> dich")
row1, spec1 = make_template("t1", [("s1", "ab"), ("s2", "L")], [
    node("s2", -0.25, 0.0, 6.0), node("s1", -0.148, 0.146, 1.0)])   # "ab" o goc TRONG tren-phai cua "L"
samp = final_masks(row1, spec1, {"s1": "ab", "s2": "L"}, {"slots": {"s1": {"scale": 1, "dx": 0, "dy": 0},
                                                                      "s2": {"scale": 1, "dx": 0, "dy": 0}}})
check("mau goc: 'ab' khong cham 'L'", TL.gcov(samp["s1"][1], samp["s1"][2], samp["s2"][0]) < 0.02,
      TL.gcov(samp["s1"][1], samp["s1"][2], samp["s2"][0]))
texts1 = {"s1": "ab", "s2": "T"}
naive = final_masks(row1, spec1, texts1, {"slots": {"s1": {"scale": 1, "dx": 0, "dy": 0},
                                                     "s2": {"scale": 1, "dx": 0, "dy": 0}}})
v_naive = TL.gcov(naive["s1"][1], naive["s1"][2], naive["s2"][0])
check("giu nguyen vi tri (cach cu) -> 'T' de len 'ab'", v_naive > 0.12, v_naive)
lay1 = TL.layout(row1, spec1, texts1)
fm = final_masks(row1, spec1, texts1, lay1)
v1 = max(TL.gcov(fm["s1"][1], fm["s1"][2], fm["s2"][0]), TL.gcov(fm["s2"][1], fm["s2"][2], fm["s1"][0]))
check("bo cuc moi: ok + khong chu cai nao bi che > 6%", lay1["ok"] and v1 <= TL.G_TOL + 0.01, (lay1, v1))
check("co ghi buoc go de", lay1["moves"], lay1["moves"])

# ---------------------------------------------------------------------------
print("[2] chu that ngan: giu THU TU + quan he cua mau ('Một góc nhỏ / cảm hứng lớn' -> 'Bơi chậm rì / à')")
row2, spec2 = make_template("t2", [("s1", "Một"), ("s2", "góc nhỏ"), ("s3", "cảm hứng lớn")], [
    node("s1", -0.32, 0.05, 2.2), node("s2", 0.2, 0.04, 1.2), node("s3", -0.02, -0.03, 1.6)])
texts2 = {"s1": "Bơi", "s2": "chậm rì", "s3": "à"}
lay2 = TL.layout(row2, spec2, texts2)
fm2 = final_masks(row2, spec2, texts2, lay2)
b1, b2, b3 = bbox(fm2["s1"][0]), bbox(fm2["s2"][0]), bbox(fm2["s3"][0])
check("'chậm rì' van BEN PHAI 'Bơi' (khong dao)", b2[0] >= b1[2] - 2, (b1, b2))
check("'à' van o DUOI dong tren", b3[1] >= min(b1[1], b2[1]), (b1, b2, b3))
gap = b2[0] - b1[2]
check("'Bơi' - 'chậm rì' khit nhu mau (khong roi rac)", gap < 0.25 * (b1[3] - b1[1]) + 40, (gap, b1, b2))

# ---------------------------------------------------------------------------
print("[3] hop trang tri (vector) cung group voi o chu: chu chinh dai hon de len hop -> chu chinh tranh hop")
box_v = {"type": "vector", "id": "box", "start": 0, "duration": 3.0, "transform": {"x": 0.3, "y": -0.06, "scale": 1, "rotation": 0},
         "points": [[-90, 30], [90, 30], [90, -30], [-90, -30]], "fill": {"type": "solid", "color": [0, 0.6, 0], "alpha": 1}}
row3, spec3 = make_template("t3", [("s1", "Ab"), ("s2", "MỚI")], [
    node("s1", 0.0, 0.0, 2.6), group([box_v, node("s2", 0.3, -0.06, 0.6)])])
texts3 = {"s1": "Abcg", "s2": "MỚI"}
lay3 = TL.layout(row3, spec3, texts3)
check("ok", lay3["ok"], lay3)
fm3 = final_masks(row3, spec3, texts3, lay3)
vb = np.zeros(TL._frame_shape(spec3), bool)
for h in TL.visible(spec3, text_tpl.geometry(row3, spec3)["t_star"]):
    if h[0]["type"] == "vector":
        TL.raster_vector(spec3, h, vb)
vb = TL._shift(vb, lay3["slots"]["s2"]["dx"] * TL.RES, lay3["slots"]["s2"]["dy"] * TL.RES)
v3 = TL.gcov(fm3["s1"][1], fm3["s1"][2], vb)
s3m = final_masks(row3, spec3, {"s1": "Ab", "s2": "MỚI"}, {"slots": {"s1": {"scale": 1, "dx": 0, "dy": 0},
                                                                    "s2": {"scale": 1, "dx": 0, "dy": 0}}})
vb0 = np.zeros(TL._frame_shape(spec3), bool)
for h in TL.visible(spec3, text_tpl.geometry(row3, spec3)["t_star"]):
    if h[0]["type"] == "vector":
        TL.raster_vector(spec3, h, vb0)
v30 = TL.gcov(s3m["s1"][1], s3m["s1"][2], vb0)
naive3 = final_masks(row3, spec3, texts3, {"slots": {"s1": {"scale": text_tpl.fit_scales(row3, spec3, texts3)["s1"],
                                                            "dx": 0, "dy": 0}, "s2": {"scale": 1, "dx": 0, "dy": 0}}})
check("cach cu (giu vi tri): chu chinh dai hon de len hop", TL.gcov(naive3["s1"][1], naive3["s1"][2], vb0) > v30 + 0.02,
      (TL.gcov(naive3["s1"][1], naive3["s1"][2], vb0), v30))
check("bo cuc moi: hop khong de chu chinh hon muc cua mau (%.3f <= %.3f)" % (v3, max(TL.G_TOL, min(v30, TL.G_CAP))),
      v3 <= max(TL.G_TOL, min(v30, TL.G_CAP)) + 0.01, v3)

# ---------------------------------------------------------------------------
print("[4] check_choice: luu bo cuc; khong go duoc de -> loai mau")
_o1 = text_tpl.geometry(row1, spec1)["order"]
lk1 = {"tiers": [{"text": texts1[s], "role": "chinh" if s == "s2" else "phu"} for s in _o1],
       "dang_noi": " ".join(texts1[s] for s in _o1)}
meta = {}
e, _f = text_tpl.check_choice(row1, spec1, lk1, texts1, out=meta)
check("lua chon dat + co bo cuc", not e and meta.get("layout", {}).get("ok"), (e, meta))
# 2 o CHONG KHIT len nhau (cung tam) va mau goc cung khong co cho trong -> khong the xep
row5, spec5 = make_template("t5", [("s1", "OOO"), ("s2", "MMM")], [
    node("s1", 0.0, 0.0, 3.0), node("s2", 0.0, 0.0, 3.0, start=0.0)])
e5, _ = text_tpl.check_choice(row5, spec5, {"tiers": [{"text": "OOO", "role": "chinh"}, {"text": "WWW", "role": "phu"}],
                                            "dang_noi": "OOO WWW"}, {"s1": "OOO", "s2": "WWW"})
check("mau de chu khong go duoc -> loi 'DE LEN NHAU' (hoac dat neu xep duoc)", (not e5) or any("DE LEN NHAU" in x or "thu qua nho" in x for x in e5), e5)
info = text_tpl.layer_info({"template": "t1", "texts": texts1})
check("layer_info tra bo cuc + t_star", info and info.get("layout") and info.get("t_star") is not None, info and info.keys())

# ---------------------------------------------------------------------------
print("[5] giu khung nghi theo cum loi noi (tplHold) + rut ngan + tieng lui theo")
wav = os.path.join(text_lib.TEXT_DIR, "t1", "tick.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=0.3", wav], check=True)
spec1["audio"] = [{"file": "tick.wav", "start": 0.1, "duration": 0.3, "sourceStart": 0, "volume": 1},
                  {"file": "tick.wav", "start": 2.5, "duration": 0.3, "sourceStart": 0, "volume": 1}]
with open(os.path.join(text_lib.TEXT_DIR, "t1", "template.json"), "w", encoding="utf-8") as f:
    json.dump(spec1, f, ensure_ascii=False)
it = {"template": "t1", "texts": texts1, "_key": "k1"}
info = text_tpl.layer_info(it)
L = MD._tpl_layer(it, info, 5.0, 0.5, 0.5, 60.0, 30, "tpl_k1", want_end=10.0)
check("cum loi noi 5 -> 10s: mau giu khung nghi -> hien toi 10s", abs(L["end"] - 10.0) < 0.01 and L.get("tplHold"), L)
check("giu tu khung day du nhat (t_star)", abs(L["tplHold"]["at"] - info["t_star"]) < 1e-3, L["tplHold"])
check("bo cuc truyen cho renderer", L.get("tplLayout") == info["layout"], L.get("tplLayout"))
L2 = MD._tpl_layer(it, info, 5.0, 0.5, 0.5, 60.0, 30, "tpl_k2", want_end=6.0)
check("cum ngan hon mau -> khong giu (chay dung do dai mau)", not L2.get("tplHold") and abs(L2["end"] - 8.0) < 0.01, L2)
L3 = MD._tpl_layer(it, info, 5.0, 0.5, 0.5, 60.0, 30, "tpl_k3", want_end=30.0)
check("giu toi da %.0fs" % MD.TPL_HOLD_MAX, abs(L3["tplHold"]["dur"] - MD.TPL_HOLD_MAX) < 0.01, L3)
from remotion_plan import probe  # noqa: E402
a0 = text_tpl.premix(text_lib.get_template("t1"), spec1)
a1 = text_tpl.premix(text_lib.get_template("t1"), spec1, hold=L["tplHold"])
d0, d1 = probe(a0).get("duration") or 0, probe(a1).get("duration") or 0
check("tieng ra cua mau lui dung bang thoi gian giu (%.2f -> %.2f)" % (d0, d1), abs((d1 - d0) - L["tplHold"]["dur"]) < 0.08,
      (d0, d1, L["tplHold"]))
spec_t = {"layers": [L], "audio": [{"layer": L["id"], "path": a1}]}
MD.tpl_set_end(spec_t, L, 9.0)
check("rut ngan con du cho hoat canh ra -> giam khung giu, het dung luc moi",
      abs(L["end"] - 9.0) < 0.01 and abs(L["tplHold"]["dur"] - (9.0 - 5.0 - L["tplDur"])) < 0.01, L)
check("tieng doi theo khung giu moi", spec_t["audio"][0]["path"] != a1, spec_t["audio"])
MD.tpl_set_end(spec_t, L, 6.0)
check("rut ngan hon do dai mau -> bo giu, cat", not L.get("tplHold") and abs(L["end"] - 6.0) < 0.01, L)

# ---------------------------------------------------------------------------
print("[6] cum trung chu voi mau dang hien cung luc -> khong tao chu anh AI")
lk_meta = [{"key": "A", "tiers": [{"text": "chỉ bằng", "role": "phu"}, {"text": "KHÔNG CHẢY MÁU", "role": "chinh"}],
            "src": [{"kind": "layers", "idx": [0, 1]}]},
           {"key": "B", "tiers": [{"text": "KHÔNG CHẢY MÁU", "role": "chinh"}], "src": [{"kind": "caption", "idx": 0}]},
           {"key": "C", "tiers": [{"text": "KHÔNG CHẢY MÁU", "role": "chinh"}], "src": [{"kind": "caption", "idx": 1}]},
           {"key": "D", "tiers": [{"text": "rất OK", "role": "chinh"}], "src": [{"kind": "caption", "idx": 2}]}]
layers = [{"source_id": "s", "src_start": 50.0, "src_end": 53.0}, {"source_id": "s", "src_start": 51.0, "src_end": 54.0}]
caps = [{"source_id": "s", "src_start": 52.0, "src_end": 53.5}, {"source_id": "s", "src_start": 80.0, "src_end": 81.0},
        {"source_id": "s", "src_start": 52.0, "src_end": 53.0}]
dup = text_tpl.dup_of_template(lk_meta, {"A": {"template": "x", "texts": {"s1": "chỉ bằng", "s2": "KHÔNG CHẢY MÁU"}}},
                               layers, caps, None)
check("B (trung chu, cung luc) bi bo; C (cung chu nhung luc khac) va D (chu khac) van tao", dup == {"B": "x"}, dup)

print("\n%d loi" % len(FAILED) if FAILED else "\nTAT CA OK")
sys.exit(1 if FAILED else 0)
