#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO TEXT KHI LAP KE HOACH (user 2026-10-04): moi cum chu noi bat KIEM TRA KHO TEXT TRUOC.

Mau hop boi canh (chu de video, khoanh khac, muc do, vai tro cum chu) -> dung NGUYEN mau (hoat canh, font, hieu ung,
am thanh) va chi THAY CHU: tung o chu (slot) nhan dung chu cua cum (loi noi that). Khong mau nao hop -> cum do moi di
duong chu anh AI (text_art) nhu cu. Buoc "TXT-lib" chay sau R5, TRUOC TXT-art (cum da dung mau khong tao anh AI).

Kiem bang CODE (AI de xuat, code quyet):
  - chu cac o doc theo THU TU DOC cua mau (tren -> duoi, trai -> phai — do tu hinh hoc mau) = dung chu cua cum, dung
    thu tu loi noi; chi doi hoa / thuong + bo dau cau
  - font cua o co du ky tu (dau tieng Viet) — thieu -> trinh duyet thay font khac, vo kieu chu
  - CO CHU: chu that dai hon chu mau thi renderer thu nho cho vua o (TextTemplate.computeFit) -> o nao phai thu < 60%
    thi bo (chu qua nho, mat phan cap cua mau)
  - moi mau toi da MAX_USES lan / video
Dung (build_spec): lop spec "tpl" (motion_design.text_lib_layers) + tieng cua mau TRON SAN thanh 1 file (premix) de can
theo giong noi nhu SFX khi chu hien.
"""
import os
import re
import json
import math
import hashlib
import itertools
import subprocess
import unicodedata

import prompt_store
import text_lib

HOME = os.path.expanduser("~")
CACHE_DIR = os.path.join(HOME, ".capcut-studio", "cache", "texttpl")

TPL_VERSION = 1
MAX_USES = 2            # moi mau toi da 2 lan / video (lap lai nhieu thi nham chan) — KHOP _TEXT_LIB_SYSTEM
MIN_FIT = 0.6           # o chu phai thu nho duoi 60% de vua -> chu qua nho, bo mau nay cho cum do
GROW_MAX = 1.12         # KHOP TextTemplate.FIT_GROW_MAX
LINE_PER_SIZE = 6.21    # KHOP TextTemplate DEFAULT_TUNE.linePerSize (CapCut: chieu cao dong / don vi size @1080)
PAD = 0.12              # khoi chu cua mau: noi them 12% chieu cao dong (glow / bong / dau tieng Viet)


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


_TEXT_LIB_SYSTEM = """Ban la EDITOR chu dong cho video ngan. Video nay co cac CUM CHU NOI BAT (chu to hien tren video, khong phai
phu de karaoke). Truoc khi cho AI ve chu bang anh, PHAI KIEM TRA KHO TEXT (mau chu dong lam san: hoat canh + font +
hieu ung + am thanh, chuan Remotion). Voi MOI cum chu: xem kho co mau nao HOP khong -> hop thi dung mau do va DIEN CHU
CUA CUM vao cac o chu cua mau; khong hop thi khong dung (he thong se tao chu anh AI cho cum do).

# KHI NAO MAU "HOP" (danh gia theo nhan cua mau — ban KHONG xem duoc hoat canh)
- Phong cach / cam giac / muc do (nhe-vua-manh) cua mau hop CHU DE + GIONG video va hop KHOANH KHAC do (cau dang noi,
  cam xuc, vai tro cum chu: hook, nhan tu khoa, chot y, CTA...). "hop_khi" khop, KHONG roi vao "tranh_khi".
- Hook (trong_hook = true) can mau gay chu y dung muc do hook; cau nhe nhang / tam su tranh mau giat manh.
- Cau truc o chu hop cum chu: so o, vai tro tung o (o to nhat = tu khoa chinh cua cum), do dai.
- Video co phong cach rieng (phong_cach) -> mau khong duoc lac tong qua xa.
- Khong hop ro rang thi KHONG dung — chon sai boi canh te hon khong chon.

# CACH DIEN CHU (kiem bang code — sai la bi bo)
- Chu trong mau CHI LA CHU MAU (minh hoa bo cuc). TUYET DOI khong dung chu mau.
- Cac o chu, doc theo "thu_tu_doc" cua mau, ghep lai phai DUNG NGUYEN chu cua cum: du moi tu, dung tu, dung dau tieng
  Viet, khong them / bot / doi tu, va dung THU TU LOI NOI. Duoc: doi HOA / thuong cho hop kieu chu cua o; bo dau cau.
- Moi o PHAI co chu (khong de trong). Mot o co the nhan nhieu tu; tu khoa chinh dat vao o to nhat.
- Do dai moi o NEN gan "so_ky_tu_mau" (toi da ~1.5 lan): chu dai hon bi thu nho cho vua o, qua dai thi bi loai.
- O "chu cai lon" (mau chi 1 ky tu, vd chu cai dau cach dieu) chi nhan 1 CHU CAI DAU cua mot tu; o ngay sau nhan PHAN
  CON LAI cua dung tu do (vd "Tăm bông" -> "T" + "ăm bông"). Rieng o co "chi_nhan": "con so" chi nhan 1 CON SO dung
  trong cum (vd "3" trong "3 bước tắm trắng") — cum khong co con so thi KHONG dung mau do.
- Moi mau dung toi da 2 lan trong video; tranh 2 cum lien nhau dung cung mot mau.

