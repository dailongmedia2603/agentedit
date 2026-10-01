#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Thi giac may: macOS = Vision framework (pyobjc); may khac (Windows) = model ONNX (vision_onnx.py).
KHONG goi AI, khong ton luot.

- face_box(video): vi tri khuon mat trong video nguon (trung vi nhieu khung). Dung de
  dat A-roll vao khung chia doi / the bo goc / khung tron ma KHONG cat mat mat nguoi,
  va de lop chu khong de len mat.
- lift_subject(anh): tach chu the khoi nen -> PNG trong suot (sticker, nhan vat, san pham)
  — giong "nhan giu anh de tach chu the" tren iPhone.

Thieu pyobjc-framework-Vision -> dung vision_onnx (RVM / YuNet / BiRefNet); thieu ca model -> tra None,
pipeline van chay (chi mat cac tien ich nay). STUDIO_VISION=onnx: ep dung ONNX ca tren macOS (de kiem).
"""
import os
import math
import json
import hashlib
import statistics
import subprocess
import tempfile

import remotion_plan
import vision_onnx

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "vision")


def _vision():
    if os.environ.get("STUDIO_VISION") == "onnx":
        return False
    try:
        import Vision  # noqa: F401
        import Quartz  # noqa: F401
        from Foundation import NSURL  # noqa: F401
        return True
    except Exception:
        return False


def available():
    """Tach nguoi (chu sau nguoi / pop-out) dung duoc: Vision, hoac model RVM."""
    return _vision() or vision_onnx.has(vision_onnx.RVM)


def _mask_name(fp):
    """f_00001.jpg -> m_00001.png CUNG thu muc (chi doi TEN file: duong dan co the chua 'f_', vd C:\\Users\\Jeff_x)."""
    d, b = os.path.split(fp)
    return os.path.join(d, b.replace("f_", "m_", 1).rsplit(".", 1)[0] + ".png")


def _key(path, extra=""):
    st = os.stat(path)
    return hashlib.sha1(("%s|%d|%d|%s" % (os.path.abspath(path), st.st_size, int(st.st_mtime), extra)).encode()).hexdigest()


def _faces_in_image(img_path):
    if not _vision():
        try:
            return vision_onnx.faces(img_path) if vision_onnx.has(vision_onnx.YUNET) else []
        except Exception:
            return []
    import Vision
    from Foundation import NSURL
    req = Vision.VNDetectFaceRectanglesRequest.alloc().init()
    h = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(img_path), None)
    ok, _err = h.performRequests_error_([req], None)
    out = []
    for r in (req.results() or []) if ok else []:
        b = r.boundingBox()  # goc DUOI-trai, 0..1
        out.append({"x": b.origin.x, "y": 1 - b.origin.y - b.size.height, "w": b.size.width, "h": b.size.height,
                    "conf": float(r.confidence())})
    return out


def face_box(video_path, samples=9, duration=None):
    """{cx, cy, w, h} (0..1, goc tren-trai) cua khuon mat chinh, hoac None."""
    if not video_path or not os.path.isfile(video_path) or not (_vision() or vision_onnx.has(vision_onnx.YUNET)):
        return None
    import media_sdr
    video_path = media_sdr.working_path(video_path)     # HDR -> ban SDR (khung dung mau)
    os.makedirs(CACHE_DIR, exist_ok=True)
    cp = os.path.join(CACHE_DIR, "face_" + _key(video_path, "" if _vision() else "onnx-yunet") + ".json")
    if os.path.isfile(cp):
        try:
            with open(cp, encoding="utf-8") as f:
                return json.load(f).get("face")
        except (OSError, ValueError):
            pass
    dur = float(duration or remotion_plan.probe(video_path).get("duration") or 0)
    if dur <= 0:
        return None
    ff = remotion_plan._ffbin("ffmpeg")
    work = tempfile.mkdtemp(prefix="face-")
    boxes = []
    try:
        for i in range(samples):
            t = dur * (i + 0.5) / samples
            fp = os.path.join(work, "f%02d.jpg" % i)
            subprocess.run([ff, "-v", "error", "-y", "-ss", "%.2f" % t, "-i", video_path, "-frames:v", "1",
                            "-vf", "scale=640:-2", fp], capture_output=True, timeout=60)
            if not os.path.isfile(fp):
                continue
            fs = _faces_in_image(fp)
            if fs:
                boxes.append(max(fs, key=lambda b: b["w"] * b["h"]))  # mat lon nhat = nguoi noi
    finally:
        for f in os.listdir(work):
            try:
                os.remove(os.path.join(work, f))
            except OSError:
                pass
        os.rmdir(work)
    face = None
    if len(boxes) >= max(2, samples // 3):
        med = lambda k: statistics.median(b[k] for b in boxes)  # noqa: E731
        x, y, w, h = med("x"), med("y"), med("w"), med("h")
        face = {"cx": round(x + w / 2, 3), "cy": round(y + h / 2, 3), "w": round(w, 3), "h": round(h, 3),
                "seen": round(len(boxes) / float(samples), 2)}
    with open(cp, "w", encoding="utf-8") as f:
        json.dump({"face": face}, f)
    return face


def lift_subject(img_path, out_path=None):
    """Tach chu the khoi nen -> PNG RGBA cat sat chu the. Tra duong dan, hoac None."""
    if not img_path or not os.path.isfile(img_path):
        return None
    out_path = out_path or os.path.splitext(img_path)[0] + "_cut.png"
    if not _vision():
        if not vision_onnx.has(vision_onnx.CUT):
            return None
        if os.path.isfile(out_path) and os.path.getmtime(out_path) >= os.path.getmtime(img_path):
            return out_path
        try:
            return vision_onnx.cutout(img_path, out_path)
        except Exception:
            return None
    import Vision
    import Quartz
    from Foundation import NSURL
    if os.path.isfile(out_path) and os.path.getmtime(out_path) >= os.path.getmtime(img_path):
        return out_path
    req = Vision.VNGenerateForegroundInstanceMaskRequest.alloc().init()
    h = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(img_path), None)
    ok, _err = h.performRequests_error_([req], None)
    res = req.results() if ok else None
    if not res:
        return None
    obs = res[0]
    buf, _e = obs.generateMaskedImageOfInstances_fromRequestHandler_croppedToInstancesExtent_error_(
        obs.allInstances(), h, True, None)
    if buf is None:
        return None
    ci = Quartz.CIImage.imageWithCVPixelBuffer_(buf)
    ctx = Quartz.CIContext.contextWithOptions_(None)
    cs = Quartz.CGColorSpaceCreateWithName(Quartz.kCGColorSpaceSRGB)
    ok2, _e2 = ctx.writePNGRepresentationOfImage_toURL_format_colorSpace_options_error_(
        ci, NSURL.fileURLWithPath_(out_path), Quartz.kCIFormatRGBA8, cs, {}, None)
    return out_path if ok2 and os.path.isfile(out_path) else None


MATTE_MAX_SEC = 20.0


def _src_fps(path):
    """So khung/giay DANH NGHIA cua luong hinh (r_frame_rate), None neu khong doc duoc."""
    try:
        r = subprocess.run([remotion_plan._ffbin("ffprobe"), "-v", "error", "-select_streams", "v:0",
                            "-show_entries", "stream=r_frame_rate,avg_frame_rate", "-of", "json", path],
                           capture_output=True, text=True, timeout=30)
        st = (json.loads(r.stdout or "{}").get("streams") or [{}])[0]
        for k in ("r_frame_rate", "avg_frame_rate"):
            num, _, den = (st.get(k) or "").partition("/")
            v = float(num) / float(den or 1)
            if 1 <= v <= 240:
                return v
    except (ValueError, ZeroDivisionError, OSError, subprocess.TimeoutExpired):
        pass
    return None


def matte_grid_start(a, src_fps):
    """Moc bat dau lop tach nguoi = KHUNG cua nguon tai / ngay truoc giay `a`.

    ffmpeg `-ss a` lay khung dau tien TU `a` tro di; `a` giua 2 khung (vd 85.61s = khung 2568.3)
    -> lop tach nguoi bat dau o khung 2569 nhung spec ghi 85.61 -> CHAM 1 khung so voi video nen
    trong render Remotion (do that: 3.5% diem lech trong vung nguoi; bat dau dung khung: 0%)."""
    f = float(src_fps or 30)
    return max(0.0, math.floor(float(a) * f + 1e-6) / f)


def _buf_np(buf):
    """CVPixelBuffer 1 kenh 8-bit -> mang numpy (h, w) uint8."""
    import numpy as np
    import Quartz
    Quartz.CVPixelBufferLockBaseAddress(buf, 1)
    try:
        w, h = Quartz.CVPixelBufferGetWidth(buf), Quartz.CVPixelBufferGetHeight(buf)
        bpr = Quartz.CVPixelBufferGetBytesPerRow(buf)
        base = Quartz.CVPixelBufferGetBaseAddress(buf)
        raw = base.as_buffer(bpr * h) if hasattr(base, "as_buffer") else bytes(base[:bpr * h])
        return np.frombuffer(bytes(raw), dtype=np.uint8).reshape(h, bpr)[:, :w].copy()
    finally:
        Quartz.CVPixelBufferUnlockBaseAddress(buf, 1)


def _frame_masks_fg(frames, ctx, gray):
    """Mat na NGUOI tung khung DOC LAP bang 'tach chu the' (VNGenerateForegroundInstanceMaskRequest, vien sac
    nhu Anh cua Photos), chi giu vat the TRUNG vung nguoi (VNGeneratePersonSegmentation) -> khong lay nham quat /
    ghe. Ghi m_*.png. Truoc day dung VNSequenceRequestHandler (lam muot theo thoi gian): khi gio tay mat na keo
    theo mang nen canh dau (do that IMG_3839 21.4s: thua ~1.6% khung). Tra False neu khong dung duoc."""
    import numpy as np
    import Vision
    import Quartz
    from Foundation import NSURL, NSMutableIndexSet
    if not hasattr(Vision, "VNGenerateForegroundInstanceMaskRequest"):
        return False
    for fp in frames:
        h = Vision.VNImageRequestHandler.alloc().initWithURL_options_(NSURL.fileURLWithPath_(fp), None)
        rf = Vision.VNGenerateForegroundInstanceMaskRequest.alloc().init()
        rp = Vision.VNGeneratePersonSegmentationRequest.alloc().initWithCompletionHandler_(None)
        rp.setQualityLevel_(1)                               # balanced: chi de loc vat the
        rp.setOutputPixelFormat_(1278226488)
        ok, _e = h.performRequests_error_([rf, rp], None)
        mp = _mask_name(fp)
        obs = (rf.results() or [None])[0] if ok else None
        buf = None
        if obs is not None:
            lab = _buf_np(obs.instanceMask())
            pres = rp.results()
            keep = NSMutableIndexSet.alloc().init()
            if pres:
                pm = _buf_np(pres[0].pixelBuffer())
                # dua mat na nguoi ve cung luoi voi nhan vat the
                yy = (np.arange(lab.shape[0]) * pm.shape[0] // lab.shape[0])[:, None]
                xx = (np.arange(lab.shape[1]) * pm.shape[1] // lab.shape[1])[None, :]
                pr = pm[yy, xx] > 96
                for i in list(obs.allInstances()):
                    sel = lab == int(i)
                    if sel.any() and pr[sel].mean() >= 0.4:
                        keep.addIndex_(int(i))
            else:
                for i in list(obs.allInstances()):
                    keep.addIndex_(int(i))
            if keep.count():
                buf, _e2 = obs.generateScaledMaskForImageForInstances_fromRequestHandler_error_(keep, h, None)
        if buf is None:
            pres = rp.results() if ok else None
            if not pres:
                return False
            buf = pres[0].pixelBuffer()                       # khong co vat the nao la nguoi -> mat na nguoi
        ci = Quartz.CIImage.imageWithCVPixelBuffer_(buf)
        ok2, _e3 = ctx.writePNGRepresentationOfImage_toURL_format_colorSpace_options_error_(
            ci, NSURL.fileURLWithPath_(mp), Quartz.kCIFormatL8, gray, {}, None)
        if not ok2:
            return False
    return True


def _median3(masks):
    """Trung vi 3 khung lien nhau (t-1, t, t+1) cho tung diem anh: bo nhap nhay 1 khung ma KHONG tre khi nguoi
    chuyen dong deu (diem la nguoi khi co mat >= 2 / 3 khung). Ghi de len cac file mat na."""
    import numpy as np
    from PIL import Image
    n = len(masks)
    if n < 3:
        return

    def load(p):
        return np.array(Image.open(p).convert("L"))
    prev, cur = None, load(masks[0])
    for k in range(n):
        nxt = load(masks[k + 1]) if k + 1 < n else None        # doc ban GOC truoc khi ghi de
        a = prev if prev is not None else cur
        c = nxt if nxt is not None else cur
        out = np.median(np.stack([a, cur, c]), axis=0).astype(np.uint8) if a.shape == cur.shape == c.shape else cur
        Image.fromarray(out).save(masks[k])
        prev, cur = cur, nxt


def subject_matte(video_path, a, b, fps=30):
    """Video WebM (VP9 + kenh alpha) CHI GIU NGUOI trong doan [a, b] giay NGUON, cung kich thuoc
    khung nguon. Bo dung dat no DE LEN lop chu -> chu nam SAU nguoi (vd chu to sau dau).
    Tra {"path", "srcStart", "srcEnd"} hoac None. Co bo nho dem theo file + doan."""
    if not video_path or not os.path.isfile(video_path) or not available():
        return None
    import media_sdr
    # Video HDR -> tach tu ban SDR: nguoi trong lop tach cung mau voi video nen (truoc day tach tu
    # khung HDR khong chuyen -> nguoi bac mau, sang hon ~27 muc so voi nen).
    video_path = media_sdr.working_path(video_path)
    a = max(0.0, float(a))
    b = float(b)
    if b - a < 0.2 or b - a > MATTE_MAX_SEC:
        return None
    info = remotion_plan.probe(video_path)
    src_fps = _src_fps(video_path) or fps
    a = matte_grid_start(a, src_fps)
    os.makedirs(CACHE_DIR, exist_ok=True)
    # khoa rieng cho ban ONNX (khong lan voi ban Vision khi ep STUDIO_VISION=onnx tren macOS)
    k = _key(video_path, "matte|%.4f|%.2f|%d|v3%s" % (a, b, fps, "" if _vision() else "|onnx-rvm"))[:24]
    out = os.path.join(CACHE_DIR, "matte_%s.webm" % k)
    res = {"path": out, "srcStart": round(a, 4), "srcEnd": round(b, 3)}
    if os.path.isfile(out) and os.path.getsize(out) > 1000:
        return res
    import glob
    import shutil
    ff = remotion_plan._ffbin("ffmpeg")
    w = int(info.get("width") or 1080)
    h = int(info.get("height") or 1920)
    if w > 1080:  # giu ti le, can chan cho VP9
        h, w = int(round(h * 1080 / w / 2) * 2), 1080
    work = tempfile.mkdtemp(prefix="matte-")
    try:
        # -ss hoi som 1/5 khung: ffmpeg lay khung DAU TIEN tu moc do -> dung khung tai `a`
        r = subprocess.run([ff, "-v", "error", "-ss", "%.4f" % max(0.0, a - 0.2 / src_fps),
                            "-t", "%.3f" % (b - a), "-i", video_path,
                            "-vf", "fps=%d,scale=%d:%d" % (fps, w, h), "-q:v", "2",
                            os.path.join(work, "f_%05d.jpg")], capture_output=True, timeout=180)
        frames = sorted(glob.glob(os.path.join(work, "f_*.jpg")))
        if r.returncode != 0 or not frames:
            return None
        if not _vision():
            # Khong co Vision (Windows): RobustVideoMatting tung khung LIEN TIEP (giu trang thai) + trung vi 3 khung
            if not vision_onnx.person_masks(frames):
                return None
            _median3(sorted(glob.glob(os.path.join(work, "m_*.png"))))
            ok_fg = True
        else:
            import Quartz
            ctx = Quartz.CIContext.contextWithOptions_(None)
            gray = Quartz.CGColorSpaceCreateDeviceGray()
            # Tung khung DOC LAP (tach chu the, vien sac) + trung vi 3 khung (bo nhap nhay, khong tre)
            try:
                ok_fg = _frame_masks_fg(frames, ctx, gray)
            except Exception:
                ok_fg = False
            if ok_fg:
                _median3(sorted(glob.glob(os.path.join(work, "m_*.png"))))
        if not ok_fg:
            import Vision
            from Foundation import NSURL
            # may cu (chua co 'tach chu the'): MOT request + VNSequenceRequestHandler nhu truoc
            req = Vision.VNGeneratePersonSegmentationRequest.alloc().initWithCompletionHandler_(None)
            req.setQualityLevel_(0)  # accurate
            req.setOutputPixelFormat_(1278226488)  # kCVPixelFormatType_OneComponent8 ('L008')
            seq = Vision.VNSequenceRequestHandler.alloc().init()
            for fp in frames:
                ok, _e = seq.performRequests_onImageURL_error_([req], NSURL.fileURLWithPath_(fp), None)
                res_ = req.results() if ok else None
                mp = _mask_name(fp)
                if not res_:
                    return None
                ci = Quartz.CIImage.imageWithCVPixelBuffer_(res_[0].pixelBuffer())
                ok2, _e2 = ctx.writePNGRepresentationOfImage_toURL_format_colorSpace_options_error_(
                    ci, NSURL.fileURLWithPath_(mp), Quartz.kCIFormatL8, gray, {}, None)
                if not ok2:
                    return None
        tmp = out + ".part.webm"
        r = subprocess.run([ff, "-v", "error", "-y", "-framerate", str(fps), "-i", os.path.join(work, "f_%05d.jpg"),
                            "-framerate", str(fps), "-i", os.path.join(work, "m_%05d.png"),
                            "-filter_complex",
                            "[1:v]scale=%d:%d:flags=bicubic,format=gray,gblur=sigma=1.2[m];"
                            "[0:v]format=rgb24[v];[v][m]alphamerge,format=yuva420p" % (w, h),
                            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "22",
                            "-auto-alt-ref", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "5",
                            "-an", tmp], capture_output=True, timeout=600)
        if r.returncode != 0 or not os.path.isfile(tmp):
            return None
        os.replace(tmp, out)
        return res
    except Exception:
        return None
    finally:
        shutil.rmtree(work, ignore_errors=True)


_mask_cache = {}


def matte_mask(matte_path, t, down=4):
    """Mat na NGUOI (mang bool, thu nho `down` lan) trong file tach nen tai giay t — de do chu 'sau
    nguoi' bi che bao nhieu. None neu khong doc duoc."""
    if not matte_path or not os.path.isfile(matte_path):
        return None
    key = (matte_path, round(max(0.0, t), 2), down)
    if key in _mask_cache:
        return _mask_cache[key]
    try:
        import numpy as np
        info = remotion_plan.probe(matte_path)
        w, h = int(info.get("width") or 0) // down, int(info.get("height") or 0) // down
        if w < 4 or h < 4:
            return None
        r = subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-c:v", "libvpx-vp9", "-ss", "%.3f" % max(0.0, t),
                            "-i", matte_path, "-frames:v", "1", "-vf", "alphaextract,scale=%d:%d" % (w, h),
                            "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, timeout=60)
        a = np.frombuffer(r.stdout, dtype=np.uint8)
        m = a.reshape(h, w) > 128 if a.size == w * h else None
    except Exception:
        m = None
    _mask_cache[key] = m
    return m


