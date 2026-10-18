#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO SHOT & MOTION (2026-10-18, user: "lay TOAN BO kho shot & motion cua video-shotcraft, buoc plan doc duoc toan bo
kho de chon dung mau cho tung phan cua video; khi phu hop thi co Full-screen B-roll").

Kho: 150 mau Remotion cua video-shotcraft (Apache-2.0, github.com/Vincentwei1021/video-shotcraft), port vao
remotion-src/shotcraft/ (moi mau nhan chu THAT cua video qua o chu, anh B-roll qua o anh, tu bo cuc khung doc 9:16).
Mo ta tung mau (tieng Viet: trong thay gi / dung khi / mo rong / o chu / o anh / do dai...) nam o
references/shotcraft_catalog.json — sinh boi scripts/shotcraft-sync.mjs tu <Component>.meta.json canh tung mau.
Mo ta do GEMINI XEM video xem truoc (references/shot_previews/<id>.mp4, scripts/shotcraft-previews.mjs) roi viet
(scripts/shotcraft-label.py -> label() o day; user 2026-10-18: chi ghi "dung khi / phu hop" + huong MO RONG khi tuy bien,
khong ghi "tranh khi"). Tab "Kho shot" (Tai nguyen) xem preview + tat / bat tung mau (shot_prefs.json).

Luong:
  R4 (motion_design.gpt_rm_design) nhan TOAN BO danh muc (prompt_block) + luat dung (rules_text) -> scene co "shot":
      {"layout": "graphic", "shot": {"id", "texts": {o: chu loi noi}, "images": {o: asset id | {source_id, src_time}},
       "brand_name"?}, src_start / src_end}
  audit(design) -> loi CUNG (id khong co, thieu o bat buoc, chu qua dai, thieu anh...) dua vao vong tu sua cua R4.
  scenes_to_spec -> spec_shot(): kiem bang CODE (chu / anh / thuong hieu / do dai -> toc do phat), sai thi bo canh.
  build_spec: drop_layers() bo lop do hoa R4 trong canh shot (truoc khi gan tieng), sfx() tieng theo nhip mau,
      clear_spec() bo lop / hieu ung tu viet con de len canh shot (chu hero -> chu anh sinh sau), theme() mau nhan.
