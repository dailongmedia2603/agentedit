# -*- coding: utf-8 -*-
"""LUAT HOOK (user 2026-09-27): hook (3-5s dau video) BAT BUOC co hieu ung HINH + AM THANH du gay chu y,
ap dung MOI video. KHONG ep loai hieu ung nao — AI tu chon theo noi dung.
DO MANH theo TONE + TINH CHAT video (user: "ke chuyen nhe nhang thi hieu ung phu hop"): 3 muc nhe / vua / manh
— muc nao cung phai NHIN THAY RO ngay tu dau; muc nhe thi em (khong giat / loe / rung).

4 lop:
1. LUAT trong prompt: code tu NOI VAO prompt B3 / R4 / FX-plan / B7 (user sua prompt cung khong mat luat).
   B3 ghi hook.attention.muc_do (+ ly do) theo tone; khong co -> code doan theo tone / yeu cau edit.
2. DO tren spec cuoi (thu nguoi xem thay / nghe that): tung hieu ung -> diem do manh (chuyen dong khung: bien
   do + toc do; lop hinh tu viet: ve khung ra anh (NSImage) do do phu + do dong; hieu ung kho: loai + cuong do),
   thoi diem CHAM, co gat khong. So voi nguong cua muc + hieu ung manh nhat than video (hook phai noi bat).
3. THIEU / YEU / MUON / GAT -> nho AI thiet ke lai DUNG phan do (kem so do + muc do); AI tu chon loai.
4. AI van khong dat -> du phong theo muc (ghi ro vao nhat ky).
"""
import json
import math
import os

import providers

HOOK_RULE_VERSION = 3
NO_HOOK_SEC = 3.5            # video khong co ban sao hook: "hook" = 3.5s dau video

# Nguong theo muc. Diem 1 NHIP (~1.0 = ro, dut khoat tren dien thoai — vd khung dap vao 15% trong 0.2s).
# min: nhip TOAN KHUNG manh nhat; hit: nhip toan khung dau tien phai cham truoc; beats: so nhip thay doi toi thieu;
# gap: hinh khong duoc DUNG IM lau hon (giay); max: tran cho tone nhe.
LEVELS = {
    "nhe": {"ten": "nhẹ", "min": 0.45, "hit": 0.8, "max": 1.5, "snd_hit": 1.5, "beats": 1, "gap": None},
    "vua": {"ten": "vừa", "min": 0.8, "hit": 0.5, "max": None, "snd_hit": 1.0, "beats": 2, "gap": 2.0},
    "manh": {"ten": "mạnh", "min": 1.1, "hit": 0.5, "max": None, "snd_hit": 1.0, "beats": 3, "gap": 1.5},
}
ORDER = ("nhe", "vua", "manh")
BEAT_MIN = 0.35              # thay doi nho hon -> khong tinh la 1 nhip
FULL_REACH = 0.35            # lop hinh phu >= 35% khung moi tinh la hieu ung TOAN KHUNG
SND_MIN_VOL = 0.3            # SFX hook bi guard ha xuong duoi muc nay -> coi nhu khong nghe ro
SND_MIN_REL = -8.0           # SFX da can theo giong noi (spec audio "rel", dB so voi giong): >= -8 dB la nghe ro
                             # (2026-10-01: video thu am nho -> volume SFX dung la rat nho, khong dung SND_MIN_VOL)
# hieu ung trong kho Remotion (deu la hieu ung TOAN KHUNG): do manh o cuong do 1.0 (bang tra, khong phai ep loai)
CATALOG_STRENGTH = {"zoom_punch": 1.2, "shake": 1.4, "flash": 1.5, "rgb_split": 1.2, "fisheye": 1.3,
                    "zoom_out_reveal": 1.0, "focus": 0.8, "blur_focus": 0.9, "light_leak": 0.8, "letterbox": 0.6,
                    "pulse": 0.7, "bw": 0.8, "ken_burns": 0.3, "vignette": 0.3, "film_grain": 0.2,
                    "pan_left": 0.3, "pan_right": 0.3}
CATALOG_SUSTAIN = {"shake", "pulse", "ken_burns", "vignette", "film_grain", "pan_left", "pan_right", "letterbox", "bw",
                   "light_leak"}
HARSH_TYPES = {"shake", "flash", "rgb_split", "fisheye"}

LUAT_HOOK = """

# ⛔ LUAT HOOK — BAT BUOC MOI VIDEO (luat cua app, luon ap dung)
Hook = 3-5s dau video (ban sao doan hook o DAU video; khong co hook = ~3.5s dau): nguoi xem quyet dinh o lai hay
luot trong chinh khoang nay. BAT BUOC:
1. It nhat MOT hieu ung TOAN KHUNG (tac dong CA khung hinh: vd rung khung, dap / keo camera, hieu ung tap trung
   (toi / nhoe vien keo mat vao chu the), loe / quet sang, chuyen mau ca khung...) — icon, huy hieu, chu nho KHONG
   tinh. La diem NOI BAT NHAT video, CHAM vao mat NGAY dau (<= 0.5s; muc "nhe" <= 0.8s), nhin thay RO tren dien thoai.
2. NHIP: hook KHONG duoc DUNG IM. Muc "vua": >= 2 nhip thay doi ro (hieu ung / chu bat / hinh vao / cut), khong dung
   im qua 2s; muc "manh": >= 3 nhip, khong dung im qua 1.5s (vd dap o tu nhan 1, rung / loe o tu nhan 2, doi nhip o
   cau chot); muc "nhe": chuyen dong muot lien tuc duoc. Mot hieu ung co the chua nhieu nhip.
3. AM THANH (SFX) du thu hut, vao trong ~1s dau (muc "nhe" ~1.5s), trung nhip hinh / loi noi.
4. MUC DO theo TONE + TINH CHAT video — YEU CAU CUA NGUOI DUNG (edit_request: phong cach, muc dich) UU TIEN NHAT:
   - "nhe": ke chuyen nhe nhang, tam su, cam dong, chua lanh, sang trong, thu gian -> RO RANG nhung EM: tap trung /
     lay net / vet sang / chuyen dong muot — KHONG rung, loe gat, glitch, dap camera manh.
   - "vua": chia se kien thuc, huong dan, review, gioi thieu -> DUT KHOAT, ro net, nhanh gon.
   - "manh": nguoi dung ghi vui / bat trend / nhanh / hai / drama / soc / nang luong cao -> manh tay, nhip gat,
     chong lop.
   Muc do la TINH CHAT, KHONG phai ly do de lam nhe: muc nao cung phai nhin thay / nghe thay RO ngay tu dau.
KHONG co loai hieu ung mac dinh / bat buoc: tu chon loai hop noi dung + cam xuc cau hook + muc do tren. Phai giai
thich duoc vi sao hop — khong trang tri cho co. He thong DO tren ban dung: nhip toan khung manh nhat, thoi diem cham,
so nhip, khoang dung im, do gat; khong dat -> bi yeu cau lam lai."""

