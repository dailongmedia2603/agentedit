#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DO HOA CO CHU BANG ANH AI (user 2026-10-01): huy hieu / tem / nhan tron co chu (lop "badge" cua R4) KHONG ve bang
code nua — code ve ra mot khuon cung (vong tron cam co dinh, chu nho tro troi) giong nhau o moi video. Nay AI TAO
ANH CA PHAN TU: hinh khoi + chat lieu + trang tri / icon minh hoa dung y nghia + chu, theo phong cach + noi dung video.

KHAC chu anh AI (text_art.py): text_art chi tao CHU de cat tung tang chu. O day moi muc la MOT PHAN TU DO HOA HOAN
CHINH (chu chi la mot phan cua no); cac phan tu cung nhom (vd hang 3 huy hieu BƠI / TOÁN / THI ĐUA) tao CHUNG mot anh
de ra mot bo dong nhat, nhom dau lam MAU phong cach cho cac nhom sau.

  1 gom     : items_from(layers) — moi lop badge -> {key, kind, label, value, active, group, y_nghia, loi_noi}
  2 tao anh : moi nhom (<= 3 phan tu) = 1 anh 1024x1536 NEN TRONG SUOT, moi phan tu mot hang cach xa (Codex)
  3 cat+kiem: tach hang nhu text_art (segment_rows / row_masks); OCR phai doc ra dung chu; sai -> tao lai 1 lan ->
              van sai thi lop do giu huy hieu ve bang code (mau theo phong cach video, khong mau co dinh).
  4 dung    : motion_design.layers_to_spec dat anh vao lop badge (L["art"]); vao / ra / vi tri cua lop giu nguyen.
Ket qua (anh cache) nam trong plan["graphic_art"]; lap plan lai cung noi dung -> dung lai anh cu.
"""
import difflib
import hashlib
import os
import shutil
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

import prompt_store
import text_art

ART_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "graphicart")
ART_VERSION = 1
KINDS = ("badge",)          # loai lop do hoa CO CHU duoc ve bang anh AI
PER_SHEET = 3
MAX_CHARS = 24
OCR_MIN = 0.72


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


_GRAPHIC_ART_PROMPT = """Dung CONG CU TAO ANH (image generation) de tao dung MOT anh. Khong hoi lai, khong giai thich.

# ANH NAY LA GI
Mot BO PHAN TU DO HOA (graphic element) de dat de len video ngan doc 9:16 — KHONG phai tam chu. Moi phan tu la mot
khoi do hoa HOAN CHINH: hinh khoi (huy hieu tron, tem, nhan dan, nut, medal...) + chat lieu + trang tri / icon minh
hoa nho dung y nghia + CHU nam trong phan tu. Anh se duoc CAT RA TUNG HANG, moi hang mot phan tu.
Chu de / giong video: {chu_de}
Phong cach thi giac cua video: {phong_cach}

# CAC PHAN TU — TUNG HANG TU TREN XUONG
{phan_tu}

# THIET KE
- Cac phan tu trong anh la MOT BO dong nhat (cung hinh khoi, chat lieu, bang mau, kieu chu) nhung moi phan tu co
  diem rieng hop y nghia cua no (icon / hoa tiet nho minh hoa dung chu, vd "BƠI" -> gon song nuoc).
- Sang tao, co chieu sau va chat lieu (3D nhe, bong do, anh kim, giay sticker, men bong... tuy phong cach video),
  KHONG phang nham chan, KHONG giong clipart mac dinh. Mau lay tu phong cach video — khong mac dinh mau nao.
- Phan tu "dang chon" noi bat hon (sang hon / vien sang); "chua chon" diu hon.
- CHU: dung CHINH XAC tung ky tu tieng Viet (du dau, dung hoa / thuong), TO, DAM, chiem phan lon long phan tu, doc ro
  ca khi phan tu nho tren dien thoai. Chi co dung chu da ghi — khong them chu / so / logo / ky hieu nao khac.
{mau_tham_chieu}
# BO CUC BAT BUOC (de cat)
- Moi phan tu NAM RIENG MOT HANG, can giua, cac phan tu cung co lon (be ngang ~ 50-60% be ngang anh).
- Giua hai phan tu: DAI NGANG TRONG SUOT HOAN TOAN cao it nhat 1/8 chieu cao anh (tinh ca bong, tia sang, hat lap
  lanh). Moi chi tiet trang tri DINH LIEN voi phan tu cua no, khong troi tu do.
