#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO CUC CHU THAT TRONG MAU KHO TEXT (user 2026-10-15: "chu bi de len nhau, luc cao luc thap, khong can doi").

Truoc: renderer (TextTemplate.computeFit) co chu tung o cho vua be ngang chu mau roi NEO vao MEP CU cua chu mau, va chi
so khe giua cac o bang KHUNG CHU NHAT tung ky tu. Hai loi do that (40 lan dung mau trong cac du an that):
  - chu that ngan hon chu mau -> moi o bam mot mep cu -> bo cuc roi rac ("sản ....... phẩm", "OK" lech xuong goc);
  - chu cai cach dieu khac hinh (mau "L" -> chu that "C": vong cung tren cua C quet dung cho "hãy" -> "Ai" bi de), net
    chu ky "Y" de len "WHC", hop trang tri (hop xanh duoi "Compound") de len chu chinh dai hon — khung chu nhat khong
    thay duoc vi khung "L" va "C" gan bang nhau.

Bay gio Python tinh BO CUC CUOI CUNG mot lan (luc lap ke hoach) va renderer ap DUNG bo cuc do (prop `layout`):
  1. CO CHU tung o nhu cu (chu that <= be ngang chu mau, phong <= 12%); cac o CUNG DONG chia chung be ngang dong.
  2. BO CUC THEO QUAN HE: moi "dong" (1 hay nhieu o) giu QUAN HE voi chu CHINH (khoi lon nhat) nhu trong mau — can
     trai / can phai / giua / sat canh, nam tren / duoi / chong len bao nhieu — thay vi giu toa do cu.
  3. KHONG DE CHU: ve NET CHU THAT tung o (font cua mau, vien, dam, nghieng gia lap, xoay — giong drawText) thanh mat na
     pixel; hai o chong net > nguong -> dich o nho hon (ca dong) / thu nho toi thieu; hop / hinh vector cung group voi o
     chu nao thi di theo o do; vector khong thuoc o nao la VAT CAN (chu khong duoc de len hon muc mau da de).
     Khong go duoc -> `ok` = False (text_tpl.check_choice loai mau cho cum do -> AI chon mau khac / chu anh AI).
  4. Ca to hop ve dung tam khoi net chu cua mau.
