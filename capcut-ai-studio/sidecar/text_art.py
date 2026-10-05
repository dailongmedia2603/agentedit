#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CHU ANH AI (user 2026-09-27): moi cum CHU NOI BAT (lop chu do hoa R4, chu hero, chu hook —
KHONG ap cho phu de karaoke) duoc AI TAO ANH ve thanh chu dep theo phong cach + chu de video, roi he thong
CAT tung tang (chinh / phu) + xac dinh vi tri tung tu de chuyen dong tung chu.

  1 tong hop: lockups_from() — moi cum -> cac tang (text + chinh / phu), bo trung.
  2 tao anh : 3 cum / anh 1024x1536 NEN TRONG SUOT, moi tang mot hang cach xa; anh DAU lam MAU phong cach
              cho cac anh sau (Codex `-i`) -> ca video cung mot he chu. Song song 3 anh.
  3 cat     : hang = cac dai lop chu cach nhau >= 3% chieu cao anh (dau mu dinh gan chu -> van chung hang);
              kiem chinh ta bang OCR (Vision vi-VT) so voi chu goc (bo dau, gan dung); tu = khoang trong trong
              hang (neu dem dung so tu). Sai -> tao lai 1 lan -> van sai thi cum do dung chu ve bang code.
  4 dung    : motion_design._attach_art dat anh tung tang theo DUNG vi tri / co chu / quy tac chu da co.
Ket qua (duong dan anh cache) nam trong plan["text_art"]; lap plan lai cung chu -> dung lai anh cu.
"""
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import prompt_store

ART_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "textart")
ART_VERSION = 2            # 2 = luat cat ngang (khoang dong rong) + gan tron net chu ve dung hang
PER_SHEET = 3
MAX_ROWS = 4            # toi da 4 hang / tam: nhieu hang thi AI xep sat, duoi chu (g, y, chu viet tay) cham
                        # hang duoi (5 -> 4 ngay 2026-10-01 de con cho cho khoang dong rong)
MAX_CHARS = 48          # cum dai hon (the trich dan, danh sach) -> giu chu ve bang code
MAX_TIERS = 3
SHEET_W, SHEET_H = 1024, 1536
ROW_GAP = 0.03          # hai dai chu cach nhau >= 3% chieu cao anh = hai hang (dau mu cach chu vai px)
OCR_MIN = 0.72


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


_TEXT_ART_PROMPT = """Dung CONG CU TAO ANH (image generation) de tao dung MOT anh. Khong hoi lai, khong giai thich.

# ANH NAY LA GI
Mot TAM CHU (typography sheet) cho video ngan doc 9:16. Anh se duoc CAT RA TUNG HANG CHU de dat len video,
vi vay bo cuc phai de cat. Chu de / giong video: {chu_de}
Phong cach thi giac cua video: {phong_cach}

# NOI DUNG — TUNG HANG TU TREN XUONG (TIENG VIET: dung CHINH XAC tung ky tu, du dau, dung hoa / thuong,
# khong them / bot / doi chu nao, khong them dau cham than hay ky hieu)
{hang}

# PHAN CAP + PHONG CACH CHU
- Hang CHINH: chu to, rat dam, noi bat nhat, mau manh + vien / bong ro, co chieu sau.
- Hang PHU: nho hon ro (~40-55% chieu cao chu chinh), nhe hon (vd viet tay / nghieng / chu thuong thanh lich).
- Moi hang trong cung mot cum phai ra MOT bo chu an khop (tang phu di kem tang chinh ngay duoi / tren no).
- Chu phai DEP kieu tieu de video ngan chuyen nghiep, HOP chu de va phong cach tren, doc ro tren nen video
  bat ky (sang lan toi): luon co vien hoac bong tach khoi nen.
{mau_tham_chieu}
# BO CUC BAT BUOC (de cat)
- Moi hang NAM RIENG, can giua; giua hai hang bat ky phai co mot DAI NGANG TRONG SUOT HOAN TOAN cao it nhat
  1/8 chieu cao anh, do tu DIEM THAP NHAT cua hang tren (ke ca DUOI CHU thong xuong: g, y, p, q, j, dau nang,
  vien, bong 3D, net bay cua chu viet tay) toi DIEM CAO NHAT cua hang duoi (ke ca dau sac / huyen / hoi / nga,
  mu cua a / e / o, moc cua o / u, vien). Ke mot duong ngang bat ky trong dai do se KHONG cham pixel nao.