Renderer: remotion-src/Scenes.tsx SceneShots -> shotcraft/ShotPlayer.
"""
import hashlib
import json
import os
import re
import subprocess
import unicodedata

import providers

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG_FILE = os.path.join(HERE, "references", "shotcraft_catalog.json")
PREVIEW_DIR = os.path.join(HERE, "references", "shot_previews")
CLIP_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "shot_clips")
PREFS_FILE = os.path.join(os.path.expanduser("~"), ".capcut-studio", "shot_prefs.json")
FPS = 30                    # cac mau viet theo 30fps

SHOT_VERSION = 2            # doi cach kiem / dung shot -> tang (khoa cache R4 doi theo). 2 = nen anh AI cho canh shot
MAX_SHOT_BG = 5             # anh nen AI cho canh shot (tinh RIENG, khong tru vao tran ai_image cua R4)
MAX_SHARE = 0.30            # tong thoi luong canh shot toi da / do dai video
MAX_USES = 1                # moi mau toi da 1 lan / video (lap lai nhan ra ngay)
MIN_DUR = 1.0               # canh shot ngan hon -> khong kip doc
MIN_GAP = 2.5               # hai canh shot (insert) cach nhau toi thieu (giay) — nguoi noi phai hien lai giua chung
MAX_HOLD = 1.5              # het chuyen dong ma canh con dai qua so giay nay -> cat bot duoi canh
OVERLONG = 1.35             # chu dai hon max x OVERLONG -> mau khong chua noi (bo)
DEFAULT_RATE = (0.8, 1.25)

_cache = {"mtime": None, "data": None}


# ---------------------------------------------------------------------------
# DANH MUC
# ---------------------------------------------------------------------------
def load():
    """[{meta mau}] — doc lai khi file doi."""
    try:
        mt = os.path.getmtime(CATALOG_FILE)
    except OSError:
        return []
    if _cache["mtime"] != mt:
        try:
            with open(CATALOG_FILE, encoding="utf-8") as f:
                _cache["data"] = [s for s in (json.load(f).get("shots") or []) if isinstance(s, dict) and s.get("id")]
        except (OSError, ValueError):
            _cache["data"] = []
        _cache["mtime"] = mt
    return _cache["data"] or []


def disabled():
    """Mau nguoi dung TAT o tab Kho shot (khong dua vao danh muc R4)."""
    try:
        with open(PREFS_FILE, encoding="utf-8") as f:
            return set(str(x) for x in (json.load(f).get("disabled") or []))
    except (OSError, ValueError, AttributeError):
        return set()


def set_disabled(sid, off):
    if sid not in {s["id"] for s in load()}:
        return {"ok": False, "error": "khong co mau %s" % sid}
    cur = disabled()
    (cur.add if off else cur.discard)(sid)
    os.makedirs(os.path.dirname(PREFS_FILE), exist_ok=True)
    tmp = PREFS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"disabled": sorted(cur)}, f, ensure_ascii=False, indent=1)
    os.replace(tmp, PREFS_FILE)
    return {"ok": True, "disabled": sorted(cur)}


def _usable(s, off):
    return not s.get("hidden") and s["id"] not in off


def by_id():
    """Mau DUNG DUOC (bo mau an: meta hidden — vd luoi cham phu kin khung, user 2026-10-18 khong dung nen dang luoi;
    bo mau nguoi dung tat o tab Kho shot)."""
    off = disabled()
    return {s["id"]: s for s in load() if _usable(s, off)}


def fingerprint():
    """Doi danh muc / luat / mau bi tat -> khoa cache R4 doi (R4 chay lai voi kho moi)."""
    try:
        with open(CATALOG_FILE, "rb") as f:
            raw = f.read()
    except OSError:
        raw = b""
    raw += ("|" + ",".join(sorted(disabled()))).encode()
    return hashlib.sha1(raw + str(SHOT_VERSION).encode()).hexdigest()[:16]


def list_view():
    """Cho tab Kho shot: moi mau + duong dan video xem truoc + trang thai tat / an."""
    off = disabled()
    out = []
    for m in load():
        pv = os.path.join(PREVIEW_DIR, m["id"] + ".mp4")
        out.append({"id": m["id"], "category": m.get("category"), "kind": m.get("kind"), "dark": bool(m.get("dark")),
                    "backdrop": bool(m.get("backdrop")), "duration": round(float(m.get("duration") or 0) / FPS, 1),
                    "brand": m.get("brand"), "vi": m.get("vi") or {}, "hidden": bool(m.get("hidden")),
                    "hidden_reason": m.get("hidden_reason"), "disabled": m["id"] in off,
                    "slots": [{"id": s.get("id"), "role": s.get("role"), "max": s.get("max"), "list": s.get("list"),
                               "optional": bool(s.get("optional"))} for s in m.get("slots") or [] if isinstance(s, dict)],
                    "images": [{"id": i.get("id"), "role": i.get("role"), "optional": bool(i.get("optional"))}
                               for i in m.get("images") or [] if isinstance(i, dict)],
                    "preview": pv if os.path.isfile(pv) else None})
    return {"ok": True, "shots": out, "categories": _CAT_VI}


def available():
    return bool(load())


def _secs(frames):
    return round(float(frames) / FPS, 2)


def _rate(m):
    r = m.get("rate") if isinstance(m.get("rate"), list) and len(m.get("rate")) == 2 else DEFAULT_RATE
    return max(0.5, float(r[0])), min(2.0, float(r[1]))


def dur_range(m):
    """(ngan nhat de thong tin kip hien, dai nhat dep) — giay timeline."""
    lo, hi = _rate(m)
    hold = max(1, int(m.get("hold") or m.get("duration") or 30))
    return round(max(MIN_DUR, hold / FPS / hi), 1), round(float(m["duration"]) / FPS / lo + MAX_HOLD, 1)


_CAT_VI = {"opening": "mo man / thuong hieu", "typography": "chu & the tieu de", "ui-entrance": "giao dien / trung bay",
           "camera": "may quay & khong gian", "data": "so lieu & chi so", "interaction": "tuong tac / demo tinh nang",
           "transition": "chuyen canh", "rhythm": "nhip & dung canh", "effects": "anh sang & nhan manh",
           "outro": "ket thuc / CTA"}


def _cap(text, n):
    """Cat gon mo ta cho danh muc R4 (giu tron cau neu duoc)."""
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(t) <= n:
        return t
    cut = max(t.rfind(". ", 0, n), t.rfind("; ", 0, n))
    return (t[:cut + 1] if cut > n * 0.55 else t[:n].rsplit(" ", 1)[0] + "…").strip()


def _slot_txt(s):
    bits = [s["id"], s.get("role", "")]
    if s.get("list"):
        bits.append("DANH SACH %d-%d muc" % (s["list"].get("min", 1), s["list"].get("max", 1)))
    bits.append("<=%d ky tu" % int(s.get("max") or 20))
    if s.get("optional"):
        bits.append("tuy chon")
    note = (" — " + _cap(s["note"], 90)) if s.get("note") else ""
    return "%s(%s)%s" % (bits[0], ", ".join(b for b in bits[1:] if b), note)


def prompt_block():
    """TOAN BO danh muc cho R4 (1 muc / mau, nhom theo loai). Moi mau: id, loai, nen, nang luong, do dai, mo ta,
    dung khi, mo rong, o chu, o anh, thuong hieu."""
    rows = []
    cur = None
    off = disabled()
    for m in load():
        if not _usable(m, off):
            continue
        if m.get("category") != cur:
            cur = m.get("category")
            rows.append("\n## %s (%s)" % (cur, _CAT_VI.get(cur, cur)))
        vi = m.get("vi") or {}
        a, b = dur_range(m)
        head = "- %s [%s; nen %s%s; nang luong %s; %.1f-%.1fs%s]" % (
            m["id"], "LOP PHU trong suot de len canh cat" if m.get("kind") == "overlay" else "toan man hinh",
            "toi" if m.get("dark") else "sang", " + ANH NEN AI" if m.get("backdrop") else "", vi.get("nang_luong", "?"), a, b,
            "; can thuong hieu" if m.get("brand") == "required" else "")
        lines = [head + " " + _cap(vi.get("ten"), 80)]
        lines.append("  thay: " + _cap(vi.get("mo_ta"), 300))
        lines.append("  dung khi: " + _cap(vi.get("hop_khi"), 260))
        if vi.get("mo_rong"):
            lines.append("  mo rong: " + _cap(vi.get("mo_rong"), 240))
        if vi.get("chu_de"):
            lines.append("  chu de: " + ", ".join(str(x) for x in vi["chu_de"][:10]))
        slots = [s for s in m.get("slots") or [] if isinstance(s, dict)]
        if slots:
            lines.append("  o chu: " + "; ".join(_slot_txt(s) for s in slots))
        imgs = [i for i in m.get("images") or [] if isinstance(i, dict)]
        if imgs:
            lines.append("  o anh: " + "; ".join("%s(%s%s%s)%s" % (
                i["id"], i.get("role"), (", " + i["aspect"]) if i.get("aspect") else "", ", tuy chon" if i.get("optional") else "",
                (" — " + _cap(i["note"], 90)) if i.get("note") else "") for i in imgs))
        rows.append("\n".join(lines))
    return "\n".join(rows).strip()


def rules_text():
    return _RULES % {"share": int(MAX_SHARE * 100), "gap": MIN_GAP, "ovl": OVERLONG, "bg": MAX_SHOT_BG}


_RULES = """