- NEN TRONG SUOT (PNG co kenh alpha). Khong nen mau, khong khung ngoai, khong vat nao khac.
TI LE KHUNG: 2:3 (doc)

Tao xong: SAO CHEP file anh vao DUNG duong dan: {out}
Chi tra loi dung duong dan do."""

_KIND_TEXT = {"badge": "HUY HIEU TRON (huy hieu / tem / medal tron)"}


# ---------------------------------------------------------------------------
# 1. GOM
# ---------------------------------------------------------------------------
def item_key(kind, label, value):
    return hashlib.sha1(("%s|%s|%s" % (kind, text_art.norm(label), text_art.norm(value))).encode("utf-8")).hexdigest()[:16]


def _words(label, value):
    return " ".join(x for x in (str(label or "").strip(), str(value or "").strip()) if x)


def _loi_noi(transcript_data, sid, t):
    for r in (transcript_data or {}).get(sid) or []:
        try:
            if isinstance(r, dict) and float(r.get("start", 0)) - 0.3 <= t <= float(r.get("end", 0)) + 0.3 and r.get("text"):
                return str(r["text"])[:120]
        except (TypeError, ValueError):
            continue
    return ""


def items_from(layers, transcript_data=None):
    """Moi lop badge co chu -> 1 muc (bo trung theo noi dung). Giu thu tu xuat hien + nhom (group)."""
    import motion_design as MD
    out, seen = [], set()
    for n, L in enumerate(layers or []):
        if not isinstance(L, dict) or L.get("type") not in KINDS:
            continue
        label, value = MD.strip_emoji(L.get("label")), MD.strip_emoji(L.get("value"))
        txt = _words(label, value)
        if not txt or len(txt) > MAX_CHARS:
            continue
        k = item_key(L["type"], label, value)
        if k in seen:
            continue
        seen.add(k)
        try:
            t = float(L.get("src_start"))
        except (TypeError, ValueError):
            t = None
        out.append({"key": k, "kind": L["type"], "label": label, "value": value, "active": bool(L.get("active", True)),
                    "group": str(L.get("group") or "solo%d" % n), "y_nghia": str(L.get("why") or "")[:160],
                    "loi_noi": _loi_noi(transcript_data, L.get("source_id"), t) if t is not None else ""})
    return out


def _groups(items, per=PER_SHEET):
    """Nhom theo group (giu thu tu), nhom > per phan tu chia nho — moi nhom = 1 anh."""
    order, by = [], {}
    for it in items:
        if it["group"] not in by:
            by[it["group"]] = []
            order.append(it["group"])
        by[it["group"]].append(it)
    out = []
    for g in order:
        rows = by[g]
        for i in range(0, len(rows), per):
            out.append(rows[i:i + per])
    return out


# ---------------------------------------------------------------------------
# 2. TAO ANH (Codex)
# ---------------------------------------------------------------------------
def _row_text(i, it):
    chu = ('chu to "%s", chu nho phia tren "%s"' % (it["value"], it["label"]) if it["value"] and it["label"]
           else 'chu "%s"' % (it["value"] or it["label"]))
    s = "Phan tu %d: %s — %s; %s" % (i + 1, _KIND_TEXT.get(it["kind"], it["kind"]), chu,
                                       "dang chon" if it["active"] else "chua chon")
    if it.get("y_nghia"):
        s += "; y nghia: %s" % it["y_nghia"]
    if it.get("loi_noi"):
        s += '; luc hien nguoi noi dang noi: "%s"' % it["loi_noi"]
    return s


_RETRY_NOTE = ("# LAN TAO LAI: lan truoc chu trong phan tu bi doc sai hoac cac phan tu dinh nhau — viet chu TO, RO, dung "
               "chinh ta tung dau; tach cac phan tu XA hon.\n")


def sheet_prompt(group, style, story, has_ref, out, brand=None, attempt=1):
    chu_de, phong_cach = text_art._style_text(style, story)
    ref = ("- ANH DINH KEM la bo phan tu khac cua CUNG video: GIU DUNG ngon ngu thiet ke do (hinh khoi, chat lieu, "
           "mau, kieu chu) — chi doi noi dung + icon theo y nghia.\n") if has_ref else ""
    txt = prompt_store.render("_GRAPHIC_ART_PROMPT", chu_de=chu_de, phong_cach=phong_cach,
                              phan_tu="\n".join(_row_text(i, it) for i, it in enumerate(group)),
                              mau_tham_chieu=ref, out=out)
    # Brand Guideline NOI THEM bang code (prompt tren sua duoc trong menu — ban da sua van phai co)
    import brand_guide
    extra = brand_guide.rule_text(brand, "text_art") + (_RETRY_NOTE if attempt > 1 else "")
    if not extra:
        return txt
    return txt.replace("\nTao xong:", "\n" + extra + "\nTao xong:", 1) if "\nTao xong:" in txt else txt + "\n" + extra


def prompt_fp():
    """Van tay prompt dang dung (prompt nay own_key -> nam trong khoa cache rieng cua buoc GFX-art)."""
    return hashlib.sha1(_p("_GRAPHIC_ART_PROMPT").encode("utf-8")).hexdigest()[:12]


def gen_sheet(group, style, story, ref=None, timeout=480, brand=None, attempt=1):
    """Tao 1 anh cho 1 nhom. Cache theo noi dung prompt + anh mau. Tra duong dan PNG hoac None."""
    import asset_gen
    import cli_providers
    os.makedirs(ART_DIR, exist_ok=True)
    probe = sheet_prompt(group, style, story, bool(ref), "{out}", brand=brand, attempt=attempt)
    refh = hashlib.sha1(open(ref, "rb").read()).hexdigest()[:10] if ref and os.path.isfile(ref) else ""
    k = hashlib.sha1((probe + "|" + refh + "|v%d" % ART_VERSION).encode("utf-8")).hexdigest()[:20]
    out = os.path.join(ART_DIR, "gfx_%s.png" % k)
    if os.path.isfile(out):
        return out
    path = cli_providers.find_bin("gpt")
    if not path:
        raise RuntimeError("Chua cai Codex CLI nen khong tao duoc do hoa anh AI — mo Doctor de app tu cai")
    model = cli_providers.SPEC["gpt"]["default_model"]
    work = tempfile.mkdtemp(prefix="gfxart-")
    target = os.path.join(work, "anh.png")
    argv = [path, "exec", "--skip-git-repo-check", "--ignore-user-config", "--enable", "image_generation",
            "--sandbox", "workspace-write", "--color", "never", "-C", work, "-m", model, "-"]
    if ref and os.path.isfile(ref):
        argv += ["-i", ref]              # anh mau phong cach — dat SAU "-" (xem cli_providers._codex_chat)
    text = sheet_prompt(group, style, story, bool(ref), target, brand=brand, attempt=attempt)
    asset_gen.log_step_call("graphic-art", "cli:codex", model, "", text, params={"phan_tu": len(group), "mau": bool(ref)})
    t0 = time.time()
    src, rc, tail = asset_gen._run_codex(argv, text, work, target, timeout)
    if not src:
        asset_gen.log_step_response("graphic-art", "cli:codex", tail, error="khong co file anh")
        shutil.rmtree(work, ignore_errors=True)
        return None
    shutil.copy2(src, out)
    shutil.rmtree(work, ignore_errors=True)
    asset_gen.log_step_response("graphic-art", "cli:codex", "bo do hoa: %s (%.0fs)" % (out, time.time() - t0))
    return out


# ---------------------------------------------------------------------------
# 3. CAT + KIEM
# ---------------------------------------------------------------------------
def contains(ocr, want):
    """Chu can co (bo dau, bo cach) nam trong chu OCR doc duoc (phan tu co the co them net trang tri doc nham)."""
    a, b = text_art.norm(ocr).replace(" ", ""), text_art.norm(want).replace(" ", "")
    if not a or not b:
        return 0.0
    if b in a:
        return 1.0
    best = 0.0
    for n in {max(1, len(b) - 1), len(b), len(b) + 1}:
        for i in range(0, max(1, len(a) - n + 1)):
            best = max(best, difflib.SequenceMatcher(None, a[i:i + n], b).ratio())
    return best


def _vision_ocr():
    """Co Apple Vision (doc ca khoi, nhieu dong)? Khong (Windows / STUDIO_VISION=onnx) -> OCR 1 dong (PP-OCR CTC)."""
    if os.environ.get("STUDIO_VISION") == "onnx":
        return False
    try:
        import Vision  # noqa: F401
        return True
    except Exception:
        return False


def read_text(crop, want):
    """OCR chu trong phan tu -> (chu doc duoc, do khop) hoac (None, None) khi may khong co OCR.
    OCR 1 dong (Windows) doc CA huy hieu tron ra rac (do that: 'El', '0', '@' cho BƠI / THI ĐUA / LỚP 2) -> quet them
    cac DAI NGANG (cao 20-38% phan tu, ca be ngang va bo 8% mep) lay dai khop nhat."""
    ocr = text_art._ocr(crop)
    sim = contains(ocr, want) if ocr else 0.0
    if (ocr is None and _vision_ocr()) or sim >= OCR_MIN or _vision_ocr():
        return ocr, (sim if ocr is not None else None)
    H, W = crop.shape[:2]
    best = (ocr or "", sim)
    for frac in (0.2, 0.28, 0.38):
        h = max(8, int(H * frac))
        step = max(4, int(H * 0.06))
        for y in range(0, H - h + 1, step):
            for x0, x1 in ((0, W), (int(W * 0.08), int(W * 0.92))):
                t = text_art._ocr(crop[y:y + h, x0:x1])
                if not t:
                    continue
                sc = contains(t, want)
                if sc > best[1]:
                    best = (t, sc)
                    if sc >= OCR_MIN:
                        return best
    if ocr is None and not best[0]:
        return None, None              # khong co OCR nao chay duoc (thieu model) -> khong kiem, nhu text_art
    return best


def slice_sheet(path, group):
    """Anh 1 nhom -> ({key: {...}}, [(key, ly_do)]). Moi hang = 1 phan tu; phai tach dung so hang + doc ra dung chu."""
    import numpy as np
    img = text_art._rgba(path)
    if img is None:
        return {}, [(it["key"], "khong doc duoc anh") for it in group]
    H, W = img.shape[:2]
    al = img[..., 3]
    if (al < 10).mean() < 0.2:
        return {}, [(it["key"], "anh khong co nen trong suot") for it in group]
    core = al > 180
    rows = text_art.segment_rows(core, len(group))
    if not rows:
        return {}, [(it["key"], "khong tach duoc %d phan tu rieng" % len(group)) for it in group]
    soft = al > 8
    bounds = []
    for i, (r0, r1) in enumerate(rows):
        top = (rows[i - 1][1] + r0) // 2 if i else 0
        bot = (r1 + rows[i + 1][0]) // 2 if i + 1 < len(rows) else H - 1
        bounds.append((top, bot))
    owner = text_art.row_masks(soft, rows, bounds)
    os.makedirs(ART_DIR, exist_ok=True)
    base = os.path.splitext(os.path.basename(path))[0]
    res, bad = {}, []
    for i, (it, (r0, r1)) in enumerate(zip(group, rows)):
        mine = owner == i
        ys = np.nonzero(mine.any(axis=1))[0]
        xs = np.nonzero(mine.any(axis=0))[0]
        if not ys.size or not xs.size:
            bad.append((it["key"], "phan tu %d trong" % (i + 1)))
            continue
        y0, y1, x0, x1 = int(ys[0]), int(ys[-1]), int(xs[0]), int(xs[-1])
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if w < 0.15 * W or h < 0.06 * H or not 0.4 <= w / float(h) <= 2.5:
            bad.append((it["key"], "phan tu %d sai hinh (%dx%d)" % (i + 1, w, h)))
            continue
        crop = img[y0:y1 + 1, x0:x1 + 1].copy()
        crop[..., 3] = np.where(mine[y0:y1 + 1, x0:x1 + 1], crop[..., 3], 0)
        want = _words(it["label"], it["value"])
        ocr, sim = read_text(crop, want)
        if sim is not None and sim < OCR_MIN:
            bad.append((it["key"], "phan tu %d doc ra %r, can %r" % (i + 1, (ocr or "")[:40], want)))
            continue
        fp = os.path.join(ART_DIR, "%s_p%d.png" % (base, i + 1))
        if not text_art._save_png(crop, fp):
            bad.append((it["key"], "khong luu duoc phan tu %d" % (i + 1)))
            continue
        cc = np.nonzero((core & mine)[y0:y1 + 1, x0:x1 + 1].any(axis=0))[0]
        res[it["key"]] = {"file": fp, "w": w, "h": h, "core_w": int(cc[-1] - cc[0] + 1) if cc.size else w,
                          "text": want, "ocr": ocr or "", "ocr_sim": None if sim is None else round(sim, 2)}
    return res, bad


# ---------------------------------------------------------------------------
# 4. DIEU PHOI
# ---------------------------------------------------------------------------
def make_graphic_art(items, style=None, story=None, log=None, emit=None, workers=3, brand=None):
    """Tao + cat do hoa anh cho moi phan tu. Tra {"items": {key: {...}}, "failed": [{key, text, ly_do}]}."""
    got, failed = {}, []
    if not items:
        return {"items": got, "failed": failed}
    groups = _groups(items)

    def run(group, ref, attempt=1):
        try:
            p = gen_sheet(group, style, story, ref=ref, attempt=attempt, **({"brand": brand} if brand else {}))
        except Exception as ex:
            return None, {}, [(it["key"], "tao anh loi: %s" % str(ex)[:120]) for it in group]
        if not p:
            return None, {}, [(it["key"], "Codex khong tao duoc anh") for it in group]
        ok, bad = slice_sheet(p, group)
        return p, ok, bad

    first, ok, bad = run(groups[0], None)
    got.update(ok)
    ref = first if first and ok else None     # nhom dau DAT -> mau phong cach cho moi nhom sau (ca video mot bo)
    last_err = dict(bad)
    if emit:
        emit("Đồ hoạ ảnh AI: nhóm 1/%d xong (%d/%d phần tử đạt)" % (len(groups), len(ok), len(groups[0])))
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for _p_, ok, bad in ex.map(lambda g: run(g, ref), groups[1:]):
            got.update(ok)
            last_err.update(dict(bad))
    # tao lai 1 lan cho phan tu loi — CA NHOM tao lai (giu bo dong nhat), chi lay phan tu con thieu
    retry = [g for g in groups if any(it["key"] not in got for it in g)]
    if retry:
        if emit:
            emit("Đồ hoạ ảnh AI: tạo lại %d nhóm lỗi chính tả / bố cục" % len(retry))
        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            for _p_, ok, bad in ex.map(lambda g: run(g, ref, 2), retry):
                for k, v in ok.items():
                    got.setdefault(k, v)
                last_err.update(dict(bad))
    for it in items:
        if it["key"] not in got:
            failed.append({"key": it["key"], "text": _words(it["label"], it["value"]),
                           "ly_do": last_err.get(it["key"], "khong dat sau khi tao lai")})
    return {"items": got, "failed": failed, "ref": ref}


def lookup(plan):
    """plan['graphic_art'] -> {key: muc} (chi muc con file). {} neu khong co."""
    g = plan.get("graphic_art") if isinstance(plan.get("graphic_art"), dict) else {}
    return {k: v for k, v in (g.get("items") or {}).items()
            if isinstance(v, dict) and v.get("file") and os.path.isfile(v["file"])}
