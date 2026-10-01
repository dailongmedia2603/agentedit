#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TU LIEU CUA NGUOI DUNG — anh / video nguoi dung dua vao de HIEN THI LEN video dang edit (2026-09-28).

User: ngoai video nguon (A-roll) con muon dua anh / video cua minh (anh san pham, logo, anh chup man hinh,
bang gia, clip demo...) hien LEN video cho nguoi xem thay — KHONG noi vao mach video chinh. Co khi khong
muon tao anh AI ma dung anh cua ho; co khi van tao anh AI nhung phai co DUNG san pham cua ho.

Moi tu lieu co:
  - MUC DICH do nguoi dung dat: cach dung (chen truc tiep / lam mau cho anh AI / ca hai), cach hien thi mong
    muon (AI tu chon / khung noi / tach nen / nua tren / toan man hinh), ghi chu (la gi, chen khi nao);
  - Gemini XEM tu lieu -> mo ta KHACH QUAN (la gi, chu the, chu trong anh, nen, tu khoa, hop khi noi ve gi);
  - MAY DO: kich thuoc, ti le, nen trong suot, do dai + tieng (video).
R4 (thiet ke, motion_design) nhan DU ba phan tren + loi noi theo giay -> dat tu lieu DUNG luc nguoi noi nhac
toi, vi tri + co hop: lop anh / video noi, panel split / broll / card, nen; anh AI "ref_media" = anh that cua
nguoi dung (Codex nhan anh qua -i). Code kiem (audit): tu lieu "chen" chua dung / anh mau chua dung -> R4 tu
sua 1 vong; van thieu -> code dat du phong theo tu khoa KHOP loi noi, khong khop thi bao nguoi dung.
Lop bao ve khi dung spec: giu DUNG ti le that (khong meo / cat), co toi thieu (chu trong anh doc duoc), trong
vung an toan, khong de len mat nguoi noi, video khong dai hon phan con lai cua clip, meme khong cat ngang.
"""
import os
import re
import json
import time
import shutil
import hashlib
import tempfile
import subprocess
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import analysis_library
import config
import prompt_store
import providers
import remotion_plan as RP
import run_log

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "user-media")
WORK_DIR = os.path.join(CACHE_DIR, "work")
ANALYSIS_VERSION = 1     # doi schema / cach doc -> tang (ban luu cu khong dung lai)
WORK_VERSION = 1         # doi cach tao ban lam viec cua anh -> tang
MAX_ITEMS = 12
MAX_SIDE = 2400          # canh dai ban lam viec cua anh (xem truoc / render / gui Gemini / Codex)

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".avif"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}
_CONVERT_EXT = {".heic", ".heif", ".tif", ".tiff", ".bmp", ".avif"}   # trinh duyet khong doc -> doi PNG

USES = ("show", "ai_ref", "both")
PLACEMENTS = ("auto", "overlay", "cutout", "split", "fullscreen")
USE_LABEL = {"show": "chen_truc_tiep", "ai_ref": "lam_mau_anh_ai", "both": "chen_va_lam_mau"}
PLACE_LABEL = {"auto": "AI tu chon", "overlay": "khung noi tren video", "cutout": "tach nen (sticker)",
               "split": "nua tren man hinh", "fullscreen": "toan man hinh"}
LOAI = ("san_pham", "logo", "nguoi", "anh_chup_man_hinh", "bang_gia_menu", "infographic", "anh_boi_canh",
        "minh_hoa", "video_demo", "video_san_pham", "video_boi_canh", "khac")
NEN = ("trong_suot", "tron_mot_mau", "don_gian", "phuc_tap")

# Lop bao ve khi dung spec (phan canvas 1080x1920)
SAFE_TOP, SAFE_BOT = 0.06, 0.82     # duoi 0.82 bi giao dien TikTok / Reels che
MAX_LAYER_H = 0.62                  # khung noi / sticker khong cao qua 62% khung (muon to hon -> scene broll)
MIN_W = {"read": 0.72, "logo": 0.22, "video": 0.45, "image": 0.30}
MIN_SHOW_SEC = 1.2
FACE_OVERLAP_MAX = 0.15             # tu lieu che toi da 15% khung mat


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------
_USER_MEDIA_PROMPT = """Ban la chuyen vien DOC HIEU TU LIEU HINH ANH cho editor video short-form (TikTok / Reels).
Nguoi dung dua 1 tu lieu (anh hoac video) de CHEN LEN video dang edit — tu lieu HIEN THI tren video cho nguoi
xem thay (khong noi vao mach video chinh). Nhiem vu: XEM ky tu lieu va mo ta KHACH QUAN no la gi, de buoc lap
ke hoach dat no vao DUNG luc nguoi noi nhac toi, dung vi tri + co.
Chi ghi dieu THAY DUOC trong tu lieu; khong chac thi de trong.
NGON NGU: moi truong chu viet TIENG VIET CO DAU DAY DU (nguoi dung doc truc tiep), vd "Ly trà sữa trân châu đặt
trên bàn gỗ" — KHONG viet khong dau. Gia tri liet ke (loai, nen, cach, chuyen_dong) va ma mau giu dung nhu schema.

# SCHEMA (CHI JSON)
{
 "loai": "san_pham | logo | nguoi | anh_chup_man_hinh | bang_gia_menu | infographic | anh_boi_canh | minh_hoa | video_demo | video_san_pham | video_boi_canh | khac",
 "mo_ta": "1-3 câu: tư liệu là gì, chủ thể chính, đang làm gì / trạng thái",
 "chu_the": "tên ngắn của chủ thể chính (vd 'ly trà sữa trân châu size L', 'logo quán ABC', 'giao diện app X')",
 "dac_diem_nhan_dien": "màu sắc, hình dáng, chất liệu, nhãn mác, bao bì... ĐỦ chi tiết để vẽ lại ĐÚNG chủ thể này",
 "chu_trong_anh": "chữ đọc được trong tư liệu (chép nguyên văn, tối đa 200 ký tự) hoặc ''",
 "can_doc_chu": true,
 "nen": "trong_suot | tron_mot_mau | don_gian | phuc_tap",
 "tach_nen_duoc": true,
 "vi_tri_chu_the": "chủ thể nằm ở đâu trong khung + chiếm bao nhiêu phần khung",
 "mau_chu_dao": ["#RRGGBB"],
 "tu_khoa": ["5-12 từ / cụm từ người nói có thể nói khi nhắc tới nội dung này (tên, loại, công dụng, giá...)"],
 "hop_khi_noi_ve": "người nói đang nói về điều gì thì chèn tư liệu này là hợp",
 "goi_y_hien_thi": {"cach": "overlay | cutout | split | fullscreen", "ly_do": "..."},
 "canh": [{"start": 0.0, "end": 2.5, "mo_ta": "..."}],
 "doan_dep": [{"start": 1.0, "end": 4.0, "ly_do": "..."}],
 "co_loi_noi": false,
 "chuyen_dong": "tinh | vua | nhanh"
}
- can_doc_chu: true khi nguoi xem PHAI doc duoc chu trong tu lieu moi hieu (bang gia, anh chup man hinh, thong so).
- tach_nen_duoc: true khi chu the ro rang, tach khoi nen de dat nhu sticker duoc (nen tron / don gian).
- goi_y_hien_thi.cach: overlay = khung anh noi tren video (nguoi noi van hien); cutout = tach nen dat nhu sticker;
  split = nua tren man hinh; fullscreen = toan man hinh.
- canh / doan_dep / co_loi_noi / chuyen_dong: CHI voi VIDEO (gio tinh bang giay trong tu lieu). Anh thi bo.
CHI tra ve JSON."""


_USER_MEDIA_NOTE = """

