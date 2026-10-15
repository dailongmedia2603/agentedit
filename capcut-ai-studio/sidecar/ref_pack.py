#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO ANH THAM CHIEU cua VIDEO MAU (user 2026-10-15): "khi lap ke hoach + code hieu ung, Claude phai THAY ANH THAT cua
video mau (chu, chuyen dong, hieu ung) de lam lai cho chuan, thay vi chi doc mot doan mo ta. Truyen DUNG anh cho dung
phan (phan chu thi anh chu), chi truyen phan can thiet: video mau dung 1 kieu chu xuyen suot thi chi 1 anh".

Truoc day: luot 2 (style_kit) cat dai khung day gui Gemini roi XOA anh; R4 / FX / chu anh AI chi doc mo ta chu.

Luot 3 (`build`): Gemini xem lai cac dai khung day + style_kit vua boc -> liet ke KIEU CHU khac nhau THAT SU (cung font
+ mau + vien + hieu ung = 1 kieu), HIEU UNG / chuyen dong / bo cuc dac trung, vai khung TONG THE — moi muc kem GIAY
(gio ghi tren o khung) + VUNG (0..1) + chu doc duoc. Code (khong tin vi tri uoc luong cua model):
  - trich khung GOC do phan giai day du o dung giay, OCR (Vision vi + en) tim hop chu khop "chu_mau" -> cat chat quanh
    chu (+ le); khong khop -> vung Gemini + le rong; khong co chu nao -> danh dau chua xac minh.
  - anh dong (chuyen dong vao cua chu / hieu ung): 8 khung trong [tu, den] ghep 4x2 co ghi gio.
  - LOC TRUNG kieu chu: cung font gan nhat + chu ky mau giong (cosine >= 0.93) -> gop (giu alias id).
  - luu vinh vien: ~/.capcut-studio/library/ref_pack/<van tay file video mau>/ (+ pack.json); ban phan tich luu
    "ref_pack" (ten file tuong doi) -> lap ke hoach lai khong goi Gemini.
`images_for(pack, buoc, ids)` -> chi anh can cho TUNG buoc (DD: tong the; R4: kieu chu + anh vao + tong the; R5: kieu
chu phu de; FX-plan: hieu ung; FX-code: chi hieu ung duoc goi ten; TXT-art: dung kieu chu cua cum).
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata

import analysis_library
import prompt_store
import providers

PACK_VERSION = 2          # 2: so_lan + de_doc tung kieu chu (gioi han tan suat, 2026-10-15)
PACK_ROOT = os.path.join(analysis_library.LIB_DIR, "ref_pack")
MAX_STYLES = 5
MAX_EFFECTS = 5
STILL_MAX_W = 900
SHEET_CELL_W = 300
COLOR_SAME = 0.93
VAI_PHU_DE = ("phu_de", "subtitle", "caption")

_RM_REF_PACK_PROMPT = """Ban la MOTION DESIGNER dang lap BO ANH THAM CHIEU tu mot video mau, de he thong cat ANH THAT cua
tung thanh phan dua cho nguoi dung lai phong cach (thay anh that thay vi doc mo ta).

Ban nhan: cac DAI KHUNG DAY (moi anh 12 khung ~2 giay, doc trai->phai tren->duoi, GIO ghi o goc moi o) + bo phong
cach (style_kit) da boc tu chinh video nay + tom tat luot 1.

LIET KE (chi cai THAY RO trong anh; giay PHAI lay dung GIO GHI tren o khung noi thanh phan hien ro nhat):
1. kieu_chu: cac KIEU CHU KHAC NHAU THAT SU trong video (phu de, chu nhan to, the chu, chu tren do hoa...). Hai cum
   chu co CUNG font + mau + vien / bong / glow + cach dat = MOT kieu (du noi dung khac). Video chi dung 1 kieu chu
   xuyen suot -> chi 1 muc. Toi da 5. Moi muc: vai (phu_de | chu_nhan | the_chu | chu_do_hoa | tieu_de | cta | khac),
   mo_ta (font gi, day / mong, hoa / thuong, mau chu, vien, bong, glow, nghieng, nen hop, dat o dau so voi nguoi),
   font_gan_nhat (id trong danh muc font ben duoi), chu_mau (chu DOC DUOC trong khung do — chep dung chu that),
   giay (o khung thay ro NHAT, chu da vao xong), vung [x0, y0, x1, y1] (0..1 theo khung, bao quanh cum chu),
   vao {tu_giay, den_giay} (doan chu dang XUAT HIEN — de xem chuyen dong vao) hoac null,
   dung_cho: ten cac recipe / vai trong style_kit dung kieu chu nay,
   so_lan: so lan (cum) kieu chu nay xuat hien trong CA video mau (uoc tinh; phu de chay suot = 0 / bo qua),
   de_doc: true neu doc ro tung chu cai (dung duoc cho thuat ngu / so); false neu la chu trang tri (cat dan, bien dang).
2. hieu_ung: cac HIEU UNG / CHUYEN DONG / BO CUC dac trung (camera: zoom, rung, nhoe, fisheye; chuyen canh; lop phu
   do hoa: mui ten, khung, vet; bo cuc: chia doi, the, nen do hoa; chu chay...). Moi loai KHAC NHAU 1 muc, toi da 5:
   id, loai (camera | chuyen_canh | lop_phu | bo_cuc | do_hoa), mo_ta (thay gi, chuyen dong the nao qua cac khung),
   tu_giay, den_giay (doan dien ra, 0.4-2.5 giay).
3. tong_the: 3-6 giay dai dien cho NHIN TONG THE (cac bo cuc / mau / anh sang khac nhau cua video).

# SCHEMA (CHI JSON)
{"kieu_chu": [{"id": "chu1", "vai": "...", "mo_ta": "...", "font_gan_nhat": "<id>", "chu_mau": "...", "giay": 5.0,
               "vung": [0.1, 0.6, 0.9, 0.7], "vao": {"tu_giay": 4.6, "den_giay": 5.0}, "dung_cho": ["..."],
               "so_lan": 3, "de_doc": true}],
 "hieu_ung": [{"id": "hu1", "loai": "...", "mo_ta": "...", "tu_giay": 12.0, "den_giay": 13.2}],
 "tong_the": [0.5, 8.0, 20.0]}
CHI tra ve JSON."""


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