- Khong chu / vien / bong / hieu ung nao cua hang nay cham sang hang khac. Moi TU cach nhau ro rang.
- Chu chiem gan het be ngang (de net) nhung khong cham mep anh.
- NEN TRONG SUOT (PNG co kenh alpha). Khong nen mau, khong khung, khong vat trang tri, khong logo, khong icon,
  khong chu nao khac ngoai cac hang tren.
TI LE KHUNG: 2:3 (doc)

Tao xong: SAO CHEP file anh vao DUNG duong dan: {out}
Chi tra loi dung duong dan do."""


# ---------------------------------------------------------------------------
# 1. TONG HOP CAC CUM CHU NOI BAT
# ---------------------------------------------------------------------------
def norm(s):
    """So khop chu (bo dau, thuong, chi chu so) — dung cho OCR va khop tang luc dung."""
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    return " ".join(re.findall(r"[a-z0-9]+", s))


def _vis(sp, L):
    import motion_design as MD
    f = sp.get("font") or L.get("font")
    return float(sp.get("size") or L.get("size") or 80) * (MD.SCRIPT_VIS if f in MD.SCRIPT_FONTS else 1.0)


def layer_tiers(L, raw=False):
    """Lop chu -> cac tang (dong) [{text, role, size}] theo "newline". None neu khong hop chu anh.
    raw=True: giu "vis" (co nhin thay) de gop nhieu lop cung group roi moi chia chinh / phu."""
    import motion_design as MD
    if not isinstance(L, dict) or L.get("type") != "text" or L.get("reveal"):
        return None
    spans = [s for s in L.get("spans") or [] if isinstance(s, dict) and MD.strip_emoji(s.get("text"))]
    if not spans:
        return None
    lines = MD._lines(spans)
    tiers = []
    for ln in lines:
        text = " ".join(MD.strip_emoji(s.get("text")) for s in ln).strip()
        if text:
            tiers.append({"text": text, "vis": max(_vis(s, L) for s in ln), "size": max(float(s.get("size") or L.get("size") or 80) for s in ln)})
    total = sum(len(t["text"]) for t in tiers)
    if not tiers or total > MAX_CHARS or len(tiers) > MAX_TIERS:
        return None
    if raw:
        return tiers
    top = max(t["vis"] for t in tiers)
    for t in tiers:
        t["role"] = "chinh" if t["vis"] >= top * 0.85 else "phu"
    return [{"text": t["text"], "role": t["role"], "size": t["size"]} for t in tiers]


def lockup_key(tiers):
    return hashlib.sha1(json.dumps([[norm(t["text"]), t["role"]] for t in tiers], ensure_ascii=False)
                        .encode("utf-8")).hexdigest()[:16]


def lockups_from(layers, captions=None, hook_caption=None, meta=False):
    """Moi cum chu noi bat -> [{key, tiers}], bo trung. Cac lop CUNG group (to hop nhieu lop, vd 'tren chinh' +
    'TAI KHOAN CUA MINH') gop thanh MOT cum de phan cap chinh / phu dung ca to hop. Khong lay phu de.
    meta=True: moi cum them "src" = [{kind: layers, idx: [chi so lop]} | {kind: caption, idx} | {kind: hook}] (Kho Text
    can biet cum nam o dau); meta=False giu dung dang cu (khoa cache TXT-art)."""
    import motion_design as MD
    out, seen = [], {}

    def add(tiers, src):
        if not tiers:
            return
        top = max(t["vis"] for t in tiers)
        tiers = [{"text": t["text"], "role": "chinh" if t["vis"] >= top * 0.85 else "phu", "size": t["size"]} for t in tiers]
        if sum(len(t["text"]) for t in tiers) > MAX_CHARS * 1.5 or len(tiers) > MAX_TIERS + 1:
            return
        k = lockup_key(tiers)
        if k not in seen:
            seen[k] = {"key": k, "tiers": tiers}
            if meta:
                seen[k]["src"] = []
            out.append(seen[k])
        if meta:
            seen[k]["src"].append(src)

    groups, order = {}, []
    for n, L in enumerate(layers or []):
        tiers = layer_tiers(L, raw=True)
        if not tiers:
            continue
        g = L.get("group") if isinstance(L, dict) else None
        key = ("g", g) if g else ("l", n)
        if key not in groups:
            groups[key] = []
            order.append(key)
        # thu tu tren -> duoi theo y (reading_order luc dung se xep lai theo loi noi, o day chi can du tang)
        groups[key].append((float(L.get("y") or 0.5), tiers, n))
    for key in order:
        rows = sorted(groups[key], key=lambda r: r[0])
        add([t for _y, ts, _n in rows for t in ts], {"kind": "layers", "idx": sorted(n for _y, _t, n in rows)})
    for i, c in enumerate(captions or []):
        if isinstance(c, dict) and c.get("role") == "hero":
            t = MD.strip_emoji(c.get("text"))
            if t and len(t) <= MAX_CHARS:
                add([{"text": t, "vis": 120, "size": 120}], {"kind": "caption", "idx": i})
    if hook_caption and MD.strip_emoji(hook_caption):
        t = MD.strip_emoji(hook_caption)
        if len(t) <= MAX_CHARS:
            add([{"text": t, "vis": 120, "size": 120}], {"kind": "hook"})
    return out


# ---------------------------------------------------------------------------
# 2. TAO ANH (Codex, goi ChatGPT)
# ---------------------------------------------------------------------------
def _style_text(style, story):
    st = style if isinstance(style, dict) else {}
    parts = []
    if st.get("mood"):
        parts.append(str(st["mood"]))
    pal = st.get("palette") if isinstance(st.get("palette"), dict) else {}
    cols = [str(v) for k, v in pal.items() if isinstance(v, str)][:5]
    if cols:
        parts.append("bang mau: " + ", ".join(cols))
    fonts = st.get("fonts") if isinstance(st.get("fonts"), dict) else {}
    if fonts:
        parts.append("font theo vai (goi y cam giac): " + ", ".join("%s=%s" % kv for kv in list(fonts.items())[:4]))
    story = story if isinstance(story, dict) else {}
    chu_de = " — ".join(x for x in (str(story.get("story_arc") or "")[:300], str(story.get("tone") or "")[:120]) if x)
    return chu_de or "(khong ro)", "; ".join(parts) or "hien dai, sach, noi bat, hop mang xa hoi"


# 2026-10-01 (user, kem anh): chu "g" cua 'tặng voucher' thong xuong sat hang 'HỜI' -> cat ngang con du mot manh
# 'g' tren dau hang duoi. Luat nay luon duoc noi vao prompt (ke ca khi user da sua prompt) + slice_sheet gan
# TRON tung net chu (thanh phan lien thong) ve dung hang cua no.
_ROW_GAP_RULE = """# LUAT CAT NGANG (bat buoc, kiem bang code)
- Anh se bi cat NGANG giua cac hang. DE KHOANG CACH DONG RAT RONG: dai trong suot giua 2 hang >= 1/8 chieu cao anh,
  tinh tu duoi chu thong xuong (g, y, p, q, j, dau nang, bong) cua hang tren toi dau thanh (sac, huyen, hoi, nga,
  mu, moc) cua hang duoi. Thu nho chu neu can de du khoang trong — KHONG de hai hang sat / chong nhau."""


def sheet_prompt(lockups, style, story, has_ref, out, brand=None):
    rows, n = [], 0
    for i, lk in enumerate(lockups):
        for t in lk["tiers"]:
            n += 1
            rows.append('Hang %d (cum %d, %s): "%s"' % (n, i + 1, "CHINH" if t["role"] == "chinh" else "PHU", t["text"]))
    chu_de, phong_cach = _style_text(style, story)
    ref = ("- ANH DINH KEM la mau cua CUNG video: GIU DUNG phong cach chu do (font, mau, vien, bong, hieu ung) cho"
           " moi hang tuong ung (chinh / phu) — chi doi noi dung chu.\n") if has_ref else ""
    txt = prompt_store.render("_TEXT_ART_PROMPT", chu_de=chu_de, phong_cach=phong_cach, hang="\n".join(rows),
                              mau_tham_chieu=ref, out=out)
    # luat cat ngang + Brand Guideline NOI THEM bang code (prompt tren sua duoc trong menu — ban da sua van phai co)
    import brand_guide
    import canvas
    extra = _ROW_GAP_RULE + brand_guide.rule_text(brand, "text_art") + canvas.note_for(story, "text_art")
    return txt.replace("\nTao xong:", "\n" + extra + "\nTao xong:", 1) if "\nTao xong:" in txt else txt + "\n" + extra


def gen_sheet(lockups, style, story, ref=None, log=None, timeout=480, brand=None):
    """Tao 1 tam chu. Cache theo noi dung prompt + anh mau. Tra duong dan PNG hoac None."""
    import asset_gen
    import cli_providers
    os.makedirs(ART_DIR, exist_ok=True)
    probe = sheet_prompt(lockups, style, story, bool(ref), "{out}", brand=brand)
    refh = hashlib.sha1(open(ref, "rb").read()).hexdigest()[:10] if ref and os.path.isfile(ref) else ""
    k = hashlib.sha1((probe + "|" + refh + "|v%d" % ART_VERSION).encode("utf-8")).hexdigest()[:20]
    out = os.path.join(ART_DIR, "sheet_%s.png" % k)
    if os.path.isfile(out):
        return out
    path = cli_providers.find_bin("gpt")
    if not path:
        raise RuntimeError("Chua cai Codex CLI nen khong tao duoc chu anh AI — mo Doctor de app tu cai")
    model = cli_providers.SPEC["gpt"]["default_model"]
    work = tempfile.mkdtemp(prefix="txtart-")
    target = os.path.join(work, "anh.png")
    argv = [path, "exec", "--skip-git-repo-check", "--ignore-user-config", "--enable", "image_generation",
            "--sandbox", "workspace-write", "--color", "never", "-C", work, "-m", model, "-"]
    if ref and os.path.isfile(ref):
        argv += ["-i", ref]              # anh mau phong cach — dat SAU "-" (xem cli_providers._codex_chat)
    text = sheet_prompt(lockups, style, story, bool(ref), target, brand=brand)
    asset_gen.log_step_call("text-art", "cli:codex", model, "", text, params={"cum": len(lockups), "mau": bool(ref)})
    t0 = time.time()
    src, rc, tail = asset_gen._run_codex(argv, text, work, target, timeout)
    if not src:
        asset_gen.log_step_response("text-art", "cli:codex", tail, error="khong co file anh")
        shutil.rmtree(work, ignore_errors=True)
        return None
    shutil.copy2(src, out)
    shutil.rmtree(work, ignore_errors=True)
    asset_gen.log_step_response("text-art", "cli:codex", "tam chu: %s (%.0fs)" % (out, time.time() - t0))
    return out


# ---------------------------------------------------------------------------
# 3. CAT + KIEM CHINH TA
# ---------------------------------------------------------------------------
def _rgba(path):
    import numpy as np
    import remotion_plan as RP
    info = RP.probe(path)
    w, h = int(info.get("width") or 0), int(info.get("height") or 0)
    raw = subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                         capture_output=True, timeout=60).stdout
    a = np.frombuffer(raw, np.uint8)
    return a.reshape(h, w, 4) if a.size == w * h * 4 else None


def _runs(v, min_gap, min_len=3):
    import numpy as np
    idx = np.nonzero(v)[0]
    res = []
    if not idx.size:
        return res
    s = prev = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i - prev > min_gap:
            res.append((s, prev))
            s = i
        prev = i
    res.append((s, prev))
    return [r for r in res if r[1] - r[0] >= min_len]


def segment_rows(core, n):
    """Tach dung `n` hang chu tu mat na loi chu: tach theo MOI khe trong (>= 3px) roi GOP dan khe hep nhat cho
    toi khi con n hang — manh mong (dau mu / dau nang tach roi, cao < 40% trung vi) duoc uu tien gop vao dong
    gan no. AI hay xep hang sat hon yeu cau (vd 20px), dau tieng Viet cach chu 4-10px -> nguong co dinh khong
    dung duoc. Tra [(y0, y1)] hoac None neu it hang hon n."""
    import numpy as np
    prof = core.sum(axis=1).astype(float)
    segs = [list(r) for r in _runs(prof > 1, min_gap=3, min_len=1)]
    # hang DINH nhau (duoi chu viet tay / bong 3D cham hang duoi): tach o cho MONG NHAT trong dai
    while 0 < len(segs) < n:
        best = None
        for i, (a, b) in enumerate(segs):
            h = b - a + 1
            if h < 40:
                continue
            lo, hi = a + int(h * 0.2), b - int(h * 0.2)
            if hi <= lo:
                continue
            j = lo + int(np.argmin(prof[lo:hi + 1]))
            score = prof[j] / max(1.0, prof[a:b + 1].max())
            if best is None or score < best[0]:
                best = (score, i, j)
        if best is None or best[0] > 0.25:
            return None
        _s, i, j = best
        a, b = segs[i]
        segs[i:i + 1] = [[a, j - 1], [j + 1, b]]
    if len(segs) < n:
        return None
    while len(segs) > n:
        hs = sorted(b - a + 1 for a, b in segs)
        med = hs[len(hs) // 2]
        best = None
        for i in range(len(segs) - 1):
            gap = segs[i + 1][0] - segs[i][1]
            thin = min(segs[i][1] - segs[i][0] + 1, segs[i + 1][1] - segs[i + 1][0] + 1) < 0.4 * med
            cost = gap * (0.15 if thin else 1.0)
            if best is None or cost < best[0]:
                best = (cost, i)
        i = best[1]
        segs[i] = [segs[i][0], segs[i + 1][1]]
        del segs[i + 1]
    return [tuple(x) for x in segs]


def _components(mask):
    """Gan nhan thanh phan lien thong (8 lan can) cho mat na bool HxW: chay ngang moi dong + union-find (khong can
    scipy). Tra mang nhan int32 (-1 = nen)."""
    import numpy as np
    H, W = mask.shape
    parent = []

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    runs, prev = [], []
    for y in range(H):
        row = mask[y]
        if not row.any():
            prev = []
            continue
        d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        cur, j = [], 0
        for x0, x1 in zip(np.nonzero(d == 1)[0].tolist(), (np.nonzero(d == -1)[0] - 1).tolist()):
            while j < len(prev) and prev[j][1] < x0 - 1:
                j += 1
            lab, k = None, j
            while k < len(prev) and prev[k][0] <= x1 + 1:
                r = find(prev[k][2])
                if lab is None:
                    lab = r
                elif r != lab:
                    parent[r] = lab
                k += 1
            if lab is None:
                lab = len(parent)
                parent.append(lab)
            cur.append((x0, x1, lab))
            runs.append((y, x0, x1, lab))
        prev = cur
    out = np.full((H, W), -1, dtype=np.int32)
    for y, x0, x1, lab in runs:
        out[y, x0:x1 + 1] = find(lab)
    return out


def row_masks(soft, rows, bounds):
    """Moi pixel chu -> chi so HANG cua no (-1 = nen). Gan TRON tung net chu (thanh phan lien thong) ve hang chua
    nhieu pixel cua no nhat: duoi chu 'g' thong qua duong cat van thuoc hang tren, dau / mu cua hang duoi van thuoc
    hang duoi — cat ngang khong con du manh chu hang ben canh (loi that 2026-10-01: manh 'g' tren dau 'HỜI').
    Net dinh lien ca hai hang (bong / vien chay dai, >= 20% o moi ben) -> chia theo duong cat nhu cu."""
    import numpy as np
    H = soft.shape[0]
    row_of_y = np.full(H, -1, dtype=np.int32)
    for i, (top, bot) in enumerate(bounds):
        row_of_y[top:bot + 1] = i
    lab = _components(soft)
    n = int(lab.max()) + 1
    owner = np.full(soft.shape, -1, dtype=np.int32)
    if n <= 0:
        return owner
    ys, xs = np.nonzero(lab >= 0)
    ls, rs = lab[ys, xs], row_of_y[ys]
    ok = rs >= 0
    cnt = np.zeros((n, len(rows)), dtype=np.int64)
    np.add.at(cnt, (ls[ok], rs[ok]), 1)
    tot = cnt.sum(axis=1)
    best = cnt.argmax(axis=1)
    srt = np.sort(cnt, axis=1)
    second = srt[:, -2] if len(rows) > 1 else np.zeros(n, dtype=np.int64)
    merged = (second >= 0.2 * np.maximum(tot, 1)) & (second >= 40)
    own = np.where(merged[ls], rs, best[ls])
    owner[ys, xs] = own
    return owner


def _save_png(arr, path):
    import remotion_plan as RP
    h, w = arr.shape[:2]
    subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", "%dx%d" % (w, h),
                    "-i", "-", path], input=arr.tobytes(), capture_output=True, timeout=60)
    return os.path.isfile(path)


def _ocr(arr, want_words=False):
    """OCR tieng Viet (Vision vi-VT) cua mot manh RGBA (dat len nen xam toi). want_words=True: tra them khoang x
    (0..1) cua TUNG TU (Vision boundingBoxForRange) — chinh xac ca voi chu in dam hep co bong 3D (khong con khe
    trong giua hai tu de do bang mat na)."""
    import numpy as np
    try:
        if os.environ.get("STUDIO_VISION") == "onnx":
            raise ImportError("ep ONNX")
        import Vision
        from Foundation import NSURL, NSMakeRange
    except Exception:
        # Khong co Vision (Windows): nhan dang 1 dong bang PP-OCR ONNX (vision_onnx) — so khop bo dau nen du
        import vision_onnx
        if vision_onnx.ocr_ready():
            return vision_onnx.ocr(arr, want_words=want_words)
        return (None, None) if want_words else None
    a = arr[..., 3:4].astype(float) / 255.0
    comp = np.concatenate([(arr[..., :3] * a + 40 * (1 - a)).astype(np.uint8), np.full(arr.shape[:2] + (1,), 255, np.uint8)], axis=2)
    fd, tmp = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    text, words = None, []
    try:
        _save_png(comp, tmp)
        req = Vision.VNRecognizeTextRequest.alloc().init()
        req.setRecognitionLevel_(0)
        req.setRecognitionLanguages_(["vi-VT"])
        req.setUsesLanguageCorrection_(False)
        hd = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(tmp), None)
        hd.performRequests_error_([req], None)
        parts = []
        for r in req.results() or []:
            cand = r.topCandidates_(1)[0]
            st = str(cand.string())
            parts.append(st)
            if want_words:
                pos = 0
                for w in st.split(" "):
                    if w:
                        box, _e = cand.boundingBoxForRange_error_(NSMakeRange(pos, len(w)), None)
                        if box is not None:
                            bb = box.boundingBox()
                            words.append((float(bb.origin.x), float(bb.origin.x + bb.size.width)))
                    pos += len(w) + 1
        text = " ".join(parts)
    except Exception:
        text = None
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    return (text, words) if want_words else text


def _sim(a, b):
    a, b = norm(a).replace(" ", ""), norm(b).replace(" ", "")
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def slice_sheet(path, lockups):
    """Tam chu -> {key: {"tiers": [...]}} cho cum cat + kiem DAT; tra them danh sach cum loi (ly do)."""
    import numpy as np
    img = _rgba(path)
    if img is None:
        return {}, [(lk["key"], "khong doc duoc anh") for lk in lockups]
    H, W = img.shape[:2]
    al = img[..., 3]
    if (al < 10).mean() < 0.2:
        return {}, [(lk["key"], "anh khong co nen trong suot") for lk in lockups]
    core = al > 180
    expect = [(lk, t) for lk in lockups for t in lk["tiers"]]
    rows = segment_rows(core, len(expect))
    if not rows:
        n_have = len(_runs(core.sum(axis=1) > 1, min_gap=3, min_len=1))
        return {}, [(lk["key"], "tam chu chi co %d dai chu, can %d hang" % (n_have, len(expect))) for lk in lockups]
    soft = al > 8
    bounds = []
    for i, (r0, r1) in enumerate(rows):
        top = (rows[i - 1][1] + r0) // 2 if i else 0
        bot = (r1 + rows[i + 1][0]) // 2 if i + 1 < len(rows) else H - 1
        bounds.append((top, bot))
    owner = row_masks(soft, rows, bounds)
    os.makedirs(ART_DIR, exist_ok=True)
    base = os.path.splitext(os.path.basename(path))[0]
    res, bad = {}, []
    for i, ((lk, t), (r0, r1), (top, bot)) in enumerate(zip(expect, rows, bounds)):
        mine = owner == i
        ys = np.nonzero(mine.any(axis=1))[0]
        xs = np.nonzero(mine.any(axis=0))[0]
        if not ys.size or not xs.size:
            bad.append((lk["key"], "hang %d trong" % (i + 1)))
            continue
        y0, y1 = int(ys[0]), int(ys[-1])
        x0, x1 = int(xs[0]), int(xs[-1])
        crop = img[y0:y1 + 1, x0:x1 + 1].copy()
        # chi giu pixel THUOC hang nay: manh duoi chu / dau cua hang ben canh lot vao khung cat -> trong suot
        crop[..., 3] = np.where(mine[y0:y1 + 1, x0:x1 + 1], crop[..., 3], 0)
        text_ocr, ocr_words = _ocr(crop, want_words=True)
        sim = _sim(text_ocr, t["text"]) if text_ocr else None
        if text_ocr and sim < OCR_MIN:
            bad.append((lk["key"], "hang %d doc ra %r, can %r" % (i + 1, text_ocr[:40], t["text"])))
            continue
        # vi tri tung TU: uu tien khung tung tu cua OCR (dung ca chu hep co bong); khong khop so tu -> khe trong
        c_core = (core & mine)[r0:r1 + 1, x0:x1 + 1]
        words = t["text"].split()
        wr = None
        if len(words) > 1:
            if ocr_words and len(ocr_words) == len(words):
                spans_ = sorted(ocr_words)
            else:
                cw = float(x1 - x0 + 1)
                gaps = _runs(c_core.sum(axis=0) > 0, min_gap=max(4, int((r1 - r0 + 1) * 0.12)))
                spans_ = [(g0 / cw, g1 / cw) for g0, g1 in gaps] if len(gaps) == len(words) else None
            if spans_:
                # noi mep hai tu ke nhau o GIUA khe (khong ho, khong chong) + phu kin 0..1
                cuts = [0.0] + [round((spans_[i][1] + spans_[i + 1][0]) / 2, 4) for i in range(len(spans_) - 1)] + [1.0]
                wr = [[cuts[i], cuts[i + 1]] for i in range(len(spans_))]
        fp = os.path.join(ART_DIR, "%s_h%d.png" % (base, i + 1))
        if not _save_png(crop, fp):
            bad.append((lk["key"], "khong luu duoc manh %d" % (i + 1)))
            continue
        cc = np.nonzero(c_core.any(axis=0))[0]
        core_w = int(cc[-1] - cc[0] + 1) if cc.size else int(x1 - x0 + 1)
        tier = {"text": t["text"], "role": t["role"], "file": fp, "w": int(x1 - x0 + 1), "h": int(y1 - y0 + 1),
                "core_h": int(r1 - r0 + 1), "core_w": core_w, "core_top": int(r0 - y0),
                "ocr": text_ocr or "", "ocr_sim": None if sim is None else round(sim, 2)}
        if wr:
            tier["words"] = wr
        res.setdefault(lk["key"], {"tiers": []})["tiers"].append(tier)
    bad_keys = {k for k, _ in bad}
    out = {k: v for k, v in res.items() if k not in bad_keys and len(v["tiers"]) == len(next(lk["tiers"] for lk in lockups if lk["key"] == k))}
    return out, bad


# ---------------------------------------------------------------------------
# 4. DIEU PHOI
# ---------------------------------------------------------------------------
def _pack(lockups, max_rows=MAX_ROWS, per=PER_SHEET):
    """Chia cum vao cac tam: <= `per` cum va <= `max_rows` hang moi tam (cum khong bi chia doi)."""
    out, cur, rows = [], [], 0
    for lk in lockups:
        n = len(lk["tiers"])
        if cur and (len(cur) >= per or rows + n > max_rows):
            out.append(cur)
            cur, rows = [], 0
        cur.append(lk)
        rows += n
    if cur:
        out.append(cur)
    return out


def make_text_art(lockups, style=None, story=None, log=None, emit=None, workers=3, brand=None):
    """Tao + cat chu anh cho moi cum. Tra {"items": {key: {...}}, "failed": [{key, text, ly_do}]}."""
    items, failed = {}, []
    if not lockups:
        return {"items": items, "failed": failed}
    sheets = _pack(lockups)

    def run(sheet, ref):
        try:
            # khong co Brand Guideline -> goi y nhu truoc (khong them tham so)
            p = gen_sheet(sheet, style, story, ref=ref, log=log, **({"brand": brand} if brand else {}))
        except Exception as ex:
            return None, {}, [(lk["key"], "tao anh loi: %s" % str(ex)[:120]) for lk in sheet]
        if not p:
            return None, {}, [(lk["key"], "Codex khong tao duoc anh") for lk in sheet]
        ok, bad = slice_sheet(p, sheet)
        return p, ok, bad

    ref = None
    todo = []
    first, ok, bad = run(sheets[0], None)
    items.update(ok)
    if first and ok:
        ref = first                      # tam dau DAT -> mau phong cach cho moi tam sau
    todo += [lk for lk in sheets[0] if lk["key"] in {k for k, _ in bad}]
    if emit:
        emit("Chữ ảnh AI: tấm 1/%d xong (%d/%d cụm đạt)" % (len(sheets), len(ok), len(sheets[0])))
    rest = sheets[1:]
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for p, ok, bad in ex.map(lambda sh: run(sh, ref), rest):
            items.update(ok)
            bad_k = {k for k, _ in bad}
            todo += [lk for sh in rest for lk in sh if lk["key"] in bad_k and lk["key"] not in {x["key"] for x in todo}]
    # tao lai 1 lan cho cum loi (tam moi, cung mau)
    retry = [lk for lk in todo if lk["key"] not in items]
    last_err = {}
    if retry:
        if emit:
            emit("Chữ ảnh AI: tạo lại %d cụm lỗi chính tả / bố cục" % len(retry))
        chunks = _pack(retry, max_rows=3)       # tao lai: it hang hon cho thoang
        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            for p, ok, bad in ex.map(lambda sh: run(sh, ref), chunks):
                items.update(ok)
                last_err.update(dict(bad))
    for lk in lockups:
        if lk["key"] not in items:
            failed.append({"key": lk["key"], "text": " / ".join(t["text"] for t in lk["tiers"]),
                           "ly_do": last_err.get(lk["key"], "khong dat sau khi tao lai")})
    return {"items": items, "failed": failed, "ref": ref}