# TU LIEU CUA NGUOI DUNG (tu_lieu_nguoi_dung) — BAT BUOC xu ly
Nguoi dung tu dua anh / video cua ho de HIEN THI LEN video (khong noi vao mach A-roll). Moi muc co: id, loai_file,
cach_dung, cach_hien_thi_nguoi_dung_chon, ghi_chu_nguoi_dung (muc dich + khi nao chen — UU TIEN CAO NHAT), gemini
(Gemini da xem tu lieu: la gi, chu the, chu trong anh, nen, tu_khoa, hop_khi_noi_ve; video: canh, doan_dep) va do_dac
(kich thuoc that, cao_khi_rong_1 = chieu cao (phan canvas) khi w = 1, nen trong suot, do dai video).
1. KHONG khai lai tu lieu trong "assets": dung THANG id cua no o truong "asset" (da dang ky san).
2. LUC CHEN: doc loi noi theo giay, chen DUNG luc nguoi noi NHAC TOI noi dung cua tu lieu (khop ghi_chu_nguoi_dung,
   gemini.tu_khoa / hop_khi_noi_ve / chu_the). src_start = luc bat dau noi cum do (start_cuc_bo); anh hien 2-5s,
   video toi da do_dac.do_dai_giay. ghi_chu_nguoi_dung noi ro luc nao (vd 'cuoi video', 'khi noi gia') -> theo dung.
3. cach_dung:
   - "chen_truc_tiep" / "chen_va_lam_mau": PHAI xuat hien it nhat 1 lan (lop hoac scene co asset = id).
   - "lam_mau_anh_ai" / "chen_va_lam_mau": ai_image minh hoa co chu the nay -> them "ref_media": ["<id>"]; prompt mo ta
     DUNG chu the theo gemini.dac_diem_nhan_dien va dat no vao boi canh cua cau noi (he thong gui kem anh that cho AI
     tao anh, giu dung hinh dang / mau / nhan). Muc chi "lam_mau_anh_ai" thi KHONG hien anh goc.
4. CACH HIEN THI — cach_hien_thi_nguoi_dung_chon khac "AI tu chon" thi theo DUNG lua chon do:
   - khung noi tren video: layer "image" (anh) / "video" (video) co "asset": id, w 0.45-0.8, mask "round", border mong +
     shadow; dat NGOAI vung mat (tren dau / nua duoi / canh ben), trong vung an toan.
   - tach nen (sticker): layer "image" + "cutout": true — chi khi gemini.tach_nen_duoc hoac do_dac.nen_trong_suot; dat
     canh nguoi noi (w 0.35-0.6), co the loop "float".
   - nua tren man hinh: scene "split" voi "panel": {"asset": id}.
   - toan man hinh: scene "broll" voi "panel": {"asset": id} (tieng nguoi noi van chay).
   - "AI tu chon": can_doc_chu (bang gia, anh chup man hinh, thong so) -> split / broll voi panel "fit": "contain" (khong
     cat mat chu), hien >= 3s; san pham nen tron / trong suot -> sticker tach nen; logo -> khung noi nho (w 0.3-0.45)
     luc gioi thieu / CTA; anh boi canh / video demo -> split hoac broll; video ngan -> khung noi.
5. KICH THUOC: he thong tu tinh h = w x cao_khi_rong_1 (giu dung ti le that) — khong khai h. Khung noi / sticker khong
   cao qua 0.6 khung. Video (layer "video" hoac panel) ghi "media_start" = giay bat dau trong tu lieu (lay tu
   gemini.doan_dep); video chen luon tat tieng.
6. Moi lop / scene dung tu lieu ghi "why" = vi sao dung luc nay. Ghi them vao JSON ket qua:
   "tu_lieu_dung": [{"media": "<id>", "src_start": 0.0, "cach": "...", "ly_do": "..."}],
   "tu_lieu_bo_qua": [{"media": "<id>", "ly_do": "..."}]  (CHI khi that su khong co cho nao hop — rat hiem).
   "cach" + "ly_do" viet tieng Viet CO DAU (hien thang cho nguoi dung doc).