def prompt_fp():
    return hashlib.sha1(_p("_RM_REF_PACK_PROMPT").encode("utf-8")).hexdigest()[:10]


def pack_dir(fp):
    return os.path.join(PACK_ROOT, str(fp))


def _ff():
    import remotion_plan
    return remotion_plan._ffbin("ffmpeg")


def _run(argv, timeout=120):
    try:
        r = subprocess.run(argv, capture_output=True, timeout=timeout)
        return r.returncode
    except Exception:
        return -1


def _plain(s):
    s = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.findall(r"[a-z0-9]+", s)


# ---------------------------------------------------------------------------
# KHUNG + OCR
# ---------------------------------------------------------------------------
def frame_at(video, t, out):
    """Khung GOC do phan giai day du o giay t -> out (jpg). True neu co file."""
    rc = _run([_ff(), "-hide_banner", "-loglevel", "error", "-ss", "%.3f" % max(0.0, float(t)), "-i", video,
               "-frames:v", "1", "-q:v", "2", "-y", out], timeout=60)
    return rc == 0 and os.path.isfile(out)


def ocr_boxes(img_path):
    """[(chu, (x0, y0, x1, y1))] — hop chu (0..1, goc tren-trai) bang Vision (vi + en). Khong co Vision -> []."""
    try:
        if os.environ.get("STUDIO_VISION") == "onnx":
            raise ImportError("ep ONNX")
        import Vision
        from Foundation import NSURL
    except Exception:
        return []
    out = []
    try:
        req = Vision.VNRecognizeTextRequest.alloc().init()
        req.setRecognitionLevel_(0)
        req.setRecognitionLanguages_(["vi-VT", "en-US"])
        req.setUsesLanguageCorrection_(False)
        hd = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(img_path), None)
        hd.performRequests_error_([req], None)
        for r in req.results() or []:
            cand = r.topCandidates_(1)[0]
            bb = r.boundingBox()
            x0, y0 = float(bb.origin.x), 1.0 - float(bb.origin.y + bb.size.height)
            out.append((str(cand.string()), (x0, y0, x0 + float(bb.size.width), y0 + float(bb.size.height))))
    except Exception:
        return []
    return out


