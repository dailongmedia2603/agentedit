#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SO SANH DOI CHIEU mau tu thiet ke voi anh mau: render khung NGHI (moi thanh phan da hien, chua mo ra) tren dung mau
nen cua anh mau, cat dung vung anh mau (Frame cua design), thu ve kich thuoc anh mau roi DO:
  - tung thanh phan: khung net muc (anh mau vs ban dung), do lech 4 canh (px anh mau), tuong quan trong vung
  - toan khung: tuong quan + sai khac trung binh
Xuat: <out>/compare.png (anh mau | ban dung | chong mau: do = anh mau, xanh = ban dung, vang = trung) + report.json.

  python text-designs/compare.py design_tk-01-3buoc [--frame 90] [--out <thu muc>]
"""
import os
import sys
import json
import argparse
import importlib.util
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REMOTION_CWD = os.path.expanduser("~/.capcut-studio/remotion")


def load_design(name):
    path = os.path.join(HERE, name if name.endswith(".py") else name + ".py")
    spec = importlib.util.spec_from_file_location("design", path)
    mod = importlib.util.module_from_spec(spec)
    sys.argv = [path, os.devnull]  # design doc argv[1] lam thu muc ra — o day chi can doi tuong, khong ghi
    spec.loader.exec_module(mod)
    return mod


def render(tpl_dir, out_png, frame, bg):
    env = {k: v for k, v in os.environ.items() if k != "ELECTRON_RUN_AS_NODE"}
    r = subprocess.run(["node", os.path.join(HERE, "render.mjs"), tpl_dir, out_png, "--frames", str(frame), "--bg", bg],
                       cwd=REMOTION_CWD, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("render loi: " + r.stderr[-800:])


def lum(a):
    return a.astype(float).mean(2)


def ink_bbox(m):
    ys, xs = np.where(m)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def corr(a, b):
    a = a - a.mean()
    b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("design")
    ap.add_argument("--frame", type=int, default=None, help="khung nghi (mac dinh: giua luc moi o da hien va luc mo ra)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--halfres", action="store_true", default=True, help="anh mau la ban phong 2x -> lam mo tuong tu")
    a = ap.parse_args()
    d = load_design(a.design)
    ref_path = os.path.join(HERE, d.spec["source"]["ref"])
    ref = np.asarray(Image.open(ref_path).convert("RGB"))
    H0, W0 = ref.shape[:2]
    bg = tuple(int(v) for v in np.median(np.concatenate([ref[:4].reshape(-1, 3), ref[-4:].reshape(-1, 3)]), 0))
    out = a.out or os.path.join(HERE, ".compare", d.TID)
    os.makedirs(out, exist_ok=True)
    tpl = os.path.join(out, "tpl")
    d.write_template(tpl, json.loads(json.dumps(d.spec)), d.FONTS, d.sounds)
    frame = a.frame if a.frame is not None else int(round(d.spec["fps"] * 3.0))
    png = os.path.join(out, "render.png")
    render(tpl, png, frame, "#%02x%02x%02x" % bg)
    full = Image.open(png).convert("RGB")
    fr = d.fr
    x0, y0 = fr.px(0, 0)
    x1, y1 = fr.px(W0, H0)
    crop = full.crop((round(x0), round(y0), round(x1), round(y1)))
    ours = crop.resize((W0, H0), Image.BOX)
    if a.halfres:
        ours = ours.resize((W0 // 2, H0 // 2), Image.BOX).resize((W0, H0), Image.BILINEAR)
    O = np.asarray(ours)
    Lr, Lo = lum(ref), lum(O)
    BGL = float(np.mean(bg))
    rep = {"frame": frame, "S": fr.S, "bg": bg, "elements": {}}
    # vung tung thanh phan (px anh mau) = khung net muc do o design + le 3px
    regions = {}
    for sid, m in d.M.items():
        l, t, r, b = d.ink_sheared(m["font"], m["text"], m.get("italic", 0))
        w = (r - l + m.get("ls", 0) * (len(m["text"]) - 1)) * m["em"]
        regions[sid] = (m["x"], m["y"], m["x"] + w, m["y"] + (b - t) * m["em"])
    for sid, (l, t, r, b) in regions.items():
        l, t, r, b = int(l) - 2, int(t) - 2, int(r) + 2, int(b) + 3
        inv = sid == "s4"  # chu toi trong hop trang
        if inv:
            mr = Lr[t:b, l:r] < 150
            mo = Lo[t:b, l:r] < 150
        else:
            mr = Lr[t:b, l:r] > BGL + 0.45 * (250 - BGL)
            mo = Lo[t:b, l:r] > BGL + 0.45 * (250 - BGL)
        br, bo = ink_bbox(mr), ink_bbox(mo)
        delta = [round(bo[i] - br[i], 1) for i in range(4)] if br and bo else None
        rep["elements"][sid] = {"text": d.M[sid]["text"], "ref_bbox": [v + (l if i % 2 == 0 else t) for i, v in enumerate(br)] if br else None,
                                "ours_bbox": [v + (l if i % 2 == 0 else t) for i, v in enumerate(bo)] if bo else None,
                                "delta_ltrb_px": delta, "corr": round(corr(Lr[t:b, l:r], Lo[t:b, l:r]), 4)}
    for name, (l, t, r, b), thr in (("box", d.BOX, 200), ("line", d.LINE, BGL + 30)):
        l, t, r, b = int(l) - 4, int(t) - 4, int(r) + 5, int(b) + 5
        if name == "box":
            br, bo = ink_bbox(Lr[t:b, l:r] > thr), ink_bbox(Lo[t:b, l:r] > thr)
        else:
            br, bo = ink_bbox(Lr[t:b, l:r] > thr), ink_bbox(Lo[t:b, l:r] > thr)
        rep["elements"][name] = {"ref_bbox": [v + (l if i % 2 == 0 else t) for i, v in enumerate(br)] if br else None,
                                 "ours_bbox": [v + (l if i % 2 == 0 else t) for i, v in enumerate(bo)] if bo else None,
                                 "delta_ltrb_px": [round(bo[i] - br[i], 1) for i in range(4)] if br and bo else None}
    rep["global_corr"] = round(corr(Lr, Lo), 4)
    rep["mean_abs_diff_255"] = round(float(np.abs(ref.astype(float) - O.astype(float)).mean()), 2)
    # anh: ref | ours | chong mau (phong 3x)
    k = 3
    A = Image.fromarray(ref).resize((W0 * k, H0 * k), Image.LANCZOS)
    B = ours.resize((W0 * k, H0 * k), Image.LANCZOS)
    nr = np.clip((Lr - BGL) / (250 - BGL), 0, 1)
    no = np.clip((Lo - BGL) / (250 - BGL), 0, 1)
    ov = Image.fromarray((np.dstack([nr, no, np.zeros_like(nr)]) * 255).astype(np.uint8)).resize((W0 * k, H0 * k), Image.LANCZOS)
    hi = crop.resize((W0 * k, H0 * k), Image.LANCZOS)
    pad = 40
    sheet = Image.new("RGB", (W0 * k * 2 + 30, (H0 * k + pad) * 2 + 10), (18, 18, 24))
    dr = ImageDraw.Draw(sheet)
    for i, (im, lab) in enumerate(((A, "ANH MAU (user)"), (hi, "MAU KHO TEXT tk-01 (Remotion, ban net)"),
                                   (B, "MAU KHO TEXT (ha ve do phan giai anh mau)"), (ov, "CHONG: do = anh mau, xanh = ban dung, vang = trung"))):
        x = (i % 2) * (W0 * k + 30)
        y = (i // 2) * (H0 * k + pad + 10)
        dr.text((x + 6, y + 10), lab, fill=(230, 230, 240))
        sheet.paste(im, (x, y + pad))
    sheet.save(os.path.join(out, "compare.png"))
    with open(os.path.join(out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    print(json.dumps(rep, ensure_ascii=False, indent=1))
    print("->", os.path.join(out, "compare.png"))


if __name__ == "__main__":
    main()
