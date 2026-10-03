#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Thi giac may KHONG can Apple Vision (Windows) — model ONNX chay CPU bang onnxruntime + numpy + Pillow.

Thay tung tien ich cua Vision (media_vision / text_art / hook_rule goi vao day khi khong co Vision):
  - faces(anh)          : do mat YuNet (opencv_zoo, giai ma bang numpy — khong can OpenCV), hieu chinh khung
                          ve quy uoc cua Vision (do that: YuNet cao hon 17%, hep hon 14%, tam thap hon 9% chieu cao).
  - person_masks(khung) : mat na NGUOI tung khung video = RobustVideoMatting (co trang thai theo thoi gian,
                          khung phai lien tiep). Ghi m_*.png canh f_*.jpg nhu duong Vision.
  - cutout(anh)         : tach chu the anh tinh = BiRefNet-lite -> PNG RGBA cat sat chu the (giong
                          generateMaskedImageOfInstances croppedToInstancesExtent=True cua Vision).
  - ocr(manh RGBA)      : doc 1 DONG chu (moi manh slice_sheet la 1 hang) bang model nhan dang PP-OCR (CTC):
                          chu = model latin (khop chu tot nhat), khung tung tu = PP-OCRv6 (tach dung so tu).
  - raster_svg(svg)     : ve khung SVG ra RGBA (resvg) thay NSImage.