7. Tu lieu dang hien thi thi lop chu nhan cung luc dat TRANH de len no; tu lieu KHONG thay phu de."""


# ---------------------------------------------------------------------------
# CHUAN HOA DAU VAO
# ---------------------------------------------------------------------------
def kind_of(path):
    ext = os.path.splitext(path or "")[1].lower()
    return "image" if ext in IMAGE_EXT else "video" if ext in VIDEO_EXT else None


def _safe_id(v):
    s = "".join(ch for ch in str(v or "") if ch.isalnum() or ch in "_-")[:24]
    return s or None


def normalize(items):
    """Danh sach tu lieu tu UI -> [{id, kind, path, name, use, placement, note, analysis?}] (hop le, <= 12).
    Tra (items, ten_file_mat)."""
    out, seen, missing = [], set(), []
    for i, it in enumerate(items or []):
        if not isinstance(it, dict):
            continue
        path = it.get("path")
        if not path or not os.path.isfile(path):
            missing.append(str(it.get("name") or path or "?"))
            continue
        kind = it.get("kind") if it.get("kind") in ("image", "video") else kind_of(path)
        if kind not in ("image", "video"):
            continue
        mid = _safe_id(it.get("id")) or "media_%d" % (i + 1)
        while mid in seen:
            mid += "_%d" % (i + 1)
        seen.add(mid)
        use = it.get("use") if it.get("use") in USES else "show"
        placement = it.get("placement") if it.get("placement") in PLACEMENTS else "auto"
        if kind == "video":
            use = "show"                      # video khong lam mau anh AI
            if placement == "cutout":
                placement = "auto"
        row = {"id": mid, "kind": kind, "path": path, "name": str(it.get("name") or os.path.basename(path))[:120],
               "use": use, "placement": placement, "note": " ".join(str(it.get("note") or "").split())[:500]}
        if isinstance(it.get("analysis"), dict) and it["analysis"]:
            row["analysis"] = it["analysis"]
        out.append(row)
    return out[:MAX_ITEMS], missing


# ---------------------------------------------------------------------------
# BAN LAM VIEC + DO DAC
# ---------------------------------------------------------------------------
def working_image(path):
    """Anh dung duoc trong trinh duyet (xem truoc / render), DUNG CHIEU (EXIF), canh dai <= 2400px.
    HEIC / TIFF / BMP (trinh duyet khong doc) -> PNG/JPG. Anh da dat chuan -> tra nguyen duong dan."""
    if not path or not os.path.isfile(path):
        return path
    ext = os.path.splitext(path)[1].lower()
    need = ext in _CONVERT_EXT
    if not need:
        try:
            from PIL import Image
            with Image.open(path) as im:
                orient = (im.getexif() or {}).get(0x0112, 1)
                need = max(im.size) > MAX_SIDE or orient not in (0, 1) or im.format not in ("PNG", "JPEG", "WEBP", "GIF")
        except Exception:
            need = True
    if not need:
        return path
    fp = analysis_library.fingerprint(path) or hashlib.sha1(path.encode("utf-8")).hexdigest()[:24]
    os.makedirs(WORK_DIR, exist_ok=True)
    for ex in (".png", ".jpg"):
        cand = os.path.join(WORK_DIR, "%s_v%d%s" % (fp, WORK_VERSION, ex))
        if os.path.isfile(cand) and os.path.getsize(cand) > 0:
            return cand
    tmp_dir = tempfile.mkdtemp(prefix="um-")
    try:
        from PIL import Image, ImageOps
        src = path
        try:
            with Image.open(path) as im:
                im.size
        except Exception:
            conv = os.path.join(tmp_dir, "conv.png")
            if os.path.isfile("/usr/bin/sips"):
                subprocess.run(["/usr/bin/sips", "-s", "format", "png", path, "--out", conv],
                               capture_output=True, timeout=120)
            else:
                # Windows (khong co sips): HEIC/HEIF qua pillow-heif, dinh dang khac Pillow doc duoc thi doc thang
                try:
                    import pillow_heif
                    pillow_heif.register_heif_opener()
                except Exception:
                    pass
                with Image.open(path) as im_:
                    ImageOps.exif_transpose(im_).save(conv, "PNG")
            if not os.path.isfile(conv):
                return path
            src = conv
        with Image.open(src) as im0:
            im = ImageOps.exif_transpose(im0)
            im.thumbnail((MAX_SIDE, MAX_SIDE))
            alpha = im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info)
            out = os.path.join(WORK_DIR, "%s_v%d%s" % (fp, WORK_VERSION, ".png" if alpha else ".jpg"))
            tmp = out + ".tmp"
            if alpha:
                im.convert("RGBA").save(tmp, "PNG")
            else:
                im.convert("RGB").save(tmp, "JPEG", quality=92)
        os.replace(tmp, out)
        return out
    except Exception:
        return path          # khong doi duoc -> dung file goc (van xem duoc voi JPG/PNG)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def working_path(item):
    """Ban dung trong xem truoc / render: anh -> working_image; video HDR -> ban SDR (media_sdr)."""
    if item.get("kind") == "image":
        return working_image(item["path"])
    import media_sdr
    return media_sdr.working_path(item["path"])


def _image_info(path):
    from PIL import Image, ImageOps
    with Image.open(path) as im0:
        im = ImageOps.exif_transpose(im0)
        w, h = im.size
        alpha = False
        if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
            a = im.convert("RGBA").getchannel("A")
            a.thumbnail((256, 256))
            hist = a.histogram()
            # "nen trong suot that": >= 3% dien tich trong suot (PNG co kenh alpha nhung dac het thi khong tinh)
            alpha = sum(hist[:128]) / float(max(1, sum(hist))) >= 0.03
    return {"width": w, "height": h, "alpha": alpha}


def measure(item):
    """So do cua MAY (khong phai AI): kich thuoc that, ti le, nen trong suot; video: do dai, co tieng."""
    work = working_path(item)
    info = {}
    if item.get("kind") == "image":
        try:
            info = _image_info(work)
        except Exception:
            info = {}
    else:
        pr = RP.probe(work)
        info = {"width": pr.get("width"), "height": pr.get("height"), "duration": pr.get("duration"),
                "has_audio": bool(pr.get("has_audio"))}
    w, h = info.get("width") or 0, info.get("height") or 0
    out = {"width": w or None, "height": h or None}
    if w and h:
        out["ti_le"] = round(w / float(h), 4)
        out["cao_khi_rong_1"] = round(1080.0 / 1920.0 * h / float(w), 4)
    if item.get("kind") == "image":
        out["alpha"] = bool(info.get("alpha"))
    else:
        out["duration"] = round(float(info.get("duration") or 0), 2) or None
        out["has_audio"] = bool(info.get("has_audio"))
    return out


# ---------------------------------------------------------------------------
# GEMINI DOC HIEU TU LIEU
# ---------------------------------------------------------------------------
def _hex(v):
    return v.strip().upper() if isinstance(v, str) and re.match(r"^#[0-9A-Fa-f]{6}$", v.strip()) else None


def _ranges(v, dur, text_key):
    out = []
    for r in v if isinstance(v, list) else []:
        if not isinstance(r, dict):
            continue
        a, b = providers._f(r.get("start"), -1), providers._f(r.get("end"), -1)
        if dur:
            a, b = max(0.0, min(a, dur)), max(0.0, min(b, dur))
        if a < 0 or b <= a:
            continue
        out.append({"start": round(a, 2), "end": round(b, 2), text_key: str(r.get(text_key) or "")[:200]})
    return out[:20]


def clean_analysis(res, kind, duration=None):
    """Chi giu truong biet, dung kieu, cat do dai — ket qua AI khong bao gio lam hong buoc sau."""
    r = res if isinstance(res, dict) else {}
    out = {"loai": r.get("loai") if r.get("loai") in LOAI else "khac"}
    for k, n in (("mo_ta", 600), ("chu_the", 160), ("dac_diem_nhan_dien", 600), ("chu_trong_anh", 300),
                 ("vi_tri_chu_the", 200), ("hop_khi_noi_ve", 400)):
        v = " ".join(str(r.get(k) or "").split())[:n]
        if v:
            out[k] = v
    out["can_doc_chu"] = bool(r.get("can_doc_chu"))
    out["tach_nen_duoc"] = bool(r.get("tach_nen_duoc"))
    out["nen"] = r.get("nen") if r.get("nen") in NEN else "don_gian"
    cols = [c for c in (_hex(x) for x in r.get("mau_chu_dao") or [] if isinstance(r.get("mau_chu_dao"), list)) if c]
    if cols:
        out["mau_chu_dao"] = cols[:4]
    kws = [" ".join(str(x).split())[:40] for x in (r.get("tu_khoa") if isinstance(r.get("tu_khoa"), list) else [])]
    out["tu_khoa"] = [x for i, x in enumerate(kws) if x and x not in kws[:i]][:12]
    g = r.get("goi_y_hien_thi") if isinstance(r.get("goi_y_hien_thi"), dict) else {}
    if g.get("cach") in PLACEMENTS[1:]:
        out["goi_y_hien_thi"] = {"cach": g["cach"], "ly_do": str(g.get("ly_do") or "")[:200]}
    if kind == "video":
        out["canh"] = _ranges(r.get("canh"), duration, "mo_ta")
        out["doan_dep"] = _ranges(r.get("doan_dep"), duration, "ly_do")
        out["co_loi_noi"] = bool(r.get("co_loi_noi"))
        out["chuyen_dong"] = r.get("chuyen_dong") if r.get("chuyen_dong") in ("tinh", "vua", "nhanh") else "vua"
    return out


def _cache_file(path):
    fp = analysis_library.fingerprint(path)
    return os.path.join(CACHE_DIR, "%s_v%d.json" % (fp, ANALYSIS_VERSION)) if fp else None


def analyze_one(item, fresh=False, log=None):
    """Gemini XEM 1 tu lieu (anh: ban lam viec; video: ban nen 720p, SDR) + so do cua may.
    Luu theo NOI DUNG file (cung anh them lai / dung o du an khac -> dung lai, khong goi Gemini).
    Tra {"analysis", "measured", "at", "via", "cached", "work" (ban lam viec — UI hien anh thu nho)}; loi -> raise."""
    measured = measure(item)
    cp = _cache_file(item["path"])
    if not fresh and cp and os.path.isfile(cp):
        try:
            with open(cp, encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved.get("analysis"), dict):
                return {"analysis": saved["analysis"], "measured": measured, "at": saved.get("at"),
                        "via": saved.get("via"), "cached": True, "work": working_path(item)}
        except Exception:
            pass
    if item["kind"] == "image":
        send = working_image(item["path"])
        label = "TU LIEU (anh): %s, %sx%s px" % (item["name"], measured.get("width"), measured.get("height"))
    else:
        import gemini_media
        prep = gemini_media.prepare(item["path"], allow_split=False, log=log)
        send = prep["pieces"][0]["path"]
        label = "TU LIEU (video): %s, dai %.1f giay" % (item["name"], measured.get("duration") or 0)
    user = {"ten_file": item["name"], "loai_file": "anh" if item["kind"] == "image" else "video",
            "do_dac": {k: v for k, v in measured.items() if v is not None}}
    prompt = _p("_USER_MEDIA_PROMPT") + "\n\n# DU LIEU DO (may do, chinh xac)\n" + json.dumps(user, ensure_ascii=False)
    if log:
        log("Gemini doc tu lieu %s (%s)..." % (item["name"], item["kind"]))
    res = providers.gemini_files([{"path": send, "label": label}], prompt, step_label="Gemini-tu-lieu", log=log)
    via = (res or {}).pop("_source", None) if isinstance(res, dict) else None
    analysis = clean_analysis(res, item["kind"], measured.get("duration"))
    if not analysis.get("mo_ta") and not analysis.get("chu_the"):
        raise RuntimeError("Gemini khong mo ta duoc tu lieu (tra ve rong)")
    at = time.strftime("%Y-%m-%dT%H:%M:%S")
    if cp:
        try:
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(cp + ".tmp", "w", encoding="utf-8") as f:
                json.dump({"analysis": analysis, "at": at, "via": via, "name": item["name"]}, f, ensure_ascii=False)
            os.replace(cp + ".tmp", cp)
        except OSError:
            pass
    return {"analysis": analysis, "measured": measured, "at": at, "via": via, "cached": False, "work": working_path(item)}


def _err_text(e):
    """Loi hien cho nguoi dung + luu trong du an: gon 1 dong, CHE khoa API trong URL (?key=... cua Gemini)."""
    t = " ".join(str(e).split())
    t = re.sub(r"(?i)([?&](?:key|api_key|access_token)=)[^&\s\"']+", r"\1***", t)
    t = re.sub(r"\b(AIza[0-9A-Za-z_\-]{20,}|sk-[0-9A-Za-z_\-]{16,})", "***", t)
    return t[:300]


def analyze_many(items, fresh=False, log=None):
    """Nhieu tu lieu song song (agy toi da 2 luot cung luc, API 3). {id: ket_qua | {"error": ...}} — loi 1 tu
    lieu khong lam hong tu lieu khac."""
    if not items:
        return {}
    run = run_log.current()
    par = providers.GEMINI_PARALLEL_AGY if config.uses_subscription("gemini") else providers.GEMINI_PARALLEL

    def work(it):
        run_log.set_run(run)          # nhat ky theo luong -> luong phu gan lai run hien hanh
        return analyze_one(it, fresh=fresh, log=log)

    out = {}
    with ThreadPoolExecutor(max_workers=max(1, min(par, len(items)))) as ex:
        futs = [(it, ex.submit(work, it)) for it in items]
        for it, f in futs:
            try:
                out[it["id"]] = f.result()
            except Exception as e:  # noqa: BLE001
                out[it["id"]] = {"error": _err_text(e)}
    ok = sum(1 for v in out.values() if v.get("analysis"))
    run_log.emit("result", "Gemini đọc %d/%d tư liệu" % (ok, len(items)), step="Gemini-tu-lieu",
                 level="ok" if ok == len(items) else "warn",
                 output={k: (v.get("analysis") or {}).get("mo_ta") or v.get("error") for k, v in out.items()})
    return out


def ensure_analyzed(items, log=None, warnings=None):
    """Truoc khi lap ke hoach: MOI tu lieu co so do cua may (do lai, re) + phan tich Gemini (UI gui kem; thieu
    thi goi Gemini — co luu theo noi dung file). Gemini loi -> van lap ke hoach bang ghi chu cua nguoi dung."""
    todo = [it for it in items if not isinstance(it.get("analysis"), dict) or not it["analysis"]]
    res = analyze_many(todo, log=log) if todo else {}
    for it in items:
        r = res.get(it["id"]) or {}
        if r.get("analysis"):
            it["analysis"] = r["analysis"]
        elif it["id"] in res and warnings is not None:
            warnings.append("Gemini chưa đọc được tư liệu '%s' (%s) — AI lập kế hoạch chỉ dựa vào ghi chú của bạn."
                            % (it["name"], r.get("error") or "không rõ"))
        if isinstance(it.get("analysis"), dict):
            it["analysis"] = clean_analysis(it["analysis"], it["kind"], None)
        try:
            it["measured"] = r.get("measured") or measure(it)
        except Exception:
            it["measured"] = {}
    return items


# ---------------------------------------------------------------------------
# DU LIEU CHO AI LAP KE HOACH (R4)
# ---------------------------------------------------------------------------
def planner_view(items):
    """tu_lieu_nguoi_dung trong payload R4: muc dich cua nguoi dung + Gemini + so do cua may."""
    rows = []
    for it in items or []:
        m = it.get("measured") or {}
        do = {"kich_thuoc": "%sx%s" % (m.get("width"), m.get("height")) if m.get("width") else None,
              "ti_le_rong_cao": m.get("ti_le"), "cao_khi_rong_1": m.get("cao_khi_rong_1")}
        if it["kind"] == "image":
            do["nen_trong_suot"] = bool(m.get("alpha"))
        else:
            do["do_dai_giay"] = m.get("duration")
            do["co_tieng_rieng"] = bool(m.get("has_audio"))
        row = {"id": it["id"], "loai_file": "anh" if it["kind"] == "image" else "video", "ten_file": it["name"],
               "cach_dung": USE_LABEL[it["use"]],
               "cach_hien_thi_nguoi_dung_chon": PLACE_LABEL[it["placement"]],
               "ghi_chu_nguoi_dung": it.get("note") or "(nguoi dung khong ghi — dua vao gemini)",
               "do_dac": {k: v for k, v in do.items() if v is not None}}
        if isinstance(it.get("analysis"), dict) and it["analysis"]:
            row["gemini"] = it["analysis"]
        rows.append(row)
    return rows


def key_view(items):
    """Phan cua tu lieu trong khoa cache R4: doi file / muc dich / phan tich / luat -> R4 chay lai."""
    rows = []
    for it in items or []:
        rows.append([it["id"], it["kind"], it["use"], it["placement"], it.get("note") or "",
                     analysis_library.fingerprint(it["path"]),
                     hashlib.sha1(json.dumps(it.get("analysis") or {}, sort_keys=True, ensure_ascii=False)
                                  .encode("utf-8")).hexdigest()[:12],
                     json.dumps(it.get("measured") or {}, sort_keys=True)])
    note = hashlib.sha1(_p("_USER_MEDIA_NOTE").encode("utf-8")).hexdigest()[:12]
    return {"items": rows, "note": note, "v": ANALYSIS_VERSION}


def r4_note():
    return _p("_USER_MEDIA_NOTE")


def as_assets(items):
    """Tu lieu -> tai nguyen DANG KY SAN (R4 dung thang bang id). path = ban lam viec (anh chuan / video SDR),
    orig_path = file trong thu muc du an (de tao lai ban lam viec neu cache bi xoa)."""
    out = []
    for it in items or []:
        m = it.get("measured") or {}
        a = it.get("analysis") or {}
        out.append({"id": it["id"], "kind": "user_image" if it["kind"] == "image" else "user_video",
                    "path": working_path(it), "orig_path": it["path"], "user_media": True, "name": it["name"],
                    "use": it["use"], "cutout": False,
                    "mw": m.get("width"), "mh": m.get("height"), "alpha": bool(m.get("alpha")),
                    "duration": m.get("duration"), "can_doc_chu": bool(a.get("can_doc_chu")),
                    "tach_nen_duoc": bool(a.get("tach_nen_duoc")), "loai": a.get("loai") or "khac"})
    return out


def refresh_assets(assets):
    """Plan da luu (dung lai spec): ban lam viec trong cache bi xoa -> tao lai tu file trong du an."""
    for a in assets or []:
        if not isinstance(a, dict) or not a.get("user_media"):
            continue
        if (not a.get("path") or not os.path.isfile(a["path"])) and a.get("orig_path") and os.path.isfile(a["orig_path"]):
            a["path"] = working_path({"kind": "image" if a.get("kind") == "user_image" else "video",
                                      "path": a["orig_path"]})
    return assets


def plan_view(items):
    """Ban luu trong plan (UI hien thi + dung lai): khong kem so do / anh thu nho."""
    return [{k: it.get(k) for k in ("id", "kind", "name", "path", "use", "placement", "note")} for it in items or []]


# ---------------------------------------------------------------------------
# KIEM THIET KE R4 + DU PHONG
# ---------------------------------------------------------------------------
def _uses(design, ids):
    """{id: [(vai_tro, phan_tu)]} tu lieu duoc dung trong scenes (panel / bg) va layers."""
    out = {}
    for sc in (design or {}).get("scenes") or []:
        if not isinstance(sc, dict):
            continue
        for key in ("panel", "bg"):
            ref = sc.get(key)
            if isinstance(ref, dict) and ref.get("asset") in ids:
                out.setdefault(ref["asset"], []).append(("%s:%s" % (sc.get("layout"), key), sc))
    for L in (design or {}).get("layers") or []:
        if isinstance(L, dict) and L.get("asset") in ids and L.get("type") in ("image", "video"):
            out.setdefault(L["asset"], []).append(("layer", L))
    return out


def _ai_refs(design):
    out = set()
    for a in (design or {}).get("assets") or []:
        if isinstance(a, dict) and a.get("kind") == "ai_image":
            out.update(m for m in a.get("ref_media") or [] if isinstance(m, str))
    return out


def audit(design, items):
    """Muc con thieu (tieng Viet khong dau) de R4 tu sua 1 vong — cung vong voi motion_design.audit_design."""
    out = []
    ids = {it["id"] for it in items or []}
    used = _uses(design, ids)
    refs = _ai_refs(design)
    for it in items or []:
        goi_y = it.get("note") or (it.get("analysis") or {}).get("hop_khi_noi_ve") or (it.get("analysis") or {}).get("chu_the") or ""
        if it["use"] in ("show", "both") and it["id"] not in used:
            out.append("tu lieu nguoi dung '%s' (%s, %s): nguoi dung muon CHEN vao video nhung chua co lop / scene nao "
                       "dung asset '%s' — dat vao luc noi toi: %s" % (it["id"], it["name"], it["kind"], it["id"], goi_y[:160]))
        if it["kind"] == "image" and it["use"] in ("ai_ref", "both") and it["id"] not in refs:
            out.append("tu lieu nguoi dung '%s' (%s): nguoi dung muon lam ANH MAU cho anh AI nhung chua co ai_image nao "
                       "ghi \"ref_media\": [\"%s\"]" % (it["id"], it["name"], it["id"]))
    return out


def _norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


# tu dem / tu chi vi tri trong GHI CHU (khong phai noi dung) — cat cum tai day
_NOTE_SKIP = set("""anh hinh video clip tu lieu chen hien khi noi ve luc doan phan cau cho nay do day kia len xuong
roi sau truoc dau cuoi giua cua va voi la thi ma nhe nha nhi minh toi ban cac nhung mot cai con duoc can muon de o tai
trong tren duoi man khung bat vao dung lam neu hay nhu kieu thoi gian giay""".split())


def _phrases(it):
    """[(cum_da_chuan_hoa, trong_so)] de do khop loi noi. Ghi chu cua nguoi dung (uu tien cao nhat): moi CUM LIEN
    MACH giua cac tu dem, trong so 1.0 ('hien khi noi ve gia' -> 'gia'). Gemini: cum nhieu tieng 1.0, 1 tieng 0.6
    (tieng Viet 1 am tiet de trung nham). Khong loc theo do dai chu: tu tieng Viet ngan ('gia', 'ly', 'com')."""
    a = it.get("analysis") or {}
    out = {}

    def add(p, w):
        n = _norm(p)
        if len(n) >= 2 and out.get(n, 0) < w:
            out[n] = w
    for part in re.split(r"[,.;:\n/()\-–]+", it.get("note") or ""):
        run = []
        for t in _norm(part).split() + [None]:
            if t is None or t in _NOTE_SKIP:
                if run:
                    add(" ".join(run), 1.0)
                run = []
            else:
                run.append(t)
    for p in list(a.get("tu_khoa") or []) + [a.get("chu_the") or ""]:
        n = _norm(p)
        if n:
            add(n, 1.0 if " " in n else 0.6)
    return list(out.items())


def _score(sentence, phrases):
    s = " %s " % _norm(sentence)
    words = set(s.split())
    sc = 0.0
    for p, w in phrases:
        if " %s " % p in s:
            sc += w * (1.0 + 0.2 * p.count(" "))
        elif " " in p:
            toks = p.split()
            hit = sum(1 for t in toks if t in words) / float(len(toks))
            if hit >= 0.6:
                sc += 0.5 * w * hit
    return sc


def _timeline_sentences(segments, transcript_data):
    """Cau loi noi CON tren timeline: (source_id, start, end, text, target_start cua doan)."""
    out = []
    for seg in segments or []:
        sid = seg.get("source_id")
        st, en = providers._f(seg.get("start")), providers._f(seg.get("end"))
        for t in providers._gon_loi_thoai((transcript_data or {}).get(sid), st, en):
            a, b = max(st, providers._f(t.get("start"))), min(en, providers._f(t.get("end")))
            if b - a >= 0.4 and (t.get("text") or "").strip():
                out.append((sid, a, b, t["text"], providers._f(seg.get("target_start"))))
    out.sort(key=lambda r: r[4] + r[1])
    return out


def _fallback_element(it, sent):
    """Phan tu du phong dat tu lieu vao cau `sent`: ("scene", ...) cho tai lieu DOC co chu can doc (anh chup man
    hinh dien thoai, menu doc — khung noi se bi thu nho khong doc duoc), con lai ("layer", ...)."""
    sid, a, b, text, _ = sent
    an = it.get("analysis") or {}
    m = it.get("measured") or {}
    why = "du phong bang code: loi noi '%s' khop tu lieu" % text[:80]
    read = bool(an.get("can_doc_chu"))
    dur = min(5.0, max(3.0 if read else 2.5, b - a))
    if it["kind"] == "video":
        dur = min(dur, max(1.0, float(m.get("duration") or dur)))
    ms = 0.0
    if it["kind"] == "video":
        dd = an.get("doan_dep") or []
        ms = dd[0]["start"] if dd else 0.0
    if (read and float(m.get("cao_khi_rong_1") or 0) > 0.75) or it["placement"] in ("split", "fullscreen"):
        sc = {"layout": "split" if it["placement"] == "split" else "broll", "source_id": sid,
              "src_start": round(a, 2), "src_end": round(a + dur, 2),
              "panel": {"asset": it["id"], "fit": "contain" if read else "cover"}, "why": why, "_fallback": True}
        if it["kind"] == "video":
            sc["panel"]["media_start"] = ms
        return "scene", sc
    cut = it["kind"] == "image" and (an.get("tach_nen_duoc") or m.get("alpha")) and it["placement"] in ("auto", "cutout") \
        and not read
    w = 0.86 if read else 0.5 if cut else 0.62
    L = {"id": "tulieu_%s" % it["id"], "type": "video" if it["kind"] == "video" else "image", "asset": it["id"],
         "source_id": sid, "src_start": round(a, 2), "src_end": round(a + dur, 2), "track": 32,
         "x": 0.5, "y": 0.3, "w": w,
         "enter": {"preset": "pop" if cut else "scale_in", "duration": 0.35, "easing": "back_out"},
         "exit": {"preset": "fade", "duration": 0.25}, "why": why, "_fallback": True}
    if cut:
        L["cutout"] = True
        L["loop"] = {"preset": "float", "amount": 0.4}
    else:
        L["mask"] = "round"
        L["border"] = "4px solid rgba(255,255,255,0.92)"
        L["shadow"] = [{"x": 0, "y": 14, "blur": 36, "color": "rgba(0,0,0,0.45)"}]
    if it["kind"] == "video":
        L["media_start"] = ms
    return "layer", L


def _pick_sentence(it, sents):
    """Cau khop tu lieu nhat. Ghi chu noi 'cuoi video' / 'dau video' -> theo vi tri do."""
    note = _norm(it.get("note"))
    if not sents:
        return None, 0.0
    if re.search(r"\b(cuoi video|ket video|ket thuc|cta|cuoi clip)\b", note):
        return sents[-1], 1.0
    if re.search(r"\b(dau video|mo dau|mo bai|dau clip)\b", note):
        return sents[0], 1.0
    phrases = _phrases(it)
    best, best_sc = None, 0.0
    for s in sents:
        sc = _score(s[3], phrases)
        if sc > best_sc + 1e-6:
            best, best_sc = s, sc
    return best, best_sc


def finalize_design(design, items, segments, transcript_data):
    """Sau R4 (ket qua co the lay tu cache) — ham THUAN theo dau vao:
    - bo tai nguyen R4 khai trung id tu lieu; ref_media chi giu id anh cua nguoi dung;
    - dung dung loai lop (anh <-> video), bo tu lieu video lam nen / tu lieu chi 'lam mau' bi dem ra hien;
    - tu lieu 'chen' R4 van chua dung -> dat DU PHONG vao cau loi noi khop nhat (tu khoa Gemini + ghi chu);
      khong cau nao khop -> bao nguoi dung (khong doan bua).
    Tra (ghi_chu, canh_bao)."""
    notes, warns = [], []
    if not items or not isinstance(design, dict):
        return notes, warns
    by_id = {it["id"]: it for it in items}
    img_ids = {i for i, it in by_id.items() if it["kind"] == "image"}
    kept = []
    for a in design.get("assets") or []:
        if not isinstance(a, dict):
            continue
        if a.get("id") in by_id:
            notes.append("R4 khai lai tu lieu '%s' trong assets -> bo (tu lieu da dang ky san)" % a["id"])
            continue
        if a.get("kind") == "ai_image" and a.get("ref_media") is not None:
            refs = [m for m in (a.get("ref_media") if isinstance(a.get("ref_media"), list) else [a.get("ref_media")])
                    if m in img_ids][:3]
            if refs:
                a["ref_media"] = refs
            else:
                a.pop("ref_media", None)
        kept.append(a)
    design["assets"] = kept
    only_ref = {i for i, it in by_id.items() if it["use"] == "ai_ref"}
    for sc in design.get("scenes") or []:
        if not isinstance(sc, dict):
            continue
        for key in ("panel", "bg"):
            ref = sc.get(key)
            aid = ref.get("asset") if isinstance(ref, dict) else None
            if aid in only_ref:
                sc.pop(key, None)
                notes.append("tu lieu '%s' chi dung lam mau anh AI (theo lua chon cua ban) -> khong hien anh goc" % aid)
            elif aid in by_id and key == "bg" and by_id[aid]["kind"] == "video":
                sc.pop(key, None)
                notes.append("tu lieu video '%s' khong lam nen duoc -> bo nen" % aid)
    layers = []
    for L in design.get("layers") or []:
        aid = L.get("asset") if isinstance(L, dict) else None
        if aid in only_ref and L.get("type") in ("image", "video"):
            notes.append("tu lieu '%s' chi dung lam mau anh AI -> bo lop hien anh goc" % aid)
            continue
        if aid in by_id and L.get("type") in ("image", "video"):
            L["type"] = "video" if by_id[aid]["kind"] == "video" else "image"
        layers.append(L)
    design["layers"] = layers

    ids = set(by_id)
    used = _uses(design, ids)
    skip = {x.get("media"): x.get("ly_do") for x in design.get("tu_lieu_bo_qua") or [] if isinstance(x, dict)}
    sents = _timeline_sentences(segments, transcript_data)
    for it in items:
        if it["use"] not in ("show", "both") or it["id"] in used:
            continue
        s, sc = _pick_sentence(it, sents)
        if s is not None and sc >= 1.0:
            kind, el = _fallback_element(it, s)
            design.setdefault("scenes" if kind == "scene" else "layers", []).append(el)
            notes.append("tu lieu '%s' R4 chua dung -> dat du phong luc noi '%s' (%.1fs nguon)" % (it["name"], s[3][:60], s[1]))
        else:
            why = skip.get(it["id"])
            warns.append("Tư liệu '%s' chưa được chèn: %s — ghi rõ trong ô mục đích lúc nào cần hiện (vd 'khi nói về giá', "
                         "'cuối video') rồi lập lại plan." % (it["name"], ("AI giải thích: " + str(why)[:160]) if why else
                                                                "không tìm thấy lời nói nào khớp nội dung tư liệu"))
    refs = _ai_refs(design)
    for it in items:
        if it["kind"] == "image" and it["use"] in ("ai_ref", "both") and it["id"] not in refs:
            warns.append("Tư liệu '%s' chưa được dùng làm mẫu cho ảnh AI (thiết kế không có ảnh AI nào hợp chỗ) — "
                         "ghi rõ trong ô mục đích cần ảnh AI minh hoạ gì rồi lập lại plan." % it["name"])
    return notes, warns


def prepare_cutouts(assets, design, log=None):
    """Anh cua nguoi dung dung lam sticker ("cutout": true) ma chua trong suot -> tach nen (Vision). Ban tach chi la
    1 manh nho cua anh -> bo (layer_spec dung khung anh nguyen ven thay vi sticker vo nghia)."""
    want = {L.get("asset") for L in (design or {}).get("layers") or []
            if isinstance(L, dict) and L.get("type") == "image" and L.get("cutout")}
    for a in assets or []:
        if a.get("kind") != "user_image" or a["id"] not in want or a.get("alpha") or not a.get("path"):
            continue
        import media_vision
        stem = os.path.splitext(os.path.basename(a["path"]))[0]
        fp = analysis_library.fingerprint(a["path"]) or stem
        out = os.path.join(WORK_DIR, "%s_cut.png" % fp)
        if not os.path.isfile(out):
            os.makedirs(WORK_DIR, exist_ok=True)
            if log:
                log("Tach nen tu lieu %s de dat nhu sticker..." % a.get("name"))
            out = media_vision.lift_subject(a["path"], out)
        if out and os.path.isfile(out) and _cutout_ok(a["path"], out):
            a["cutout_path"] = out
        elif out and log:
            log("Tach nen tu lieu %s chi lay duoc 1 manh nho -> dung khung anh nguyen ven" % a.get("name"))
    return assets


CUTOUT_MIN_AREA = 0.15     # ban tach nen (cat sat chu the) < 15% dien tich anh goc = Vision chi lay duoc 1 manh


def _cutout_ok(src, cut):
    """Vision doi khi chi tach 1 MANH cua chu the (do: chai trang tren nen xam -> chi lay nap xanh) -> sticker vo
    nghia. lift_subject cat sat chu the nen kich thuoc ban tach = khung chu the; qua nho so voi anh goc -> bo."""
    try:
        from PIL import Image
        with Image.open(src) as a_, Image.open(cut) as b_:
            ra = (b_.size[0] * b_.size[1]) / float(max(1, a_.size[0] * a_.size[1]))
        return ra >= CUTOUT_MIN_AREA
    except Exception:
        return False


def display_windows(design, items):
    """Khoang GIO NGUON tu lieu dang hien: [(source_id, a, b, id, anchor)]."""
    out = []
    ids = {it["id"] for it in items or []}
    for aid, uses in _uses(design, ids).items():
        for _, el in uses:
            a = providers._f(el.get("src_start"))
            b = providers._f(el.get("src_end"), a + 3.0)
            out.append((el.get("source_id"), a, max(b, a + 0.5), aid, el.get("anchor")))
    return out


def drop_conflicting_inserts(inserts, design, items):
    """Meme CAT / DE vao dung luc tu lieu cua nguoi dung dang hien -> bo meme (tu lieu nguoi dung uu tien).
    Sua `inserts` tai cho, tra danh sach ghi chu."""
    wins = [w for w in display_windows(design, items) if w[4] != "hook"]
    notes = []
    if not wins or not isinstance(inserts, dict):
        return notes
    keep = []
    for ins in inserts.get("inserts") or []:
        if not isinstance(ins, dict):
            continue
        t = providers._f(ins.get("src_time"), -99)
        hit = next((w for w in wins if (w[0] in (None, ins.get("source_id")) or ins.get("source_id") is None)
                    and w[1] - 0.3 <= t <= w[2] + 0.3), None)
        if hit:
            notes.append("meme '%s' luc %.1fs trung luc tu lieu '%s' dang hien -> bo meme" % (ins.get("meme_id"), t, hit[3]))
            continue
        keep.append(ins)
    inserts["inserts"] = keep
    return notes


# ---------------------------------------------------------------------------
# LOP BAO VE KHI DUNG SPEC (goi tu motion_design)
# ---------------------------------------------------------------------------
def _min_w(a, typ):
    if a.get("can_doc_chu"):
        return MIN_W["read"]
    if a.get("loai") == "logo":
        return MIN_W["logo"]
    return MIN_W["video"] if typ == "video" else MIN_W["image"]


def layer_spec(L, L0, a, duration, changes, label):
    """Lop anh / video dung TU LIEU: dung loai, ban lam viec, co theo ti le THAT (khong meo / cat), co toi thieu,
    video khong dai hon phan con lai. False = bo lop."""
    typ = "video" if a.get("kind") == "user_video" else "image"
    path = a.get("path")
    if not path or not os.path.isfile(path):
        refresh_assets([a])
        path = a.get("path")
    if not path or not os.path.isfile(path):
        changes.append("%s: tu lieu '%s' khong con file -> bo" % (label, a.get("name") or a.get("id")))
        return False
    L["type"] = typ
    sticker = False
    if typ == "image" and L0.get("cutout"):
        if a.get("alpha"):
            sticker = True
        elif a.get("cutout_path") and os.path.isfile(a["cutout_path"]):
            path, sticker = a["cutout_path"], True
        else:
            changes.append("%s: khong tach nen duoc tu lieu '%s' -> dung khung anh" % (label, a.get("name")))
    elif typ == "image" and a.get("alpha") and not L0.get("mask"):
        sticker = True                   # PNG nen trong suot san: dat thang, khong dong khung
    L["path"] = path
    L["um"] = a["id"]
    if sticker:
        for k in ("mask", "border", "shadow", "radius"):
            L.pop(k, None)
    elif not L.get("mask"):
        L["mask"] = "round"
    mw, mh = float(a.get("mw") or 0), float(a.get("mh") or 0)
    ratio = (1080.0 / 1920.0) * (mh / mw) if mw and mh else (1080.0 / 1920.0) * 0.75
    if L.get("mask") == "circle":
        ratio = 1080.0 / 1920.0      # khung tron = vuong (cat cover)
    w = providers._f(L.get("w"), 0.6)
    lo = _min_w(a, typ)
    if w < lo:
        changes.append("%s: tu lieu '%s' w %.2f nho qua -> %.2f%s" % (
            label, a.get("name"), w, lo, " (co chu can doc)" if a.get("can_doc_chu") else ""))
        w = lo
    w = min(w, 1.0)
    if w * ratio > MAX_LAYER_H:
        w2 = MAX_LAYER_H / ratio
        changes.append("%s: tu lieu '%s' cao %.2f khung -> thu w %.2f -> %.2f (to hon nua thi dung scene broll)" % (
            label, a.get("name"), w * ratio, w, w2))
        w = w2
    L["w"], L["h"] = round(w, 4), round(w * ratio, 4)
    L["fit"] = "cover"
    # diem neo -> tam (lop bao ve tinh theo khung)
    anc = L.pop("anchor", "center") or "center"
    if not L.get("keyframes"):
        if anc == "left":
            L["x"] = round(L["x"] + L["w"] / 2, 4)
        elif anc == "right":
            L["x"] = round(L["x"] - L["w"] / 2, 4)
        elif anc == "top":
            L["y"] = round(L["y"] + L["h"] / 2, 4)
        elif anc == "bottom":
            L["y"] = round(L["y"] - L["h"] / 2, 4)
    elif anc != "center":
        L["anchor"] = anc
    if typ == "video":
        dur = float(a.get("duration") or 0)
        ms = max(0.0, providers._f(L0.get("media_start"), 0.0))
        if dur and ms > dur - 0.5:
            ms = max(0.0, dur - 2.0)
        L["mediaStart"] = round(ms, 3)
        if dur:
            avail = dur - ms
            if L["end"] - L["start"] > avail:
                changes.append("%s: video '%s' chi con %.1fs tu giay %.1f -> cat lop" % (label, a.get("name"), avail, ms))
                L["end"] = round(L["start"] + avail, 3)
        if L["end"] - L["start"] < 0.8:
            changes.append("%s: video '%s' hien < 0.8s -> bo" % (label, a.get("name")))
            return False
    elif L["end"] - L["start"] < MIN_SHOW_SEC:
        L["end"] = round(min(duration, L["start"] + MIN_SHOW_SEC), 3)
    return True


def _box(L):
    return (L["x"] - L["w"] / 2, L["y"] - L["h"] / 2, L["x"] + L["w"] / 2, L["y"] + L["h"] / 2)


def _inter(a, b):
    return max(0.0, min(a[2], b[2]) - max(a[0], b[0])) * max(0.0, min(a[3], b[3]) - max(a[1], b[1]))


def place_layers(layers, scenes, faces, dims, zoom, changes):
    """Tu lieu nam TRONG vung an toan va KHONG de len mat nguoi noi (A-roll): thu tren dau -> duoi cam -> canh ben
    -> thu nho dan (khong nho hon co toi thieu). Lop co keyframes / sau nguoi: giu nguyen (AI chu dong)."""
    import motion_design as MD
    for L in layers:
        if not L.get("um") or L.get("keyframes") or L.get("anchor"):
            continue
        w, h = L["w"], L["h"]
        x0 = RP._clamp(L["x"], 0.02 + w / 2, 0.98 - w / 2) if w <= 0.96 else 0.5
        y0 = RP._clamp(L["y"], SAFE_TOP + h / 2, SAFE_BOT - h / 2) if h <= SAFE_BOT - SAFE_TOP else (SAFE_TOP + SAFE_BOT) / 2
        if abs(x0 - L["x"]) > 1e-3 or abs(y0 - L["y"]) > 1e-3:
            changes.append("%s: tu lieu ra ngoai vung an toan -> (%.2f, %.2f)" % (L["id"], x0, y0))
            L["x"], L["y"] = round(x0, 4), round(y0, 4)
        if L.get("behind") or not faces:
            continue
        sc = MD.scene_at(scenes, L["start"])
        sid = L.get("_src") if L.get("_src") in faces else next(iter(faces), None)
        sw, sh = (dims or {}).get(sid, (0, 0))
        fc = MD.face_in_canvas(sc, faces.get(sid), sw, sh)
        if not fc:
            continue
        k_z = zoom(L["start"]) if zoom and (sc is None or sc["layout"] == "full") else 1.0
        if abs(k_z - 1.0) > 0.01:
            fc = {"cx": 0.5 + (fc["cx"] - 0.5) * k_z, "cy": 0.5 + (fc["cy"] - 0.5) * k_z,
                  "h": fc["h"] * k_z, "w": fc.get("w", 0.4) * k_z}
        fw = fc.get("w", 0.4)
        face = (fc["cx"] - fw * 0.55, fc["cy"] - fc["h"] * 0.75, fc["cx"] + fw * 0.55, fc["cy"] + fc["h"] * 0.65)
        area = max(1e-6, (face[2] - face[0]) * (face[3] - face[1]))
        if _inter(_box(L), face) / area <= FACE_OVERLAP_MAX:
            continue
        hair = fc["cy"] - fc["h"] * 1.2
        chin = fc["cy"] + fc["h"] * 0.65
        lo_w = max(0.2, min(w, 0.3))
        moved = None
        for k in (1.0, 0.85, 0.72):
            ww, hh = w * k, h * k
            if k < 1.0 and ww < lo_w:
                break
            cands = []
            if hair - 0.015 - hh >= SAFE_TOP:
                cands.append(("tren dau", L["x"], hair - 0.015 - hh / 2))
            if chin + 0.02 + hh <= SAFE_BOT:
                cands.append(("duoi cam", L["x"], chin + 0.02 + hh / 2))
            if ww <= 0.5:
                if face[0] - 0.02 - ww >= 0.02:
                    cands.append(("ben trai", 0.02 + ww / 2, L["y"]))
                if face[2] + 0.02 + ww <= 0.98:
                    cands.append(("ben phai", 0.98 - ww / 2, L["y"]))
            for note, cx, cy in cands:
                cx = RP._clamp(cx, 0.02 + ww / 2, 0.98 - ww / 2)
                cy = RP._clamp(cy, SAFE_TOP + hh / 2, SAFE_BOT - hh / 2)
                bx = (cx - ww / 2, cy - hh / 2, cx + ww / 2, cy + hh / 2)
                if _inter(bx, face) / area <= FACE_OVERLAP_MAX:
                    moved = (note, cx, cy, k)
                    break
            if moved:
                break
        if moved:
            note, cx, cy, k = moved
            L["x"], L["y"] = round(cx, 4), round(cy, 4)
            if k < 1.0:
                L["w"], L["h"] = round(w * k, 4), round(h * k, 4)
            changes.append("%s: tu lieu de len mat nguoi noi -> %s%s" % (L["id"], note, ", thu nho %.0f%%" % (k * 100) if k < 1 else ""))
        else:
            changes.append("%s: tu lieu to, khong con cho ne mat — giu vi tri (nen dung bo cuc split / broll)" % L["id"])


def panel_media(a, panel, rect):
    """Panel scene (split / broll / card / circle) dung TU LIEU -> RSMedia. Anh co chu can doc / lech ti le
    nhieu so voi khung -> 'contain' (khong cat mat noi dung; Remotion lot ban mo phia sau)."""
    typ = "video" if a.get("kind") == "user_video" else "image"
    path = a.get("path")
    if not path or not os.path.isfile(path):
        refresh_assets([a])
        path = a.get("path")
    if not path or not os.path.isfile(path):
        return None
    fit = panel.get("fit") if panel.get("fit") in ("cover", "contain") else None
    if not fit:
        fit = "cover"
        mw, mh = float(a.get("mw") or 0), float(a.get("mh") or 0)
        if a.get("can_doc_chu"):
            fit = "contain"
        elif mw and mh and rect:
            r_panel = (rect["w"] * 1080.0) / max(1.0, rect["h"] * 1920.0)
            r_media = mw / mh
            if max(r_panel / r_media, r_media / r_panel) > 1.5:
                fit = "contain"
    m = {"kind": typ, "path": path, "fit": fit, "um": a["id"]}
    if typ == "video":
        dur = float(a.get("duration") or 0)
        ms = max(0.0, providers._f(panel.get("media_start"), 0.0))
        if dur and ms > dur - 0.5:
            ms = max(0.0, dur - 2.0)
        m["srcStart"] = round(ms, 3)
        m["kenburns"] = "none"
        m["_avail"] = (dur - ms) if dur else None
    else:
        kb = panel.get("kenburns")
        m["kenburns"] = "none" if a.get("can_doc_chu") else (kb if kb in ("in", "out", "left", "right", "up", "none") else "in")
    return m


# ---------------------------------------------------------------------------
# BAO CAO CHO NGUOI DUNG
# ---------------------------------------------------------------------------
_CACH = {"split": "nửa trên màn hình", "broll": "toàn màn hình", "card": "khung phía trên thẻ",
         "circle": "nền sau khung tròn"}


def usage_report(spec, items, design, plan_assets=None):
    """Tu lieu nao duoc dung o dau (gio TIMELINE cua ban dung that) + ly do AI ghi — hien trong UI."""
    reasons = {x.get("media"): x.get("ly_do") for x in (design or {}).get("tu_lieu_dung") or [] if isinstance(x, dict)}
    skips = {x.get("media"): x.get("ly_do") for x in (design or {}).get("tu_lieu_bo_qua") or [] if isinstance(x, dict)}
    fallback = {L.get("asset") for L in (design or {}).get("layers") or [] if isinstance(L, dict) and L.get("_fallback")}
    fallback |= {(sc.get("panel") or {}).get("asset") for sc in (design or {}).get("scenes") or []
                 if isinstance(sc, dict) and sc.get("_fallback")}
    refs = {}
    for a in plan_assets or []:
        if isinstance(a, dict) and a.get("kind") == "ai_image" and a.get("path"):
            for m in a.get("ref_media") or []:
                refs[m] = refs.get(m, 0) + 1
    out = []
    for it in items or []:
        uses = []
        for L in (spec or {}).get("layers") or []:
            if L.get("um") == it["id"]:
                how = "video nổi trên video" if L.get("type") == "video" else (
                    "sticker tách nền" if not L.get("mask") else "khung ảnh nổi trên video")
                uses.append({"start": L["start"], "end": L["end"], "cach": how})
        for sc in (spec or {}).get("scenes") or []:
            pm = sc.get("panel") or {}
            if pm.get("um") == it["id"]:
                uses.append({"start": sc["start"], "end": sc["end"], "cach": _CACH.get(sc.get("layout"), sc.get("layout"))})
            if (sc.get("bg") or {}).get("um") == it["id"]:
                uses.append({"start": sc["start"], "end": sc["end"], "cach": "ảnh nền"})
        uses.sort(key=lambda u: u["start"])
        row = {"id": it["id"], "name": it["name"], "kind": it["kind"], "use": it["use"],
               "dung": [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in u.items()} for u in uses],
               "anh_ai_dung_mau": refs.get(it["id"], 0)}
        if reasons.get(it["id"]):
            row["ly_do"] = str(reasons[it["id"]])[:300]
        if not uses and skips.get(it["id"]):
            row["bo_qua"] = str(skips[it["id"]])[:300]
        if it["id"] in fallback:
            row["du_phong"] = True
        out.append(row)
    return out
