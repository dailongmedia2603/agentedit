#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BRAND GUIDELINE (2026-10-01, khong bat buoc) — nguoi dung nhap o menu Tao video, gom 5 truong:
  typography (Font & chu) | colors (Mau sac) | graphics (Ngon ngu do hoa) | imagery (Phong cach hinh anh) |
  motion (Ngon ngu chuyen dong).

Moi truong vao DUNG buoc AI can no (STEP_FIELDS) — yeu cau user:
  - Typography + Mau      -> chu anh AI, phu de (R5) + ke hoach (R4) de chu hien theo loi noi dung font / mau.
  - Mau / Do hoa / Anh    -> chu anh AI, anh AI, ke hoach (R4).
  - Chuyen dong           -> ke hoach: R4 (chuyen canh, vao / ra cua lop) + hieu ung tu viet (FX-plan / FX-code / hook).
Va EP BANG CODE (AI quen van dung): font co trong danh muc app duoc nhac trong Typography -> moi chu dung font do
(`enforce_plan`); ma mau (#hex / rgb) trong Mau sac -> moi mau NOI (co sac do) trong plan / spec / khung hieu ung
duoc dua ve mau thuong hieu gan nhat; mau TRUNG TINH (trang / den / xam — vien, bong cho chu de doc) giu nguyen.

Brand Guideline la yeu cau RO RANG cua nguoi dung cho du an nay -> UU TIEN hon phong cach boc tu video mau o 5 mat
tren (khong phai "phong cach mac dinh" — chi nam trong plan cua du an do, xem memory capcut-style-only-from-reference).
"""
import copy
import re
import unicodedata

FIELDS = ("typography", "colors", "graphics", "imagery", "motion")
LABELS = {"typography": "Typography - Font & chu", "colors": "Mau sac", "graphics": "Ngon ngu do hoa",
          "imagery": "Phong cach hinh anh", "motion": "Ngon ngu chuyen dong"}
MAX_CHARS = 800

# buoc -> cac truong duoc dua vao (thu tu = thu tu hien trong prompt)
STEP_FIELDS = {
    "plan": FIELDS,                                            # R4 thiet ke / R4-visual du phong
    "captions": ("typography", "colors"),                      # R5 phu de theo loi noi
    "text_art": ("typography", "colors", "graphics", "imagery"),  # chu anh AI (Codex)
    "image": ("colors", "graphics", "imagery"),                # anh AI (Codex)
    "fx": ("motion", "colors", "graphics"),                    # FX-plan / FX-code / Hook-FX
}

_HOW = {
    "plan": ("- Typography: lop chu / to hop chu / chu hero chi dung font thuong hieu (id trong danh muc ben duoi); "
             "kieu chu (hoa / thuong, dam, nghieng, phan cap) theo mo ta.\n"
             "- Mau sac: palette trong \"style\", mau chu / vien / glow / khung / nen the / nen scene CHI lay tu he mau "
             "thuong hieu (+ trang / den / xam de tach nen cho chu de doc).\n"
             "- Ngon ngu do hoa: hinh khoi, khung, the, mui ten, vong, sticker, hoa van theo dung mo ta.\n"
             "- Phong cach hinh anh: \"style.image_style\" va prompt moi anh AI (assets) theo dung mo ta.\n"
             "- Ngon ngu chuyen dong: enter / exit / loop cua lop, chuyen canh (transitions, hook_transition), camera "
             "theo dung mo ta (vd 'mem, khong rung' -> khong shake / glitch / flash gat)."),
    "captions": ("- Phu de + chu hero: font_body / font_hero / font tung caption chi dung font thuong hieu (id trong "
                 "danh muc); kieu chu (hoa / thuong, dam) theo mo ta.\n"
                 "- Mau: accent / mau nhan chi lay tu he mau thuong hieu (chu thuong van trang / den de doc ro)."),
    "text_art": ("- Kieu chu (font, do dam, hoa / thuong, nghieng) giong mo ta Typography nhat co the.\n"
                 "- Mau chu / vien / bong / hieu ung chu CHI dung he mau thuong hieu.\n"
                 "- Vien, khoi, trang tri quanh chu theo Ngon ngu do hoa; chat lieu / anh sang theo Phong cach hinh anh."),
    "image": ("- Tong mau anh hai hoa voi he mau thuong hieu (mau nhan dung mau thuong hieu).\n"
              "- Hinh khoi / bo cuc / trang tri theo Ngon ngu do hoa; chat lieu, anh sang, kieu anh theo Phong cach hinh anh."),
    "fx": ("- Toc do, easing, nhip, do manh, kieu vao / ra cua hieu ung theo Ngon ngu chuyen dong (vd 'mem, khong "
           "rung' -> khong rung / loe / glitch gat).\n"
           "- Mau cua lop hinh tu ve CHI lay tu he mau thuong hieu (ctx.palette) + trang / den.\n"
           "- Hinh khoi, net, kieu trang tri theo Ngon ngu do hoa."),
}


# ---------------------------------------------------------------------------
# Chuan hoa + doc
# ---------------------------------------------------------------------------
def normalize(raw):
    """dict nguoi dung nhap -> {truong: chu} (bo trong, gon khoang trang, cat MAX_CHARS). Khong co gi -> None."""
    if not isinstance(raw, dict):
        return None
    out = {}
    for k in FIELDS:
        v = raw.get(k)
        if isinstance(v, str):
            v = " ".join(v.split())[:MAX_CHARS]
            if v:
                out[k] = v
    return out or None


def view(bg, step):
    """Phan Brand Guideline cua MOT buoc (dua vao payload + khoa cache). None = buoc nay khong co gi."""
    bg = normalize(bg)
    if not bg:
        return None
    out = {k: bg[k] for k in STEP_FIELDS.get(step, FIELDS) if bg.get(k)}
    if not out:
        return None
    if "typography" in out:
        f = fonts(bg)
        if f:
            out["font_trong_danh_muc"] = f
    if "colors" in out:
        h = hexes(bg)
        if h:
            out["ma_mau"] = h
    return out


def rule_text(bg, step):
    """Doan luat noi vao SYSTEM prompt cua buoc (code noi them — ke ca khi user da sua prompt mac dinh)."""
    v = view(bg, step)
    if not v:
        return ""
    rows = ["%s: %s" % (LABELS[k], v[k]) for k in STEP_FIELDS.get(step, FIELDS) if v.get(k)]
    extra = []
    if v.get("font_trong_danh_muc"):
        extra.append("Font thuong hieu co trong app (id): %s — dung DUNG cac id nay." % ", ".join(v["font_trong_danh_muc"]))
    elif v.get("typography") and step in ("plan", "captions"):
        extra.append("Font ten trong Typography khong co trong app -> chon font trong danh muc GAN NHAT voi mo ta.")
    if v.get("ma_mau"):
        extra.append("He mau thuong hieu (ma): %s." % ", ".join(v["ma_mau"]))
    return ("\n\n# BRAND GUIDELINE CUA KHACH HANG (BAT BUOC — uu tien hon phong cach video mau / tu chon o cac mat nay)\n"
            + "\n".join("- " + r for r in rows) + ("\n" + "\n".join("- " + e for e in extra) if extra else "")
            + "\n# AP DUNG\n" + _HOW.get(step, _HOW["plan"]) + "\n")


def _plain(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    return " " + " ".join(re.findall(r"[a-z0-9]+", s)) + " "


def fonts(bg):
    """Font trong DANH MUC app duoc nhac ten trong Typography, theo thu tu xuat hien (font dau = tieu de)."""
    bg = normalize(bg) or {}
    txt = _plain(bg.get("typography"))
    if not txt.strip():
        return []
    import remotion_plan as RP
    hits = []
    for f in RP.load_catalog().get("fonts") or []:
        names = {_plain(f.get("family")), _plain(f.get("label")), _plain(str(f.get("id", "")).replace("_", " "))}
        names |= {_plain(n.replace("svn ", "")) for n in names}
        pos = [txt.find(n) for n in names if n.strip() and txt.find(n) >= 0]
        if pos:
            hits.append((min(pos), f["id"]))
    return [i for _p, i in sorted(hits)]


_HEX = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])")
_RGB = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+%?))?\s*\)", re.I)


def hexes(bg):
    """Ma mau trong truong Mau sac (#hex / rgb()) -> ['#RRGGBB'...] theo thu tu, khong trung."""
    bg = normalize(bg) or {}
    txt = bg.get("colors") or ""
    found = []
    for m in re.finditer(r"%s|%s" % (_HEX.pattern, _RGB.pattern), txt, re.I):
        c = _parse(m.group(0))
        if c:
            h = "#%02X%02X%02X" % c[:3]
            if h not in found:
                found.append(h)
    return found


# ---------------------------------------------------------------------------
# Mau
# ---------------------------------------------------------------------------
def _parse(s):
    """'#rgb' / '#rrggbb' / '#rrggbbaa' / 'rgb(a)(...)' -> (r, g, b, alpha|None, kieu) hoac None."""
    if not isinstance(s, str):
        return None
    t = s.strip()
    m = re.fullmatch(_HEX.pattern, t)
    if m:
        h = t[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255.0 if len(h) == 8 else None
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a, "hex"
    m = _RGB.fullmatch(t)
    if m:
        r, g, b = (min(255, int(x)) for x in m.group(1, 2, 3))
        a = m.group(4)
        if a is not None:
            a = float(a[:-1]) / 100.0 if a.endswith("%") else float(a)
        return r, g, b, a, "rgb"
    return None


def _neutral(c):
    """Trang / den / xam (it sac do) — vien, bong, nen tach chu: luon duoc phep."""
    r, g, b = c[:3]
    return max(r, g, b) - min(r, g, b) < 36


def _dist(a, b):
    """Khoang cach mau 'redmean' (gan voi cam nhan hon RGB thuong)."""
    rm = (a[0] + b[0]) / 2.0
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    return ((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) ** 0.5


KEEP_DIST = 60        # sac do gan mau thuong hieu (sang / toi hon chut) -> giu (gradient 2 tong cua cung 1 mau)


def snap(value, brand):
    """Mot gia tri mau -> mau thuong hieu gan nhat neu no la mau NOI khong thuoc he mau thuong hieu. Giu alpha + kieu."""
    c = _parse(value)
    if not c or not brand or _neutral(c):
        return value
    pal = [_parse(h) for h in brand]
    chroma = [p for p in pal if p and not _neutral(p)] or [p for p in pal if p]
    if not chroma:
        return value
    best = min(chroma, key=lambda p: _dist(c, p))
    if _dist(c, best) <= KEEP_DIST:
        return value
    r, g, b = best[:3]
    if c[3] is None:
        return "#%02X%02X%02X" % (r, g, b)
    if c[4] == "hex":
        return "#%02X%02X%02X%02X" % (r, g, b, int(round(c[3] * 255)))
    return "rgba(%d,%d,%d,%s)" % (r, g, b, ("%.3f" % c[3]).rstrip("0").rstrip("."))


_SKIP_KEYS = {"text", "label", "value", "id", "name", "why", "prompt", "illustrates", "path", "file", "src", "asset",
              "source_id", "type", "kind", "anchor", "group", "words", "style", "font", "role", "mood", "image_style",
              "broll_style", "density", "note", "layouts_note", "_nguon"}
_FONT_KEYS = {"font", "font_body", "font_hero"}


def _walk(obj, fn_color, fn_font, path=()):
    """Duyet de quy: chuoi la MA MAU (o khoa khong phai noi dung) -> fn_color; khoa font -> fn_font."""
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if k in _FONT_KEYS and isinstance(v, str):
                nv = fn_font(v, k, obj, path)
                if nv != v:
                    obj[k] = nv
            elif isinstance(v, str):
                if k not in _SKIP_KEYS or (k == "text" and path and path[-1] == "palette"):
                    nv = fn_color(v)
                    if nv != v:
                        obj[k] = nv
            else:
                _walk(v, fn_color, fn_font, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, str):
                if path and path[-1] not in ("words", "emphasis", "spans_text"):
                    nv = fn_color(v)
                    if nv != v:
                        obj[i] = nv
            else:
                _walk(v, fn_color, fn_font, path)


# ---------------------------------------------------------------------------
# Font
# ---------------------------------------------------------------------------
def _font_for(old, key, ctx, brand_fonts):
    """Font thay the: font dau = tieu de / chu nhan; font cuoi = noi dung / phu de."""
    if not brand_fonts or old in brand_fonts:
        return old
    import remotion_plan as RP
    roles = set((RP._by_id("fonts").get(old) or {}).get("roles") or [])
    body = key == "font_body" or (isinstance(ctx, dict) and ctx.get("role") in ("support", "micro")) \
        or (roles and "hero" not in roles)
    return brand_fonts[-1] if body else brand_fonts[0]


# ---------------------------------------------------------------------------
# Ap vao bo phong cach / plan / spec
# ---------------------------------------------------------------------------
def apply_kit(kit, bg):
    """Bo phong cach cua PHIEN (video mau / R4 tu dat) + Brand Guideline -> bo moi (khong sua kit truyen vao):
    palette ve he mau thuong hieu, font theo vai = font thuong hieu, kieu anh minh hoa kem Phong cach hinh anh."""
    bg = normalize(bg)
    if not bg:
        return kit
    out = copy.deepcopy(kit) if isinstance(kit, dict) else {"_nguon": "brand_guideline"}
    hs, fs = hexes(bg), fonts(bg)
    if hs:
        pal = out.get("palette") if isinstance(out.get("palette"), dict) else {}
        chroma = [h for h in hs if not _neutral(_parse(h))] or hs
        base = {"primary": chroma[0], "accent": chroma[1 % len(chroma)], "highlight": chroma[2 % len(chroma)]}
        for k, v in base.items():
            pal.setdefault(k, v)
        _walk(pal, lambda v: snap(v, hs), lambda v, *a: v, ("palette",))
        if not isinstance(pal.get("bg_gradient"), list) or len(pal["bg_gradient"]) < 2:
            pal["bg_gradient"] = [chroma[0], chroma[1 % len(chroma)]]
        out["palette"] = pal
    if fs:
        fonts_ = out.get("fonts") if isinstance(out.get("fonts"), dict) else {}
        fonts_.update({"impact": fs[0], "support": fs[-1], "body": fs[-1]})
        out["fonts"] = fonts_
        if isinstance(out.get("subtitle"), dict):
            out["subtitle"]["font"] = fs[-1]
    if bg.get("imagery"):
        old = str(out.get("broll_style") or "")
        if bg["imagery"] not in old:          # da co (ap lai lan 2) -> giu nguyen, khong mat ghi chu cu
            out["broll_style"] = (bg["imagery"] + ((" | " + old) if old else ""))[:500]
    out["brand_guideline"] = {k: bg[k] for k in FIELDS if bg.get(k)}
    return out


def enforce_plan(p, changes=None):
    """EP font + ma mau thuong hieu len plan (ban sao trong build_spec, TRUOC khi dung lop chu / do vi tri) — layers,
    scenes, caption_theme, captions, style_kit. Ham on dinh: chay lai khong doi."""
    bg = normalize(p.get("brand_guide"))
    if not bg:
        return
    hs, fs = hexes(bg), fonts(bg)
    if not hs and not fs:
        return
    n = {"mau": 0, "font": 0}

    def fc(v):
        nv = snap(v, hs) if hs else v
        if nv != v:
            n["mau"] += 1
        return nv

    def ff(v, key, ctx, path):
        nv = _font_for(v, key, ctx, fs)
        if nv != v:
            n["font"] += 1
        return nv

    for key in ("layers", "scenes", "caption_theme", "captions", "style_kit"):
        if p.get(key):
            _walk(p[key], fc, ff, (key,))
    if fs:
        th = p.get("caption_theme") if isinstance(p.get("caption_theme"), dict) else {}
        for k, f in (("font_hero", fs[0]), ("font_body", fs[-1])):
            if th.get(k) not in fs:
                th[k] = f
                n["font"] += 1
        p["caption_theme"] = th
        for L in p.get("layers") or []:          # lop chu khong khai font -> font thuong hieu (khong de mac dinh)
            if isinstance(L, dict) and L.get("type") in ("text", "counter", "badge") and not L.get("font"):
                L["font"] = fs[0]
    if hs:
        th = p.get("caption_theme") if isinstance(p.get("caption_theme"), dict) else {}
        if not th.get("accent"):
            chroma = [h for h in hs if not _neutral(_parse(h))]
            if chroma:
                th["accent"] = chroma[0]
                p["caption_theme"] = th
    if changes is not None and (n["mau"] or n["font"]):
        changes.append("brand guideline: %d mau -> he mau thuong hieu, %d font -> font thuong hieu" % (n["mau"], n["font"]))


def enforce_spec(spec, bg, changes=None):
    """Luot cuoi tren SPEC (sau khi code tu them mau: lop tach chu, nen the...): mau NOI ve he mau thuong hieu.
    Mau trung tinh (vien / bong cho de doc) giu nguyen -> khong pha do tuong phan."""
    hs = hexes(bg)
    if not hs:
        return
    n = [0]

    def fc(v):
        nv = snap(v, hs)
        if nv != v:
            n[0] += 1
        return nv

    for key in ("layers", "captions", "scenes"):
        if spec.get(key):
            _walk(spec[key], fc, lambda v, *a: v, (key,))
    if n[0] and changes is not None:
        changes.append("brand guideline: %d mau trong ban dung -> he mau thuong hieu" % n[0])


_SVG_COLOR = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])|rgba?\([^)]*\)")


def snap_svg(text, brand):
    """Chuoi SVG / HTML da ve san (hieu ung tu viet) -> mau noi ve he mau thuong hieu."""
    if not brand or not isinstance(text, str):
        return text
    return _SVG_COLOR.sub(lambda m: snap(m.group(0), brand), text)


def report(bg):
    """Dong nhat ky: Brand Guideline dung o dau + font / mau nhan ra duoc."""
    bg = normalize(bg)
    if not bg:
        return None
    fs, hs = fonts(bg), hexes(bg)
    parts = ["%s" % LABELS[k] for k in FIELDS if bg.get(k)]
    s = "Brand Guideline: %s" % ", ".join(parts)
    if bg.get("typography"):
        s += " · font có trong app: %s" % (", ".join(fs) if fs else "không thấy tên font nào trong app — AI chọn font gần nhất theo mô tả")
    if bg.get("colors"):
        s += " · mã màu: %s" % (", ".join(hs) if hs else "không có mã #hex — AI theo mô tả màu (code không ép được màu)")
    return s
