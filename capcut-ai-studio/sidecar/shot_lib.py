#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO SHOT & MOTION (2026-10-18, user: "lay TOAN BO kho shot & motion cua video-shotcraft, buoc plan doc duoc toan bo
kho de chon dung mau cho tung phan cua video; khi phu hop thi co Full-screen B-roll").

Kho: 150 mau Remotion cua video-shotcraft (Apache-2.0, github.com/Vincentwei1021/video-shotcraft), port vao
remotion-src/shotcraft/ (moi mau nhan chu THAT cua video qua o chu, anh B-roll qua o anh, tu bo cuc khung doc 9:16).
Mo ta tung mau (tieng Viet: trong thay gi / hop khi / tranh khi / o chu / o anh / do dai...) nam o
references/shotcraft_catalog.json — sinh boi scripts/shotcraft-sync.mjs tu <Component>.meta.json canh tung mau.

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
CLIP_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "shot_clips")
FPS = 30                    # cac mau viet theo 30fps

SHOT_VERSION = 1            # doi cach kiem / dung shot -> tang (khoa cache R4 doi theo)
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


def by_id():
    return {s["id"]: s for s in load()}


def fingerprint():
    """Doi danh muc / luat -> khoa cache R4 doi (R4 chay lai voi kho moi)."""
    try:
        with open(CATALOG_FILE, "rb") as f:
            raw = f.read()
    except OSError:
        raw = b""
    return hashlib.sha1(raw + str(SHOT_VERSION).encode()).hexdigest()[:16]


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
    hop / tranh, o chu, o anh, thuong hieu."""
    rows = []
    cur = None
    for m in load():
        if m.get("category") != cur:
            cur = m.get("category")
            rows.append("\n## %s (%s)" % (cur, _CAT_VI.get(cur, cur)))
        vi = m.get("vi") or {}
        a, b = dur_range(m)
        head = "- %s [%s; nen %s; nang luong %s; %.1f-%.1fs%s]" % (
            m["id"], "LOP PHU trong suot de len canh cat" if m.get("kind") == "overlay" else "toan man hinh",
            "toi" if m.get("dark") else "sang", vi.get("nang_luong", "?"), a, b,
            "; can thuong hieu" if m.get("brand") == "required" else "")
        lines = [head + " " + _cap(vi.get("ten"), 80)]
        lines.append("  thay: " + _cap(vi.get("mo_ta"), 300))
        lines.append("  hop: " + _cap(vi.get("hop_khi"), 240) + " | tranh: " + _cap(vi.get("tranh_khi"), 150))
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
    return _RULES % {"share": int(MAX_SHARE * 100), "gap": MIN_GAP, "ovl": OVERLONG}


_RULES = """

# KHO SHOT & MOTION (motion graphic toan man hinh — FULL-SCREEN B-ROLL)
Ben duoi la TOAN BO kho mau chuyen dong chuyen nghiep (moi mau: id, loai, nen, nang luong, do dai hop ly, nguoi xem
THAY gi, khi nao hop / tranh, cac o chu, o anh). Doc HET kho truoc khi chon — chon mau HOP NHAT voi tung khoanh khac,
khong chon theo thu tu liet ke, khong dung lai cung kieu cho moi video.
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
            sid, path = sfx_kit.family_file(x.get("type"))
            if not sid:
                continue
            if lib is None or sid not in lib:
                lib = {e["id"]: e for e in engine.sfx_list()}
            e = lib.get(sid) or {}
            out.append({"sfx_id": sid, "file": path, "start": round(t, 3), "purpose": MD._sfx_purpose(x.get("type")),
                        "_name": e.get("name"), "tags": e.get("tags") or [], "_lufs": e.get("lufs_m"),
                        "_from_layer": "%s:%s" % (s["id"], m["id"]), "_shot": True})
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