_BUOC = {
    "B3": "\nO BUOC NAY: chon doan hook CO khoanh khac du luc de dat hieu ung hinh + am thanh (nhan giong, con so, "
          "cu soc, cau hoi...). Ghi vao hook.attention = {\"muc_do\": \"nhe|vua|manh\", \"ly_do_muc_do\": \"<theo yeu cau "
          "edit cua nguoi dung + tone / tinh chat video + cam xuc cau hook>\", \"visual\": \"<y tuong hieu ung TOAN KHUNG "
          "+ cac nhip + vi sao hop>\", \"sound\": \"<y tuong am thanh + vi sao hop>\", \"at\": <gio NGUON cua khoanh "
          "khac dat hieu ung>} — la GOI Y cho cac buoc sau (khong phai ten hieu ung trong kho). Nguoi dung ghi phong "
          "cach vui / bat trend / nhanh -> muc_do \"manh\"; nhe nhang / cam xuc -> \"nhe\".",
    "R4": "\nO BUOC NAY: \"effects\" PHAI co hieu ung TOAN KHUNG \"anchor\": \"hook\" (src_start sat dau hook) dat muc do "
          "+ so nhip cua hook (hook.y_tuong_gay_chu_y.muc_do neu co; khong co thi theo yeu cau edit / tone) — tu chon "
          "loai hop nhat voi cau hook.",
    "FX": "\nO BUOC NAY: PHAI co hieu ung TOAN KHUNG o khoanh khac \"la_hook\" voi \"anchor\": \"hook\" (hieu ung cua ban "
          "sao o dau video), cham sat dau hook, du so nhip cua muc do (hook.y_tuong_gay_chu_y.muc_do neu co; khong co "
          "thi theo yeu cau edit / tone) — khong duoc dua hook vao \"bo_qua\". Icon / huy hieu nho chi la lop phu them, "
          "khong thay duoc hieu ung toan khung. Video khong co hook thi dat o khoanh khac dau tien. Hieu ung hook phai "
          "la hieu ung noi bat nhat trong cac hieu ung ban de xuat.",
    "B7": "\nO BUOC NAY: PHAI co it nhat 1 SFX cho hook: \"anchor\": \"hook\", source_id = hook.source_id, src_time sat "
          "hook.src_start (vao trong ~1s dau; muc nhe ~1.5s) — trung nhip hieu ung hinh cua hook (xem "
          "da_co_tren_timeline.hieu_ung_hook); muc manh nen co tieng o ca cac nhip sau. Chon tieng theo noi dung + cam "
          "xuc cau hook + muc do (nhe: em, muot; manh: dam, gat), doc use_when, khong mac dinh mot tieng nao. Video "
          "khong co hook -> SFX nay dat trong ~1s dau video.",
}


def luat(buoc):
    """Doan luat hook noi vao system prompt cua buoc `buoc` (B3 | R4 | FX | B7)."""
    return LUAT_HOOK + _BUOC.get(buoc, "")


# ---------------------------------------------------------------------------
# MUC DO theo YEU CAU EDIT > B3 > tone
# ---------------------------------------------------------------------------
_NHE = ("nhẹ nhàng", "tâm sự", "sâu lắng", "cảm động", "xúc động", "chữa lành", "thư giãn", "sang trọng", "ấm áp",
        "bình yên", "tĩnh", "chậm rãi", "buồn", "hoài niệm", "trầm", "thủ thỉ", "healing", "chill")
_MANH = ("vui", "hài", "bắt trend", "trend", "sốc", "drama", "kịch tính", "năng lượng", "hào hứng", "sôi động",
         "giật gân", "bùng nổ", "cháy", "hype", "nhanh", "gắt", "phấn khích", "troll", "meme")


def _level_of(txt):
    txt = (txt or "").lower()
    n, s = sum(k in txt for k in _NHE), sum(k in txt for k in _MANH)
    return "manh" if s > n else ("nhe" if n > s else None)


def muc_do(plan, story=None):
    """(muc, ly_do). Uu tien: YEU CAU EDIT cua nguoi dung (phong cach / muc dich: "vui, bat trend, nhanh" -> manh;
    "nhe nhang" -> nhe) > B3 ghi hook.attention.muc_do > doan theo tone + phong cach. (Do that 2026-09-28: user ghi
    "nhanh, vui, bat trends" ma B3 chon "vua" -> hook qua hien.)"""
    st = story or {}
    req = st.get("edit_request") if isinstance(st.get("edit_request"), dict) else {}
    rtxt = " ".join(str(req.get(k) or "") for k in ("style", "purpose", "phong_cach", "muc_dich"))
    lv = _level_of(rtxt)
    if lv:
        return lv, "theo yêu cầu edit: %s" % rtxt.strip()[:140]
    hk = plan.get("hook") if isinstance(plan.get("hook"), dict) else {}
    att = hk.get("attention") if isinstance(hk.get("attention"), dict) else {}
    m = str(att.get("muc_do") or "").strip().lower()
    m = {"nhẹ": "nhe", "vừa": "vua", "mạnh": "manh"}.get(m, m)
    if m in LEVELS:
        return m, "AI chọn theo tone: %s" % str(att.get("ly_do_muc_do") or "")[:160]
    parts = [st.get("tone"), " ".join(str(v) for v in req.values() if isinstance(v, str)),
             (plan.get("style_kit") or {}).get("mood") if isinstance(plan.get("style_kit"), dict) else None]
    txt = " ".join(str(x) for x in parts if x)
    lv = _level_of(txt)
    return (lv, "đoán theo tone: %s" % txt[:160]) if lv else ("vua", "mặc định (tone chưa rõ)")


# ---------------------------------------------------------------------------
# DO: NHIP thay doi (events) cua tung hieu ung — cai nguoi xem THAY, khong phai trang thai dang giu
# ---------------------------------------------------------------------------
def _group(flags, vals, fps, t0, minlen=1, join=3):
    """Khung co thay doi >= BEAT_MIN -> cac nhip [(dau, cuoi, manh_nhat)] (giay tuyet doi)."""
    out, cur = [], None
    for i, (f, v) in enumerate(zip(flags, vals)):
        if f:
            if cur and i - cur[1] <= join:
                cur = [cur[0], i, max(cur[2], v)]
            else:
                if cur:
                    out.append(cur)
                cur = [i, i, v]
    if cur:
        out.append(cur)
    return [(round(t0 + a / fps, 2), round(t0 + (b + 1) / fps, 2), round(min(2.0, m), 2)) for a, b, m in out
            if b - a + 1 >= minlen]