# TRA VE JSON
{"chon": [{"key": "<key cum>", "mau": "<id mau>", "o_chu": {"<id o>": "<chu>", ...}, "ly_do": "<vi sao mau hop khoanh
khac nay>"}],
 "khong_dung": [{"key": "<key cum>", "ly_do": "<vi sao khong mau nao hop>"}]}
Moi cum xuat hien dung 1 lan (trong "chon" hoac "khong_dung")."""


def prompt_fp():
    return hashlib.sha1(_p("_TEXT_LIB_SYSTEM").encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------------------
# 1. DOC MAU + HINH HOC (port gon cua TextTemplate.tsx: transform / keyframe tuyen tinh / do chu bang font that)
# ---------------------------------------------------------------------------
_SPEC_CACHE = {}
_FONT_CACHE = {}


def _spec_path(row):
    return os.path.join(row.get("dir") or os.path.join(text_lib.TEXT_DIR, row["id"]), "template.json")


def load_spec(row):
    p = _spec_path(row)
    try:
        mt = os.path.getmtime(p)
    except OSError:
        return None
    hit = _SPEC_CACHE.get(p)
    if hit and hit[0] == mt:
        return hit[1]
    try:
        with open(p, encoding="utf-8") as f:
            spec = json.load(f)
    except Exception:
        return None
    _SPEC_CACHE[p] = (mt, spec)
    return spec


def usable():
    """Mau dung duoc khi lap plan: co template.json + da co nhan (AI chon theo nhan)."""
    out = []
    for t in text_lib.text_list():
        if not (t.get("summary") or t.get("use_when")) or not t.get("slots"):
            continue
        spec = load_spec(t)
        if spec and spec.get("root") and spec.get("slots"):
            out.append(t)
    return out


def _font(dirp, spec, fid):
    f = next((x for x in spec.get("fonts") or [] if x.get("id") == fid), None)
    if not f:
        return None
    path = os.path.join(dirp, f["file"])
    if path not in _FONT_CACHE:
        try:
            from PIL import ImageFont
            ft = ImageFont.truetype(path, 100)
            asc, desc = ft.getmetrics()
            _FONT_CACHE[path] = (ft, (asc + desc) / 100.0 or 1.2, path)
        except Exception:
            _FONT_CACHE[path] = None
    return _FONT_CACHE[path]


def _split_runs(text, runs):
    chars = list(text)
    out, i = [], 0
    for idx, r in enumerate(runs):
        take = len(chars) - i if idx == len(runs) - 1 else min(int(r.get("len") or 0), max(0, len(chars) - i))
        out.append((r, "".join(chars[i:i + take])))
        i += take
    return [(r, s) for r, s in out if s]


def _runs(n, text):
    return n.get("runs") or [{"len": len(text), "font": n.get("font"), "size": n.get("size") or 15}]


def _shown(n, text):
    """Chu HIEN tren mau: o textCase 'upper' luon in hoa (KHOP layoutText cua TextTemplate)."""
    return text.upper() if n.get("textCase") == "upper" else text


def _line_px(n, r, scale, W, line_em):
    """Chieu cao dong px — KHOP layoutText: o co emPx (mask chu CapCut, co theo em) thi theo em, con lai theo size."""
    if n.get("emPx"):
        return float(n["emPx"]) * scale * (W / 1080.0) * line_em
    return float(r.get("size") or 15) * LINE_PER_SIZE * scale * (W / 1080.0)


def text_size(spec, dirp, n, text, scale=1.0):
    """(be ngang, chieu cao dong) px tren khung mau — cong thuc nhu layoutText (CapCut khong kern)."""
    W = float(spec.get("width") or 1080)
    w, h = 0.0, 0.0
    text = _shown(n, text)
    for r, s in _split_runs(text, _runs(n, text)):
        fo = _font(dirp, spec, r.get("font"))
        line = _line_px(n, r, scale, W, fo[1] if fo else 1.2)
        h = max(h, line)
        if not fo:
            w += len(s) * line * 0.45
            continue
        ft, line_em, _ = fo
        em = line / line_em
        w += ft.getlength(s) * em / 100.0 + float(n.get("letterSpacing") or 0) * em * len(s)
    return w, h


def _cc(keys, t, dflt):
    """Keyframe CapCut [t, v, ...] — noi suy tuyen tinh (du cho hinh hoc / thu tu doc)."""
    if not keys:
        return dflt
    if t <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if a[0] <= t <= b[0]:
            u = (t - a[0]) / max(1e-6, b[0] - a[0])
            return a[1] + (b[1] - a[1]) * u
    return keys[-1][1]


def _mul(m, n):
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return (a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f)


def _tr(x, y):
    return (1, 0, 0, 1, x, y)


def _rot(deg):
    r = math.radians(deg)
    return (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0)


def _sc(s):
    return (s, 0, 0, s, 0, 0)


def _apply(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def _group_m(g, local, W, H):
    kf = g.get("keyframes") or {}
    tr = g.get("transform") or {"x": 0, "y": 0, "scale": 1, "rotation": 0}
    x, y = _cc(kf.get("x"), local, tr["x"]), _cc(kf.get("y"), local, tr["y"])
    s, rot = _cc(kf.get("scale"), local, tr["scale"]), _cc(kf.get("rotation"), local, tr["rotation"])
    alpha = _cc(kf.get("alpha"), local, g.get("alpha", 1))
    for a in g.get("anims") or []:
        p = min(1.0, max(0.0, (local - a["start"]) / max(1e-6, a["duration"])))
        alpha *= a["alpha"][0] + (a["alpha"][1] - a["alpha"][0]) * p
        s *= a["scale"][0] + (a["scale"][1] - a["scale"][0]) * p
    m = (1, 0, 0, 1, 0, 0)
    if x or y or s != 1 or rot:
        m = _mul(_mul(_mul(_tr(W / 2 + x * W / 2, H / 2 - y * H / 2), _rot(rot)), _sc(s)), _tr(-W / 2, -H / 2))
    return m, alpha


def _hits(spec, t, shapes=None):
    """Node CHU dang hien luc t: [(node, ma tran group, gio trong node)]. shapes (list) -> nhan them hinh dang hien:
    (hinh, ma tran, gio, cac node cung group) — hinh bam khung chu cua o cung group."""
    W, H = float(spec.get("width") or 1080), float(spec.get("height") or 1920)
    out = []

    def visit(g, local, M):
        if local < 0 or local >= g["duration"]:
            return
        ct = local + g.get("sourceStart", 0)
        m, alpha = _group_m(g, local, W, H)
        if alpha <= 0:
            return
        Mg = _mul(M, m)
        for ch in g.get("children") or []:
            if ch.get("type") == "group":
                visit(ch, ct - ch["start"], Mg)
                continue
            l = ct - ch["start"]
            if l < 0 or l >= ch["duration"] or _cc((ch.get("keyframes") or {}).get("alpha"), l, ch.get("alpha", 1)) <= 0:
                continue
            if ch.get("type") == "shape":
                if shapes is not None:
                    shapes.append((ch, Mg, l, g.get("children") or []))
                continue
            if ch.get("type") != "text":  # chuoi khung video (frames) — trang tri, khong co chu
                continue
            out.append((ch, Mg, l))

    visit(dict(spec["root"], start=0), t, (1, 0, 0, 1, 0, 0))
    return out


def _node_box(spec, dirp, hit, text):
    n, M, l = hit
    kf = n.get("keyframes") or {}
    W, H = float(spec.get("width") or 1080), float(spec.get("height") or 1920)
    w, h = text_size(spec, dirp, n, text, _cc(kf.get("scale"), l, n["transform"]["scale"]))
    cx, cy = _apply(M, W / 2 + _cc(kf.get("x"), l, n["transform"]["x"]) * W / 2,
                    H / 2 - _cc(kf.get("y"), l, n["transform"]["y"]) * H / 2)
    s = math.hypot(M[0], M[1])
    return [cx - w * s / 2, cy - h * s / 2, cx + w * s / 2, cy + h * s / 2]


def _node_ink(spec, dirp, hit, text, mult=1.0):
    """Khung NET CHU THAT cua node (khong phai dong font): chu cai cach dieu (drop cap) dong font cao gap ~2 lan net
    -> khoi mau tinh theo dong font to gap doi, luat ne mat tuong khong con cho. Cong thuc dat chu nhu drawText:
    duong chan chu = tam + (asc - desc) / 2 (metric dong cua font)."""
    f = _text_frame(spec, dirp, hit, text, mult)
    return None if f is None else [f["inkL"], f["inkT"], f["inkR"], f["inkB"]]


def _text_frame(spec, dirp, hit, text, mult=1.0):
    """Khung chu cua node tren khung mau: l / r / t / b (dong font), cx / cy, base (chan chu), ink* (net muc that)."""
    n, M, l = hit
    kf = n.get("keyframes") or {}
    W, H = float(spec.get("width") or 1080), float(spec.get("height") or 1920)
    scale = _cc(kf.get("scale"), l, n["transform"]["scale"]) * mult
    text = _shown(n, text)
    parts, x = [], 0.0
    asc_m, desc_m = 0.0, 0.0
    for r, s in _split_runs(text, _runs(n, text)):
        fo = _font(dirp, spec, r.get("font"))
        if not fo:
            return None
        ft, line_em, _ = fo
        line = _line_px(n, r, scale, W, line_em)
        k = line / line_em / 100.0
        a, d = ft.getmetrics()
        asc_m, desc_m = max(asc_m, a * k), max(desc_m, d * k)
        bb = ft.getbbox(s, anchor="ls")
        parts.append((x + bb[0] * k, bb[1] * k, x + bb[2] * k, bb[3] * k))
        x += ft.getlength(s) * k + float(n.get("letterSpacing") or 0) * (line / line_em) * len(s)
    if not parts:
        return None
    base = (asc_m - desc_m) / 2
    cx, cy = _apply(M, W / 2 + _cc(kf.get("x"), l, n["transform"]["x"]) * W / 2,
                    H / 2 - _cc(kf.get("y"), l, n["transform"]["y"]) * H / 2)
    sc = math.hypot(M[0], M[1])
    x0 = -x / 2
    return {"l": cx + x0 * sc, "r": cx - x0 * sc, "cx": cx, "t": cy - (asc_m + desc_m) / 2 * sc,
            "b": cy + (asc_m + desc_m) / 2 * sc, "cy": cy, "base": cy + base * sc,
            "inkL": cx + (x0 + min(p[0] for p in parts)) * sc, "inkT": cy + (base + min(p[1] for p in parts)) * sc,
            "inkR": cx + (x0 + max(p[2] for p in parts)) * sc, "inkB": cy + (base + max(p[3] for p in parts)) * sc,
            "s": sc}


def _rest_local(n):
    """Gio "nghi" cua node chu (sau keyframe / hoat anh vao) — KHOP restLocal cua TextTemplate."""
    t = 0.0
    for ks in (n.get("keyframes") or {}).values():
        for k in ks or []:
            t = max(t, float(k[0]))
    for key in ("charAnim", "reveal"):
        a = n.get(key)
        if a:
            t = max(t, float(a.get("start") or 0) + float(a.get("duration") or 0))
    return min(t, max(0.0, float(n.get("duration") or 0) - 1e-3))


def _shape_box(spec, dirp, shp, texts, fit=None):
    """Khung hinh (hop / gach / lap lanh) tren khung mau — bam o chu cung group o vi tri nghi (khong tinh xoay)."""
    s, M, _l, sib = shp
    samples = {x["id"]: x.get("sample") or "" for x in spec.get("slots") or []}
    W = float(spec.get("width") or 1080)
    vals = []
    for side in ("l", "t", "r", "b"):
        ref = (s.get("box") or {}).get(side) or {}
        n = next((x for x in sib if x.get("type") == "text" and x.get("slot") == ref.get("slot")), None)
        if not n:
            return None
        sid = n["slot"]
        f = _text_frame(spec, dirp, (n, M, _rest_local(n)), texts.get(sid) or samples.get(sid, ""), (fit or {}).get(sid, 1.0))
        if not f:
            return None
        e = ref.get("edge")
        v = f.get({"inkT": "inkT", "inkB": "inkB"}.get(e, e))
        if v is None:
            return None
        vals.append(v + float(ref.get("off") or 0) * (W / 1080.0) * f["s"])
    if vals[2] - vals[0] < float(s.get("minWidth") or 0) * (W / 1080.0) or vals[2] <= vals[0] or vals[3] <= vals[1]:
        return None
    return vals


def _union(bs):
    return [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)]


def _longest_mid(flags, fps):
    best, s = None, -1
    for i in range(len(flags) + 1):
        if i < len(flags) and flags[i]:
            if s < 0:
                s = i
        elif s >= 0:
            if best is None or i - s >= best[1] - best[0]:
                best = (s, i)
            s = -1
    return None if best is None else (best[0] + best[1] - 1) / 2.0 / fps


def _same_line(a, b):
    ha, hb = a[3] - a[1], b[3] - b[1]
    v = min(a[3], b[3]) - max(a[1], b[1])
    hov = min(a[2], b[2]) - max(a[0], b[0])
    gap = max(a[0], b[0]) - min(a[2], b[2])
    return (0.6 < ha / max(1e-6, hb) < 1.67 and v >= 0.5 * min(ha, hb) and hov < 0.35 * min(a[2] - a[0], b[2] - b[0])
            and gap < 1.2 * min(ha, hb))


def geometry(row, spec=None):
    """Hinh hoc mau o khung "day du nhat" (nhieu o cung hien nhat): khung tung o (chu mau), thu tu doc, khoi chu."""
    spec = spec or load_spec(row)
    dirp = os.path.dirname(_spec_path(row))
    fps = int(spec.get("fps") or 30)
    nF = max(1, int(round(float(spec.get("duration") or 1) * fps)))
    frames = [_hits(spec, f / float(fps)) for f in range(nF)]
    sets = [{h[0]["slot"] for h in hs} for hs in frames]
    most = max(len(s) for s in sets)
    t_star = _longest_mid([len(s) == most for s in sets], fps) or 0.0
    shapes = []
    star = _hits(spec, t_star, shapes)
    samples = {s["id"]: s.get("sample") or "" for s in spec.get("slots") or []}
    boxes, ref = {}, {}
    for sid in samples:
        hs = [h for h in star if h[0]["slot"] == sid]
        if hs:
            boxes[sid] = _union([_node_box(spec, dirp, h, samples[sid]) for h in hs])
        else:
            tt = _longest_mid([sid in s for s in sets], fps)
            hs = [h for h in _hits(spec, tt) if h[0]["slot"] == sid] if tt is not None else []
        if hs:
            ref[sid] = max(hs, key=lambda h: (lambda b: b[2] - b[0])(_node_box(spec, dirp, h, samples[sid])))
    # mau TU THIET KE khai bao thu tu doc (vd so "3" to canh 2 dong: doc truoc dong tren — doan theo hinh thi sai)
    decl = [x for x in spec.get("readingOrder") or [] if x in samples]
    order = decl if len(decl) == len(samples) else reading_order(boxes, samples)
    # o khong hien o khung day du nhat (vd chu hien roi tat truoc) -> xep theo luc xuat hien
    first = {sid: next((i for i, s in enumerate(sets) if sid in s), 10 ** 6) for sid in samples}
    rest = sorted([s for s in samples if s not in boxes], key=lambda s: first[s])
    for s in rest:
        later = [i for i, o in enumerate(order) if first.get(o, 0) > first[s]]
        order.insert(later[0] if later else len(order), s)
    box = None
    if boxes:
        # khoi chu = NET chu that (+ le cho glow / bong / dau) — dong font cua chu cach dieu cao gap doi net
        inks = [b for b in (_node_ink(spec, dirp, h, samples[h[0]["slot"]]) for h in star) if b] or list(boxes.values())
        inks += [b for b in (_shape_box(spec, dirp, x, {}) for x in shapes) if b]
        u = _union(inks)
        pad = PAD * max(b[3] - b[1] for b in boxes.values() if b[3] - b[1] <= 1.67 * min(x[3] - x[1] for x in boxes.values())) \
            if len(boxes) > 1 else PAD * max(b[3] - b[1] for b in boxes.values())
        box = [u[0] - pad, u[1] - pad, u[2] + pad, u[3] + pad]
    lines = []
    for sid in boxes:
        if any(sid in ln for ln in lines):
            continue
        comp = [sid]
        for x in comp:
            for o in boxes:
                if o not in comp and _same_line(boxes[x], boxes[o]):
                    comp.append(o)
        lines.append(sorted(comp, key=lambda s: boxes[s][0]))
    return {"t_star": round(t_star, 3), "boxes": boxes, "order": order, "box": box, "ref": ref, "lines": lines,
            "dir": dirp, "W": spec.get("width") or 1080, "H": spec.get("height") or 1920}


def reading_order(boxes, samples=None):
    """Tren -> duoi, trai -> phai. Hai o CUNG DONG khi chong doc >= 60% chieu cao o thap hon + khong chong ngang (bo cuc
    cheo kieu bac thang thi la 2 dong). Chu cai LON (drop cap: o mau <= 2 ky tu, cao > 1.67 lan o ben canh) doc CUNG
    dong voi o ngay ben phai no (phan con lai cua tu) — khong xep theo tam cua chinh no."""
    samples = samples or {}
    cy = {s: (b[1] + b[3]) / 2 for s, b in boxes.items()}
    band = {s: (b[1], b[3]) for s, b in boxes.items()}
    glued = {}
    for s, b in boxes.items():
        if len(samples.get(s) or "xxx") > 2:
            continue
        hs = b[3] - b[1]
        right = [o for o, c in boxes.items() if o != s and hs > 1.67 * (c[3] - c[1]) and c[0] >= b[0] + 0.5 * (b[2] - b[0])
                 and c[0] - b[2] < 0.3 * hs and min(b[3], c[3]) > max(b[1], c[1])]
        if right:
            glued[s] = min(right, key=lambda o: abs(cy[o] - cy[s]))

    def same(a, b):
        A, B = boxes[a], boxes[b]
        v = min(band[a][1], band[b][1]) - max(band[a][0], band[b][0])
        h = min(A[2], B[2]) - max(A[0], B[0])
        return v >= 0.6 * min(band[a][1] - band[a][0], band[b][1] - band[b][0]) and h < 0.35 * min(A[2] - A[0], B[2] - B[0])

    lines = []
    for s in sorted([x for x in boxes if x not in glued], key=lambda s: cy[s]):
        for ln in lines:
            if all(same(s, o) for o in ln):
                ln.append(s)
                break
        else:
            lines.append([s])
    lines.sort(key=lambda ln: sum(cy[s] for s in ln) / len(ln))
    order = [s for ln in lines for s in sorted(ln, key=lambda s: boxes[s][0])]
    for s, o in glued.items():
        order.insert(order.index(o) if o in order else len(order), s)
    return order


# ---------------------------------------------------------------------------
# 2. KIEM CHU THAT TRONG MAU: du ky tu trong font + co chu (vua o)
# ---------------------------------------------------------------------------
_GLYPH = {}


def _has_glyph(fo, ch):
    ft, _, path = fo
    key = (path, ch)
    if key not in _GLYPH:
        try:
            m = ft.getmask(ch)
            miss = ft.getmask("")
            same = m.size == miss.size and bytes(m) == bytes(miss)
            _GLYPH[key] = not same and m.getbbox() is not None
        except Exception:
            _GLYPH[key] = True
    return _GLYPH[key]


def missing_glyphs(row, spec, texts):
    """{slot: "ky tu thieu"} — font cua o khong co ky tu do (dau tieng Viet...) -> trinh duyet thay font khac."""
    dirp = os.path.dirname(_spec_path(row))
    out = {}
    nodes = []

    def walk(g):
        for ch in g.get("children") or []:
            if ch.get("type") == "group":
                walk(ch)
            elif ch.get("type") == "text":
                nodes.append(ch)

    walk(spec["root"])
    for sid, text in texts.items():
        bad = set()
        for n in [x for x in nodes if x.get("slot") == sid]:
            shown = _shown(n, text)
            for r, s in _split_runs(shown, _runs(n, shown)):
                fo = _font(dirp, spec, r.get("font"))
                if fo:
                    bad |= {c for c in s if not c.isspace() and not _has_glyph(fo, c)}
        if bad:
            out[sid] = "".join(sorted(bad))
    return out


def fit_scales(row, spec, texts, geo=None):
    """Co chu tung o (giong computeFit): o le -> be ngang chu mau / chu that; cac o CUNG DONG chia chung be ngang dong."""
    geo = geo or geometry(row, spec)
    dirp = geo["dir"]
    samples = {s["id"]: s.get("sample") or "" for s in spec.get("slots") or []}
    raw, w0 = {}, {}
    for sid, hit in geo["ref"].items():
        b0 = _node_box(spec, dirp, hit, samples[sid])
        b1 = _node_box(spec, dirp, hit, texts.get(sid, samples[sid]))
        w0[sid], raw[sid] = b0[2] - b0[0], b1[2] - b1[0]
    room = {x["id"]: float(x.get("room") or 1) for x in spec.get("slots") or []}

    def one(sid):
        if raw[sid] <= 0:
            return 1.0
        # room > 1: o duoc rong hon chu mau toi room lan (KHOP computeFit)
        if room.get(sid, 1) > 1 and raw[sid] > w0[sid]:
            return min(1.0, room[sid] * w0[sid] / raw[sid])
        return min(GROW_MAX, w0[sid] / raw[sid])

    out = {sid: one(sid) for sid in raw}
    for ln in geo["lines"]:
        if len(ln) < 2:
            continue
        bx = geo["boxes"]
        span0 = bx[ln[-1]][2] - bx[ln[0]][0]
        gaps = sum(bx[b][0] - bx[a][2] for a, b in zip(ln, ln[1:]))
        # be ngang chu that o khung day du nhat (cung ti le voi chu mau o do)
        need = sum(raw[s] * (bx[s][2] - bx[s][0]) / max(1e-6, w0[s]) for s in ln if s in raw) + gaps
        s = min(GROW_MAX, span0 / need) if need > 0 else 1.0
        for sid in ln:
            out[sid] = s
    return {k: round(v, 3) for k, v in out.items()}


def nz(s):
    """So khop chu: NFC, thuong, chi chu + so (GIU dau tieng Viet), bo moi khoang trang / dau cau."""
    s = unicodedata.normalize("NFC", str(s or "")).lower()
    return "".join(c for c in s if c.isalnum())


def _spoken_pos(spoken, part, start=0):
    i = spoken.find(part, start)
    return i if i >= 0 else None


def check_choice(row, spec, lk, texts, geo=None):
    """Loi (list chu) cua mot lua chon AI; [] = dat. Kem fit (co chu tung o)."""
    errs = []
    geo = geo or geometry(row, spec)
    slot_ids = [s["id"] for s in spec.get("slots") or []]
    texts = {k: unicodedata.normalize("NFC", str(v or "")).strip() for k, v in (texts or {}).items()}
    extra = [k for k in texts if k not in slot_ids]
    if extra:
        errs.append("mau khong co o %s" % ", ".join(extra))
    empty = [s for s in slot_ids if not nz(texts.get(s))]
    if empty:
        errs.append("o %s de trong — moi o phai co chu" % ", ".join(empty))
    num = [x["id"] for x in spec.get("slots") or [] if x.get("accept") == "number" and x["id"] not in empty
           and not re.fullmatch(r"\d+(?:[.,]\d+)?%?", texts.get(x["id"], ""))]
    if num:
        errs.append("o %s chi nhan CON SO (vd '3') — cum khong co con so thi khong dung mau nay" % ", ".join(num))
    if errs:
        return errs, {}
    joined = "".join(nz(texts[s]) for s in geo["order"])
    tiers = [t["text"] for t in lk["tiers"]]
    perms = [p for p in itertools.permutations(range(len(tiers))) if "".join(nz(tiers[i]) for i in p) == joined]
    if not perms:
        errs.append("doc theo thu tu doc cua mau (%s) ra '%s' — khong dung nguyen chu cua cum '%s'" % (
            " -> ".join(geo["order"]), " ".join(texts[s] for s in geo["order"]), " / ".join(tiers)))
        return errs, {}
    spoken = nz(lk.get("dang_noi"))
    pos = [_spoken_pos(spoken, nz(t)) for t in tiers] if spoken else []
    if pos and all(p is not None for p in pos):
        if not any(all(pos[a] <= pos[b] for a, b in zip(p, p[1:])) for p in perms):
            errs.append("thu tu doc tren mau khac thu tu loi noi (nguoi noi: '%s')" % lk.get("dang_noi", "")[:120])
    elif tuple(range(len(tiers))) not in perms:
        errs.append("thu tu doc tren mau khac thu tu cac tang cua cum")
    miss = missing_glyphs(row, spec, texts)
    for sid, chars in miss.items():
        errs.append("font cua o %s thieu ky tu '%s' (se bi thay font khac)" % (sid, chars))
    fit = fit_scales(row, spec, texts, geo)
    small = {k: v for k, v in fit.items() if v < MIN_FIT}
    if small:
        errs.append("chu qua dai so voi o: %s phai thu con %s (< %d%%) — chon o / mau khac hoac chia chu lai" % (
            ", ".join(small), ", ".join("%d%%" % (v * 100) for v in small.values()), MIN_FIT * 100))
    return errs, fit


# ---------------------------------------------------------------------------
# 3. CUM CHU CAN XET + DANH MUC KHO CHO AI
# ---------------------------------------------------------------------------
def _spoken(transcript_data, sid, a, b):
    rows = []
    for t in (transcript_data or {}).get(sid) or []:
        try:
            st, en = float(t.get("start")), float(t.get("end"))
        except (TypeError, ValueError):
            continue
        if en >= a - 0.6 and st <= b + 0.6 and (t.get("text") or "").strip():
            rows.append(t["text"].strip())
    return " ".join(rows)


def contexts(lockups, layers, captions, hook_info, transcript_data):
    """lockups (text_art.lockups_from meta=True) -> cum kem boi canh: gio nguon, cau dang noi, y do, trong hook."""
    hk = hook_info or {}
    out = []
    for lk in lockups:
        srcs = lk.get("src") or []
        sid, a, b, why, kind = None, None, None, "", ""
        for s in srcs:
            if s["kind"] == "layers":
                for i in s["idx"]:
                    L = layers[i]
                    try:
                        st, en = float(L.get("src_start")), float(L.get("src_end"))
                    except (TypeError, ValueError):
                        continue
                    sid = sid or L.get("source_id")
                    a, b = min(a if a is not None else st, st), max(b if b is not None else en, en)
                    why = why or str(L.get("why") or "")
                kind = kind or "lop chu (R4)"
            elif s["kind"] == "caption":
                c = captions[s["idx"]]
                try:
                    a, b = float(c.get("src_start")), float(c.get("src_end"))
                except (TypeError, ValueError):
                    pass
                sid = c.get("source_id") or sid
                kind = kind or ("caption hook" if c.get("anchor") == "hook" else "caption hero")
            elif s["kind"] == "hook":
                a, b, sid = hk.get("src_start"), hk.get("src_end"), hk.get("source_id")
                kind = kind or "caption hook"
        in_hook = bool(hk and sid == hk.get("source_id") and a is not None and hk.get("src_start") is not None
                       and a < float(hk["src_end"]) and (b or a) > float(hk["src_start"])) or kind == "caption hook"
        out.append({"key": lk["key"], "cac_tang": [{"text": t["text"], "vai": t["role"]} for t in lk["tiers"]],
                    "loai": kind, "luc_nguon": [round(a, 2), round(b, 2)] if a is not None and b is not None else None,
                    "dang_noi": _spoken(transcript_data, sid, a, b) if a is not None else "",
                    "trong_hook": in_hook, "y_do": why[:240]})
    return out


def catalog(rows=None):
    out = []
    for t in rows if rows is not None else usable():
        spec = load_spec(t)
        try:
            geo = geometry(t, spec)
        except Exception:
            continue
        roles = {r.get("id"): r for r in t.get("slot_roles") or [] if isinstance(r, dict)}
        sizes = {s: round(b[3] - b[1]) for s, b in geo["boxes"].items()}
        big = max(sizes.values()) if sizes else 0
        o = []
        for i, sid in enumerate(geo["order"]):
            smp = next((s.get("sample") or "" for s in spec["slots"] if s["id"] == sid), "")
            r = roles.get(sid) or {}
            sl = next((s for s in spec["slots"] if s["id"] == sid), {})
            if sl.get("accept") == "number":
                r = dict(r, chi_nhan="con so")
            o.append({"id": sid, "thu_tu_doc": i + 1, "vai_tro": r.get("role") or sl.get("role") or "",
                      "gioi_han": r.get("max_len") or "", "chu_mau_minh_hoa": smp, "so_ky_tu_mau": len(smp),
                      "co_chu": "to nhat" if sizes.get(sid) == big else ("to" if sizes.get(sid, 0) >= big * 0.6 else "nho")})
            if r.get("chi_nhan"):
                o[-1]["chi_nhan"] = r["chi_nhan"]
        out.append({"id": t["id"], "ten": t.get("name"), "tom_tat": t.get("summary"), "phong_cach": t.get("style"),
                    "cam_giac": t.get("mood"), "muc_do": t.get("energy"), "chuyen_dong": t.get("motion"),
                    "hop_khi": t.get("use_when"), "tranh_khi": t.get("avoid_when"), "hop_cho": t.get("best_for"),
                    "tags": t.get("tags"), "am_thanh": t.get("sound_notes"), "do_dai_giay": t.get("duration"),
                    "o_chu": o})
    return out


def catalog_fp(rows):
    blob = []
    for t in rows:
        try:
            mt = os.path.getmtime(_spec_path(t))
        except OSError:
            mt = 0
        blob.append([t["id"], mt, {k: t.get(k) for k in text_lib.ANALYSIS_FIELDS if k not in ("labeled_at",)}])
    return hashlib.sha1(json.dumps(blob, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# 4. BUOC AI "TXT-lib": de xuat -> code kiem -> sai thi AI sua 1 luot -> van sai thi cum do di chu anh AI
# ---------------------------------------------------------------------------
def _ask(payload, note=None, log=None):
    import providers
    text = providers.plan_chat([
        {"role": "system", "content": _p("_TEXT_LIB_SYSTEM")
         + (("\n\n" + note) if note else "")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=8000, temperature=0.3, req_timeout=300, max_attempts=2, step_label="TXT-lib")
    return providers._safe_json(text) or {}


def choose(ctxs, rows, story=None, style=None, hook=None, log=None, emit=None):
    """Tra {"items": {key: {template, texts, ly_do, fit}}, "bo_qua": [{key, ly_do}]}."""
    by_id = {t["id"]: t for t in rows}
    cat = catalog(rows)
    st = style if isinstance(style, dict) else {}
    video = {"chu_de": (story or {}).get("story_arc") if isinstance(story, dict) else None,
             "giong": (story or {}).get("tone") if isinstance(story, dict) else None,
             "phong_cach": {k: st.get(k) for k in ("mood", "palette", "fonts") if st.get(k)} or None,
             "muc_do_hook": ((hook or {}).get("y_tuong_gay_chu_y") or {}).get("muc_do") if isinstance(hook, dict) else None}
    payload = {"video": video, "kho_text": cat, "cum_chu": ctxs}
    if log:
        log("TXT-lib: AI xet %d cum chu voi %d mau trong Kho Text..." % (len(ctxs), len(cat)))
    res = _ask(payload, log=log)
    by_key = {c["key"]: c for c in ctxs}
    items, skip, retry = {}, [], []
    uses = {}

    def judge(rows_in, final):
        for r in rows_in:
            if not isinstance(r, dict) or r.get("key") not in by_key or r.get("key") in items:
                continue
            k, tid = r["key"], r.get("mau")
            lk = by_key[k]
            t = by_id.get(tid)
            errs = []
            if not t:
                errs = ["mau '%s' khong co trong kho" % tid]
            elif uses.get(tid, 0) >= MAX_USES:
                errs = ["mau %s da dung du %d lan" % (tid, MAX_USES)]
            fit = {}
            if not errs:
                spec = load_spec(t)
                lkx = {"tiers": [{"text": x["text"], "role": x["vai"]} for x in lk["cac_tang"]], "dang_noi": lk["dang_noi"]}
                errs, fit = check_choice(t, spec, lkx, r.get("o_chu") or {})
            if errs:
                if final:
                    skip.append({"key": k, "ly_do": "mau %s khong dat: %s" % (tid, "; ".join(errs))})
                else:
                    retry.append({"key": k, "mau_da_chon": tid, "o_chu_da_dien": r.get("o_chu"), "loi": errs})
                continue
            uses[tid] = uses.get(tid, 0) + 1
            items[k] = {"template": tid, "texts": {s: unicodedata.normalize("NFC", str(v)).strip()
                                                    for s, v in (r.get("o_chu") or {}).items()},
                        "ly_do": str(r.get("ly_do") or "")[:300], "fit": fit,
                        "tiers": [x["text"] for x in lk["cac_tang"]]}

    judge(res.get("chon") or [], final=False)
    for r in res.get("khong_dung") or []:
        if isinstance(r, dict) and r.get("key") in by_key and r["key"] not in items:
            skip.append({"key": r["key"], "ly_do": str(r.get("ly_do") or "")[:300]})
    if retry:
        if emit:
            emit("Kho Text: %d lựa chọn chưa đạt kiểm tra (chữ / thứ tự / font / độ vừa ô) -> AI sửa 1 lượt" % len(retry))
        note = ("LUOT SUA: cac lua chon duoi day bi code loai (truong 'loi'). Sua lai o_chu cho dung luat, hoac doi mau "
                "khac hop hon, hoac dua cum vao khong_dung. Chi tra ve cac cum nay. Mau da dung (so lan): %s"
                % json.dumps(uses, ensure_ascii=False))
        res2 = _ask({"video": video, "kho_text": cat, "cum_chu": [by_key[x["key"]] for x in retry],
                     "lua_chon_bi_loai": retry}, note=note, log=log)
        judge(res2.get("chon") or [], final=True)
        done = set(items) | {s["key"] for s in skip}
        for r in res2.get("khong_dung") or []:
            if isinstance(r, dict) and r.get("key") in by_key and r["key"] not in done:
                skip.append({"key": r["key"], "ly_do": str(r.get("ly_do") or "")[:300]})
                done.add(r["key"])
        for x in retry:
            if x["key"] not in done:
                skip.append({"key": x["key"], "ly_do": "mau %s khong dat: %s" % (x["mau_da_chon"], "; ".join(x["loi"]))})
    seen = set(items) | {s["key"] for s in skip}
    for c in ctxs:
        if c["key"] not in seen:
            skip.append({"key": c["key"], "ly_do": "AI khong xet cum nay"})
    return {"items": items, "bo_qua": skip}


def brand_blocks(brand):
    """Brand Guideline co font / ma mau ep bang code -> mau Kho Text (font + mau rieng) se pha thuong hieu."""
    if not brand:
        return False
    import brand_guide
    try:
        return bool(brand_guide.fonts(brand) or brand_guide.hexes(brand))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# 5. DUNG: thong tin lop "tpl" + tieng tron san
# ---------------------------------------------------------------------------
def premix(row, spec):
    """Tron moi clip am thanh cua mau (gio, cat, khuech dai, fade) thanh 1 file WAV dinh -1 dBFS — giu dung ti le to
    nho trong mau; build_spec can ca file theo giong noi (plan_guard.mix_sfx). Khong co tieng -> None."""
    import winsupport
    dirp = os.path.dirname(_spec_path(row))
    clips = []
    for a in spec.get("audio") or []:
        path = os.path.join(dirp, a.get("file") or "")
        st, dur, ss = float(a.get("start") or 0), float(a.get("duration") or 0), float(a.get("sourceStart") or 0)
        if st < 0:
            ss, dur, st = ss - st, dur + st, 0.0
        if dur <= 0.02 or not os.path.isfile(path):
            continue
        clips.append((path, st, dur, ss, float(a.get("volume") or 1), float(a.get("fadeIn") or 0), float(a.get("fadeOut") or 0)))
    if not clips:
        return None
    key = hashlib.sha1(json.dumps([(c, os.path.getsize(c[0])) for c in clips]).encode("utf-8")).hexdigest()[:12]
    os.makedirs(CACHE_DIR, exist_ok=True)
    out = os.path.join(CACHE_DIR, "%s-%s.wav" % (row["id"], key))
    if os.path.isfile(out) and os.path.getsize(out) > 1000:
        return out
    ff = winsupport.ffbin("ffmpeg") or "ffmpeg"
    files = sorted({c[0] for c in clips})
    chains, labels = [], []
    for i, (path, st, dur, ss, vol, fi, fo) in enumerate(clips):
        f = "[%d:a]atrim=start=%.4f:duration=%.4f,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=%.4f" % (
            files.index(path), ss, dur, vol)
        if fi > 0:
            f += ",afade=t=in:d=%.3f" % fi
        if fo > 0:
            f += ",afade=t=out:st=%.3f:d=%.3f" % (max(0.0, dur - fo), fo)
        ms = int(round(st * 1000))
        f += ",adelay=%d|%d[c%d]" % (ms, ms, i)
        chains.append(f)
        labels.append("[c%d]" % i)
    graph = ";".join(chains) + ";" + "".join(labels) + ("amix=inputs=%d:normalize=0:duration=longest[m]" % len(labels))
    tmp = out + ".tmp.wav"
    cmd = [ff, "-v", "error", "-y"] + sum([["-i", f] for f in files], []) + ["-filter_complex", graph, "-map", "[m]",
                                                                               "-ar", "48000", "-c:a", "pcm_s16le", tmp]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if r.returncode != 0 or not os.path.isfile(tmp):
        raise RuntimeError("tron tieng mau %s loi: %s" % (row["id"], (r.stderr or "")[-300:]))
    # dinh -> -1 dBFS (mau CapCut khuech dai > 1 co the vuot 0 dBFS; nho qua thi mix_sfx khong keo len duoc tren 1.0)
    det = subprocess.run([ff, "-v", "info", "-i", tmp, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True, timeout=60)
    m = re.search(r"max_volume:\s*(-?[\d.]+) dB", det.stderr or "")
    gain = -1.0 - float(m.group(1)) if m else 0.0
    r = subprocess.run([ff, "-v", "error", "-y", "-i", tmp, "-af", "volume=%.2fdB" % gain, "-c:a", "pcm_s16le", out],
                       capture_output=True, text=True, timeout=60)
    try:
        os.remove(tmp)
    except OSError:
        pass
    if r.returncode != 0:
        raise RuntimeError("chuan hoa tieng mau %s loi: %s" % (row["id"], (r.stderr or "")[-300:]))
    return out


def ink_box(row, spec, texts, fit=None, geo=None):
    """Khoi NET chu that cua MOT lan dung mau (chu that + co chu fit) o khung day du nhat, + le glow — luat ne mat /
    phu de / dat vi tri dung khoi nay (chu that ngan hon chu mau thi khoi nho hon)."""
    geo = geo or geometry(row, spec)
    samples = {s["id"]: s.get("sample") or "" for s in spec.get("slots") or []}
    fit = fit or fit_scales(row, spec, texts, geo)
    shapes = []
    star = _hits(spec, geo["t_star"], shapes)
    inks = [b for b in (_node_ink(spec, geo["dir"], h, texts.get(h[0]["slot"]) or samples[h[0]["slot"]],
                                  fit.get(h[0]["slot"], 1.0)) for h in star) if b]
    if inks:
        inks += [b for b in (_shape_box(spec, geo["dir"], x, texts, fit) for x in shapes) if b]
    if not inks:
        return geo["box"]
    u = _union(inks)
    hs = [b[3] - b[1] for b in geo["boxes"].values()]
    pad = PAD * max([h for h in hs if h <= 1.67 * min(hs)] or hs)
    return [u[0] - pad, u[1] - pad, u[2] + pad, u[3] + pad]


def layer_info(item):
    """Muc plan text_lib -> {spec, dir, box (px mau), duration, audio, name}. Mau khong con trong kho -> None."""
    row = text_lib.get_template(item.get("template"))
    spec = load_spec(row) if row else None
    if not spec:
        return None
    geo = geometry(row, spec)
    try:
        audio = premix(row, spec)
    except Exception:
        audio = None
    try:
        box = ink_box(row, spec, item.get("texts") or {}, geo=geo)
    except Exception:
        box = geo["box"]
    return {"spec": spec, "dir": geo["dir"], "box": [round(v, 1) for v in (box or [0, 0, spec["width"], spec["height"]])],
            "duration": float(spec.get("duration") or 2), "audio": audio, "name": row.get("name") or row["id"]}