Chon model bang DO THAT 2026-10-01 tren video / anh that cua user, so voi Vision (xem toolchain.json
`_vision_models_doc`). Model: toolchain.json `vision_models` — nhung san trong app (STUDIO_MODELS_DIR) hoac Doctor
tai ve ~/.capcut-studio/models (kiem SHA-256). Thieu model / thu vien -> ham tra None, pipeline van chay nhu cu.
"""
import json
import os
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
USER_MODELS = os.path.join(os.path.expanduser("~"), ".capcut-studio", "models")

RVM = "rvm_mobilenetv3_fp32.onnx"
YUNET = "face_detection_yunet_2023mar.onnx"
CUT = "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx"
OCR_TEXT = "latin_PP-OCRv5_rec_mobile.onnx"
OCR_WORDS = "PP-OCRv6_rec_small.onnx"

_lock = threading.Lock()
_sessions = {}


def _manifest_models():
    try:
        with open(os.path.join(HERE, "assets", "toolchain.json"), encoding="utf-8") as f:
            return json.load(f).get("vision_models") or {}
    except (OSError, ValueError):
        return {}


def model_dirs():
    out = []
    env = os.environ.get("STUDIO_MODELS_DIR")
    if env:
        out.append(env)
    out.append(USER_MODELS)
    return out


def model_path(name):
    """Duong dan model DUNG kich thuoc ghim (kiem SHA-256 day du do Doctor lam luc cai), hoac None."""
    want = (_manifest_models().get(name) or {}).get("size")
    for d in model_dirs():
        p = os.path.join(d, name)
        try:
            if os.path.isfile(p) and (not want or os.path.getsize(p) == want):
                return p
        except OSError:
            pass
    return None


def has(name):
    try:
        import onnxruntime  # noqa: F401
    except Exception:
        return False
    return model_path(name) is not None


def _session(name):
    with _lock:
        s = _sessions.get(name)
        if s is None:
            import onnxruntime as ort
            p = model_path(name)
            if not p:
                raise FileNotFoundError("thieu model " + name)
            opt = ort.SessionOptions()
            opt.log_severity_level = 3
            s = ort.InferenceSession(p, opt, providers=["CPUExecutionProvider"])
            _sessions[name] = s
        return s


# ---------------------------------------------------------------------------
# Mat (YuNet)
# ---------------------------------------------------------------------------
# Hieu chinh ve quy uoc khung mat cua Vision (do tren 89 khung video that): w / 0.862, h / 1.17,
# tam dich xuong 0.093 x chieu cao, sang phai 0.017 x be ngang.
_FACE_W, _FACE_H, _FACE_DY, _FACE_DX = 0.862, 1.17, 0.093, 0.017


def faces(img_path, thr=0.6):
    """[{x, y, w, h, conf}] (0..1, goc tren-trai) — cung dang media_vision._faces_in_image (Vision)."""
    import numpy as np
    from PIL import Image
    s = _session(YUNET)
    img = Image.open(img_path).convert("RGB")
    W, H = img.size
    sc = 640.0 / max(W, H)
    w, h = max(1, int(round(W * sc))), max(1, int(round(H * sc)))
    can = np.zeros((640, 640, 3), np.float32)
    can[:h, :w] = np.asarray(img.resize((w, h), Image.BILINEAR), np.float32)[..., ::-1]   # BGR 0..255
    names = [o.name for o in s.get_outputs()]
    out = dict(zip(names, s.run(None, {s.get_inputs()[0].name: can.transpose(2, 0, 1)[None]})))
    boxes = []
    for st in (8, 16, 32):
        cols = 640 // st
        cls, obj, bb = out["cls_%d" % st][0, :, 0], out["obj_%d" % st][0, :, 0], out["bbox_%d" % st][0]
        score = np.sqrt(np.clip(cls, 0, 1) * np.clip(obj, 0, 1))
        for i in np.nonzero(score >= thr)[0]:
            r, c = divmod(int(i), cols)
            cx, cy = (c + bb[i, 0]) * st, (r + bb[i, 1]) * st
            bw, bh = float(np.exp(bb[i, 2]) * st), float(np.exp(bb[i, 3]) * st)
            boxes.append((float(score[i]), float(cx - bw / 2), float(cy - bh / 2), bw, bh))
    boxes.sort(reverse=True)
    keep = []
    for b in boxes:
        dup = False
        for k in keep:
            x0, y0 = max(b[1], k[1]), max(b[2], k[2])
            x1, y1 = min(b[1] + b[3], k[1] + k[3]), min(b[2] + b[4], k[2] + k[4])
            inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
            if inter / (b[3] * b[4] + k[3] * k[4] - inter + 1e-6) > 0.3:
                dup = True
                break
        if not dup:
            keep.append(b)
    res = []
    for conf, x, y, bw, bh in keep:
        fw, fh = bw / sc / W / _FACE_W, bh / sc / H / _FACE_H
        cx = (x + bw / 2) / sc / W + _FACE_DX * fw
        cy = (y + bh / 2) / sc / H + _FACE_DY * fh
        res.append({"x": float(cx - fw / 2), "y": float(cy - fh / 2), "w": float(fw), "h": float(fh), "conf": float(conf)})
    return res


# ---------------------------------------------------------------------------
# Nguoi trong video (RobustVideoMatting)
# ---------------------------------------------------------------------------
def person_masks(frames):
    """Mat na nguoi cho TUNG khung (f_*.jpg, lien tiep theo thoi gian) -> ghi m_*.png (L 8-bit) cung thu muc.
    RVM giu trang thai qua cac khung (on dinh, it nhap nhay — do that ngang Vision). True neu ghi du."""
    import numpy as np
    from PIL import Image
    if not frames:
        return False
    s = _session(RVM)
    rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
    W, H = Image.open(frames[0]).size
    # do phan giai noi bo ~480px canh dai (RVM khuyen 0.25 cho 1080p, 0.4 cho 720p)
    ratio = np.array([min(1.0, 480.0 / max(W, H))], np.float32)

    def step(img, rec_):
        x = (np.asarray(img, np.float32) / 255.0).transpose(2, 0, 1)[None]
        _fgr, pha, *r = s.run(None, {"src": x, "r1i": rec_[0], "r2i": rec_[1], "r3i": rec_[2], "r4i": rec_[3],
                                     "downsample_ratio": ratio})
        return pha[0, 0], r
    # khoi dong trang thai: chay khung dau vai lan (khung dau RVM chua co ngu canh -> mat na kem hon)
    first = Image.open(frames[0]).convert("RGB")
    for _ in range(3):
        _p, rec = step(first, rec)
    for fp in frames:
        pha, rec = step(Image.open(fp).convert("RGB"), rec)
        d, b = os.path.split(fp)
        Image.fromarray((np.clip(pha, 0, 1) * 255).astype(np.uint8)).save(os.path.join(d, b.replace("f_", "m_", 1).rsplit(".", 1)[0] + ".png"))
    return True


# ---------------------------------------------------------------------------
# Chu the anh tinh (BiRefNet-lite)
# ---------------------------------------------------------------------------
def cutout(img_path, out_path, min_cover=0.01):
    """PNG RGBA chi giu chu the, CAT SAT khung chu the (mat na da lam sach — cutout_refine). Tra out_path hoac None."""
    import numpy as np
    from PIL import Image
    import cutout_refine
    s = _session(CUT)
    with Image.open(img_path) as img:
        rgb = img.convert("RGB")
    W, H = rgb.size
    x = np.asarray(rgb.resize((1024, 1024), Image.BILINEAR), np.float32) / 255.0
    x = ((x - np.array([0.485, 0.456, 0.406])) / np.array([0.229, 0.224, 0.225])).astype(np.float32)
    m = s.run(None, {s.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0][0, 0]
    m = 1.0 / (1.0 + np.exp(-m))
    a = np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR))
    if (a > 128).mean() < min_cover:
        return None
    return cutout_refine.cutout(img_path, a.astype(np.float32) / 255.0, out_path)


# ---------------------------------------------------------------------------
# OCR 1 dong (PP-OCR nhan dang, giai ma CTC)
# ---------------------------------------------------------------------------
_chars = {}


def _charset(name):
    if name not in _chars:
        import onnxruntime  # noqa: F401
        s = _session(name)
        meta = s.get_modelmeta().custom_metadata_map or {}
        _chars[name] = ["<blank>"] + (meta.get("character") or "").split("\n") + [" "]
    return _chars[name]


def _rec_line(name, rgb):
    """Anh RGB (h, w, 3) uint8 -> (chu, [(x0, x1) 0..1 tung tu])."""
    import numpy as np
    from PIL import Image
    s = _session(name)
    chars = _charset(name)
    H, W = rgb.shape[:2]
    pad = max(2, H // 5)
    img = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)), constant_values=40)
    Hp, Wp = img.shape[:2]
    w = max(16, min(4000, int(round(48.0 * Wp / Hp))))
    x = np.asarray(Image.fromarray(img).resize((w, 48), Image.BILINEAR), np.float32) / 255.0
    x = ((x - 0.5) / 0.5).transpose(2, 0, 1)[None]
    p = s.run(None, {s.get_inputs()[0].name: x})[0][0]
    T = p.shape[0]
    idx = p.argmax(1)
    text, pos, prev = [], [], 0
    for t, k in enumerate(idx):
        k = int(k)
        if k != prev and k != 0:
            text.append(chars[k] if k < len(chars) else "")
            pos.append(t)
        prev = k
    words, cur = [], []
    for c, t in zip(text + [" "], pos + [T]):
        if c == " ":
            if cur:
                x0 = (cur[0] * Wp / float(T) - pad) / W
                x1 = ((cur[-1] + 1) * Wp / float(T) - pad) / W
                words.append((max(0.0, x0), min(1.0, x1)))
            cur = []
        else:
            cur.append(t)
    return "".join(text).strip(), words


def ocr(arr, want_words=False):
    """Giong text_art._ocr: manh RGBA -> chu (va khung tung tu 0..1). Loi -> None."""
    import numpy as np
    try:
        a = arr[..., 3:4].astype(np.float32) / 255.0
        rgb = (arr[..., :3] * a + 40 * (1 - a)).astype(np.uint8)
        text, _w = _rec_line(OCR_TEXT, rgb)
        words = _rec_line(OCR_WORDS, rgb)[1] if want_words else []
    except Exception:
        return (None, None) if want_words else None
    return (text or None, words) if want_words else (text or None)


def ocr_ready():
    return has(OCR_TEXT) and has(OCR_WORDS)


# ---------------------------------------------------------------------------
# SVG -> RGBA (resvg)
# ---------------------------------------------------------------------------
def raster_svg(svg, w=216, h=384):
    """Khung SVG -> mang RGBA float32 0..1 (h, w, 4), hoac None."""
    try:
        import io
        import numpy as np
        import resvg_py
        from PIL import Image
        png = resvg_py.svg_to_bytes(svg_string=svg, width=w, height=h, skip_system_fonts=True)
        im = Image.open(io.BytesIO(bytes(png))).convert("RGBA")
        if im.size != (w, h):
            im = im.resize((w, h), Image.BILINEAR)
        return np.asarray(im, np.float32) / 255.0
    except Exception:
        return None


def probe():
    """Cho Doctor: tung tien ich co dung duoc khong (model + thu vien)."""
    out = {"backend": "onnx", "person_seg": has(RVM), "faces": has(YUNET), "foreground_mask": has(CUT),
           "ocr_vi": False, "svg": False, "heic": False, "missing": [], "error": None}
    try:
        import onnxruntime  # noqa: F401
    except Exception as e:  # noqa: BLE001
        out["error"] = "onnxruntime: %s" % str(e).split("\n")[0][:160]
    out["ocr_vi"] = ocr_ready()
    try:
        import resvg_py  # noqa: F401
        out["svg"] = raster_svg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
                                '<rect width="10" height="10" fill="red"/></svg>', 4, 4) is not None
    except Exception:
        pass
    try:
        import pillow_heif  # noqa: F401
        out["heic"] = True
    except Exception:
        pass
    out["missing"] = [n for n in _manifest_models() if model_path(n) is None]
    out["ok"] = bool(out["person_seg"] and out["faces"] and out["foreground_mask"] and out["ocr_vi"] and out["svg"])
    return out