def _transform_events(values, fps, start):
    """Chuyen dong khung (so tung khung) -> ([nhip], harsh, do). Thay doi = so voi 0.2s truoc (truoc hieu ung =
    khung goc); het hieu ung ma khung chua ve goc -> 1 nhip 'bat ve'. Giu zoom KHONG tinh la nhip."""
    vals = {k: v for k, v in (values or {}).items() if isinstance(v, list) and v}
    n = max([len(v) for v in vals.values()] or [0])
    if not n:
        return [], False, {}
    neutral = {"scale": 1.0, "x": 0.0, "y": 0.0, "rotate": 0.0, "blur": 0.0, "brightness": 1.0, "contrast": 1.0,
               "saturate": 1.0, "hueRotate": 0.0}
    ref = {"scale": 0.15, "rotate": 4.0, "blur": 8.0, "brightness": 0.35, "contrast": 0.35, "saturate": 0.7,
           "hueRotate": 40.0}

    def arr(k):
        v = vals.get(k) or []
        return [float(v[min(i, len(v) - 1)]) if v else neutral[k] for i in range(n)] + [neutral[k]]   # + ve goc

    A = {k: arr(k) for k in neutral}
    m = n + 1
    lag = max(1, int(round(0.2 * fps)))

    def before(k, i):
        return A[k][i - lag] if i >= lag else neutral[k]

    def flips(v):
        dv = [0.0] + [v[i] - v[i - 1] for i in range(1, m)]
        return [abs(dv[i]) if i > 1 and dv[i] * dv[i - 1] < 0 and abs(dv[i]) >= 0.5 else 0.0 for i in range(m)]
    jx, jy = flips(A["x"]), flips(A["y"])
    jw = [sum(jx[max(0, i - 4):i + 1] + jy[max(0, i - 4):i + 1]) / min(5, i + 1) for i in range(m)]
    c = []
    for i in range(m):
        comp = [abs(A[k][i] - before(k, i)) / ref[k] for k in ref]
        comp.append(math.hypot(A["x"][i] - before("x", i), A["y"][i] - before("y", i)) / 40.0 * 0.5)
        comp.append(jw[i] / 6.0)
        c.append(max(comp))
    ev = _group([v >= BEAT_MIN for v in c], c, fps, start)
    flash = any(abs(A["brightness"][i] - A["brightness"][max(0, i - 2)]) >= 0.3 for i in range(m))
    do = {"phong_to_%": round(max(abs(v - 1) for v in A["scale"]) * 100, 1), "rung_px_khung": round(max(jw), 1),
          "xoay_do": round(max(abs(v) for v in A["rotate"]), 1), "sang_%": round(max(abs(v - 1) for v in A["brightness"]) * 100, 1)}
    return ev, (max(jw) >= 5.0 or flash), do


def _raster(svg, w=216, h=384):
    """Khung SVG -> mang RGBA 0..1 (NSImage cua macOS; khong co -> resvg (Windows); ca 2 khong co -> None)."""
    try:
        if os.environ.get("STUDIO_VISION") == "onnx":
            raise ImportError("ep resvg")
        import AppKit
        import Foundation
        import numpy as np
        b = svg.encode("utf-8")
        img = AppKit.NSImage.alloc().initWithData_(Foundation.NSData.dataWithBytes_length_(b, len(b)))
        if img is None:
            return None
        rep = AppKit.NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(
            None, w, h, 8, 4, True, False, AppKit.NSDeviceRGBColorSpace, w * 4, 32)
        ctx = AppKit.NSGraphicsContext.graphicsContextWithBitmapImageRep_(rep)
        AppKit.NSGraphicsContext.saveGraphicsState()
        AppKit.NSGraphicsContext.setCurrentContext_(ctx)
        img.drawInRect_(Foundation.NSMakeRect(0, 0, w, h))
        AppKit.NSGraphicsContext.restoreGraphicsState()
        return np.frombuffer(bytes(rep.bitmapData()[: w * h * 4]), dtype=np.uint8).reshape(h, w, 4).astype(np.float32) / 255.0
    except ImportError:
        import vision_onnx
        return vision_onnx.raster_svg(svg, w, h)
    except Exception:
        return None