def _iou_any(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def _union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def locate_text(img_path, want_text, hint):
    """Hop chu that cua kieu chu trong khung: OCR khop chu_mau (>= 50% tu) uu tien hop gan / trong vung goi y. Tra
    (box, xac_minh: bool, chu_ocr)."""
    boxes = ocr_boxes(img_path)
    want = set(_plain(want_text))
    hint = tuple(hint) if hint and len(hint) == 4 else None
    hits = []
    for txt, b in boxes:
        toks = set(_plain(txt))
        if want and toks and len(toks & want) / float(len(toks)) >= 0.5:
            hits.append((txt, b))
    if hits and hint:
        near = [h for h in hits if _iou_any(h[1], _grow(hint, 0.15))]
        hits = near or hits
    if hits:
        box = _union([b for _t, b in hits])
        got = set(t for txt, _b in hits for t in _plain(txt))
        if want and len(got & want) / float(len(want)) < 0.8 and hint:
            # OCR chi doc duoc MOT PHAN cum chu (vd phan chu trung mau nen) -> mo hop ra ca vung goi y, giu dung hang chu
            box = (min(box[0], hint[0]), min(box[1], max(hint[1], box[1] - (box[3] - box[1]))),
                   max(box[2], hint[2]), max(box[3], min(hint[3], box[3] + (box[3] - box[1]))))
        return box, True, " ".join(t for t, _b in hits)
    if hint:
        inside = [(t, b) for t, b in boxes if _iou_any(b, hint)]
        if inside:
            return _union([b for _t, b in inside]), True, " ".join(t for t, _b in inside)
        return hint, False, ""
    return None, False, ""


def _grow(b, k):
    w, h = b[2] - b[0], b[3] - b[1]
    return (max(0.0, b[0] - w * k), max(0.0, b[1] - h * k), min(1.0, b[2] + w * k), min(1.0, b[3] + h * k))


def crop(img_path, box, out, pad=0.18, min_w=0.22, min_h=0.06):
    """Cat vung box (0..1) + le, toi thieu min_w x min_h khung, rong toi da STILL_MAX_W px."""
    from PIL import Image
    with Image.open(img_path) as im:
        im = im.convert("RGB")
        W, H = im.size
        x0, y0, x1, y1 = box
        w, h = x1 - x0, y1 - y0
        px, py = max(w * pad, 0.015), max(h * pad * 1.6, 0.012)
        x0, y0, x1, y1 = x0 - px, y0 - py, x1 + px, y1 + py
        if x1 - x0 < min_w:
            c = (x0 + x1) / 2
            x0, x1 = c - min_w / 2, c + min_w / 2
        if y1 - y0 < min_h:
            c = (y0 + y1) / 2
            y0, y1 = c - min_h / 2, c + min_h / 2
        x0, y0, x1, y1 = max(0.0, x0), max(0.0, y0), min(1.0, x1), min(1.0, y1)
        c = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
        if c.width > STILL_MAX_W:
            c = c.resize((STILL_MAX_W, max(1, int(c.height * STILL_MAX_W / c.width))))
        c.save(out, quality=90)
    return (round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4))


def sheet(video, times, out, box=None, cols=4, label=True):
    """Ghep cac khung (giay trong `times`) thanh 1 anh co ghi gio; box -> cat vung do (chuyen dong cua chu)."""
    from PIL import Image, ImageDraw, ImageFont
    work = tempfile.mkdtemp(prefix="refpack-")
    try:
        cells = []
        for i, t in enumerate(times):
            fp = os.path.join(work, "f%02d.jpg" % i)
            if not frame_at(video, t, fp):
                continue
            im = Image.open(fp).convert("RGB")
            if box:
                W, H = im.size
                im = im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)))
            cw = SHEET_CELL_W
            im = im.resize((cw, max(1, int(im.height * cw / max(1, im.width)))))
            cells.append((t, im))
        if not cells:
            return False
        ch = max(c[1].height for c in cells)
        rows = (len(cells) + cols - 1) // cols
        out_im = Image.new("RGB", (cols * SHEET_CELL_W, rows * ch), (16, 16, 16))
        draw = ImageDraw.Draw(out_im)
        try:
            font = ImageFont.load_default(size=20)
        except TypeError:
            font = ImageFont.load_default()
        for k, (t, im) in enumerate(cells):
            x, y = (k % cols) * SHEET_CELL_W, (k // cols) * ch
            out_im.paste(im, (x, y))
            if label:
                nhan = "%d · %.2fs" % (k + 1, t)
                draw.rectangle([x, y, x + 12 + 11 * len(nhan), y + 26], fill=(0, 0, 0))
                draw.text((x + 6, y + 3), nhan, fill=(255, 214, 0), font=font)
            draw.rectangle([x, y, x + SHEET_CELL_W - 1, y + ch - 1], outline=(70, 70, 70), width=1)
        out_im.save(out, quality=86)
        return True
    finally:
        shutil.rmtree(work, ignore_errors=True)


def color_sig(img_path):
    """Chu ky mau (histogram 4x4x4 chuan hoa) cua anh chu — so sanh 2 kieu chu co cung bang mau."""
    from PIL import Image
    import numpy as np
    with Image.open(img_path) as im:
        a = np.asarray(im.convert("RGB").resize((96, 48)), dtype=np.int32) // 64
    idx = (a[..., 0] * 16 + a[..., 1] * 4 + a[..., 2]).ravel()
    h = np.bincount(idx, minlength=64).astype(np.float64)
    n = np.linalg.norm(h)
    return (h / n).tolist() if n else h.tolist()


def _cos(a, b):
    import numpy as np
    a, b = np.asarray(a), np.asarray(b)
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a.dot(b) / d) if d else 0.0