def matte_head(matte_path, t):
    """Dau nguoi trong file tach nen tai giay t: {"top": dinh dau, "cx": tam ngang dau} (0..1).
    Dinh dau = hang tren cung ma phan nguoi chiem >= 3% be ngang. None neu khong co nguoi."""
    if not matte_path or not os.path.isfile(matte_path):
        return None
    try:
        import numpy as np
        info = remotion_plan.probe(matte_path)
        w, h = int(info.get("width") or 0), int(info.get("height") or 0)
        if not w or not h:
            return None
        r = subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-c:v", "libvpx-vp9", "-ss", "%.3f" % max(0.0, t),
                            "-i", matte_path, "-frames:v", "1", "-vf", "alphaextract", "-f", "rawvideo",
                            "-pix_fmt", "gray", "-"], capture_output=True, timeout=60)
        a = np.frombuffer(r.stdout, dtype=np.uint8)
        if a.size != w * h:
            return None
        m = a.reshape(h, w) > 128
        rows = (m.sum(axis=1) >= w * 0.03).nonzero()[0]
        if not rows.size:
            return None
        top = int(rows[0])
        band = m[top:top + max(2, int(h * 0.1))]
        cols = band.nonzero()[1]
        cx = float(cols.mean()) / w if cols.size else 0.5
        row = m[min(h - 1, top + int(h * 0.07))].nonzero()[0]   # be ngang dau (ngang tran)
        hw = float(row[-1] - row[0]) / w if row.size else 0.3
        return {"top": round(top / float(h), 4), "cx": round(cx, 4), "w": round(hw, 4)}
    except Exception:
        return None