# KHO SHOT & MOTION (motion graphic toan man hinh — FULL-SCREEN B-ROLL)
Ben duoi la TOAN BO kho mau chuyen dong chuyen nghiep (moi mau: id, loai, nen, nang luong, do dai hop ly, nguoi xem
THAY gi, dung khi nao, mo rong / tuy bien ra sao, cac o chu, o anh). Doc HET kho truoc khi chon — chon mau HOP NHAT
voi tung khoanh khac, khong chon theo thu tu liet ke, khong dung lai cung kieu cho moi video.
Chu / anh / mau trong mo ta chi la VI DU: moi mau la mot HINH THUC truyen tai (dem so, liet ke, so sanh, giao dien,
trich dan...) — doi chu, anh, mau, so muc la dung duoc cho CHU DE KHAC (xem "mo rong"). Chon theo hinh thuc hop khoanh
khac, roi dien noi dung THAT cua video; dung bo qua mau chi vi vi du cua no khac nganh.
KHI NAO dung canh shot (scene layout "graphic" co "shot"): khoanh khac loi noi CAN MINH HOA hon la nhin mat nguoi noi —
neu con so / so lieu, liet ke cac buoc / tinh nang, so sanh truoc-sau, nhac toi app / phan mem / dien thoai / dashboard /
AI / quy trinh, cau chot can doc tron, mo dau chu de, CTA cuoi, chuyen sang y moi. KHONG dung khi nguoi noi dang bo lo
cam xuc that, ke chuyen ca nhan can thay mat, hoac cau dang do dang.
Moi canh shot: "layout": "graphic" + "shot": {"id": "<id trong kho>", "texts": {"<o chu>": "<chu>"}, "images": {"<o anh>":
"<asset id>"}} + source_id / src_start / src_end NEO DUNG cau noi (bat dau o dau cau / dau cum y, ket thuc het y, nam trong
khoang do dai cua mau). Mau "LOP PHU" (kind overlay): dat "layout": "full" (nguoi noi van hien), canh dai dung bang mau,
dat dung diem cat sang / ra canh shot.
LUAT CUNG (code kiem, sai thi canh bi bo):
1. CHU: moi o chu lay tu LOI NOI that cua doan do (tieng Viet co dau, rut gon dung y — khong bia so / ten / tinh nang khong
   duoc noi). Dien du o khong "tuy chon"; khong qua so ky tu (qua %(ovl)s lan -> bo). O "number" phai co chu so. O danh
   sach -> mang chu dung so muc cho phep. O ten thuong hieu: chi khi loi noi NHAC ten -> "brand_name": "<ten dung nhu
   loi noi>" (mau "can thuong hieu" ma loi noi khong nhac ten nao thi KHONG chon).
2. ANH: o anh khong "tuy chon" bat buoc co hinh: id cua asset (ai_image khai trong "assets" — dem vao tran ai_image;
   source_frame; tu lieu nguoi dung) hoac {"source_id": "...", "src_time": <giay nguon>} (cat khung / doan tu video goc).
   Anh phai MINH HOA DUNG noi dung (ai_image "illustrates" = cau noi do).
3. LIEU LUONG: tong thoi luong canh shot <= %(share)d%% video; cac canh shot cach nhau >= %(gap).1fs (nguoi noi hien lai);
   moi mau toi da 1 lan / video; dung 3s dau (hook) chi khi mau thuoc nhom mo man va hop hook.
4. TRONG khoang canh shot: KHONG khai lop do hoa (layers) / chu nhan / hieu ung chong len (mau da tu ve day du).
5. MAU SAC: mau nhan cua kho lay theo "style.palette" cua video (accent / highlight) — chon mau nen sang / toi hop tone video.
6. ANH NEN AI (mau co "+ ANH NEN AI"): KHONG dung nen do code ve. Moi canh shot do khai 1 asset ai_image rieng
   {"id": "<id>", "kind": "ai_image", "role": "shot_bg", "aspect": "<khung video>", "illustrates": "<cau noi>",
   "prompt": "<TIENG ANH>"} va ghi "bg_asset": "<id>" trong "shot". Anh nen: canh THAT hop CHU DE cau noi luc do (van
   phong, cua hang, man hinh lam viec, nha may, duong pho... dung nganh nghe trong video), anh sang dien anh, chieu sau
   (tien canh mo), KHOANG GIUA SACH IT CHI TIET cho chu dat len, tong mau hop nen cua mau (nen "toi" -> canh toi, tram;
   nen "sang" -> canh sang, diu). TUYET DOI khong chu / so / logo / giao dien trong anh, khong luoi ke o, khong hoa van
   trang tri. Anh nen KHONG tinh vao tran 6 ai_image (toi da %(bg)d anh nen / video).
7. CHU KHONG DUNG DAU GACH: o chu khong chua "—", "–" hay " - " lam dau noi / trang tri (dung dau phay, hai cham hoac
   tach thanh 2 o / 2 dong). Khoang so "3-4" duoc giu.