# ---------------------------------------------------------------------------
# DUNG BO ANH
# ---------------------------------------------------------------------------
def _num(v, d=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def _box(v):
    if isinstance(v, (list, tuple)) and len(v) == 4:
        b = [_num(x) for x in v]
        if all(x is not None for x in b):
            b = [min(1.0, max(0.0, x)) for x in b]
            if b[2] > b[0] and b[3] > b[1]:
                return tuple(b)
    return None


def gpt_anchors(strips, kit, first_pass, log=None):
    """Luot 3 (Gemini): dai khung day + style_kit -> kieu chu / hieu ung / tong the kem giay + vung."""
    import motion_design
    import remotion_plan
    fonts = [f.get("id") for f in remotion_plan.load_catalog().get("fonts") or [] if isinstance(f, dict)]
    kit_v = {k: (kit or {}).get(k) for k in ("fonts", "palette", "subtitle", "text_system", "camera", "transitions",
                                             "layouts") if (kit or {}).get(k)}
    if (kit or {}).get("recipes"):
        kit_v["recipes"] = [{"name": r.get("name"), "when": r.get("when")} for r in kit["recipes"] if isinstance(r, dict)]
    tom = {k: (first_pass or {}).get(k) for k in ("summary", "format", "captions", "editing_language", "visual_identity")
           if (first_pass or {}).get(k)}
    user = {"style_kit": kit_v, "phan_tich_luot_1": tom, "danh_muc_font": fonts,
            "dai_khung": [{"anh_so": i + 1, "tu_giay": round(a, 2), "den_giay": round(b, 2)}
                          for i, (a, b, _) in enumerate(strips)]}
    _ = motion_design  # (giu import: dsl khong can o luot nay)
    prompt = _p("_RM_REF_PACK_PROMPT") + "\n\n# DU LIEU\n" + json.dumps(user, ensure_ascii=False)
    if log:
        log("Luot 3: Gemini chi ra kieu chu / hieu ung / khung tong the de cat anh tham chieu...")
    return providers.gemini_files(
        [{"path": sp, "label": "anh_so=%d: dai khung %.2f-%.2f giay" % (i + 1, a, b)} for i, (a, b, sp) in enumerate(strips)],
        prompt, step_label="RM-ref-pack", log=log)


def build(video, duration, cuts, kit, first_pass, fp, log=None, anchors=None):
    """Dung bo anh tham chieu cho video mau `video` (ban lam viec SDR) -> pack dict (luu pack.json + anh vao
    pack_dir(fp)). anchors: ket qua luot 3 da co (test / goi lai) -> khong goi Gemini."""
    import reference_video as RV
    out_dir = pack_dir(fp)
    tmp_dir = out_dir + ".tmp"
    shutil.rmtree(tmp_dir, ignore_errors=True)
    os.makedirs(tmp_dir, exist_ok=True)
    duration = float(duration or 0)
    if anchors is None:
        work = tempfile.mkdtemp(prefix="refpack-strips-")
        try:
            strips = RV.make_strips(video, RV.strip_windows(duration, cuts or []), work)
            if not strips:
                raise RuntimeError("khong cat duoc dai khung tu video mau")
            anchors = gpt_anchors(strips, kit, first_pass, log=log)
        finally:
            shutil.rmtree(work, ignore_errors=True)
    if not isinstance(anchors, dict):
        raise RuntimeError("Gemini tra ve khong phai JSON object (luot 3)")
    import remotion_plan
    fonts_ok = {f.get("id") for f in remotion_plan.load_catalog().get("fonts") or [] if isinstance(f, dict)}

    def clamp_t(t):
        t = _num(t)
        return None if t is None else max(0.0, min(duration - 0.05 if duration else t, t))

    styles = []
    for i, k in enumerate((anchors.get("kieu_chu") or [])[:MAX_STYLES + 3]):
        if not isinstance(k, dict):
            continue
        t = clamp_t(k.get("giay"))
        if t is None:
            continue
        sid = re.sub(r"[^a-z0-9_]+", "", str(k.get("id") or "chu%d" % (i + 1)).lower())[:16] or "chu%d" % (i + 1)
        fr = os.path.join(tmp_dir, "_f_%s.jpg" % sid)
        box, ok, ocr_txt = None, False, ""
        for dt in (0.0, 0.12, -0.12, 0.3):           # chu dang chuyen dong -> thu khung lan can
            if not frame_at(video, max(0.0, t + dt), fr):
                continue
            box, ok, ocr_txt = locate_text(fr, k.get("chu_mau"), _box(k.get("vung")))
            if ok:
                t = max(0.0, t + dt)
                break
        if not box:
            continue
        still = "chu_%s.jpg" % sid
        used = crop(fr, box, os.path.join(tmp_dir, still))
        os.remove(fr) if os.path.isfile(fr) else None
        vao = k.get("vao") if isinstance(k.get("vao"), dict) else None
        anh_dong = None
        if vao:
            a, b = clamp_t(vao.get("tu_giay")), clamp_t(vao.get("den_giay"))
            if a is not None and b is not None and b > a:
                if b - a < 0.4:
                    a, b = max(0.0, a - 0.2), b + 0.2
                b = min(b, a + 2.5)
                times = [a + (b - a) * j / 7.0 for j in range(8)]
                nm = "chu_%s_vao.jpg" % sid
                if sheet(video, times, os.path.join(tmp_dir, nm), box=_grow(used, 0.25)):
                    anh_dong = nm
        font = k.get("font_gan_nhat") if k.get("font_gan_nhat") in fonts_ok else None
        styles.append({"id": sid, "vai": str(k.get("vai") or "khac")[:20], "mo_ta": str(k.get("mo_ta") or "")[:400],
                       "font": font, "chu_mau": str(k.get("chu_mau") or "")[:80], "giay": round(t, 2),
                       "vung": list(used), "anh": still, "anh_vao": anh_dong, "xac_minh": bool(ok),
                       "ocr": ocr_txt[:80], "dung_cho": [str(x)[:60] for x in k.get("dung_cho") or []][:8],
                       "alias": [], "_sig": color_sig(os.path.join(tmp_dir, still)),
                       "so_lan": int(_num(k.get("so_lan"), 0) or 0) or None,
                       "de_doc": False if k.get("de_doc") is False else True})
    # LOC TRUNG: cung font gan nhat + bang mau giong -> 1 kieu (anh dau tien, uu tien ban da xac minh bang OCR)
    styles.sort(key=lambda s: (not s["xac_minh"],))
    kept = []
    for s in styles:
        dup = next((k for k in kept if k["font"] == s["font"] and _cos(k["_sig"], s["_sig"]) >= COLOR_SAME
                    and (k["vai"] in VAI_PHU_DE) == (s["vai"] in VAI_PHU_DE)), None)
        if dup:
            dup["alias"].append(s["id"])
            if dup.get("so_lan") and s.get("so_lan"):
                dup["so_lan"] += s["so_lan"]
            dup["dung_cho"] = list(dict.fromkeys(dup["dung_cho"] + s["dung_cho"]))[:10]
            for f in (s["anh"], s["anh_vao"]):
                if f and os.path.isfile(os.path.join(tmp_dir, f)):
                    os.remove(os.path.join(tmp_dir, f))
            continue
        kept.append(s)
    kept = kept[:MAX_STYLES]
    for s in kept:
        s.pop("_sig", None)
    effects = []
    for i, e in enumerate((anchors.get("hieu_ung") or [])[:MAX_EFFECTS]):
        if not isinstance(e, dict):
            continue
        a, b = clamp_t(e.get("tu_giay")), clamp_t(e.get("den_giay"))
        if a is None or b is None or b <= a:
            continue
        b = min(b, a + 2.5)
        if b - a < 0.4:
            a, b = max(0.0, a - 0.2), b + 0.2
        hid = re.sub(r"[^a-z0-9_]+", "", str(e.get("id") or "hu%d" % (i + 1)).lower())[:16] or "hu%d" % (i + 1)
        nm = "hu_%s.jpg" % hid
        if sheet(video, [a + (b - a) * j / 7.0 for j in range(8)], os.path.join(tmp_dir, nm)):
            effects.append({"id": hid, "loai": str(e.get("loai") or "khac")[:20], "mo_ta": str(e.get("mo_ta") or "")[:400],
                            "tu_giay": round(a, 2), "den_giay": round(b, 2), "anh": nm})
    tt = [t for t in (clamp_t(x) for x in (anchors.get("tong_the") or [])[:6]) if t is not None]
    if not tt and duration:
        tt = [duration * f for f in (0.08, 0.35, 0.65, 0.92)]
    tong = "tong_the.jpg" if tt and sheet(video, sorted(tt), os.path.join(tmp_dir, "tong_the.jpg"), cols=3) else None
    pack = {"v": PACK_VERSION, "fp": fp, "p": prompt_fp(), "kieu_chu": kept, "hieu_ung": effects, "tong_the": tong,
            "dir": out_dir,           # dir: UI hien anh (may chu media); code doc anh qua pack_dir(fp)
            "ref_duration": round(duration, 2)}
    with open(os.path.join(tmp_dir, "pack.json"), "w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, indent=1)
    shutil.rmtree(out_dir, ignore_errors=True)
    os.replace(tmp_dir, out_dir)
    if log:
        log("Bo anh tham chieu: %d kieu chu (%d gop trung), %d hieu ung, %s" % (
            len(kept), sum(len(s["alias"]) for s in kept), len(effects), "co anh tong the" if tong else "khong anh tong the"))
    return pack


# ---------------------------------------------------------------------------
# DUNG / KIEM
# ---------------------------------------------------------------------------
def with_dir(pack):
    """Them duong dan thu muc anh tren MAY NAY (UI hien anh) — pack cu / chep tu may khac."""
    if isinstance(pack, dict) and pack.get("fp"):
        pack["dir"] = pack_dir(pack["fp"])
    return pack


def files_ok(pack):
    if not isinstance(pack, dict) or pack.get("v") != PACK_VERSION or not pack.get("fp"):
        return False
    d = pack_dir(pack["fp"])
    need = [s.get("anh") for s in pack.get("kieu_chu") or []] + [e.get("anh") for e in pack.get("hieu_ung") or []]
    return bool(need or pack.get("tong_the")) and all(os.path.isfile(os.path.join(d, f)) for f in need if f)


def load(fp):
    try:
        with open(os.path.join(pack_dir(fp), "pack.json"), encoding="utf-8") as f:
            p = json.load(f)
        return p if files_ok(p) else None
    except Exception:
        return None


def ensure(reference_analysis, log=None):
    """Bo anh tham chieu cho phan tich video mau: dung lai (trong phan tich / tren dia) hoac DUNG MOI (video mau con file +
    co style_kit). Ghi lai vao thu vien phan tich. Loi / khong co video mau -> None (cac buoc chay nhu truoc)."""
    if not isinstance(reference_analysis, dict) or not reference_analysis:
        return None
    pk = reference_analysis.get("ref_pack")
    if files_ok(pk):
        return with_dir(pk)
    rv = reference_analysis.get("reference_video") if isinstance(reference_analysis.get("reference_video"), dict) else {}
    path = rv.get("path")
    if not path or not os.path.isfile(path):
        return None
    fp = analysis_library.fingerprint(path)
    if not fp:
        return None
    pk = load(fp)
    if pk:
        reference_analysis["ref_pack"] = pk
        return pk
    if not reference_analysis.get("style_kit"):
        return None
    import media_sdr
    import reference_video as RV
    import remotion_plan
    work = media_sdr.working_path(path, log=log)
    info = remotion_plan.probe(work)
    duration = float(rv.get("duration") or reference_analysis.get("duration") or info.get("duration") or 0)
    cuts = RV.detect_cuts(work, duration)
    pk = build(work, duration, cuts, reference_analysis.get("style_kit"), reference_analysis, fp, log=log)
    reference_analysis["ref_pack"] = pk
    try:
        saved = analysis_library.get_reference(path, "ref_video")
        if saved:
            saved.pop("_library", None)
            saved["ref_pack"] = pk
            analysis_library.save_reference(path, "ref_video", saved, name=rv.get("name"), duration=duration)
    except Exception:
        pass
    return pk


def fingerprint(pack):
    """Van tay cho khoa cache cac buoc dung anh (doi anh / mo ta -> buoc chay lai)."""
    if not pack:
        return None
    blob = json.dumps({k: pack.get(k) for k in ("v", "fp", "p", "kieu_chu", "hieu_ung", "tong_the")},
                      ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:12]


def resolve_style(pack, sid):
    """id kieu chu (ke ca id da bi gop) -> muc kieu chu."""
    for s in (pack or {}).get("kieu_chu") or []:
        if sid == s["id"] or sid in (s.get("alias") or []):
            return s
    return None


def main_style(pack):
    """Kieu chu NHAN chinh (khong phai phu de) — mac dinh cho cum chu khong ghi kieu."""
    ks = (pack or {}).get("kieu_chu") or []
    return next((s for s in ks if s["vai"] not in VAI_PHU_DE), ks[0] if ks else None)


def view(pack, buoc):
    """Mo ta gon (id, vai, mo ta, font, file anh) cua phan ANH ma buoc `buoc` nhan — de AI noi anh voi id."""
    if not pack:
        return None
    ks = pack.get("kieu_chu") or []
    if buoc == "R5":
        ks = [s for s in ks if s["vai"] in VAI_PHU_DE]
    out = {}
    if buoc in ("R4", "R5", "DD"):
        out["kieu_chu"] = [{k: v for k, v in {
            "id": s["id"], "vai": s["vai"], "mo_ta": s["mo_ta"], "font_gan_nhat": s.get("font"),
            "chu_mau": s.get("chu_mau"), "dung_cho": s.get("dung_cho"), "anh": s["anh"], "anh_vao": s.get("anh_vao"),
            "so_lan_trong_video_mau": s.get("so_lan"), "de_doc": s.get("de_doc", True)}.items() if v is not None}
            for s in ks]
    if buoc in ("FX-plan", "DD", "R4"):
        out["hieu_ung"] = [{"id": e["id"], "loai": e["loai"], "mo_ta": e["mo_ta"], "anh": e["anh"]}
                           for e in pack.get("hieu_ung") or []]
    if buoc in ("DD", "R4") and pack.get("tong_the"):
        out["tong_the"] = pack["tong_the"]
    return {k: v for k, v in out.items() if v} or None


def images_for(pack, buoc, ids=None):
    """[{path, label}] — CHI anh buoc `buoc` can (khong lap: 1 kieu chu = 1 anh tinh + 1 anh vao)."""
    if not pack or not files_ok(pack):
        return []
    d = pack_dir(pack["fp"])
    out = []

    def add(f, label):
        if f and os.path.isfile(os.path.join(d, f)) and all(x["path"] != os.path.join(d, f) for x in out):
            out.append({"path": os.path.join(d, f), "label": label})

    ks = pack.get("kieu_chu") or []
    if buoc == "DD":
        add(pack.get("tong_the"), "tong the video mau (cac khung dai dien)")
    elif buoc == "R4":
        for s in ks:
            add(s["anh"], "kieu chu '%s' (%s): %s" % (s["id"], s["vai"], s["mo_ta"][:160]))
            add(s.get("anh_vao"), "kieu chu '%s' DANG VAO — 8 khung theo gio" % s["id"])
        add(pack.get("tong_the"), "tong the video mau (bo cuc, mau, anh sang)")
    elif buoc == "R5":
        for s in ks:
            if s["vai"] in VAI_PHU_DE:
                add(s["anh"], "PHU DE video mau ('%s'): %s" % (s["id"], s["mo_ta"][:160]))
                add(s.get("anh_vao"), "phu de '%s' DANG VAO — 8 khung theo gio" % s["id"])
    elif buoc == "FX-plan":
        for e in pack.get("hieu_ung") or []:
            add(e["anh"], "hieu ung '%s' (%s): %s — 8 khung theo gio" % (e["id"], e["loai"], e["mo_ta"][:160]))
    elif buoc == "FX-code":
        want = set(ids or [])
        for e in pack.get("hieu_ung") or []:
            if e["id"] in want:
                add(e["anh"], "hieu ung MAU '%s': %s — 8 khung theo gio, code lai dung chuyen dong nay"
                    % (e["id"], e["mo_ta"][:160]))
    return out


# ---------------------------------------------------------------------------
# NGU CANH LUOT LAP KE HOACH (theo luong — cac buoc Claude chay tren luong chinh cua /remotion/autoplan)
# ---------------------------------------------------------------------------
import threading  # noqa: E402

_TL = threading.local()


class use:
    """with ref_pack.use(pack): cac buoc DD / R4 / R5 / FX tu lay anh + luat cua buoc minh (current())."""

    def __init__(self, pack):
        self.pack = pack if files_ok(pack) else None

    def __enter__(self):
        self.prev = getattr(_TL, "pack", None)
        _TL.pack = self.pack
        return self

    def __exit__(self, *a):
        _TL.pack = self.prev
        return False


def current():
    return getattr(_TL, "pack", None)


RULES = {
    "DD": """

# ANH THAM CHIEU VIDEO MAU (anh dinh kem + video_mau.anh_tham_chieu)
Anh tong the = cac khung that cua video mau. Nhin de hieu CHAT hinh (anh sang, mau, mat do do hoa, bo cuc, nhip).""",
    "R4": """

# ANH THAT CUA VIDEO MAU (anh dinh kem; danh sach + id trong payload "anh_tham_chieu")
- Lop chu nao tai hien mot KIEU CHU cua video mau: ghi "kieu_chu": "<id>" vao lop do va CHEP DUNG theo ANH: font (id gan
  nhat trong danh muc), co tuong doi so voi khung, do dam, hoa / thuong, mau chu, vien (do day, mau), bong, glow, nghieng,
  hop nen, vi tri so voi nguoi, truoc / sau nguoi. Kieu vao + nhip + stagger lay theo anh "..._vao" (8 khung theo gio:
  mo dan / truot / bat / tung chu / go phim...). ANH uu tien hon mo ta chu khi hai ben khac nhau.
- CUNG mot kieu chu thi MOI cum dung CUNG thong so (khong bien tau giua cac cum) — video mau dung 1 kieu xuyen suot thi
  ca video 1 kieu. Bo cuc / mau / anh sang tong the theo anh tong the; hieu ung camera de buoc FX lam.
- TAN SUAT + VAI TRO giong video mau: kieu chu xuat hien it trong video mau (so_lan_trong_video_mau nho — chu do hoa /
  trang tri) chi dung cho VAI khoanh khac dac biet tuong ung (khong tran khap video); kieu "de_doc": false (cat dan, bien
  dang) KHONG dung cho thuat ngu, ten rieng, con so, tu chuyen mon — nguoi xem phai doc dung tung chu cai. He thong dem
  so lan dung tung kieu; vuot -> bi yeu cau sua.""",
    "R5": """

# ANH THAT PHU DE VIDEO MAU (anh dinh kem)
Chep DUNG kieu phu de trong anh: font (id gan nhat), co, mau, vien / hop nen, hoa / thuong, vi tri, so chu moi lan
hien, cach chu vao (anh "_vao" 8 khung theo gio). Anh uu tien hon mo ta chu.""",
    "FX-plan": """

# ANH THAT HIEU UNG VIDEO MAU (anh dinh kem, 8 khung theo gio moi anh; id trong payload "anh_tham_chieu")
Hieu ung nao TAI HIEN mot hieu ung cua video mau: ghi "theo_mau": "<id>" va mo ta lai DUNG chuyen dong THAY qua cac khung
(huong, bien do, toc do, thoi diem len dinh, cach het) trong "visual" — buoc viet code se xem lai dung anh do.""",
    "FX-code": """

# ANH THAT HIEU UNG GOC (anh dinh kem, chi cho hieu ung co "theo_mau")
Moi anh = 8 khung THAT cua hieu ung goc theo gio. Code ra chuyen dong KHOP anh: huong, bien do (ti le khung), easing, thoi
gian tung pha, vi tri so voi khung. Khong them thu anh khong co.""",
}


def rule(buoc):
    return RULES.get(buoc, "") if current() else ""


def step_images(buoc, ids=None):
    pk = current()
    return images_for(pk, buoc, ids) if pk else []


def step_view(buoc):
    pk = current()
    return view(pk, buoc) if pk else None


def step_fp():
    return fingerprint(current())


def usage_limits(pack, duration):
    """{kieu_chu_id: so cum toi da} cho video dai `duration` giay — theo tan suat kieu do trong video mau (x1.5, quy theo
    do dai); kieu trang tri / chu do hoa khong co so lieu -> ~1 cum / phut. Phu de / kieu dung khap -> khong gioi han."""
    out = {}
    ref_d = float((pack or {}).get("ref_duration") or 0) or None
    mins = max(1.0, float(duration or 0) / 60.0)
    for s in (pack or {}).get("kieu_chu") or []:
        if s["vai"] in VAI_PHU_DE:
            continue
        n = s.get("so_lan")
        if n and ref_d:
            out[s["id"]] = max(1, int(round(n * max(1.0, float(duration) / ref_d) * 1.5)))
        elif s["vai"] in ("chu_do_hoa",) or s.get("de_doc") is False:
            out[s["id"]] = max(1, int(round(mins)))
    return out


def audit_usage(design, duration):
    """Dem so CUM (to hop / lop doc lap) dung moi kieu chu trong ban thiet ke R4 -> [muc thieu] cho vong tu sua."""
    pk = current()
    if not pk:
        return []
    lim = usage_limits(pk, duration)
    if not lim:
        return []
    seen, cnt = set(), {}
    for L in (design or {}).get("layers") or []:
        if not isinstance(L, dict) or not L.get("kieu_chu"):
            continue
        st = resolve_style(pk, L["kieu_chu"])
        if not st:
            continue
        key = ("g", L.get("group")) if L.get("group") else ("l", L.get("id"))
        if (st["id"], key) in seen:
            continue
        seen.add((st["id"], key))
        cnt[st["id"]] = cnt.get(st["id"], 0) + 1
    out = []
    for sid, n in cnt.items():
        if sid in lim and n > lim[sid]:
            st = resolve_style(pk, sid)
            out.append("kieu chu video mau '%s' (%s) dung %d cum, video mau dung it hon — toi da %d cum, chi cho khoanh "
                       "khac dac biet; cum con lai doi sang kieu chu nhan / the chu cua video mau%s" % (
                           sid, st["vai"], n, lim[sid], "; kieu nay KHONG de doc -> khong dung cho thuat ngu / so / ten rieng"
                           if st.get("de_doc") is False else ""))
    return out