Ket qua: {slot: {scale, dx, dy}} (dx, dy = px khung mau, dich tam o so voi chu mau) + khoi net chu that (ink) cho luat ne
mat / phu de. Mat na lam o do phan giai RES (0.5 px / px mau).
"""
import math

import numpy as np

import text_tpl as TT

RES = 0.5                 # mat na: 0.5 px / px khung mau (1080x1920 -> 540x960)
FIT_SHRINK_MIN = 0.3      # KHOP TextTemplate
GROW_MAX = TT.GROW_MAX
G_TOL = 0.06              # DO THEO TUNG CHU CAI: net o khac (no khe CLEAR) che <= 6% net mot chu cai — luon cho
G_CAP = 0.12              # mau CO Y cho net cham chu (chu ky vat qua chu dam: 10-40% mot chu cai) -> giu muc cua mau
                          # nhung <= 12% / chu cai (do that: "Y" che 30% chu "W" -> doc thanh "VHC" — khong cho)
SOLID = 0.6               # chu dam >= 60% moi tinh de (mau chu noi tiep: chu truoc mo dan khi chu sau vao)
CLEAR = 0.035             # khe toi thieu giua net 2 o = 3.5% chieu cao dong o nho hon (dau tieng Viet khong cham chu)
MAX_SHRINK = 0.72         # go de: thu nho them toi da con 72% co da fit
MOVE_MAX = 0.9            # go de: dich toi da 0.9 lan chieu cao dong cua o phai dich
LAYOUT_VERSION = 1

_FONTS = {}


def _ft(path, size):
    from PIL import ImageFont
    key = (path, round(size, 2))
    if key not in _FONTS:
        _FONTS[key] = ImageFont.truetype(path, max(1.0, size))
    return _FONTS[key]


# ---------------------------------------------------------------------------
# 1. CAC NODE DANG HIEN (chu + hinh vector + chuoi khung) — KHOP hitsAt cua TextTemplate (them vector / frames)
# ---------------------------------------------------------------------------
def visible(spec, t):
    """[(node, M, local, parent_children, alpha)] — node chu / vector / frames dang hien luc t (gio mau); alpha = do dam
    hieu dung (group long nhau x node) — chu dang mo dan (chuyen tiep cua mau chu noi tiep) khong tinh de."""
    W, H = float(spec.get("width") or 1080), float(spec.get("height") or 1920)
    out = []

    def visit(g, local, M, W, H, pa=1.0):
        if local < 0 or local >= g["duration"]:
            return
        ct = local + g.get("sourceStart", 0)
        m, alpha = TT._group_m(g, local, W, H)
        if alpha <= 0:
            return
        alpha = pa * min(1.0, alpha)
        Mg = TT._mul(M, m)
        cv = g.get("canvas")
        if cv and (float(cv[0]), float(cv[1])) != (W, H):
            f = min(W / float(cv[0]), H / float(cv[1]))
            Mg = TT._mul(Mg, TT._mul(TT._tr((W - cv[0] * f) / 2, (H - cv[1] * f) / 2), TT._sc(f)))
            W, H = float(cv[0]), float(cv[1])
        for e in g.get("effects") or []:
            # track matte CapCut: noi dung group dich theo vi tri matte (KHOP hitsAt)
            if e.get("type") != "ae_trs_matte" or ct < e["start"] or ct >= e["start"] + e["duration"]:
                continue
            pos = _ae_val(e.get("position"), (ct - e["start"]) * e.get("speed", 1)) if e.get("position") else e["anchor"]
            Mg = TT._mul(Mg, TT._tr((pos[0] - e["anchor"][0]) * (W / e["compSize"][0]),
                                    (pos[1] - e["anchor"][1]) * (H / e["compSize"][1])))
        kids = g.get("children") or []
        for ch in kids:
            if ch.get("type") == "group":
                visit(ch, ct - ch["start"], Mg, W, H, alpha)
                continue
            ch["_cv"] = (W, H)
            l = ct - ch["start"]
            if l < 0 or l >= ch["duration"]:
                continue
            na = TT._cc((ch.get("keyframes") or {}).get("alpha"), l, ch.get("alpha", 1)) \
                if ch.get("type") in ("text", "vector") else 1.0
            if na <= 0:
                continue
            if ch.get("type") in ("text", "vector", "frames"):
                out.append((ch, Mg, l, kids, alpha * min(1.0, na)))

    visit(dict(spec["root"], start=0), t, (1, 0, 0, 1, 0, 0), W, H)
    return out


_TWO_D, _THREE_D = 6415, 6413


def _bez3(p1, p2, p3, p4, t):
    u = 1 - t
    g = lambda p, i: p[i] if i < len(p) else 0.0  # noqa: E731
    return [g(p1, i) * u * u * u + 3 * g(p2, i) * u * u * t + 3 * g(p3, i) * u * t * t + g(p4, i) * t * t * t
            for i in range(3)]


def _bez2(p1, p2, p3, p4, t):
    u = 1 - t
    return [p1[i] * u * u * u + 3 * p2[i] * u * u * t + 3 * p3[i] * u * t * t + p4[i] * t * t * t for i in range(2)]


def _bezier01(b, p, ylen):
    ts, te, n = 0.0, 1.0, 1
    while True:
        tm = (ts + te) * 0.5
        if _bez2([0, 0], [b[0], b[1]], [b[2], b[3]], [1, ylen], tm)[0] > p:
            te = tm
        else:
            ts = tm
        n += 1
        if (te - ts < 0.001 and n < 50) or n > 80:
            break
    return _bez2([0, 0], [b[0], b[1]], [b[2], b[3]], [1, ylen], (te + ts) * 0.5)[1]


def _ae_val(keys, t):
    """AETools:GetVal — port 1:1 cua aeVal (remotion-src/textTemplate/aeCurve.ts): bezier thoi gian + duong cong khong
    gian 2D / 3D (chia deu theo do dai cung). Vi tri matte phai DUNG nhu renderer: khung kiem bo cuc co the roi giua
    hoat canh vao (do that levip5-08: matte con dang chay luc khung day du nhat)."""
    if not keys:
        return [0, 0]
    for k in keys:
        s, e = float(k[1][0]), float(k[1][1])
        if s <= t < e:
            cp = 0.0 if t < s else 1.0 if t > e else (t - s) / max(1e-12, e - s)
            bz, vr = k[0], k[2]
            ylen = 1
            if vr[1][0] == vr[0][0] and len(k) > 4 and k[4] and k[4][0] == 0 and len(vr[0]) == 1:
                ylen = 0
            if len(k) > 4 and k[4] and k[4][0] == 2:
                return list(vr[0])
            mix = (lambda a, b_, x: a * (1 - x) + b_ * x) if ylen == 1 else (lambda a, b_, x: a + x)
            if len(bz) > 4:
                return [mix(vr[0][j], vr[1][j], _bezier01([bz[j], bz[j + 3], bz[j + 6], bz[j + 9]], cp, ylen))
                        for j in range(3)]
            p = _bezier01(bz, cp, ylen)
            if len(k) > 3 and k[3] and k[3][0] in (_THREE_D, _TWO_D) and len(k) > 4 and k[4] and k[4][0] == 0 \
                    and len(vr) >= 4:
                lens, p0, tot = [0.0], vr[0], 0.0
                for i in range(1, 201):
                    c = _bez3(vr[0], vr[2], vr[3], vr[1], i / 200.0)
                    tot += math.hypot(c[0] - p0[0], c[1] - p0[1])
                    p0 = c
                    lens.append(tot)
                lens = [x / (tot + 1e-6) for x in lens]
                if p <= 0:
                    q = 0.0
                elif p >= 1:
                    q = 1.0
                else:
                    a_, b_ = 0, 200
                    for i in range(1, 201):
                        if lens[i] >= p:
                            a_, b_ = i - 1, i
                            break
                    q = a_ / 200.0 + 0.005 * (p - lens[a_]) / (lens[b_] - lens[a_] + 1e-6)
                c = _bez3(vr[0], vr[2], vr[3], vr[1], q)
                return c[:2] if k[3][0] == _TWO_D else c
            return [mix(vr[0][j], vr[1][j], p) for j in range(len(vr[0]))]
    if t < float(keys[0][1][0]):
        return list(keys[0][2][0])
    return list(keys[-1][2][1])


# ---------------------------------------------------------------------------
# 2. VE NET CHU / HINH THANH MAT NA (khung mau, do phan giai RES)
# ---------------------------------------------------------------------------
def _frame_shape(spec):
    return int(math.ceil(float(spec.get("height") or 1920) * RES)), int(math.ceil(float(spec.get("width") or 1080) * RES))


def _inv(m):
    a, b, c, d, e, f = m
    det = a * d - b * c
    if abs(det) < 1e-12:
        return None
    return (d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det)


def _paste(dst, src_img, fwd, origin):
    """Bien anh cuc bo (L, goc = origin trong toa do cuc bo) theo ma tran fwd (cuc bo -> khung mau) roi OR vao dst."""
    from PIL import Image
    Hh, Ww = dst.shape
    ox, oy = origin
    # pixel anh cuc bo (u, v) -> cuc bo (u / RES + ox, v / RES + oy) -> khung (fwd) -> mat na (* RES)
    full = TT._mul(TT._sc(RES), TT._mul(fwd, TT._mul(TT._tr(ox, oy), TT._sc(1.0 / RES))))
    inv = _inv(full)
    if inv is None:
        return None
    w0, h0 = src_img.size
    cs = [TT._apply(full, x, y) for x, y in ((0, 0), (w0, 0), (0, h0), (w0, h0))]
    x0, x1 = max(0, int(math.floor(min(c[0] for c in cs)))), min(Ww, int(math.ceil(max(c[0] for c in cs))))
    y0, y1 = max(0, int(math.floor(min(c[1] for c in cs)))), min(Hh, int(math.ceil(max(c[1] for c in cs))))
    if x1 <= x0 or y1 <= y0:
        return None
    sub = TT._mul(inv, TT._tr(x0, y0))
    a, b, c, d, e, f = sub
    out = src_img.transform((x1 - x0, y1 - y0), Image.AFFINE, data=(a, c, e, b, d, f), resample=Image.BILINEAR)
    arr = np.asarray(out) > 96
    dst[y0:y1, x0:x1] |= arr
    return x0, y0, arr


def text_layout(spec, dirp, n, text, scale):
    """Dan chu cua node (KHOP layoutText): [(run, font_path, em, [(glyph, x)], w)], asc, desc, total — x tinh tu 0."""
    W = TT._cv(spec, n)[0]
    text = TT._shown(n, text)
    runs, x = [], 0.0
    asc_m = desc_m = 0.0
    for r, s in TT._split_runs(text, TT._runs(n, text)):
        fo = TT._font(dirp, spec, r.get("font"))
        if not fo:
            return None
        ft100, line_em, path, a_em, d_em = fo
        em = TT._line_px(n, r, scale, W, line_em) / line_em
        ls = float(n.get("letterSpacing") or 0) * em
        gl, acc = [], 0.0
        for i, ch in enumerate(s):
            gl.append((ch, x + acc))
            acc = ft100.getlength(s[:i + 1]) * em / 100.0 + ls * (i + 1)
        runs.append({"run": r, "path": path, "em": em, "glyphs": gl, "x0": x, "w": acc, "text": s})
        asc_m, desc_m = max(asc_m, a_em * em), max(desc_m, d_em * em)
        x += acc
    return runs, asc_m, desc_m, x


def raster_text(spec, dirp, hit, text, mult, dst, glyphs=None):
    """Ve net chu (fill + vien + dam, nghieng gia lap) cua node vao mat na dst (OR). Tra khung NET (khung mau) hoac None.
    glyphs (list): them TUNG CHU CAI [(x0, y0, mat na)] (do che tung chu cai — doc duoc hay khong)."""
    from PIL import Image, ImageDraw
    n, M, l = hit[0], hit[1], hit[2]
    kf = n.get("keyframes") or {}
    W, H = TT._cv(spec, n)
    scale = TT._cc(kf.get("scale"), l, n["transform"]["scale"]) * mult
    lay = text_layout(spec, dirp, n, text, scale)
    if not lay:
        return None
    runs, asc, desc, total = lay
    if total <= 0:
        return None
    rot = TT._cc(kf.get("rotation"), l, n["transform"].get("rotation", 0))
    cx = W / 2 + TT._cc(kf.get("x"), l, n["transform"]["x"]) * W / 2
    cy = H / 2 - TT._cc(kf.get("y"), l, n["transform"]["y"]) * H / 2
    node = TT._mul(TT._mul(M, TT._tr(cx, cy)), TT._rot(rot) if rot else (1, 0, 0, 1, 0, 0))
    base = (asc - desc) / 2
    bd = n.get("border") or {}
    stroke = float(bd.get("width") or 0) * 5.5 if bd and float(bd.get("alpha", 1) or 0) > 0 else 0.0
    stroke = max(stroke, float(n.get("bold") or 0))
    skew = math.tan(math.radians(float(n.get("italicDegree", 10) if n.get("italicDegree") is not None else 10)))
    before = dst.sum()
    box = None
    for rr in runs:
        ft = _ft(rr["path"], rr["em"] * RES)
        sw = stroke * rr["em"] * RES
        bbs = [ft.getbbox(g, anchor="ls") for g, _x in rr["glyphs"] if g.strip()]
        if not bbs:
            continue
        pad = sw + 2
        lx0 = min((x - total / 2) * RES + bb[0] for (g, x), bb in zip([g for g in rr["glyphs"] if g[0].strip()], bbs)) - pad
        lx1 = max((x - total / 2) * RES + bb[2] for (g, x), bb in zip([g for g in rr["glyphs"] if g[0].strip()], bbs)) + pad
        ly0 = base * RES + min(bb[1] for bb in bbs) - pad
        ly1 = base * RES + max(bb[3] for bb in bbs) + pad
        iw, ih = int(math.ceil(lx1 - lx0)) + 1, int(math.ceil(ly1 - ly0)) + 1
        if iw <= 0 or ih <= 0 or iw * ih > 25_000_000:
            continue
        fwd = node
        if rr["run"].get("italic"):
            ink_a = -min(bb[1] for bb in bbs) / RES
            ink_d = max(bb[3] for bb in bbs) / RES
            py0 = base - (ink_a - ink_d) / 2
            fwd = TT._mul(node, (1, 0, -skew, 1, skew * py0, 0))
        if glyphs is None:
            img = Image.new("L", (iw, ih), 0)
            dr = ImageDraw.Draw(img)
            for g, x in rr["glyphs"]:
                if not g.strip():
                    continue
                dr.text(((x - total / 2) * RES - lx0, base * RES - ly0), g, font=ft, fill=255, anchor="ls",
                        stroke_width=sw, stroke_fill=255)
            _paste(dst, img, fwd, (lx0 / RES, ly0 / RES))
        else:
            for g, x in rr["glyphs"]:
                if not g.strip():
                    continue
                gb = ft.getbbox(g, anchor="ls")
                gx0 = (x - total / 2) * RES + gb[0] - pad
                gy0 = base * RES + gb[1] - pad
                gw, gh = int(math.ceil(gb[2] - gb[0] + 2 * pad)) + 1, int(math.ceil(gb[3] - gb[1] + 2 * pad)) + 1
                img = Image.new("L", (max(1, gw), max(1, gh)), 0)
                ImageDraw.Draw(img).text(((x - total / 2) * RES - gx0, base * RES - gy0), g, font=ft, fill=255,
                                         anchor="ls", stroke_width=sw, stroke_fill=255)
                got = _paste(dst, img, fwd, (gx0 / RES, gy0 / RES))
                if got and got[2].any():
                    glyphs.append(got)
        cs = [TT._apply(fwd, x, y) for x, y in ((lx0 / RES, ly0 / RES), (lx1 / RES, ly0 / RES),
                                                (lx0 / RES, ly1 / RES), (lx1 / RES, ly1 / RES))]
        b = [min(c[0] for c in cs), min(c[1] for c in cs), max(c[0] for c in cs), max(c[1] for c in cs)]
        box = b if box is None else TT._union([box, b])
    return box if dst.sum() > before else box


def raster_vector(spec, hit, dst):
    from PIL import Image, ImageDraw
    n, M, l = hit[0], hit[1], hit[2]
    if not n.get("fill") and not (n.get("border") or {}).get("width"):
        return
    kf = n.get("keyframes") or {}
    W, H = TT._cv(spec, n)
    s = TT._cc(kf.get("scale"), l, n["transform"]["scale"]) * (W / 720.0)
    rot = TT._cc(kf.get("rotation"), l, n["transform"].get("rotation", 0))
    x = W / 2 + TT._cc(kf.get("x"), l, n["transform"]["x"]) * W / 2
    y = H / 2 - TT._cc(kf.get("y"), l, n["transform"]["y"]) * H / 2
    fwd = TT._mul(TT._mul(TT._mul(M, TT._tr(x, y)), TT._rot(rot) if rot else (1, 0, 0, 1, 0, 0)), TT._sc(s))
    pts = [TT._apply(fwd, px, -py) for px, py in n.get("points") or []]
    if len(pts) < 3:
        return
    Hh, Ww = dst.shape
    img = Image.new("L", (Ww, Hh), 0)
    ImageDraw.Draw(img).polygon([(px * RES, py * RES) for px, py in pts], fill=255)
    dst |= np.asarray(img) > 0


# ---------------------------------------------------------------------------
# 3. BO CUC
# ---------------------------------------------------------------------------
def _box_of(spec, dirp, hit, text, mult):
    """Khung DONG FONT (khong phai net) cua node — KHOP nodeBox cua TextTemplate."""
    n, M, l = hit[0], hit[1], hit[2]
    kf = n.get("keyframes") or {}
    W, H = TT._cv(spec, n)
    sc = TT._cc(kf.get("scale"), l, n["transform"]["scale"]) * mult
    lay = text_layout(spec, dirp, n, text, sc)
    if not lay:
        return None
    _runs, asc, desc, total = lay
    cx, cy = TT._apply(M, W / 2 + TT._cc(kf.get("x"), l, n["transform"]["x"]) * W / 2,
                       H / 2 - TT._cc(kf.get("y"), l, n["transform"]["y"]) * H / 2)
    s = math.hypot(M[0], M[1])
    return [cx - total * s / 2, cy - (asc + desc) * s / 2, cx + total * s / 2, cy + (asc + desc) * s / 2]


def _same_line(a, b):
    ha, hb = a[3] - a[1], b[3] - b[1]
    v = min(a[3], b[3]) - max(a[1], b[1])
    hov = min(a[2], b[2]) - max(a[0], b[0])
    gap = max(a[0], b[0]) - min(a[2], b[2])
    return (0.6 < ha / max(1e-6, hb) < 1.67 and v >= 0.5 * min(ha, hb) and hov < 0.35 * min(a[2] - a[0], b[2] - b[0])
            and gap < 1.2 * min(ha, hb))


def _rel(u, m):
    """Quan he cua khoi u voi khoi neo m (mau): (kieu ngang, lech), (kieu doc, lech). Khoi nam HAN ben phai / trai /
    duoi / tren khoi neo -> giu dung THU TU do (sau / truoc / duoi / tren + khe); con lai chon moc gan nhat (can trai /
    phai / giua, mep tren / duoi / giua) — chu that ngan / dai khong lam dao thu tu doc."""
    uw, mw, uh, mh = u[2] - u[0], m[2] - m[0], u[3] - u[1], m[3] - m[1]
    tol_x, tol_y = 0.15 * min(uw, mw), 0.15 * min(uh, mh)
    ucx, ucy = (u[0] + u[2]) / 2, (u[1] + u[3]) / 2
    # nam han / phan lon ben phai khoi neo (tam vuot 3/4 khoi neo, vd "ưu lại" canh chu cai lon "L") -> bam MEP PHAI cua
    # khoi neo: chu neo hep / rong di (L -> C) thi khoi nay di theo mep do, khong bam mep trai xa
    if u[0] >= m[2] - tol_x or (uw < 2.5 * mw and ucx >= m[2] - 0.25 * mw):
        hx = {"after": u[0] - m[2]}
    elif u[2] <= m[0] + tol_x or (uw < 2.5 * mw and ucx <= m[0] + 0.25 * mw):
        hx = {"before": u[2] - m[0]}
    else:
        hx = {"l": u[0] - m[0], "r": u[2] - m[2], "c": ucx - (m[0] + m[2]) / 2}
    if u[1] >= m[3] - tol_y or (uh < 2.5 * mh and ucy >= m[3] - 0.25 * mh):
        vy = {"below": u[1] - m[3]}
    elif u[3] <= m[1] + tol_y or (uh < 2.5 * mh and ucy <= m[1] + 0.25 * mh):
        vy = {"above": u[3] - m[1]}
    else:
        vy = {"t": u[1] - m[1], "b": u[3] - m[3], "c": ucy - (m[1] + m[3]) / 2}
    kx = min(hx, key=lambda k: abs(hx[k]))
    ky = min(vy, key=lambda k: abs(vy[k]))
    return (kx, hx[kx]), (ky, vy[ky])


def _tree(obox, root):
    """Cay neo = cay khung NHO NHAT theo khoang cach giua cac khoi (khe ngang + doc; hoa -> uu tien cap CUNG HANG, chong
    doc nhieu nhat): moi khoi neo vao khoi SAT no trong mau (vd "góc nhỏ" neo vao "Một" ben trai, khong neo vao dong duoi).
    Dat tu khoi chinh ra ngoai. Tra [(khoi, khoi neo)] theo thu tu dat."""
    keys = list(obox)

    def dist(a, b):
        A, B = obox[a], obox[b]
        hg = max(0.0, max(A[0], B[0]) - min(A[2], B[2]))
        vg = max(0.0, max(A[1], B[1]) - min(A[3], B[3]))
        mh = max(1e-6, min(A[3] - A[1], B[3] - B[1]))
        vo = max(0.0, min(A[3], B[3]) - max(A[1], B[1])) / mh
        ia = max(0.0, min(A[2], B[2]) - max(A[0], B[0])) * max(0.0, min(A[3], B[3]) - max(A[1], B[1]))
        small = max(1e-6, min((A[2] - A[0]) * (A[3] - A[1]), (B[2] - B[0]) * (B[3] - B[1])))
        # CHONG LEN NHAU (>= 15% khoi nho, vd chu ky de len chu dam) = gan nhat; CUNG HANG (chong doc >= 50%): khe ngang;
        # xep chong (hang tren / duoi): khe doc + nua dong — "góc nhỏ" canh "Một" (khe 9px) neo vao "Một", khong neo vao
        # dong duoi chi vi sat mep tren; "Sống lý tưởng" de len "không gian" neo vao "không gian"
        if ia / small >= 0.15:
            return (0.0, -1.0 - ia / small)
        return (hg if vo >= 0.5 else hg + vg + 0.5 * mh, -vo)

    comp = {k: k for k in keys}

    def find(k):
        while comp[k] != k:
            comp[k] = comp[comp[k]]
            k = comp[k]
        return k

    adj = {k: [] for k in keys}
    for a, b in sorted(((a, b) for i, a in enumerate(keys) for b in keys[i + 1:]), key=lambda e: dist(*e)):
        ra, rb = find(a), find(b)
        if ra != rb:
            comp[ra] = rb
            adj[a].append(b)
            adj[b].append(a)
    out, seen, queue = [], {root}, [root]
    while queue:
        p = queue.pop(0)
        for u in sorted(adj[p], key=lambda u: dist(u, p)):
            if u not in seen:
                seen.add(u)
                out.append((u, p))
                queue.append(u)
    return out


def _keep_order(obox, nbox, rank, k):
    """Giu THU TU cua mau giua MOI cap khoi (khong chi voi khoi neo): mau co A ben trai B CUNG HANG (theo tam) -> moi A
    van ben trai B; A tren B (chong ngang) -> moi A van tren B. Khe can giu = khe mau (am = muc chong co y cua mau), duong
    thi toi da 1/4 dong (giu thu tu, khong keo chu ngan dat ra xa). Sai -> dich khoi dat SAU (xa khoi chinh hon)."""
    keys = list(obox)
    for _ in range(6):
        moved = False
        for a in keys:
            for b in keys:
                if a == b:
                    continue
                A, B, nA, nB = obox[a], obox[b], nbox[a], nbox[b]
                mh = max(1e-6, min(A[3] - A[1], B[3] - B[1]))
                mw = max(1e-6, min(A[2] - A[0], B[2] - B[0]))
                vo = (min(A[3], B[3]) - max(A[1], B[1])) / mh
                ho = (min(A[2], B[2]) - max(A[0], B[0])) / mw
                mv = b if rank[b] > rank[a] else a
                kb = k.get(b, 1.0)
                if vo >= 0.5 and (A[0] + A[2]) < (B[0] + B[2]):           # A trai B, cung hang
                    g0 = B[0] - A[2]
                    need = g0 * kb if g0 <= 0 else min(g0 * kb, 0.25 * mh * kb)
                    d = nA[2] + need - nB[0]
                    if d > 0.5:
                        sh = d if mv == b else -d
                        nbox[mv] = [nbox[mv][0] + sh, nbox[mv][1], nbox[mv][2] + sh, nbox[mv][3]]
                        moved = True
                elif vo < 0.5 and ho >= 0.2 and (A[1] + A[3]) < (B[1] + B[3]):   # A tren B
                    g0 = B[1] - A[3]
                    need = g0 * kb if g0 <= 0 else min(g0 * kb, 0.25 * mh * kb)
                    d = nA[3] + need - nB[1]
                    if d > 0.5:
                        sh = d if mv == b else -d
                        nbox[mv] = [nbox[mv][0], nbox[mv][1] + sh, nbox[mv][2], nbox[mv][3] + sh]
                        moved = True
        if not moved:
            break


def _place(rel, m, w, h, k):
    """Dat khoi rong w cao h theo quan he rel voi khoi chinh MOI m (lech nhan k = ti le co cua chu chinh)."""
    (kx, dx), (ky, dy) = rel
    dx, dy = dx * k, dy * k
    if kx == "l":
        l = m[0] + dx
    elif kx == "r":
        l = m[2] + dx - w
    elif kx == "c":
        l = (m[0] + m[2]) / 2 + dx - w / 2
    elif kx == "after":
        l = m[2] + dx
    else:
        l = m[0] + dx - w
    if ky == "t":
        t = m[1] + dy
    elif ky == "b":
        t = m[3] + dy - h
    elif ky == "c":
        t = (m[1] + m[3]) / 2 + dy - h / 2
    elif ky == "below":
        t = m[3] + dy
    else:
        t = m[1] + dy - h
    return [l, t, l + w, t + h]


def _shift(mask, dx, dy):
    """Dich mat na (px mat na) — phan ra ngoai bi bo."""
    out = np.zeros_like(mask)
    H, W = mask.shape
    dx, dy = int(round(dx)), int(round(dy))
    xs0, xs1 = max(0, -dx), min(W, W - dx)
    ys0, ys1 = max(0, -dy), min(H, H - dy)
    if xs1 > xs0 and ys1 > ys0:
        out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = mask[ys0:ys1, xs0:xs1]
    return out


def _dilate(mask, r):
    """No mat na r px (o vuong) — khe toi thieu giua net 2 o."""
    r = int(round(r))
    if r <= 0:
        return mask
    out = mask.copy()
    for d in range(1, r + 1):
        out[d:, :] |= mask[:-d, :]
        out[:-d, :] |= mask[d:, :]
    m2 = out.copy()
    for d in range(1, r + 1):
        out[:, d:] |= m2[:, :-d]
        out[:, :-d] |= m2[:, d:]
    return out


def _times(spec, geo):
    """Cac thoi diem kiem de chu: khung day du nhat + giua doan hien cua tung o (o hien / tat so le)."""
    fps = int(spec.get("fps") or 30)
    nF = max(1, int(round(float(spec.get("duration") or 1) * fps)))
    sets = [{h[0]["slot"] for h in TT._hits(spec, f / float(fps))} for f in range(nF)]
    ts = [geo["t_star"]]
    for sid in {s["id"] for s in spec.get("slots") or []}:
        tt = TT._longest_mid([sid in s for s in sets], fps)
        if tt is not None and all(abs(tt - x) > 0.05 for x in ts):
            ts.append(tt)
    return ts


def layout(row, spec, texts, geo=None):
    """Bo cuc cuoi cung cua chu that trong mau. Tra:
    {"slots": {sid: {"scale", "dx", "dy"}}, "ink": [x0, y0, x1, y1] (khung mau, khoi net chu that o khung day du nhat),
     "ok": bool, "overlap": [(a, b, ti le chong)], "moves": [...], "v": LAYOUT_VERSION}."""
    geo = geo or TT.geometry(row, spec)
    dirp = geo["dir"]
    samples = {s["id"]: s.get("sample") or "" for s in spec.get("slots") or []}
    rooms = {s["id"]: float(s.get("room") or 1) for s in spec.get("slots") or []}
    txt = {sid: (texts.get(sid) if texts.get(sid) is not None else samples[sid]) for sid in samples}
    star = [h for h in visible(spec, geo["t_star"]) if h[0].get("type") == "text"]
    # --- 1) co chu tung o (KHOP computeFit buoc 1)
    scale = {}
    for sid, hit in geo["ref"].items():
        b0 = _box_of(spec, dirp, hit, samples[sid], 1.0)
        b1 = _box_of(spec, dirp, hit, txt[sid], 1.0)
        if not b0 or not b1 or txt[sid] == samples[sid]:
            scale[sid] = 1.0
            continue
        w0, w1 = b0[2] - b0[0], b1[2] - b1[0]
        tgt = min(1.0, rooms.get(sid, 1) * w0 / w1) if rooms.get(sid, 1) > 1 and w1 > w0 else w0 / max(1e-6, w1)
        scale[sid] = max(FIT_SHRINK_MIN, min(GROW_MAX, tgt)) if w1 > 0 else 1.0
    # --- 2) khoi cu / be ngang chu that o khung day du nhat
    old, raw = {}, {}
    for sid in {h[0]["slot"] for h in star}:
        hs = [h for h in star if h[0]["slot"] == sid]
        bs = [b for b in (_box_of(spec, dirp, h, samples[sid], 1.0) for h in hs) if b]
        ns = [b for b in (_box_of(spec, dirp, h, txt[sid], 1.0) for h in hs) if b]
        if bs and ns:
            old[sid] = TT._union(bs)
            raw[sid] = max(b[2] - b[0] for b in ns)
    ids = sorted(old, key=lambda s: (old[s][1], old[s][0]))
    # dong chu: cac o canh nhau cung co chu chia chung be ngang (KHOP computeFit)
    lines, seen = [], set()
    for sid in ids:
        if sid in seen:
            continue
        comp = [sid]
        for x in comp:
            for o in ids:
                if o not in comp and _same_line(old[x], old[o]):
                    comp.append(o)
        comp.sort(key=lambda s: old[s][0])
        seen |= set(comp)
        lines.append(comp)
    # khoi tung dong: be ngang moi + vi tri tung o trong dong (tinh tu mep trai dong)
    unit_w, unit_h, inner = {}, {}, {}
    for ln in lines:
        key = tuple(ln)
        if len(ln) > 1:
            span0 = old[ln[-1]][2] - old[ln[0]][0]
            gaps = [old[b][0] - old[a][2] for a, b in zip(ln, ln[1:])]
            need = sum(raw[s] for s in ln) + sum(gaps)
            s = max(FIT_SHRINK_MIN, min(GROW_MAX, span0 / need)) if need > 0 else 1.0
            x, pos = 0.0, {}
            for i, sid in enumerate(ln):
                scale[sid] = s
                pos[sid] = (x, s * raw[sid])
                x += s * raw[sid] + (s * gaps[i] if i < len(gaps) else 0)
            unit_w[key] = x
        else:
            sid = ln[0]
            unit_w[key] = raw[sid] * scale.get(sid, 1.0)
            pos = {sid: (0.0, unit_w[key])}
        inner[key] = pos
        ob = TT._union([old[s] for s in ln])
        # chieu cao dong theo co chu (cac o cung dong cung co)
        unit_h[key] = (ob[3] - ob[1]) * scale.get(ln[0], 1.0)
    obox = {tuple(ln): TT._union([old[s] for s in ln]) for ln in lines}
    # --- 3) bo cuc theo quan he: khoi chinh (lon nhat o mau) giu tam; moi khoi khac neo vao khoi GAN NHAT da dat
    main = max(obox, key=lambda k: (obox[k][2] - obox[k][0]) * (obox[k][3] - obox[k][1])) if obox else None
    nbox = {}
    if main:
        mo = obox[main]
        mcx, mcy = (mo[0] + mo[2]) / 2, (mo[1] + mo[3]) / 2
        nbox[main] = [mcx - unit_w[main] / 2, mcy - unit_h[main] / 2, mcx + unit_w[main] / 2, mcy + unit_h[main] / 2]
        order = _tree(obox, main)
        for key, par in order:
            nbox[key] = _place(_rel(obox[key], obox[par]), nbox[par], unit_w[key], unit_h[key], scale.get(par[0], 1.0))
        rank = {main: 0}
        rank.update({key: i + 1 for i, (key, _p) in enumerate(order)})
        _keep_order(obox, nbox, rank, {key: scale.get(key[0], 1.0) for key in obox})
    center = {}
    for key, b in nbox.items():
        for sid, (x, w) in inner[key].items():
            center[sid] = (b[0] + x + w / 2, (b[1] + b[3]) / 2)
    # --- 4) mat na net chu tung o (o vi tri moi) + vat can; go de
    shape = _frame_shape(spec)
    unit_of = {sid: key for key in nbox for sid in key}
    deco = _deco_units(spec, geo, star)

    def off(sid):
        ob = old[sid]
        return center[sid][0] - (ob[0] + ob[2]) / 2, center[sid][1] - (ob[1] + ob[3]) / 2

    # CAC THOI DIEM KIEM: khung day du nhat (0) + giua doan hien cua tung o (mau chu noi tiep: o vao / ra so le)
    frames = [star] + [[h for h in visible(spec, t) if h[0].get("type") == "text"] for t in _times(spec, geo)[1:]]
    hits_at = [{sid: [h for h in fr if h[0]["slot"] == sid] for sid in old} for fr in frames]
    solid_at = [{h[0]["slot"] for h in fr if h[4] >= SOLID} & set(old) for fr in frames]

    def raster(sid, f=1.0, sample=False, ti=0):
        """(mat na, [chu cai]) cua o o vi tri CU (chua dich) luc frames[ti], co = co fit x f (mau: chu mau, co goc)."""
        m, gl = np.zeros(shape, bool), []
        for h in hits_at[ti].get(sid) or []:
            raster_text(spec, dirp, h, samples[sid] if sample else txt[sid],
                        1.0 if sample else scale.get(sid, 1.0) * f, m, gl)
        return m, gl

    _ink, _dil = {}, {}

    def ink(sid, f, ti=0):
        k = (sid, round(f, 3), ti)
        if k not in _ink:
            _ink[k] = raster(sid, f, ti=ti)
        return _ink[k]

    def ink_dil(sid, f, r, ti=0):
        """Mat na o (vi tri cu) NO r px — dich bang _shift (khong no lai moi lan thu)."""
        k = (sid, round(f, 3), int(round(r)), ti)
        if k not in _dil:
            _dil[k] = _dilate(ink(sid, f, ti)[0], r)
        return _dil[k]

    samp_at = [{sid: raster(sid, sample=True, ti=ti) for sid in old} for ti in range(len(frames))]
    samp = samp_at[0]
    deco_mask = {}
    for key_s, hits in deco.items():
        m = np.zeros(shape, bool)
        for h in hits:
            raster_vector(spec, h, m)
        deco_mask[key_s] = m
    extra = {sid: [0.0, 0.0, 1.0] for sid in old}             # dich them (px mau) + thu nho them khi go de
    line_h = {sid: (old[sid][3] - old[sid][1]) * scale.get(sid, 1.0) for sid in old}
    line_h0 = {sid: old[sid][3] - old[sid][1] for sid in old}

    def pos(sid, ex=None):
        dx, dy = off(sid)
        ex = ex or extra[sid]
        return (dx + ex[0]) * RES, (dy + ex[1]) * RES

    def clear_r(a, b, h=None):
        h = h or line_h
        return CLEAR * min(h[a], h[b]) * RES

    def deco_at(owner, ex=None):
        m = deco_mask.get(owner)
        if m is None or not m.any():
            return None
        return _shift(m, *pos(owner, ex))

    free = deco_mask.get(None)
    if free is not None and not free.any():
        free = None
    # NGUONG tung chieu (chu cai cua a bi net b che): bang muc che O CHINH MAU (cung cach do), kep [G_TOL, G_CAP]
    allow = {}
    for ti in range(len(frames)):
        for a in solid_at[ti]:
            for b in solid_at[ti]:
                if a != b:
                    v0 = gcov(samp_at[ti][a][1], (0, 0), _dilate(samp_at[ti][b][0], clear_r(a, b, line_h0)))
                    allow[(a, b, ti)] = max(G_TOL, min(v0, G_CAP))
    for a in ids:
        if free is not None:
            allow[(a, None)] = max(G_TOL, min(gcov(samp[a][1], (0, 0), free), G_CAP))
        for o in old:
            if o != a and deco_mask.get(o) is not None and deco_mask[o].any():
                allow[(a, "deco:" + o)] = max(G_TOL, min(gcov(samp[a][1], (0, 0), deco_mask[o]), G_CAP))

    def check(sid_set, trial=None):
        """Vi pham cua cac o trong sid_set (ca 2 chieu voi moi o khac + hop / hinh). trial: {sid: [dx, dy, f]} thu."""
        tr = trial or {}

        def ex_of(s):
            return tr.get(s, extra[s])

        out = []
        for ti, sol in enumerate(solid_at):
            for a in sol:
                for b in sol:
                    if a == b or (a not in sid_set and b not in sid_set):
                        continue
                    if a in sid_set and b in sid_set and unit_of.get(a) == unit_of.get(b) and len(unit_of.get(a)) > 1:
                        continue                           # cung dong: khe da xep theo mau
                    ea, eb = ex_of(a), ex_of(b)
                    other = _shift(ink_dil(b, eb[2], clear_r(a, b), ti), *pos(b, eb))
                    v = gcov(ink(a, ea[2], ti)[1], pos(a, ea), other)
                    if v > allow[(a, b, ti)] + 1e-3:
                        out.append((a, b, v))
        for a in sid_set:
            ea = ex_of(a)
            gl, pa = ink(a, ea[2])[1], pos(a, ea)
            if free is not None:
                v = gcov(gl, pa, free)
                if v > allow[(a, None)] + 1e-3:
                    out.append((a, None, v))
            for o in old:
                if o == a or ("deco:" + o) not in {k[1] for k in allow if k[0] == a}:
                    continue
                dm = deco_at(o, ex_of(o))
                if dm is not None:
                    v = gcov(gl, pa, dm)
                    if v > allow[(a, "deco:" + o)] + 1e-3:
                        out.append((a, "deco:" + o, v))
        return out

    def in_frame(sid, ex):
        m = ink(sid, ex[2])[0]
        ys, xs = np.nonzero(m)
        if not len(ys):
            return True
        dx, dy = pos(sid, ex)
        Hh, Ww = shape
        return xs.min() + dx >= 2 and ys.min() + dy >= 2 and xs.max() + dx <= Ww - 3 and ys.max() + dy <= Hh - 3

    def resolve(mover):
        """Dich (ca dong cua o) + thu nho it nhat de het vi pham cua dong do. None neu khong co."""
        group = unit_of.get(mover) or (mover,)
        lh = max(line_h[s] for s in group)
        steps = [i * 0.06 for i in range(0, int(MOVE_MAX / 0.06) + 1)]
        dirs = [(0, -1), (0, 1), (-1, 0), (1, 0), (-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7), (0.7, 0.7)]
        best = None
        for f in (1.0, 0.92, 0.85, 0.78, MAX_SHRINK):
            for st in steps:
                cost = st + (1.0 - f) * 2.2
                if best and cost >= best[3]:
                    break
                for ddx, ddy in (dirs if st else [(0, 0)]):
                    d = (ddx * st * lh, ddy * st * lh)
                    trial = {s: [extra[s][0] + d[0], extra[s][1] + d[1], extra[s][2] * (f if s == mover else 1.0)]
                             for s in group}
                    if all(in_frame(s, trial[s]) for s in group) and not check(set(group), trial):
                        best = (d[0], d[1], extra[mover][2] * f, cost)
                        break
                if best and best[3] <= cost:
                    break
        return best

    moves = []
    for _it in range(12):
        bad = check(set(old))
        if not bad:
            break
        a, b, v = max(bad, key=lambda x: x[2])
        # o phai dich: o NHO hon (khong phai khoi chinh); hop / hinh -> dich o chu
        cand = [a] if b is None or str(b).startswith("deco:") else [a, b]
        cand = [s for s in cand if unit_of.get(s) != main] or cand
        mover = min(cand, key=lambda s: ink(s, extra[s][2])[0].sum())
        best = resolve(mover)
        if not best and len(cand) > 1:
            mover = [s for s in cand if s != mover][0]
            best = resolve(mover)
        if not best:
            break
        moves.append({"o": mover, "dx": round(best[0], 1), "dy": round(best[1], 1), "co": round(best[2], 3),
                      "vi": round(v, 3)})
        for s in (unit_of.get(mover) or (mover,)):
            extra[s][0] += best[0]
            extra[s][1] += best[1]
        extra[mover][2] = best[2]
    bad = check(set(old))
    ms = {sid: _shift(ink(sid, extra[sid][2])[0], *pos(sid)) for sid in old}
    samp_mask = {sid: samp[sid][0] for sid in old}
    # --- 5) ca to hop ve tam khoi net chu cua mau
    def bbox(m):
        ys, xs = np.nonzero(m)
        if not len(ys):
            return None
        return [xs.min() / RES, ys.min() / RES, (xs.max() + 1) / RES, (ys.max() + 1) / RES]

    u_new = np.zeros(shape, bool)
    for sid in old:
        u_new |= ms[sid]
    u_old = np.zeros(shape, bool)
    for sid in old:
        u_old |= samp_mask[sid]
    bn, bo = bbox(u_new), bbox(u_old)
    sx = sy = 0.0
    if bn and bo:
        sx = (bo[0] + bo[2]) / 2 - (bn[0] + bn[2]) / 2
        sy = (bo[1] + bo[3]) / 2 - (bn[1] + bn[3]) / 2
    out = {}
    for sid in samples:
        if sid in old:
            dx, dy = off(sid)
            out[sid] = {"scale": round(float(scale.get(sid, 1.0) * extra[sid][2]), 4),
                        "dx": round(float(dx + extra[sid][0] + sx), 2), "dy": round(float(dy + extra[sid][1] + sy), 2)}
        else:
            out[sid] = {"scale": round(float(scale.get(sid, 1.0)), 4), "dx": 0.0, "dy": 0.0}
    ink = [bn[0] + sx, bn[1] + sy, bn[2] + sx, bn[3] + sy] if bn else geo["box"]
    # o hien o thoi diem khac (khong o khung day du nhat): kiem de voi cac o dang hien luc do
    late = _late_overlaps(spec, dirp, geo, txt, out, samples)
    return {"slots": out, "ink": [round(float(v), 1) for v in ink], "ok": bool(not bad and not late),
            "overlap": [(a, b, round(float(v), 3)) for a, b, v in bad] + late, "moves": moves, "v": LAYOUT_VERSION}


def _deco_units(spec, geo, star):
    """Hinh vector dang hien o khung day du nhat: {slot: [hits]} (cung group voi DUNG 1 o chu -> di theo o do) /
    {None: [hits]} (khong thuoc o nao -> vat can co dinh)."""
    out = {}
    for h in visible(spec, geo["t_star"]):
        n, kids = h[0], h[3]
        if n.get("type") != "vector":
            continue
        slots = {k.get("slot") for k in kids if k.get("type") == "text"}
        owner = next(iter(slots)) if len(slots) == 1 else None
        out.setdefault(owner, []).append(h)
    return out


def gcov(glyphs, sh, other):
    """Ti le net CHU CAI bi che nhieu nhat: moi chu cai (x0, y0, mat na) dich sh (px mat na) — phan net nam trong `other`
    / net chu cai do. 0 = khong chu cai nao bi cham."""
    best = 0.0
    dx, dy = int(round(sh[0])), int(round(sh[1]))
    H, W = other.shape
    for x0, y0, a in glyphs:
        h, w = a.shape
        X0, Y0 = x0 + dx, y0 + dy
        xa, ya, xb, yb = max(0, X0), max(0, Y0), min(W, X0 + w), min(H, Y0 + h)
        if xb <= xa or yb <= ya:
            continue
        n = a.sum()
        if not n:
            continue
        hit = (a[ya - Y0:yb - Y0, xa - X0:xb - X0] & other[ya:yb, xa:xb]).sum()
        if hit:
            best = max(best, float(hit) / float(n))
    return best


def _late_overlaps(spec, dirp, geo, txt, out, samples):
    """O khong hien o khung day du nhat (hien truoc / sau): kiem de voi o khac dang hien luc giua doan cua no."""
    res = []
    star_slots = {h[0]["slot"] for h in TT._hits(spec, geo["t_star"])}
    shape = _frame_shape(spec)
    for t in _times(spec, geo)[1:]:
        hits = [h for h in visible(spec, t) if h[0].get("type") == "text" and h[4] >= SOLID]
        slots = sorted({h[0]["slot"] for h in hits})
        if not (set(slots) - star_slots) or len(slots) < 2:
            continue
        ms, m0, g1, g0 = {}, {}, {}, {}
        for sid in slots:
            m, z, gl, gz = np.zeros(shape, bool), np.zeros(shape, bool), [], []
            for h in [x for x in hits if x[0]["slot"] == sid]:
                raster_text(spec, dirp, h, txt[sid], out[sid]["scale"], m, gl)
                raster_text(spec, dirp, h, samples[sid], 1.0, z, gz)
            sh = (out[sid]["dx"] * RES, out[sid]["dy"] * RES)
            ms[sid], m0[sid], g1[sid], g0[sid] = _shift(m, *sh), z, (gl, sh), gz
        for a in slots:
            for b in slots:
                if a != b:
                    v = gcov(g1[a][0], g1[a][1], ms[b])
                    if v > max(G_TOL, min(gcov(g0[a], (0, 0), m0[b]), G_CAP)) + 0.01:
                        res.append((a, b, round(v, 3)))
    return res