"""


# ---------------------------------------------------------------------------
# KIEM (R4 tu sua + luc dung spec)
# ---------------------------------------------------------------------------
def _fold(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s.replace("đ", "d")).strip()


def _text_issues(m, texts):
    """Loi o chu (list chuoi) — rong = dat. texts da la dict."""
    bad = []
    slots = {s["id"]: s for s in m.get("slots") or [] if isinstance(s, dict) and s.get("id")}
    for sid, s in slots.items():
        v = texts.get(sid)
        if s.get("list"):
            items = v if isinstance(v, list) else ([x for x in str(v).split("\n") if x.strip()] if isinstance(v, str) and v.strip() else [])
            items = [str(x).strip() for x in items if str(x).strip()]
            lo = int((s.get("list") or {}).get("min") or 1)
            if not items:
                if not s.get("optional"):
                    bad.append("o '%s' (danh sach %d-%d muc) trong" % (sid, lo, int((s.get("list") or {}).get("max") or lo)))
                continue
            if len(items) < lo and not s.get("optional"):
                bad.append("o '%s' can >= %d muc (co %d)" % (sid, lo, len(items)))
            long_ = [x for x in items if len(x) > int(s.get("max") or 20) * OVERLONG]
            if long_:
                bad.append("o '%s': muc qua dai (> %d ky tu): %s" % (sid, int(s.get("max") or 20), long_[0][:40]))
            continue
        txt = str(v).strip() if isinstance(v, (str, int, float)) else (" ".join(str(x) for x in v) if isinstance(v, list) else "")
        if not txt:
            if not s.get("optional"):
                bad.append("thieu o chu '%s'" % sid)
            continue
        if len(txt) > int(s.get("max") or 20) * OVERLONG:
            bad.append("o '%s' qua dai (%d > %d ky tu)" % (sid, len(txt), int(s.get("max") or 20)))
        if s.get("role") == "number" and not re.search(r"\d", txt):
            bad.append("o so '%s' khong co chu so" % sid)
    return bad


def audit(design, duration):
    """Loi CUNG cua cac canh shot R4 khai -> dua vao vong tu sua cua R4 (chuoi tieng Viet khong dau)."""
    out = []
    cat = by_id()
    if not cat:
        return out
    ids = {a.get("id") for a in (design or {}).get("assets") or [] if isinstance(a, dict)}
    used = {}
    total = 0.0
    for i, sc in enumerate((design or {}).get("scenes") or []):
        if not isinstance(sc, dict) or not isinstance(sc.get("shot"), dict):
            continue
        sh = sc["shot"]
        m = cat.get(sh.get("id"))
        name = "scene%d shot '%s'" % (i, sh.get("id"))
        if not m:
            out.append("%s: id khong co trong kho shot" % name)
            continue
        used[m["id"]] = used.get(m["id"], 0) + 1
        texts = sh.get("texts") if isinstance(sh.get("texts"), dict) else {}
        out += ["%s: %s" % (name, b) for b in _text_issues(m, texts)]
        imgs = sh.get("images") if isinstance(sh.get("images"), dict) else {}
        for im in m.get("images") or []:
            v = imgs.get(im["id"])
            if im.get("optional") and not v:
                continue
            if not v:
                out.append("%s: thieu o anh '%s'" % (name, im["id"]))
            elif isinstance(v, str) and v not in ids:
                out.append("%s: o anh '%s' tro asset '%s' khong co trong assets" % (name, im["id"], v))
        if m.get("brand") == "required" and not str(sh.get("brand_name") or "").strip():
            out.append("%s: mau can ten thuong hieu (brand_name) nhung khong co" % name)
        d = providers._f(sc.get("src_end")) - providers._f(sc.get("src_start"))
        a, _b = dur_range(m)
        if d < a - 0.05:
            out.append("%s: canh %.1fs ngan hon %.1fs (chua kip hien du thong tin)" % (name, d, a))
        total += max(0.0, d) if m.get("kind") != "overlay" else 0.0
    out += ["shot '%s' dung %d lan (toi da %d)" % (k, n, MAX_USES) for k, n in used.items() if n > MAX_USES]
    if duration and total > duration * MAX_SHARE + 1.0:
        out.append("tong canh shot %.1fs > %d%% video (%.1fs)" % (total, int(MAX_SHARE * 100), duration * MAX_SHARE))
    return out


_BG_PROMPT = ("Cinematic background plate for a full-screen motion-graphics card in a short vertical video about %s. "
              "Scene: %s. Real photographic environment that fits the topic, shallow depth of field with a softly "
              "blurred foreground, %s, calm composition with a CLEAN LOW-DETAIL CENTRAL AREA reserved for large titles, "
              "subtle natural textures, no people facing camera. Absolutely no text, letters, numbers, logos, user "
              "interface, screens with readable content, grids, patterns or graphic overlays.")


def ensure_backdrops(design, story=None, changes=None):
    """Canh shot (mau ho tro nen anh) chua co anh nen hop le -> tu khai 1 ai_image role shot_bg (prompt theo chu de
    video + chu cua canh). R4 da khai thi giu nguyen. Tra so anh nen da them. Ham thuan (dung lai ket qua cache)."""
    cat = by_id()
    if not isinstance(design, dict) or not cat:
        return 0
    assets = design.setdefault("assets", [])
    ids = {a.get("id") for a in assets if isinstance(a, dict)}
    have = sum(1 for a in assets if isinstance(a, dict) and a.get("role") == "shot_bg")
    topic = " ".join(str((story or {}).get(k) or "") for k in ("story_arc", "tone"))[:260] or "a business talk"
    added = 0
    for i, sc in enumerate(design.get("scenes") or []):
        sh = sc.get("shot") if isinstance(sc, dict) else None
        m = cat.get((sh or {}).get("id")) if isinstance(sh, dict) else None
        if not m or not m.get("backdrop") or m.get("kind") == "overlay":
            continue
        if sh.get("bg_asset") in ids:
            a = next(x for x in assets if isinstance(x, dict) and x.get("id") == sh["bg_asset"])
            a.setdefault("role", "shot_bg")
            continue
        if have >= MAX_SHOT_BG:
            break
        words = " / ".join(str(v if not isinstance(v, list) else ", ".join(map(str, v)))
                           for v in (sh.get("texts") or {}).values() if v)[:200]
        aid = "shotbg_%d" % i
        while aid in ids:
            aid += "x"
        assets.append({"id": aid, "kind": "ai_image", "role": "shot_bg", "aspect": "16:9" if _landscape() else "9:16",
                       "illustrates": words or (m.get("vi") or {}).get("ten", ""),
                       "prompt": _BG_PROMPT % (topic, words or "the moment being discussed",
                                               "dark moody low-key lighting, deep shadows" if m.get("dark")
                                               else "bright airy soft daylight, light tones")})
        sh["bg_asset"] = aid
        ids.add(aid)
        have += 1
        added += 1
    if added and changes is not None:
        changes.append("canh shot: tu them %d anh nen AI" % added)
    return added


def _landscape():
    import canvas
    return canvas.landscape()


def _transcript_fold(p):
    words = []
    for w in p.get("asr_words") or []:
        if isinstance(w, (list, tuple)) and w:
            words.append(str(w[0]))
    if not words:
        for c in p.get("captions") or []:
            if isinstance(c, dict):
                words.append(str(c.get("text") or ""))
    return " " + _fold(" ".join(words)) + " "


def _clip(src, t, dur):
    """Cat doan video nguon (video slot) -> file cache (tat tieng, 720p)."""
    os.makedirs(CLIP_DIR, exist_ok=True)
    key = hashlib.sha1(("%s|%.2f|%.2f|%s" % (src, t, dur, os.path.getmtime(src))).encode()).hexdigest()[:16]
    out = os.path.join(CLIP_DIR, key + ".mp4")
    if os.path.isfile(out) and os.path.getsize(out) > 1000:
        return out
    import remotion_plan as RP
    try:
        subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-y", "-ss", "%.2f" % max(0.0, t), "-i", src, "-t", "%.2f" % dur,
                        "-an", "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                        "-pix_fmt", "yuv420p", out], capture_output=True, timeout=180)
    except Exception:
        return None
    return out if os.path.isfile(out) and os.path.getsize(out) > 1000 else None


def _frame(src, t):
    """Cat 1 khung tu video nguon (anh slot dang {source_id, src_time})."""
    os.makedirs(CLIP_DIR, exist_ok=True)
    key = hashlib.sha1(("%s|%.2f|%s|f" % (src, t, os.path.getmtime(src))).encode()).hexdigest()[:16]
    out = os.path.join(CLIP_DIR, key + ".jpg")
    if os.path.isfile(out) and os.path.getsize(out) > 1000:
        return out
    import remotion_plan as RP
    try:
        subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-y", "-ss", "%.2f" % max(0.0, t), "-i", src, "-frames:v", "1",
                        "-q:v", "2", out], capture_output=True, timeout=120)
    except Exception:
        return None
    return out if os.path.isfile(out) and os.path.getsize(out) > 1000 else None


def spec_shot(raw, sc, p, assets_by_id, changes, uses):
    """Kiem canh shot R4 -> dat sc["shot"] (+ chinh do dai canh). False = bo canh (ly do vao changes).
    raw: scene R4 (co "shot"); sc: scene spec dang dung (start / end timeline da quy doi)."""
    import motion_design as MD
    sh = raw.get("shot") if isinstance(raw.get("shot"), dict) else None
    m = by_id().get((sh or {}).get("id"))
    tag = "%s shot '%s'" % (sc["id"], (sh or {}).get("id"))
    if not m:
        changes.append("%s: khong co trong kho shot -> bo canh" % tag)
        return False
    if uses.get(m["id"], 0) >= MAX_USES:
        changes.append("%s: mau da dung %d lan trong video -> bo canh" % (tag, MAX_USES))
        return False
    texts_in = sh.get("texts") if isinstance(sh.get("texts"), dict) else {}
    bad = _text_issues(m, texts_in)
    if bad:
        changes.append("%s: %s -> bo canh" % (tag, "; ".join(bad)[:200]))
        return False
    texts = {}
    for s in m.get("slots") or []:
        v = texts_in.get(s["id"])
        if v is None:
            continue
        if s.get("list"):
            items = v if isinstance(v, list) else [x for x in str(v).split("\n")]
            items = [str(x).strip() for x in items if str(x).strip()][: int((s.get("list") or {}).get("max") or 99)]
            if items:
                texts[s["id"]] = items
        else:
            t = (" ".join(str(x) for x in v) if isinstance(v, list) else str(v)).strip()
            if t:
                texts[s["id"]] = t
    # anh
    imgs_in = sh.get("images") if isinstance(sh.get("images"), dict) else {}
    images = {}
    for im in m.get("images") or []:
        v = imgs_in.get(im["id"])
        path = None
        if isinstance(v, str) and v:
            a = assets_by_id.get(v) or {}
            if im.get("role") == "video" and a.get("kind") == "user_video":
                path = a.get("path") if os.path.isfile(a.get("path") or "") else None
            else:
                path = MD._asset_path(assets_by_id, v, im.get("role") == "product")
        elif isinstance(v, dict) and v.get("source_id") is not None:
            sv = next((x for x in p.get("source_videos") or [] if x.get("id") == v.get("source_id")), None)
            if sv and os.path.isfile(sv.get("path") or ""):
                t0 = providers._f(v.get("src_time"), providers._f(raw.get("src_start")))
                path = _clip(sv["path"], t0, max(2.0, sc["end"] - sc["start"] + 0.6)) if im.get("role") == "video" \
                    else _frame(sv["path"], t0)
        if path:
            images[im["id"]] = path
        elif not im.get("optional"):
            changes.append("%s: thieu anh cho o '%s' -> bo canh" % (tag, im["id"]))
            return False
    # thuong hieu: chi ten CO trong loi noi
    brand = None
    bn = str(sh.get("brand_name") or "").strip()
    if bn:
        if _fold(bn) and (" " + _fold(bn) + " ") in _transcript_fold(p):
            brand = {"name": bn[:40]}
        else:
            changes.append("%s: ten thuong hieu '%s' khong co trong loi noi -> bo ten" % (tag, bn[:30]))
    if m.get("brand") == "required" and not brand:
        changes.append("%s: mau can thuong hieu ma loi noi khong nhac -> bo canh" % tag)
        return False
    # do dai -> toc do phat; qua ngan -> keo dai neu con cho, qua dai -> cat bot
    lo, hi = _rate(m)
    native = float(m["duration"]) / FPS
    hold = max(1, int(m.get("hold") or m["duration"])) / FPS
    d = sc["end"] - sc["start"]
    if m.get("kind") == "overlay":
        sc["end"] = round(sc["start"] + min(d, native / lo), 3)
        rate = 1.0
    else:
        if d < hold / hi - 0.05:
            room = sc.get("_room", d)
            need = hold / hi
            if room >= need:
                sc["end"] = round(sc["start"] + need, 3)
                changes.append("%s: canh %.2fs < %.2fs de hien du -> keo dai" % (tag, d, need))
                d = need
            else:
                changes.append("%s: canh %.2fs qua ngan (can %.2fs) -> bo canh" % (tag, d, need))
                return False
        rate = max(lo, min(hi, native / max(0.1, d)))
        play = native / rate
        if d > play + MAX_HOLD:
            sc["end"] = round(sc["start"] + play + MAX_HOLD * 0.6, 3)
            changes.append("%s: canh dai hon chuyen dong %.1fs -> cat con %.1fs" % (tag, play, sc["end"] - sc["start"]))
    sc["shot"] = {"id": m["id"], "kind": m.get("kind") or "insert", "texts": texts, "images": images,
                  "rate": round(rate, 4), "brand": brand,
                  "hideSubs": bool(texts) and m.get("kind") != "overlay"}
    if m.get("backdrop") and m.get("kind") != "overlay" and sh.get("bg_asset"):
        # NEN ANH AI cua canh (user 2026-10-18: khong dung nen code ve) — tao that bai thi mau dung nen goc cua no
        bp = MD._asset_path(assets_by_id, sh["bg_asset"], False)
        if bp:
            sc["shot"]["backdrop"] = bp
        else:
            changes.append("%s: anh nen AI '%s' khong co file -> dung nen goc cua mau" % (tag, sh["bg_asset"]))
    sc["layout"] = "full" if m.get("kind") == "overlay" else "graphic"
    sc["morph"] = 0
    sc.pop("bg", None)
    uses[m["id"]] = uses.get(m["id"], 0) + 1
    return True


def enforce_spacing(scenes, duration, changes):
    """Tran tong thoi luong + khoang cach giua cac canh shot insert (sau khi da quy doi gio timeline)."""
    ins = [s for s in scenes if (s.get("shot") or {}).get("kind") == "insert"]
    keep, last_end, total = [], -99.0, 0.0
    for s in ins:
        d = s["end"] - s["start"]
        if s["start"] - last_end < MIN_GAP:
            changes.append("%s shot '%s': cach canh shot truoc %.1fs < %.1fs -> bo" % (s["id"], s["shot"]["id"], s["start"] - last_end, MIN_GAP))
            continue
        if duration and total + d > duration * MAX_SHARE + 1.0:
            changes.append("%s shot '%s': vuot tran %d%% video -> bo" % (s["id"], s["shot"]["id"], int(MAX_SHARE * 100)))
            continue
        keep.append(s)
        last_end, total = s["end"], total + d
    drop = {id(s) for s in ins if s not in keep}
    return [s for s in scenes if id(s) not in drop]


def windows(scenes):
    """[(start, end)] cac canh shot insert (timeline)."""
    return [(s["start"], s["end"]) for s in scenes or [] if (s.get("shot") or {}).get("kind") == "insert"]


def _inside(a, b, wins, frac=0.5):
    """Khoang [a,b] nam trong canh shot >= frac do dai cua no."""
    L = max(1e-3, b - a)
    return any(max(0.0, min(b, e) - max(a, s)) >= frac * L for s, e in wins)


def drop_layers(scenes, layers, changes):
    """Lop do hoa R4 trong canh shot -> bo; lop bat dau truoc va keo vao canh -> cat duoi (con >= 0.4s) hoac bo."""
    wins = windows(scenes)
    if not wins:
        return layers
    out = []
    for L in layers:
        a, b = providers._f(L.get("start")), providers._f(L.get("end"))
        if _inside(a, b, wins, 0.5) or any(s <= a < e for s, e in wins):
            changes.append("lop %s: nam trong canh shot -> bo" % L.get("id"))
            continue
        hit = next((s for s, e in wins if a < s < b), None)
        if hit is not None:
            if hit - a >= 0.4:
                L["end"] = round(hit, 3)
            else:
                changes.append("lop %s: chay vao canh shot -> bo" % L.get("id"))
                continue
        out.append(L)
    return out


def clear_spec(spec, changes):
    """Sau khi moi lop da co (chu hero -> chu anh, hieu ung tu viet): bo lop / hieu ung de len canh shot insert."""
    wins = windows(spec.get("scenes"))
    if not wins:
        return
    n0 = len(spec.get("layers") or [])
    spec["layers"] = [L for L in spec.get("layers") or []
                      if not (_inside(providers._f(L.get("start")), providers._f(L.get("end")), wins, 0.5)
                              or any(s <= providers._f(L.get("start")) < e for s, e in wins))]
    f0 = len(spec.get("fx") or [])
    spec["fx"] = [f for f in spec.get("fx") or []
                  if not _inside(providers._f(f.get("start")), providers._f(f.get("end")), wins, 0.3)]
    if n0 - len(spec["layers"]) or f0 - len(spec["fx"]):
        changes.append("canh shot: bo %d lop + %d hieu ung tu viet de len" % (n0 - len(spec["layers"]), f0 - len(spec["fx"])))
    # meme / doan chen de len canh shot -> bo canh shot (meme la noi dung that, uu tien)
    ovs = [(providers._f(o.get("start")), providers._f(o.get("end"))) for o in spec.get("overlays") or []]
    keep = []
    for s in spec.get("scenes") or []:
        if (s.get("shot") or {}).get("kind") == "insert" and any(min(s["end"], e) - max(s["start"], a) > 0.2 for a, e in ovs):
            changes.append("%s shot '%s': trung meme chen -> bo canh" % (s["id"], s["shot"]["id"]))
            continue
        keep.append(s)
    spec["scenes"] = keep


def sfx(scenes, changes):
    """Tieng theo NHIP cua mau (meta sfx: khung goc @30fps, chia toc do phat) -> muc audio gio timeline."""
    import engine
    import sfx_kit
    import motion_design as MD
    cat = by_id()
    lib = None
    out = []
    for s in scenes or []:
        sh = s.get("shot") or {}
        m = cat.get(sh.get("id"))
        if not m:
            continue
        rate = providers._f(sh.get("rate"), 1.0) or 1.0
        for x in m.get("sfx") or []:
            t = s["start"] + providers._f(x.get("at")) / FPS / rate
            if t >= s["end"] - 0.05:
                continue
            if lib is None:
                lib = {e["id"]: e for e in engine.sfx_list()}
            # ref co gio -> moi nhip cua mau mot take (bo tieng earshot cua video)
            item = sfx_kit.auto_item(x.get("type"), round(t, 3), "%s:%s@%.2f" % (s["id"], m["id"], t),
                                     MD._sfx_purpose(x.get("type")), lib=lib)
            if not item:
                continue
            item["_from_layer"] = "%s:%s" % (s["id"], m["id"])
            item["_shot"] = True
            out.append(item)
    if out:
        changes.append("canh shot: %d SFX theo nhip mau" % len(out))
    return out


def theme(p):
    """Mau nhan cho kho shot: thuong hieu (Brand Guideline) > style cua phien (R4 / video mau)."""
    cols = []
    if p.get("brand_guide"):
        try:
            import brand_guide
            cols = brand_guide.hexes(p["brand_guide"])
        except Exception:
            cols = []
    if not cols:
        pal = ((p.get("style_kit") or {}).get("palette") or {}) if isinstance(p.get("style_kit"), dict) else {}
        for k in ("accent", "highlight", "primary"):
            v = pal.get(k)
            if isinstance(v, str) and re.match(r"^#[0-9a-fA-F]{6}$", v.strip()) and v.strip().upper() not in ("#FFFFFF", "#000000"):
                cols.append(v.strip())
    if not cols:
        return None
    out = {"accent": cols[0]}
    if len(cols) > 1:
        out["accent2"] = cols[1]
    return out


# ---------------------------------------------------------------------------
# GEMINI XEM VIDEO XEM TRUOC -> MO TA (scripts/shotcraft-label.py goi; ket qua ghi vao <Component>.meta.json "vi")
# ---------------------------------------------------------------------------
LABEL_BATCH = 4             # so video / luot Gemini

_GEMINI_SHOT_PROMPT = """Ban la MOTION DESIGNER dang VIET MO TA cho KHO MAU SHOT (motion graphic toan man hinh / lop phu) dung lai
khi dung video short-form tieng Viet (TikTok / Reels / Shorts) — chu yeu la video NGUOI NOI (chia se kinh nghiem, ban
hang, review, huong dan, ke chuyen, gioi thieu dich vu...). AI lap ke hoach se chen mau vao dung khoanh khac loi noi.

