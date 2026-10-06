#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""2026-10-03 (user): (1) o HOOK chu / phan khac KHONG duoc che mat nguoi noi ('1 NUT LA XONG' de ngang mat);
(2) xoa nen anh phai SACH — khong du lop bong (anh cot song: mang mo hinh chu nhat de len mat).

Chay: HOME=$(mktemp -d) <venv_python> tests/test_face_cutout.py
Khong goi AI. Anh gia lap bang PIL (vat + bong do mem tren nen xam nhat nhu anh AI); mat na AI gia lap — co ca truong
hop mat na OM LUON bong (loi Vision that) va BO SOT mot mang vat (de nut bam do tham).
"""
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import numpy as np                          # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

import cutout_refine as CR                  # noqa: E402
import media_vision                         # noqa: E402
import motion_design as MD                  # noqa: E402

FAILED = []
TMP = tempfile.mkdtemp(prefix="facecut-")


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


# ---------------------------------------------------------------------------
# 1. TACH NEN SACH
# ---------------------------------------------------------------------------
def synth():
    """Vat (than do + nap trang GAN mau nen + mang xam trung tinh) dung tren san xam nhat, bong do mem phia duoi."""
    W = H = 800
    img = Image.new("RGB", (W, H), (229, 229, 231))
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).ellipse((170, 600, 650, 700), fill=170)
    sh = sh.filter(ImageFilter.GaussianBlur(30))
    img = Image.composite(Image.new("RGB", (W, H), (60, 60, 62)), img, sh.point(lambda v: int(v * 0.6)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((260, 240, 540, 640), radius=40, fill=(200, 40, 50))    # than do
    d.ellipse((300, 160, 500, 330), fill=(246, 241, 233))                         # nap trang (gan mau nen)
    d.rectangle((330, 480, 470, 560), fill=(120, 120, 124))                       # mang xam trung tinh
    obj = Image.new("L", (W, H), 0)
    od = ImageDraw.Draw(obj)
    od.rounded_rectangle((260, 240, 540, 640), radius=40, fill=255)
    od.ellipse((300, 160, 500, 330), fill=255)
    return np.asarray(img), np.asarray(obj) > 0, np.asarray(sh) > 25


def test_cutout_clean():
    print("Tach nen: xoa bong do + lop mo, giu du vat")
    rgb, obj, shadow = synth()
    check("nen tron mot mau duoc nhan ra", CR.plain_background(rgb.astype(np.float32)) is not None)
    # bong ngoai vat (tru dai 3 diem sat vien: vien vat duoc lam mem 1 diem)
    out_shadow = shadow & ~(np.asarray(Image.fromarray(obj.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0)
    # (a) mat na AI OM LUON bong + lop mo alpha thap tren ca khung (loi that: mang chu nhat de len mat)
    bad = np.where(obj, 1.0, 0.0).astype(np.float32)
    bad = np.maximum(bad, np.where(shadow, 0.9, 0.0))
    bad = np.maximum(bad, 0.05)                                   # lop mo 5% ca khung
    rgba, info = CR.refine(rgb, bad)
    a = rgba[..., 3].astype(np.float32) / 255
    check("bong do bi xoa (mat na AI om bong)", a[out_shadow].max() < 0.05, a[out_shadow].max())
    check("lop mo alpha thap ngoai vat = 0", float((a[~obj & ~shadow] > 0).mean()) < 0.003,
          float((a[~obj & ~shadow] > 0).mean()))
    core = obj.copy()
    core[:4] = core[-4:] = False
    inner = np.asarray(Image.fromarray(obj.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(9))) > 0
    check("than vat giu nguyen (alpha ~1)", a[inner].min() > 0.95, a[inner].min())
    check("nap trang gan mau nen KHONG bi xoa", a[190:300, 360:440].min() > 0.95, a[190:300, 360:440].min())
    check("mang xam trung tinh KHONG bi xoa", a[490:550, 340:460].min() > 0.95, a[490:550, 340:460].min())
    # (b) mat na AI BO SOT nua duoi than vat (de nut bam do tham Vision bo) -> lay lai
    miss = np.where(obj, 1.0, 0.0).astype(np.float32)
    miss[500:, :] = 0.0
    rgba2, info2 = CR.refine(rgb, miss)
    a2 = rgba2[..., 3].astype(np.float32) / 255
    lost = inner.copy()
    lost[:510] = False
    check("phan vat AI bo sot duoc lay lai", a2[lost].mean() > 0.95, (a2[lost].mean(), info2))
    check("... nhung bong ben duoi van bi xoa", a2[out_shadow].max() < 0.05, a2[out_shadow].max())
    # (c) vien than DO khong con mau nen xam (khu mau nen o diem anti-alias)
    band = np.zeros_like(obj)
    band[300:560, 250:275] = True
    edge = band & (a > 0.1) & (a < 0.9)
    check("co diem vien mem o canh vat", bool(edge.any()))
    if edge.any():
        px = rgba[..., :3][edge].astype(np.float32)
        check("vien than do khong con mau nen xam", float((px[:, 0] - px[:, 1]).mean()) > 120,
              px.mean(0))


def test_cutout_pipeline():
    print("Tach nen qua lift_subject: phien ban + anh trong suot san")
    rgb, obj, _shadow = synth()
    src = os.path.join(TMP, "obj.png")
    Image.fromarray(rgb).save(src)
    # anh DA trong suot san (Codex): dung alpha cua anh, khong qua mat na AI; lop mo < ALPHA_FLOOR bi xoa
    rgba = np.dstack([rgb, np.where(obj, 255, 6).astype(np.uint8)])
    rgba[:, :40, 3] = 0
    tr = os.path.join(TMP, "transp.png")
    Image.fromarray(rgba, "RGBA").save(tr)
    own = CR.own_alpha(tr)
    check("nhan ra anh trong suot san", own is not None)
    cut = media_vision.lift_subject(tr, os.path.join(TMP, "transp_cut.png"))
    check("tach anh trong suot san ra file", bool(cut) and os.path.isfile(cut))
    if cut:
        with Image.open(cut) as im:
            check("ban tach co dau phien ban", str(im.info.get("studio_cut")) == str(CR.VERSION), im.info)
            a = np.asarray(im)[..., 3]
            check("lop mo alpha 6/255 bi xoa", int(((a > 0) & (a < 20)).sum()) == 0, int(((a > 0) & (a < 20)).sum()))
        check("ban tach moi + dung phien ban -> dung lai", CR.fresh(cut, tr))
        # ban tach cu (khong co dau phien ban) -> tach lai
        Image.fromarray(rgba, "RGBA").save(cut)
        os.utime(cut, (os.path.getmtime(tr) + 5, os.path.getmtime(tr) + 5))
        check("ban tach cu (khong dau phien ban) -> khong dung lai", not CR.fresh(cut, tr))
        again = media_vision.lift_subject(tr, cut)
        with Image.open(again) as im:
            check("... tach lai co dau phien ban", str(im.info.get("studio_cut")) == str(CR.VERSION))
    if media_vision._vision() or media_vision.vision_onnx.has(media_vision.vision_onnx.CUT):
        out = media_vision.lift_subject(src, os.path.join(TMP, "obj_cut.png"))
        check("tach nen that (Vision / ONNX) ra file", bool(out) and os.path.isfile(out))
        if out:
            with Image.open(out) as im:
                w, h = im.size
            # ban cat SAT chu the: vat cao 480 (y 160..640), bong lan toi ~700 -> khung tach khong duoc keo dai xuong bong
            check("tach nen that: khung khong om bong (cao <= vat)", h <= 480 + 12 and w <= 280 + 12, (w, h))
    else:
        print("  (bo qua tach nen that: may khong co Vision / model ONNX)")


# ---------------------------------------------------------------------------
# 2. MAT NGUOI NOI KHONG BI CHE
# ---------------------------------------------------------------------------
def spec_with(layers, captions=None, hook_end=5.0):
    face = {"cx": 0.44, "cy": 0.31, "h": 0.22}
    clips = [
        {"id": "clip0", "kind": "hook", "start": 0, "end": hook_end, "srcStart": 10, "speed": 1, "scale": 1,
         "path": "/x.mp4", "srcW": 480, "srcH": 854, "face": face, "fit": "cover", "x": 0, "y": 0},
        {"id": "clip1", "kind": "body", "start": hook_end, "end": 30, "srcStart": 0, "speed": 1, "scale": 1,
         "path": "/x.mp4", "srcW": 480, "srcH": 854, "face": face, "fit": "cover", "x": 0, "y": 0},
    ]
    return {"width": 1080, "height": 1920, "fps": 30, "duration": 30, "clips": clips, "scenes": [], "effects": [],
            "layers": layers, "captions": captions or []}


def face_cover(spec, box, t):
    f = MD._face_rect(spec, t, 1080, 1920)
    if not f:
        return 0.0
    ix = max(0.0, min(box[2], f[2]) - max(box[0], f[0]))
    iy = max(0.0, min(box[3], f[3]) - max(box[1], f[1]))
    return ix * iy / ((f[2] - f[0]) * (f[3] - f[1]))


def test_face_guard():
    print("Bao ve mat: hook tuyet doi, than video toi da 15%")
    art = {"id": "art_cap0", "type": "text", "start": 0.88, "end": 5.0, "track": 40, "x": 0.5, "y": 0.31,
           "spans": [{"text": "1 NUT LA XONG", "size": 150}],
           "art": [{"src": "/a.png", "w": 856.7, "h": 286.7, "mt": 0}]}
    img = {"id": "spine", "type": "image", "start": 1.0, "end": 4.0, "track": 20, "x": 0.45, "y": 0.28, "w": 0.4,
           "path": os.path.join(TMP, "tall.png"), "cutout": True}
    Image.new("RGBA", (400, 900), (0, 0, 0, 0)).save(img["path"])
    hero = {"id": "h0", "role": "hero", "start": 0.5, "end": 3.0, "text": "BI MAT", "size": 120, "y": -0.38,
            "style": "hero_title"}
    sub = {"id": "s0", "role": "support", "start": 1.0, "end": 3.5, "text": "toi noi o day", "size": 60, "y": -0.42}
    body = {"id": "b1", "type": "text", "start": 10, "end": 12, "track": 30, "x": 0.5, "y": 0.31,
            "spans": [{"text": "CHU THAN VIDEO", "size": 110}]}
    ring = {"id": "r1", "type": "ring", "start": 1, "end": 2, "track": 10, "x": 0.44, "y": 0.31, "w": 0.4}
    behind = {"id": "bh", "type": "text", "start": 1, "end": 3, "track": 5, "x": 0.5, "y": 0.3, "behind": True,
              "spans": [{"text": "SAU NGUOI", "size": 200}]}
    spec = spec_with([art, img, body, ring, behind], [hero, sub])
    before = {L["id"]: face_cover(spec, MD._guard_box(L), L["start"] + 0.1) for L in (art, img, body)}
    check("truoc khi sua: chu hook de len mat (gia lap dung loi that)", before["art_cap0"] > 0.3, before)
    ch = []
    MD.protect_face(spec, ch)
    ids = {L["id"]: L for L in spec["layers"]}
    for lid in ("art_cap0", "spine"):
        L = ids.get(lid)
        check("hook: '%s' van con (doi cho, khong bo)" % lid, L is not None)
        if L:
            worst = max(face_cover(spec, MD._guard_box(L), t) for t in np.arange(L["start"], L["end"], 0.1))
            check("hook: '%s' khong che mat (<= %.0f%%)" % (lid, MD.FACE_HOOK_MAX * 100), worst <= MD.FACE_HOOK_MAX,
                  (worst, L.get("x"), L.get("y"), ch))
            sb = MD._guard_box(L)
            check("hook: '%s' nam trong vung an toan" % lid,
                  sb[1] >= MD.FACE_SAFE[0] - 1e-3 and sb[3] <= MD.FACE_SAFE[1] + 1e-3 and sb[0] >= 0 and sb[2] <= 1, sb)
    caps = {c["id"]: c for c in spec["captions"]}
    for cid in ("h0", "s0"):
        c = caps.get(cid)
        check("hook: caption '%s' khong che mat" % cid,
              c is not None and face_cover(spec, MD._cap_box(c), c["start"] + 0.1) <= MD.FACE_HOOK_MAX,
              c and face_cover(spec, MD._cap_box(c), c["start"] + 0.1))
    b = ids["b1"]
    check("than video: chu che <= 15%% mat", face_cover(spec, MD._guard_box(b), 11) <= MD.FACE_BODY_MAX,
          face_cover(spec, MD._guard_box(b), 11))
    check("vong khoanh mat (ring) giu nguyen", ids["r1"]["x"] == 0.44 and ids["r1"]["y"] == 0.31)
    check("chu 'sau nguoi' giu nguyen", ids["bh"]["y"] == 0.3)
    check("nhat ky ghi ro hook", any("hook" in c and "art_cap0" in c for c in ch), ch)
    # chay lai khong doi gi (on dinh)
    snap = json.dumps(spec, sort_keys=True)
    ch2 = []
    MD.protect_face(spec, ch2)
    check("chay lai: khong doi (on dinh)", json.dumps(spec, sort_keys=True) == snap and not ch2, ch2)
    # camera phong to trong hook (zoom_punch) -> mat to theo -> van phai ne
    art2 = dict(art, id="art_z", y=0.47, art=[{"src": "/a.png", "w": 700, "h": 200, "mt": 0}])
    spec2 = spec_with([art2])
    spec2["effects"] = [{"id": "z", "type": "zoom_punch", "start": 0.9, "end": 2.0, "intensity": 1.0}]
    plain = MD._face_rect(spec2, 0.5, 1080, 1920)
    zoomed = MD._face_rect(spec2, 1.2, 1080, 1920)
    check("camera phong to -> khung mat to theo", (zoomed[3] - zoomed[1]) > (plain[3] - plain[1]) * 1.1, (plain, zoomed))
    MD.protect_face(spec2, [])
    L = spec2["layers"][0]
    worst = max(face_cover(spec2, MD._guard_box(L), t) for t in np.arange(L["start"], L["end"], 0.1))
    check("hook + zoom_punch: chu van khong che mat", worst <= MD.FACE_HOOK_MAX, (worst, L["y"]))
    # bo cuc khong co mat (broll) -> khong dong vao
    spec3 = spec_with([dict(art, id="art_b", y=0.31)])
    for c in spec3["clips"]:
        c.pop("face")
    MD.protect_face(spec3, [])
    check("khong co mat -> giu nguyen", spec3["layers"][0]["y"] == 0.31)


def test_face_guard_per_time():
    print("Bao ve mat XET THEO TUNG THOI DIEM (10-06: 4 chu nua tren bi doi sat mep + thu 42% vi 1 chu hien them 0.45s "
          "sau khi bo cuc chia doi het)")
    rows = [("CAT TUNG DOAN", 0.42, 0.30, 15.0, 20.45), ("LAM PHU DE", 0.60, 0.21, 15.4, 19.95),
            ("TIM HINH ANH", 0.40, 0.12, 15.8, 19.95), ("HIEU UNG AM THANH", 0.55, 0.39, 16.2, 19.95)]
    layers = [{"id": "t%d" % i, "type": "text", "group": "viec", "start": st, "end": en, "track": 30, "x": x, "y": y,
               "spans": [{"text": txt, "size": 92}]} for i, (txt, x, y, st, en) in enumerate(rows)]
    spec = spec_with(layers)
    spec["scenes"] = [{"layout": "split", "start": 5.0, "end": 20.0, "aroll": {"x": 0, "y": 0.5, "w": 1, "h": 0.5}}]
    f_split, f_full = MD._face_rect(spec, 17, 1080, 1920), MD._face_rect(spec, 20.3, 1080, 1920)
    check("gia lap: chia doi -> mat nua duoi; toan khung -> mat len cao", f_split and f_split[1] >= 0.5 and f_full
          and f_full[1] < 0.3, (f_split, f_full))
    union = (min(MD._guard_box(L)[1] for L in layers), max(MD._guard_box(L)[3] for L in layers))
    check("gia lap: khung GOP ca to hop cham mat toan khung (dung loi cu)", union[1] > f_full[1], (union, f_full))
    ch = []
    MD.protect_face(spec, ch)
    ids = {L["id"]: L for L in spec["layers"]}
    check("khong chu nao bi doi cho", all((ids["t%d" % i]["x"], ids["t%d" % i]["y"]) == (r[1], r[2])
                                          for i, r in enumerate(rows)), [(L["x"], L["y"]) for L in spec["layers"]])
    check("khong chu nao bi thu nho", all(L["spans"][0]["size"] == 92 for L in spec["layers"]),
          [L["spans"][0]["size"] for L in spec["layers"]])
    check("chi chu hien qua luc doi bo cuc bi tat som (truoc khi de len mat)",
          ids["t0"]["end"] <= 20.1 and all(ids["t%d" % i]["end"] == 19.95 for i in (1, 2, 3)),
          [L["end"] for L in spec["layers"]])
    worst = max(face_cover(spec, MD._guard_box(L), t) for L in spec["layers"]
                for t in np.arange(L["start"], L["end"] - 0.04, 0.05))
    check("sau khi sua: khong luc nao chu de len mat qua 15%", worst <= MD.FACE_BODY_MAX, worst)
    check("nhat ky ghi ro: chi cat bot thoi gian, giu co + vi tri", any("giu co + vi tri" in c for c in ch), ch)
    # 2 chu 2 BEN mat (khung gop phu mat, tung chu khong cham) -> giu nguyen
    lay3 = [{"id": "a", "type": "text", "group": "g", "start": 21, "end": 25, "track": 30, "x": 0.12, "y": 0.31,
             "spans": [{"text": "TRAI", "size": 80}]},
            {"id": "b", "type": "text", "group": "g", "start": 21, "end": 25, "track": 30, "x": 0.88, "y": 0.31,
             "spans": [{"text": "PHAI", "size": 80}]}]
    spec3 = spec_with(lay3)
    f = MD._face_rect(spec3, 22, 1080, 1920)
    check("gia lap: 2 chu khong cham mat", all(MD._guard_box(L)[2] < f[0] or MD._guard_box(L)[0] > f[2] for L in lay3),
          ([MD._guard_box(L) for L in lay3], f))
    ch3 = []
    MD.protect_face(spec3, ch3)
    check("2 chu 2 ben mat -> giu nguyen (khung gop khong tinh la de len mat)",
          [(L["x"], L["y"], L["spans"][0]["size"]) for L in spec3["layers"]] == [(0.12, 0.31, 80), (0.88, 0.31, 80)], ch3)
    # de len mat GAN HET thoi gian hien -> van doi cho (khong cat thoi gian)
    lay2 = [{"id": "x0", "type": "text", "start": 21, "end": 25, "track": 30, "x": 0.5, "y": 0.31,
             "spans": [{"text": "DE LEN MAT CA LUC", "size": 92}]}]
    spec2 = spec_with(lay2)
    ch2 = []
    MD.protect_face(spec2, ch2)
    L = spec2["layers"][0]
    check("de len mat ca luc -> van doi cho nhu cu, khong cat thoi gian", L["end"] == 25 and L["y"] != 0.31, (L, ch2))


def test_sticker_flag():
    print("Anh tach nen gan co cutout (renderer ve bong theo vien, khong theo khung chu nhat)")
    path = os.path.join(TMP, "a.png")
    cut = os.path.join(TMP, "a_cut.png")
    Image.new("RGB", (10, 10)).save(path)
    by = {"a": {"id": "a", "path": path, "cutout_path": cut}}
    check("ban tach -> cutout", MD.is_cutout(by, "a", cut))
    check("anh thuong -> khong", not MD.is_cutout(by, "a", path))
    tsx = open(os.path.join(ROOT, "remotion-src", "Layers.tsx"), encoding="utf-8").read()
    i = tsx.index("case 'image': {")
    j = tsx.index("case 'video': {")
    seg = tsx[i:j]
    k = seg.index("if (sticker)")
    sticker_branch = seg[k:seg.index("return (", seg.index("return (", k) + 1)]
    check("renderer: anh tach nen dung drop-shadow", "drop-shadow" in sticker_branch)
    check("renderer: anh tach nen KHONG dung box-shadow", "boxShadow" not in sticker_branch)


if __name__ == "__main__":
    test_cutout_clean()
    test_cutout_pipeline()
    test_face_guard()
    test_face_guard_per_time()
    test_sticker_flag()
    print("\n%s" % ("TAT CA DAT" if not FAILED else "LOI: %d — %s" % (len(FAILED), ", ".join(FAILED))))
    sys.exit(1 if FAILED else 0)