def _overlay_events(path, start):
    """Lop hinh tu viet (file khung SVG): ve ra anh -> thay doi giua cac khung (hien / chuyen dong / tat) ->
    ([nhip], full, harsh, do). full = phu >= FULL_REACH khung (vd lop toi / nhoe vien, vet sang quet ca khung)."""
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        frames, idx, fps = d["frames"], d["idx"], float(d.get("fps") or 30)
    except (OSError, ValueError, KeyError, TypeError):
        return None
    n = len(idx)
    if not n:
        return None
    import numpy as np
    step = 2 if n <= 180 else max(2, n // 90)
    pick = list(range(0, n, step)) + [n]                      # + 1 mau "da tat" sau khung cuoi
    prev, ok, rows = np.zeros((384, 216), dtype=np.float32), 0, []
    for i in pick:
        fr = frames[idx[i]] if i < n and 0 <= idx[i] < len(frames) else ""
        a = _raster(fr) if fr and "<" in fr else None
        al = a[..., 3] if a is not None else np.zeros((384, 216), dtype=np.float32)
        ok += 1 if a is not None else 0
        dlt = float(np.abs(al - prev).mean())
        rows.append((i, float(al.mean()), float((al > 0.1).mean()), dlt))
        prev = al
    if not ok and any(frames[j] for j in idx if 0 <= j < len(frames)):
        return None
    reach = max(r[2] for r in rows)
    c = [r[3] / 0.02 for r in rows]
    ev = _group([v >= BEAT_MIN for v in c], c, fps / step, start)
    harsh = any(r[3] >= 0.2 for r in rows)
    do = {"do_phu_%": round(max(r[1] for r in rows) * 100, 1), "vung_phu_%": round(reach * 100, 1)}
    return ev, reach >= FULL_REACH, harsh, do


def _catalog_events(e):
    base = CATALOG_STRENGTH.get(e.get("type"), 0.6)
    k = providers._f(e.get("intensity"), 0.7)
    st, en = providers._f(e.get("start")), providers._f(e.get("end"), providers._f(e.get("start")) + 0.4)
    s = round(base * (0.4 + 0.6 * k), 2)
    end = en if e.get("type") in CATALOG_SUSTAIN else min(en, st + 0.4)
    harsh = e.get("type") in HARSH_TYPES or (e.get("type") == "zoom_punch" and k >= 0.85)
    return [(round(st, 2), round(end, 2), s)] if s >= BEAT_MIN else [], harsh, {"loai": e.get("type"), "cuong_do": k}


def _layer_events(spec):
    """Chu / hinh VAO (co hieu ung vao) -> nhip nho, KHONG toan khung."""
    out = []
    for L in spec.get("layers") or []:
        if not isinstance(L, dict) or not L.get("enter") or L.get("type") in ("line", "ring"):
            continue
        st = providers._f(L.get("start"))
        dur = providers._f((L.get("enter") or {}).get("duration"), 0.35)
        n = len(" ".join(sp.get("text") or "" for sp in L.get("spans") or [] if isinstance(sp, dict)).split()) or 1
        stag = providers._f((L.get("enter") or {}).get("stagger"), 0.08)
        out.append({"id": L.get("id"), "kind": "chu_hinh_vao", "full": False, "harsh": False,
                    "t0": round(st, 2), "t1": round(st + dur + stag * (n - 1), 2), "s": 0.5})
    return out


def measure(spec, plan=None):
    """Moi NHIP hinh tren spec: [{id, kind, t0, t1, s, full, harsh, do}] (gio timeline)."""
    fps = float(spec.get("fps") or 30)
    intens = {e.get("id"): providers._f((e.get("params") or {}).get("intensity"), 0.7)
              for e in (plan or {}).get("fx") or [] if isinstance(e, dict)}
    out = []

    def add(e, kind, evs, full, harsh, do):
        for a, b, s in evs:
            out.append({"id": e.get("id") or e.get("type"), "type": e.get("type"), "kind": kind, "t0": a, "t1": b,
                        "s": s, "full": bool(full), "harsh": bool(harsh), "do": do})
    for e in spec.get("effects") or []:
        if isinstance(e, dict):
            ev, harsh, do = _catalog_events(e)
            add(e, "kho", ev, True, harsh, do)
    for e in spec.get("fxTransforms") or []:
        if isinstance(e, dict):
            ev, harsh, do = _transform_events(e.get("values"), fps, providers._f(e.get("start")))
            add(e, "chuyen_dong_khung", ev, True, harsh, do)
    for e in spec.get("fx") or []:
        if not isinstance(e, dict):
            continue
        r = _overlay_events(e.get("file"), providers._f(e.get("start"))) if e.get("file") else None
        if r is None:        # khong ve duoc (thieu NSImage / file) -> uoc 1 nhip luc vao theo cuong do AI khai
            st = providers._f(e.get("start"))
            add(e, "lop_hinh", [(round(st, 2), round(st + 0.4, 2), round(0.5 + 0.5 * intens.get(e.get("id"), 0.7), 2))],
                False, False, {"uoc_theo_cuong_do": True})
        else:
            ev, full, harsh, do = r
            add(e, "lop_hinh", ev, full, harsh, do)
    clips = [c for c in spec.get("clips") or [] if isinstance(c, dict) and c.get("kind") in ("hook", "body")]
    for c0, c1 in zip(clips, clips[1:]):                      # jump-cut / cut = nhip toan khung
        t = providers._f(c1.get("start"))
        out.append({"id": c1.get("id"), "type": "cut", "kind": "cut", "t0": round(t, 2), "t1": round(t + 0.1, 2),
                    "s": 0.6, "full": True, "harsh": False, "do": {}})
    return out + _layer_events(spec)


# ---------------------------------------------------------------------------
# KIEM tren spec
# ---------------------------------------------------------------------------
def window(spec):
    """(0, cuoi) khoang hook tren timeline: het ban sao hook; khong co hook -> NO_HOOK_SEC dau video."""
    hk = [float(c.get("end") or 0) for c in spec.get("clips") or [] if isinstance(c, dict) and c.get("kind") == "hook"]
    if hk:
        return 0.0, max(hk)
    return 0.0, min(NO_HOOK_SEC, float(spec.get("duration") or NO_HOOK_SEC))


def _beats(evs, merge=0.35):
    ts = sorted(e["t0"] for e in evs)
    out = []
    for t in ts:
        if not out or t - out[-1] > merge:
            out.append(t)
    return out


def _longest_gap(evs, a, b):
    """Khoang dai nhat trong [a, b] khong co nhip nao (hinh dung im) -> (do_dai, tu, den)."""
    iv = sorted((max(a, e["t0"] - 0.1), min(b, e["t1"] + 0.1)) for e in evs if e["t1"] > a and e["t0"] < b)
    best, cur = (0.0, a, a), a
    for x0, x1 in iv:
        if x0 > cur and x0 - cur > best[0]:
            best = (round(x0 - cur, 2), round(cur, 2), round(x0, 2))
        cur = max(cur, x1)
    if b - cur > best[0]:
        best = (round(b - cur, 2), round(cur, 2), round(b, 2))
    return best


def check(spec, level=None, plan=None):
    """{"visual": [..], "sound": [..], "thieu": [...], "yeu": {"visual": [ly do], "sound": [ly do]}, "do": {...},
    "window": (0, cuoi)}. level=None -> chi kiem CO / KHONG (khong do do manh)."""
    empty = {"visual": [], "sound": [], "thieu": [], "yeu": {"visual": [], "sound": []}, "do": {}, "window": (0.0, 0.0)}
    if not isinstance(spec, dict) or not spec.get("clips"):
        return empty
    a, b = window(spec)
    end = b - 0.1

    def in_hook(st, en):
        return st < end and en > a

    # tieng code tu gan cho chu (textAuto) khong tinh: hook can tieng GAY CHU Y chon theo cam xuc, khong phai 'pop' chung
    snd_all = [x for x in spec.get("audio") or [] if isinstance(x, dict) and (x.get("role") or "sfx") == "sfx"
               and x.get("start") is not None and not x.get("textAuto")]
    snd = [x for x in snd_all if float(x["start"]) < end]
    vis = ([("effect", e.get("type")) for e in spec.get("effects") or [] if isinstance(e, dict)
            and in_hook(providers._f(e.get("start")), providers._f(e.get("end"), providers._f(e.get("start"))))]
           + [("fx", e.get("id")) for e in spec.get("fx") or [] if isinstance(e, dict)
              and in_hook(providers._f(e.get("start")), providers._f(e.get("end")))]
           + [("fx_transform", e.get("id")) for e in spec.get("fxTransforms") or [] if isinstance(e, dict)
              and in_hook(providers._f(e.get("start")), providers._f(e.get("end")))])
    thieu = [k for k, v in (("visual", vis), ("sound", snd)) if not v]
    if level is None:
        return dict(empty, visual=vis, sound=[x.get("name") or x.get("id") for x in snd], thieu=thieu, window=(a, b))

    L = LEVELS.get(level) or LEVELS["vua"]
    ms = measure(spec, plan)
    ev_hook = [m for m in ms if in_hook(m["t0"], m["t1"])]
    ff = [m for m in ev_hook if m["full"] and m["kind"] != "cut"]
    body_ff = [m["s"] for m in ms if m["full"] and m["kind"] != "cut" and not in_hook(m["t0"], m["t1"])]
    yeu_v, yeu_s = [], []
    best = max(ff, key=lambda m: m["s"], default=None)
    combined = 0.0
    if best:
        others = [m for m in ff if m is not best and m["t0"] < best["t1"] + 0.2 and m["t1"] > best["t0"] - 0.2]
        combined = round(best["s"] + 0.35 * max([m["s"] for m in others] or [0.0]), 2)
    body_max = max(body_ff or [0.0])
    need = round(max(L["min"], min(0.75 * body_max, 1.5 * L["min"])), 2)
    early = min([m["t0"] for m in ff if m["s"] >= 0.6 * L["min"]] or [None], key=lambda v: 99 if v is None else v)
    beats = _beats([m for m in ev_hook if m["s"] >= BEAT_MIN])
    gap = _longest_gap([m for m in ev_hook if m["s"] >= BEAT_MIN], a, max(a, end - 0.1))
    if vis or ev_hook:
        if not ff:
            yeu_v.append("chưa có hiệu ứng TOÀN KHUNG (icon / huy hiệu / chữ nhỏ không tính)")
        elif combined < need:
            yeu_v.append("nhịp toàn khung mạnh nhất %.2f (mức %s cần >= %.2f%s)" % (
                combined, L["ten"], need, "; phải nổi bật hơn hiệu ứng toàn khung mạnh nhất thân video %.2f" % body_max
                if need > L["min"] else ""))
        if ff and (early is None or early > L["hit"]):
            yeu_v.append("hiệu ứng toàn khung đủ rõ đầu tiên chạm lúc %s (cần <= %.1fs)" % (
                "không có" if early is None else "%.2fs" % early, L["hit"]))
        if len(beats) < L["beats"]:
            yeu_v.append("chỉ có %d nhịp thay đổi (mức %s cần >= %d)" % (len(beats), L["ten"], L["beats"]))
        if L["gap"] and gap[0] > L["gap"]:
            yeu_v.append("hình đứng im %.1fs (%.1fs-%.1fs; mức %s tối đa %.1fs)" % (gap[0], gap[1], gap[2], L["ten"], L["gap"]))
        if level == "nhe":
            harsh = sorted({str(m["id"]) for m in ev_hook if m["harsh"]})
            if harsh or (L["max"] and combined > L["max"]):
                yeu_v.append("quá gắt với tone nhẹ nhàng (%s)" % (", ".join(harsh) or "quá mạnh %.2f" % combined))
    snd_early = [x for x in snd if float(x["start"]) <= L["snd_hit"] and _audible(x)]
    if snd and not snd_early:
        first = min(snd, key=lambda x: float(x["start"]))
        yeu_s.append("SFX hook đầu tiên vào lúc %.2fs / âm lượng %.2f%s (cần vào <= %.1fs, không bị hạ quá nhỏ)" % (
            float(first["start"]), providers._f(first.get("volume"), 1.0),
            "" if first.get("rel") is None else " = %+.1f dB so với giọng" % float(first["rel"]), L["snd_hit"]))
    return {"visual": vis, "sound": [x.get("name") or x.get("id") for x in snd], "thieu": thieu,
            "yeu": {"visual": yeu_v, "sound": yeu_s}, "window": (a, b),
            "do": {"muc": level, "manh_nhat": combined, "can": need, "cham": early, "so_nhip": len(beats),
                   "nhip_luc": beats, "dung_im_lau_nhat": gap[0], "than_video_max": body_max,
                   "hieu_ung_hook": [{k: m.get(k) for k in ("id", "kind", "type", "t0", "t1", "s", "full", "harsh")}
                                     for m in ev_hook]}}


def _audible(x):
    """SFX nghe ro so voi giong noi cua video: co "rel" (dB so voi giong, mix_sfx do) -> >= SND_MIN_REL; khong thi
    theo volume nhu cu."""
    if x.get("rel") is not None:
        return providers._f(x.get("rel"), -99.0) >= SND_MIN_REL
    return providers._f(x.get("volume"), 1.0) >= SND_MIN_VOL


def _problems(res):
    return {k for k in ("visual", "sound") if k in res["thieu"] or res["yeu"][k]}


# ---------------------------------------------------------------------------
# Khoanh khac hook (cho AI bo sung)
# ---------------------------------------------------------------------------
def hook_moment(plan, transcript_data=None):
    """Mo ta khoanh khac hook: {source_id, src_start, src_end, anchor|None, loi_noi, caption, ...}."""
    hk = plan.get("hook") if isinstance(plan.get("hook"), dict) else None
    if hk and hk.get("src_start") is not None:
        sid = hk.get("source_id") or ((plan.get("source_videos") or [{}])[0].get("id"))
        a, b = providers._f(hk.get("src_start")), providers._f(hk.get("src_end"), providers._f(hk.get("src_start")) + 4)
        m = {"source_id": sid, "src_start": round(a, 2), "src_end": round(b, 2), "anchor": "hook",
             "caption": hk.get("caption"), "ly_do_chon": hk.get("reason"),
             "y_tuong_gay_chu_y": hk.get("attention") if isinstance(hk.get("attention"), dict) else None}
    else:
        segs = sorted([s for s in plan.get("segments") or [] if isinstance(s, dict) and s.get("kind") != "insert"],
                      key=lambda s: providers._f(s.get("target_start")))
        if not segs:
            return None
        s0 = segs[0]
        a = providers._f(s0.get("start"))
        b = min(providers._f(s0.get("end")), a + NO_HOOK_SEC)
        m = {"source_id": s0.get("source_id"), "src_start": round(a, 2), "src_end": round(b, 2), "anchor": None,
             "ghi_chu": "video khong co ban sao hook: 'hook' la ~3.5s dau video"}
    m["loi_noi"] = providers._gon_loi_thoai((transcript_data or {}).get(m["source_id"]), m["src_start"], m["src_end"])
    return m


# ---------------------------------------------------------------------------
# AI bo sung / lam lai SFX
# ---------------------------------------------------------------------------
_HOOK_FIX_SFX_PROMPT = """Ban la SOUND DESIGNER short-form. Am thanh cua HOOK (3-5s dau video) CHUA DAT luat cua app: hook
BAT BUOC co it nhat MOT SFX du thu hut, gay chu y, vao trong ~1s dau (muc "nhe" ~1.5s). Ly do chua dat: van_de.
Chon 1 (toi da 2) SFX tu sfx_catalog cho hook.

- Doc hook: loi_noi (gio nguon), caption, ly_do_chon, y_tuong_gay_chu_y (neu co), hieu_ung_hinh (hieu ung hinh dang
  co trong hook), cau_chuyen (tone) va muc_do:
  "nhe" (ke chuyen nhe nhang, tam su...) -> tieng EM, muot (vd whoosh mem, riser nhe, chuong, lap lanh) — khong tieng
  dam gat / meme; "vua" -> ro, dut khoat; "manh" -> dam, gat, bat tai.
- Chon tieng theo NOI DUNG + CAM XUC cau hook + muc_do: doc summary / use_when / avoid_when. KHONG co tieng mac dinh.
  Tieng co giong nguoi (has_speech) -> khong dung.
- Dat sat dau hook hoac trung nhip hieu ung hinh trong ~1s dau. Muon cu dam roi dung luc X thi src_time = X - peak_time.
- src_time = gio NGUON, nam trong [hook.src_start, hook.src_end]; "anchor" = hook.anchor (giu nguyen).

SCHEMA DAU RA (CHI JSON):
{"audio": [{"sfx_id": "<id trong sfx_catalog>", "source_id": "source_1", "src_time": 12.3, "anchor": "hook",
            "purpose": "punch|reveal|transition|ui|comedy", "why": "<vi sao hop cau hook + muc do>"}]}
⚠️ TRA VE CHI JSON GOC."""


def gpt_hook_sfx(moment, sfx_catalog, story=None, hinh=None, log=None, level=None, van_de=None):
    payload = {"hook": moment, "cau_chuyen": story or {}, "hieu_ung_hinh": hinh or [], "sfx_catalog": sfx_catalog,
               "muc_do": level or "vua", "van_de": van_de or ["hook chua co SFX"]}
    if log:
        log("Hook-check: %s chon SFX cho hook..." % providers.plan_ai_name())
    text = providers.plan_chat([
        {"role": "system", "content": _p("_HOOK_FIX_SFX_PROMPT")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=1500, temperature=0.4, req_timeout=90, max_attempts=2, step_label="Hook-SFX")
    return providers._safe_json(text)


def clean_sfx(res, moment, sfx_catalog):
    """Giu SFX co trong kho + nam trong khoang hook. Tra [muc audio cua plan]."""
    ids = {x.get("id"): x for x in sfx_catalog or [] if isinstance(x, dict)}
    out = []
    for a in (res or {}).get("audio") or []:
        if not isinstance(a, dict) or a.get("sfx_id") not in ids or ids[a["sfx_id"]].get("has_speech"):
            continue
        t = providers._f(a.get("src_time"), moment["src_start"])
        t = min(max(t, moment["src_start"]), moment["src_end"] - 0.1)
        item = {"sfx_id": a["sfx_id"], "source_id": moment["source_id"], "src_time": round(t, 3),
                "purpose": a.get("purpose") if a.get("purpose") in ("punch", "reveal", "transition", "ui", "comedy")
                else "punch", "why": str(a.get("why") or "")[:300], "_hook_rule": "ai"}
        if moment.get("anchor") == "hook":
            item["anchor"] = "hook"
        out.append(item)
        if len(out) >= 2:
            break
    return out


def fallback_sfx(moment, sfx_catalog, level="vua"):
    """Du phong khi AI khong chon duoc: nhe -> tieng em (whoosh / riser / chuong); vua / manh -> tieng dam."""
    soft = level == "nhe"

    def score(x):
        s = 0
        typ = (str(x.get("sound_type") or "") + " " + str(x.get("emotion") or "")).lower()
        inten = str(x.get("intensity") or "")
        if soft:
            if any(k in typ for k in ("whoosh", "swoosh", "riser", "chime", "sparkle", "ding", "ambience")):
                s += 3
            if inten in ("nhe", "vua"):
                s += 1
            if any(k in typ for k in ("impact", "boom", "meme", "punch")):
                s -= 3
        else:
            if any(k in typ for k in ("impact", "punch", "hit", "boom", "whoosh", "riser")):
                s += 3
            if inten in ("manh", "vua"):
                s += 1
            if any(k in str(x.get("use_when") or "").lower() for k in ("mở đầu", "hook", "gây chú ý", "bất ngờ", "sốc")):
                s += 2
        return s
    pool = sorted([x for x in sfx_catalog or [] if isinstance(x, dict) and not x.get("has_speech") and x.get("id")],
                  key=score, reverse=True)
    if pool and score(pool[0]) > 0:
        sid = pool[0]["id"]
    else:
        import sfx_kit
        sid = sfx_kit.family_file("whoosh" if soft else "boom")[0]
    if not sid:
        return []
    item = {"sfx_id": sid, "source_id": moment["source_id"], "src_time": round(moment["src_start"] + 0.02, 3),
            "purpose": "transition" if soft else "punch", "why": "du phong luat hook (AI khong chon duoc SFX)",
            "_hook_rule": "fallback"}
    if moment.get("anchor") == "hook":
        item["anchor"] = "hook"
    return [item]


# ---------------------------------------------------------------------------
# AI bo sung / lam lai hieu ung hinh — kho hieu ung Remotion
# ---------------------------------------------------------------------------
_HOOK_FIX_VISUAL_PROMPT = """Ban la EDITOR short-form. Hieu ung hinh cua HOOK (3-5s dau video) CHUA DAT luat cua app: hook BAT
BUOC co hieu ung hinh gay chu y, NOI BAT NHAT video, cham ngay dau (<= 0.5s; muc "nhe" <= 0.8s) va nhin thay ro.
Ly do chua dat (co so do that): van_de. Chon 1-3 hieu ung TOAN KHUNG tu danh_muc cho hook, dat o cac NHIP khac
nhau (nhip dau sat dau hook, cac nhip sau bam tu nhan / cau chot trong loi_noi) cho du yeu_cau (so nhip, khong dung im).

- Doc hook: loi_noi (gio nguon), caption, ly_do_chon, y_tuong_gay_chu_y (neu co), cau_chuyen (tone, phong cach) va
  muc_do: "nhe" (ke chuyen nhe nhang, tam su...) -> ro rang nhung EM, muot — KHONG rung / loe / glitch / mat ca;
  "vua" -> dut khoat, ro net; "manh" -> manh tay, co the chong 2 hieu ung.
- Chon loai hop NOI DUNG + CAM XUC cau hook + muc_do: doc look / use_when / avoid_when. KHONG co loai mac dinh.
  intensity du lon de NHIN THAY RO o muc do do.
- src_start sat dau hook (hook.src_start); do dai trong khoang "duration" cua hieu ung.
- src_start / src_end = gio NGUON trong [hook.src_start, hook.src_end]; "anchor" = hook.anchor (giu nguyen).

SCHEMA DAU RA (CHI JSON):
{"effects": [{"type": "<id trong danh_muc>", "source_id": "source_1", "src_start": 12.3, "src_end": 13.1,
              "anchor": "hook", "intensity": 0.8, "why": "<vi sao hop cau hook + muc do>"}]}
⚠️ TRA VE CHI JSON GOC."""


def _effect_catalog():
    import remotion_plan as RP
    return [e for e in RP.load_catalog().get("effects") or [] if isinstance(e, dict) and e.get("id")]


def gpt_hook_effect(moment, story=None, log=None, level=None, van_de=None):
    import remotion_plan as RP
    L = LEVELS.get(level or "vua") or LEVELS["vua"]
    payload = {"hook": moment, "cau_chuyen": story or {}, "danh_muc": RP.catalog_for_prompt("effects"),
               "muc_do": level or "vua", "van_de": van_de or ["hook chua co hieu ung hinh"],
               "yeu_cau": {"so_nhip_toi_thieu": L["beats"], "dung_im_toi_da_giay": L["gap"], "nhip_dau_truoc_giay": L["hit"]}}
    if log:
        log("Hook-check: %s chon hieu ung hinh cho hook..." % providers.plan_ai_name())
    text = providers.plan_chat([
        {"role": "system", "content": _p("_HOOK_FIX_VISUAL_PROMPT")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=1500, temperature=0.4, req_timeout=90, max_attempts=2, step_label="Hook-FX")
    return providers._safe_json(text)


def clean_effects(res, moment, level=None):
    cat = {e["id"]: e for e in _effect_catalog()}
    out = []
    for e in (res or {}).get("effects") or []:
        if not isinstance(e, dict) or e.get("type") not in cat:
            continue
        if level == "nhe" and e["type"] in HARSH_TYPES:
            continue                                     # gat voi tone nhe -> khong nhan
        lo, hi = (cat[e["type"]].get("duration") or [0.4, 2.5])[:2]
        a = min(max(providers._f(e.get("src_start"), moment["src_start"]), moment["src_start"]), moment["src_end"] - 0.3)
        b = providers._f(e.get("src_end"), a + lo)
        b = min(max(b, a + float(lo)), a + float(hi), moment["src_end"])
        if b - a < 0.2:
            continue
        k = min(1.0, max(0.3, providers._f(e.get("intensity"), 0.7)))
        if level == "nhe" and e["type"] == "zoom_punch":
            k = min(k, 0.8)
        item = {"type": e["type"], "source_id": moment["source_id"], "src_start": round(a, 3), "src_end": round(b, 3),
                "intensity": round(k, 2), "why": str(e.get("why") or "")[:300], "_hook_rule": "ai"}
        if moment.get("anchor") == "hook":
            item["anchor"] = "hook"
        out.append(item)
        if len(out) >= 3:
            break
    return out


def fallback_effect(moment, level="vua", need=None):
    """Du phong khi AI khong dat, THEO MUC: du nhip toan khung + du nguong (`need`, co tinh hieu ung manh nhat than
    video). nhe -> keo mat vao chu the (focus, em, 1 nhip); vua -> dap camera o dau + giua hook; manh -> dap camera +
    loe sang o dau, rung o 1/3, dap lai o 2/3 hook."""
    h0, h1 = moment["src_start"], moment["src_end"]
    dur_h = max(1.0, h1 - h0)
    L = LEVELS.get(level) or LEVELS["vua"]
    need = need or L["min"]

    def fx(typ, k, at, dur):
        a = h0 + at
        item = {"type": typ, "source_id": moment["source_id"], "src_start": round(a, 3),
                "src_end": round(min(h1, a + dur), 3), "intensity": round(k, 2),
                "why": "du phong luat hook muc %s (AI khong dat)" % level, "_hook_rule": "fallback"}
        if moment.get("anchor") == "hook":
            item["anchor"] = "hook"
        return item
    if level == "nhe":
        return [fx("focus", 0.8, 0.05, 1.2)]
    if level == "manh":
        return [fx("zoom_punch", 1.0, 0.05, 0.6), fx("flash", 0.7, 0.05, 0.3),
                fx("shake", 0.7, dur_h / 3.0, 0.5), fx("zoom_punch", 0.9, dur_h * 2 / 3.0, 0.6)]
    base = CATALOG_STRENGTH["zoom_punch"]
    k = min(1.0, max(0.8, (need / base - 0.4) / 0.6))
    out = [fx("zoom_punch", k, 0.05, 0.6), fx("zoom_punch", 0.8, dur_h * 0.45, 0.6)]
    if base * (0.4 + 0.6 * k) < need:
        out.append(fx("focus", 0.8, 0.05, 1.0))
    return out


def hook_moments_fx(moments, moment):
    """Khoanh khac FX-plan cua hook (la_hook) — hoac khoanh khac dau tien neu video khong co hook."""
    hk = [dict(m) for m in moments or [] if m.get("la_hook")]
    if hk or not moments:
        return hk
    first = dict(sorted(moments, key=lambda m: m.get("timeline_start", 0))[0])
    return [first]


def hook_visuals(plan):
    """Hieu ung hinh da dat cho hook (mo ta gon) — cho B7 / Hook-SFX chon tieng TRUNG nhip hinh."""
    out = []
    for e in plan.get("fx") or []:
        if isinstance(e, dict) and e.get("anchor") == "hook":
            out.append({"loai": "tu_viet", "mo_ta": str(e.get("visual") or "")[:240], "muc_tieu": e.get("goal"),
                        "src_start": e.get("src_start"), "src_end": e.get("src_end"), "anchor": "hook"})
    for e in plan.get("scene_effects") or []:
        if isinstance(e, dict) and e.get("anchor") == "hook":
            out.append({"loai": e.get("type"), "src_start": e.get("src_start"), "src_end": e.get("src_end"),
                        "anchor": "hook"})
    return out


def _harsh_ids(res):
    """id hieu ung tu viet + loai hieu ung kho bi gat trong hook."""
    out = set()
    for m in (res.get("do") or {}).get("hieu_ung_hook") or []:
        if m.get("harsh"):
            out.add(m["id"])
            if m.get("kind") == "kho" and m.get("type"):
                out.add(m["type"])
    return out


def ensure(plan, spec, build, step, sfx_catalog=None, transcript_data=None, story=None, fx_ctx=None,
           emit=None, log=None):
    """Kiem luat hook tren `spec` theo MUC DO cua video; thieu / yeu / muon / gat -> AI lam lai DUNG phan do (qua
    `step` de cache, kem so do), dung lai spec; AI van khong dat -> du phong theo muc. `build(plan)` -> (spec, report).
    fx_ctx: {"moments", "faces", "palette", "style", "sources", "hook"} -> hieu ung hook do AI tu viet code (nhu
    cac hieu ung khac); khong co / khong dat -> hieu ung trong kho Remotion (Hook-FX), roi du phong theo muc.
    Tra (plan, spec, report | None, ghi_chu[])."""
    level, why_level = muc_do(plan, story)
    L = LEVELS[level]
    say = emit or (lambda m, lvl="warn": None)
    res = check(spec, level, plan)
    d = res["do"]
    head = "mức %s (%s)" % (L["ten"], why_level)

    def so_do(dd):
        return "toàn khung mạnh nhất %.2f/%.2f, chạm lúc %s, %d nhịp, đứng im lâu nhất %.1fs" % (
            dd.get("manh_nhat") or 0, dd.get("can") or 0, "%.2fs" % dd["cham"] if dd.get("cham") is not None else "-",
            dd.get("so_nhip") or 0, dd.get("dung_im_lau_nhat") or 0)
    if not _problems(res):
        msg = "hook đạt %s — %s" % (head, so_do(d))
        say("Luật hook: " + msg, "ok")
        return plan, spec, None, [msg]
    notes = ["hook %s — %s" % (head, "; ".join(res["yeu"]["visual"] + res["yeu"]["sound"]
                                                + ["thiếu %s" % k for k in res["thieu"]]))]
    say("Luật hook: %s -> nhờ AI làm lại (AI tự chọn theo nội dung câu hook + mức độ)" % notes[0], "warn")
    moment = hook_moment(plan, transcript_data)
    if moment is None:
        return plan, spec, None, notes + ["khong xac dinh duoc khoanh khac hook"]
    report = None

    def drop_hook(pred):
        plan["fx"] = [e for e in plan.get("fx") or [] if not (isinstance(e, dict) and e.get("anchor") == "hook" and pred(e))]
        plan["scene_effects"] = [e for e in plan.get("scene_effects") or []
                                 if not (isinstance(e, dict) and e.get("anchor") == "hook" and pred(e))]

    def van_de_visual(r):
        return (r["yeu"]["visual"] or ["hook chua co hieu ung hinh"]) + [
            "nhip hinh dang co trong hook (t0/t1 = giay timeline tu dau hook, s = do manh, full = toan khung): %s" %
            json.dumps(r["do"].get("hieu_ung_hook") or [], ensure_ascii=False)]

    def add_visual(use_fallback, r):
        gat = any("gắt" in x for x in r["yeu"]["visual"])
        harsh = _harsh_ids(r)
        if use_fallback:
            if gat:
                drop_hook(lambda e: e.get("id") in harsh or e.get("type") in harsh)
            plan["scene_effects"] = list(plan.get("scene_effects") or []) + fallback_effect(moment, level, r["do"].get("can"))
            notes.append("hieu ung hinh hook: du phong muc %s (AI khong dat)" % level)
            return True
        vd = van_de_visual(r)
        if fx_ctx and fx_ctx.get("moments"):
            import fx_flow
            hm = hook_moments_fx(fx_ctx["moments"], moment)
            note = ("# LUOT RIENG CHO HOOK\nHieu ung hinh cua hook CHUA DAT: %s\nMuc do can: \"%s\" (%s).\nChi co "
                    "khoanh khac hook ben duoi: thiet ke LAI hieu ung TOAN KHUNG cho hook (1-2 hieu ung, moi hieu ung co "
                    "the co nhieu nhip)%s — nhip dau cham trong <= %.1fs dau hook (src_start sat hook.src_start), >= %d "
                    "nhip thay doi ro%s, bam cac tu nhan / cau chot trong loi_noi, dung ngu canh cau hook%s. \"bo_qua\" de "
                    "trong." % (
                        " | ".join(vd), level, why_level, ' ("anchor": "hook")' if moment.get("anchor") == "hook" else "",
                        L["hit"], L["beats"], (", khong dung im qua %.1fs" % L["gap"]) if L["gap"] else "",
                        "; tone nhe: em, muot, KHONG rung / loe / glitch" if level == "nhe" else ""))
            import brand_guide
            brand = fx_ctx.get("brand")
            k_hook = {"m": hm, "story": story, "style": fx_ctx.get("style"), "hook": fx_ctx.get("hook"),
                      "vd": vd, "muc": level, "hr": HOOK_RULE_VERSION, "v": fx_flow.FX_VERSION}
            if brand_guide.view(brand, "fx"):
                k_hook["brand"] = brand_guide.view(brand, "fx")     # chi khi co -> khoa cache cu giu nguyen
            res_p = step("Hook-FX-plan", k_hook,
                         lambda: fx_flow.gpt_fx_plan(hm, story=story, style=fx_ctx.get("style"),
                                                     sources=fx_ctx.get("sources"), hook=fx_ctx.get("hook"),
                                                     note=note, log=log, step_label="Hook-FX-plan", brand=brand)) or {}
            for i, e in enumerate(res_p.get("effects") or []):
                if isinstance(e, dict):
                    e["id"] = "hook%d" % (i + 1)
                    if moment.get("anchor") == "hook":
                        e["anchor"] = "hook"
            ch = []
            got = fx_flow.build_effects(res_p, hm, fx_ctx.get("faces"), fx_ctx.get("palette"), step=step, changes=ch,
                                        log=log, brand=brand, project=fx_ctx.get("project"))[:2]
            for c in ch:
                notes.append("FX hook: %s" % c)
            if got:
                # lam lai: bo hieu ung hook cu bi gat (tone nhe) / transform cu (khong chong 2 transform)
                new_tr = any(e.get("kind") == "transform" for e in got)
                drop_hook(lambda e: (gat and e.get("id") in harsh) or (new_tr and e.get("kind") == "transform"))
                plan["fx"] = list(plan.get("fx") or []) + got
                notes.append("hieu ung hinh hook (AI tu viet lai): %s" % " + ".join((e.get("visual") or "")[:90] for e in got))
                return True
        rr = step("Hook-FX", {"m": moment, "story": story, "vd": vd, "muc": level, "hr": HOOK_RULE_VERSION},
                  lambda: gpt_hook_effect(moment, story=story, log=log, level=level, van_de=vd)) or {}
        got = clean_effects(rr, moment, level)
        if got:
            if gat:
                drop_hook(lambda e: e.get("id") in harsh or e.get("type") in harsh)
            plan["scene_effects"] = list(plan.get("scene_effects") or []) + got
            notes.append("hieu ung hinh hook (AI chon trong kho): %s" % ", ".join(
                "%s %.1f — %s" % (e["type"], e["intensity"], e.get("why", "")[:80]) for e in got))
            return True
        return False

    def add_sound(use_fallback, r):
        import engine
        vd = r["yeu"]["sound"] or ["hook chua co SFX"]
        if use_fallback:
            got = fallback_sfx(moment, sfx_catalog, level)
            tag = "du phong"
        else:
            rr = step("Hook-SFX", {"m": moment, "story": story, "sfx": sfx_catalog, "hinh": hook_visuals(plan),
                                   "vd": vd, "muc": level, "hr": HOOK_RULE_VERSION},
                      lambda: gpt_hook_sfx(moment, sfx_catalog or [], story=story, hinh=hook_visuals(plan), log=log,
                                           level=level, van_de=vd)) or {}
            got = clean_sfx(rr, moment, sfx_catalog)
            tag = "AI chon"
        if not got:
            return False
        # dat DAU danh sach: resolve_plan_sfx cat bot khi qua so SFX toi da -> SFX hook khong bi cat
        plan["audio"] = got + list(plan.get("audio") or [])
        engine.resolve_plan_sfx(plan)
        notes.append("am thanh hook (%s): %s — %s" % (tag, got[0]["sfx_id"], got[0].get("why", "")[:120]))
        return True

    for use_fallback in (False, True):
        changed = False
        for k in sorted(_problems(res), reverse=True):          # visual truoc: SFX chon trung nhip hinh moi
            try:
                changed |= add_visual(use_fallback, res) if k == "visual" else add_sound(use_fallback, res)
            except Exception as ex:  # AI / code hieu ung loi -> luot sau du phong
                notes.append("bo sung %s cho hook loi: %s" % (k, str(ex)[:160]))
        if changed:
            spec, report = build(plan)
            res = check(spec, level, plan) if spec else res
        if not _problems(res):
            break
    d = res["do"]
    if _problems(res):
        notes.append("hook VAN chua dat: %s" % "; ".join(res["yeu"]["visual"] + res["yeu"]["sound"]
                                                          + ["thiếu %s" % k for k in res["thieu"]]))
    else:
        notes.append("sau khi lam lai: hook dat muc %s — %s" % (L["ten"], so_do(d)))
    for n in notes[1:]:
        say("Luật hook: %s" % n, "warn" if ("du phong" in n or "VAN" in n or "loi" in n) else "ok")
    return plan, spec, report, notes


def _p(name):
    import prompt_store
    return prompt_store.get_prompt(name, globals()[name])