Moi file dinh kem la VIDEO XEM TRUOC cua 1 mau, kem: id, nhom, kieu (toan man hinh / lop phu), do dai, cac O CHU (vai
tro, so ky tu toi da, chu mau), O ANH (vai tro), mo ta cu (chi tham khao — co the sai; CHI TIN nhung gi THAY trong video).

QUAN TRONG — MAU LA KHUON, KHONG PHAI NOI DUNG CO DINH:
- Chu, so, anh, mau sac, ten thuong hieu trong preview chi la VI DU. Khi dung that, he thong THAY bang noi dung that
  cua video: chu lay tu loi noi, anh = anh minh hoa AI / khung cat tu video nguon / anh nguoi dung, mau nhan theo tone
  video, so muc danh sach thay doi trong gioi han.
- Vi vay hay nhin mau nhu mot HINH THUC TRUYEN TAI (dem so, liet ke buoc, so sanh, giao dien app, tin nhan, trich dan,
  bang gia, ban do, dong thoi gian, tiet lo, chuyen y...) va nghi RONG: cung hinh thuc do con phuc vu duoc nhung
  nganh / chu de / dang video nao khac neu tuy bien (ban hang online, giao duc, bat dong san, spa / lam dep, F&B, tai
  chinh, cong nghe / AI, suc khoe, du lich, tuyen dung, ca nhan / doi song...).
- KHONG viet "tranh khi", dieu cam, canh bao hay han che. Chi viet: dung khi nao, phu hop voi gi, mo rong ra sao.

AI lap ke hoach KHONG xem duoc video — chi doc mo ta cua ban. Viet tieng Viet CO DAU, cu the, de hinh dung.

# TRA VE CHI JSON
{"shots": [
  {"id": "<dung id da cho>",
   "ten": "ten ngan 3-8 tu (vd: Dem so lon kem thanh tien do)",
   "mo_ta": "2-3 cau: nguoi xem THAY gi — bo cuc, hinh khoi, chu dat o dau, chuyen dong vao -> dinh -> ra, nhip nhanh/cham",
   "hop_khi": "DUNG KHI / PHU HOP: loai khoanh khac va noi dung loi noi ma mau truyen tai tot nhat, cam xuc / nhip hop, kem 2-3 vi du cau noi kieu '...'",
   "mo_rong": "MO RONG KHI TUY BIEN: 3-6 huong dung khac, moi huong noi ro thay gi (chu / anh / so muc / mau) -> dung cho nganh / chu de / khoanh khac nao. Vd: 'doi anh chup man hinh thanh anh san pham -> gioi thieu san pham moi; doi 3 muc thanh 3 buoc -> huong dan quy trinh'",
   "nang_luong": "thap|vua|cao",
   "chu_de": ["8-14 tu khoa tieng Viet: ca chu de goc lan chu de mo rong, hinh thuc truyen tai, nganh hop"],
   "chat_luong": 1,
   "loi_hien_thi": "loi THAY trong preview neu co (chu tran / bi cat / de len nhau / khung trong / giat / sai dau tieng Viet), khong loi -> \\"\\""}
]}
"chat_luong": 1 (hong / trong / xau) .. 5 (dep, ro, chuyen nghiep).
⚠️ TRA VE CHI JSON GOC. Ky tu dau la {, ky tu cuoi la }."""

_LABEL_TEXT = ("ten", "mo_ta", "hop_khi", "mo_rong")


def preview_path(sid):
    p = os.path.join(PREVIEW_DIR, sid + ".mp4")
    return p if os.path.isfile(p) else None


def _label_item(m):
    vi = m.get("vi") or {}
    slots = "; ".join("%s(%s, <=%s ky tu%s, mau: %s)" % (
        s.get("id"), s.get("role"), s.get("max"), ", danh sach %d-%d muc" % (s["list"]["min"], s["list"]["max"])
        if s.get("list") else "", _cap(s.get("sample"), 60)) for s in m.get("slots") or [] if isinstance(s, dict)) or "khong"
    imgs = "; ".join("%s(%s)" % (i.get("id"), i.get("role")) for i in m.get("images") or [] if isinstance(i, dict)) or "khong"
    return {"path": preview_path(m["id"]), "label": "id=%s | nhom=%s (%s) | %s | dai %.1fs | o chu: %s | o anh: %s | mo ta cu: %s" % (
        m["id"], m.get("category"), _CAT_VI.get(m.get("category"), ""),
        "LOP PHU trong suot de len canh nguoi noi" if m.get("kind") == "overlay" else "toan man hinh (thay canh nguoi noi)",
        _secs(m.get("duration") or 0), slots, imgs, _cap(vi.get("mo_ta"), 300))}


def clean_label(r):
    out = {}
    for k in _LABEL_TEXT:
        out[k] = re.sub(r"\s+", " ", str(r.get(k) or "")).strip()[:900]
    out["nang_luong"] = r.get("nang_luong") if r.get("nang_luong") in ("thap", "vua", "cao") else "vua"
    tags = r.get("chu_de") if isinstance(r.get("chu_de"), list) else []
    out["chu_de"] = list(dict.fromkeys(str(x).strip()[:40] for x in tags if str(x).strip()))[:14]
    try:
        out["chat_luong"] = max(1, min(5, int(r.get("chat_luong"))))
    except (TypeError, ValueError):
        out["chat_luong"] = 3
    out["loi_hien_thi"] = re.sub(r"\s+", " ", str(r.get("loi_hien_thi") or "")).strip()[:400]
    return out


def label(ids, call=None, log=None):
    """Gemini XEM video xem truoc (LABEL_BATCH / luot) -> {id: nhan da lam sach}. KHONG ghi file (nguoi goi quyet dinh).
    call(items, prompt) -> dict JSON; mac dinh providers.gemini_files (theo cach ket noi dang chon trong app)."""
    call = call or (lambda items, prompt: providers.gemini_files(items, prompt, step_label="Gemini-shot", log=log))
    cat = {s["id"]: s for s in load()}
    rows = [cat[i] for i in ids or [] if i in cat and preview_path(i)]
    out, errors = {}, {}
    for i in range(0, len(rows), LABEL_BATCH):
        part = rows[i:i + LABEL_BATCH]
        try:
            res = call([_label_item(m) for m in part], _GEMINI_SHOT_PROMPT)
        except Exception as ex:
            for m in part:
                errors[m["id"]] = str(ex).split("\n")[0][:200]
            continue
        got = res.get("shots") if isinstance(res, dict) else None
        if not isinstance(got, list) and isinstance(res, dict) and res.get("id"):
            got = [res]
        pid = [m["id"] for m in part]
        for j, r in enumerate(got or []):
            if not isinstance(r, dict):
                continue
            rid = r.get("id") if r.get("id") in pid else (pid[j] if j < len(pid) else None)
            if rid and rid not in out:
                lb = clean_label(r)
                if lb["mo_ta"] and lb["hop_khi"]:
                    out[rid] = lb
        for rid in pid:
            if rid not in out and rid not in errors:
                errors[rid] = "Gemini khong tra mo ta cho mau nay"
    return {"labels": out, "errors": errors}
