#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test LOAI VIDEO doc 9:16 / ngang 16:9 (sidecar/canvas.py, 2026-10-04) — khong goi AI.

Chay:  HOME=$(mktemp -d) <venv_python> tests/test_landscape.py   (can ffmpeg de tao video thu)
"""
import os
import sys
import json
import shutil
import tempfile
import subprocess
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sidecar"))

import canvas as CV  # noqa: E402
import remotion_plan as RP  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % (detail,)))
    if not cond:
        FAILS.append(name)


def ff(*args):
    subprocess.run([RP._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def video(path, size):
    ff("-f", "lavfi", "-i", "testsrc=size=%s:rate=30:duration=20" % size, "-f", "lavfi",
       "-i", "sine=frequency=440:duration=20", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", path)
    return path


def plan(src, img, canvas=None):
    S = "source_1"
    p = {
        "engine": "remotion",
        "source_videos": [{"id": S, "path": src, "name": os.path.basename(src), "duration": 20.0}],
        "segments": [{"source_id": S, "start": 0.0, "end": 16.0, "target_start": 0.0}],
        "faces": {S: {"cx": 0.5, "cy": 0.4, "w": 0.3, "h": 0.2}},
        "assets": [{"id": "anh", "kind": "ai_image", "path": img}],
        "captions": [{"text": "Phụ đề lời nói", "role": "support", "source_id": S, "src_start": 1.0, "src_end": 2.5}],
        "scenes": [
            {"layout": "split", "source_id": S, "src_start": 3.0, "src_end": 5.0, "panel": {"asset": "anh"}},
            {"layout": "split", "source_id": S, "src_start": 5.0, "src_end": 6.5, "panel": {"asset": "anh"},
             "panel_side": "right", "panel_ratio": 0.4},
            {"layout": "card", "source_id": S, "src_start": 7.0, "src_end": 9.0, "popout": True, "panel": {"asset": "anh"}},
            {"layout": "circle", "source_id": S, "src_start": 10.0, "src_end": 12.0, "circle_d": 0.9},
        ],
        "layers": [{"id": "chu", "type": "text", "source_id": S, "src_start": 13.0, "src_end": 14.5, "x": 0.5, "y": 0.2,
                    "spans": [{"text": "CHỮ NHẤN", "size": 120}]}],
        "speech": [],
    }
    if canvas:
        p["canvas"] = canvas
    return p


def main():
    tmp = tempfile.mkdtemp(prefix="landscape-")
    try:
        print("[1] canvas.py")
        check("mac dinh = doc 1080x1920", CV.size() == (1080, 1920) and not CV.landscape())
        check("normalize: landscape / ngang / 16:9 -> ngang; con lai -> doc",
              [CV.normalize(x) for x in ("landscape", "ngang", "16:9", None, "", "portrait", "bay")]
              == ["landscape"] * 3 + ["portrait"] * 4)
        check("dims", CV.dims("landscape") == (1920, 1080) and CV.dims(None) == (1080, 1920))
        check("khung doc: khong ghi chu prompt, khong doi khoa cache, anh 9:16",
              CV.note("design") == "" and CV.tag() is None and CV.keyed({"a": 1}) == {"a": 1}
              and CV.aspect_default() == "9:16" and CV.story_view() is None)
        with CV.use(1920, 1080):
            check("khung ngang: ghi chu prompt + khoa cache + anh 16:9",
                  "1920x1080" in CV.note("design") and "ctx.W = 1920" in CV.note("fx")
                  and CV.keyed({"a": 1}) == {"a": 1, "khung": "landscape"} and CV.aspect_default() == "16:9"
                  and "NGANG" in CV.story_view())
            check("px -> phan khung theo 1920x1080", abs(CV.fw(960) - 0.5) < 1e-9 and abs(CV.fh(540) - 0.5) < 1e-9)
            check("phu de rong 70% khung ngang", CV.caption_frac() == 0.70)
        check("ra khoi khung ngang -> tro lai doc", CV.size() == (1080, 1920) and CV.caption_frac() == 0.86)
        check("of_plan: plan cu khong canvas -> doc", CV.of_plan({}) == (1080, 1920)
              and CV.of_plan({"canvas": {"w": 1920, "h": 1080}}) == (1920, 1080))
        check("note_for: story ghi khung ngang (luong phu khong mang khung)",
              CV.note_for({"khung_hinh": "NGANG"}, "text_art") and CV.note_for({}, "text_art") == "")

        print("[2] viec chay nen mang theo khung (run_log.carry)")
        import run_log
        with CV.use(1920, 1080):
            fn = run_log.carry(lambda: CV.size())
        with ThreadPoolExecutor(1) as ex:
            got = ex.submit(fn).result()
            plain = ex.submit(CV.size).result()
        check("luong phu thay khung ngang cua luong goi", got == (1920, 1080), got)
        check("luong khong boc -> doc (khong ro ri)", plain == (1080, 1920), plain)

        print("[3] do khoi chu theo khung")
        import motion_design as MD
        L = {"type": "text", "spans": [{"text": "CHU NHAN", "size": 120}]}
        w_doc, h_doc = MD._text_width(L), MD._text_height(L)
        with CV.use(1920, 1080):
            w_ng, h_ng = MD._text_width(L), MD._text_height(L)
        check("cung co chu: be ngang (phan khung) ngang = doc x 1080/1920", abs(w_ng - w_doc * 1080 / 1920) < 1e-9, (w_doc, w_ng))
        check("cung co chu: chieu cao (phan khung) ngang = doc x 1920/1080", abs(h_ng - h_doc * 1920 / 1080) < 1e-9, (h_doc, h_ng))

        img = os.path.join(tmp, "broll.png")
        ff("-f", "lavfi", "-i", "color=c=orange:s=960x540", "-frames:v", "1", img)
        land = video(os.path.join(tmp, "land.mp4"), "640x360")
        port = video(os.path.join(tmp, "port.mp4"), "360x640")
        import media_vision
        media_vision.available = lambda: True          # pop-out / tach nguoi: gia lap (test giong nhau moi may)
        media_vision.subject_matte = lambda *a, **k: None

        print("[4] build_spec khung NGANG")
        sp, rep = RP.build_spec(plan(land, img, {"w": 1920, "h": 1080}))
        check("spec 1920x1080", sp and (sp["width"], sp["height"]) == (1920, 1080), sp and (sp["width"], sp["height"]))
        check("nguon ngang tren khung ngang -> phu kin (cover)", sp["clips"][0]["fit"] == "cover", sp["clips"][0]["fit"])
        sc = [s for s in sp["scenes"]]
        sp1, sp2, card, circ = sc[0], sc[1], sc[2], sc[3]
        check("split: B-roll ben TRAI, A-roll ben PHAI, cao het khung",
              sp1["panelRect"]["x"] == 0 and sp1["panelRect"]["h"] == 1 and sp1["aroll"]["x"] == 0.5
              and sp1["aroll"]["h"] == 1, sp1)
        check("split panel_side right + ratio 0.4", abs(sp2["panelRect"]["x"] - 0.6) < 1e-9 and sp2["aroll"]["x"] == 0.0
              and abs(sp2["aroll"]["w"] - 0.6) < 1e-9, sp2)
        check("card: the A-roll ben phai, panel ben trai, khong pop-out",
              card["aroll"]["x"] >= 0.4 and card["panelRect"]["x"] < 0.1 and not card.get("popout"), card)
        check("bao bo pop-out", any("bo pop-out" in c for c in rep["fixed"]), rep["fixed"])
        a = circ["aroll"]
        check("circle: kep circle_d <= 0.5, VUONG tren px va nam tron trong khung",
              a["w"] <= 0.5 and abs(a["w"] * 1920 - a["h"] * 1080) < 2 and a["y"] >= 0 and a["y"] + a["h"] <= 1, a)
        sub = [c for c in sp["captions"] if c["role"] == "support"]
        check("phu de van co (vi tri trong vung an toan)", sub and RP.SAFE_Y[0] <= sub[0]["y"] <= RP.SAFE_Y[1], sub)

        print("[5] nguon DOC tren khung ngang (video quay dien thoai)")
        sp_v, _ = RP.build_spec(plan(port, img, {"w": 1920, "h": 1080}))
        check("giu tron khung + nen mo (blur)", sp_v["clips"][0]["fit"] == "blur", sp_v["clips"][0]["fit"])
        import fx_flow
        f_full = fx_flow._face_px(sp_v, 1.5, 1920, 1080)
        check("mat (full) o giua khung, cao dung 40% khung (contain, khong phai cover)",
              f_full and abs(f_full["x"] - 960) < 1 and abs(f_full["y"] - 432) < 1 and abs(f_full["h"] - 216) < 1, f_full)
        f_split = fx_flow._face_px(sp_v, 4.0, 1920, 1080)
        check("mat (split) o giua nua PHAI", f_split and abs(f_split["x"] - 1440) < 1, f_split)

        print("[6] khung DOC giu nguyen (plan cu khong ghi canvas)")
        sp_d, _ = RP.build_spec(plan(port, img))
        check("spec 1080x1920", (sp_d["width"], sp_d["height"]) == (1080, 1920))
        d1 = sp_d["scenes"][0]
        check("split doc: B-roll nua TREN", d1["panelRect"]["w"] == 1 and abs(d1["panelRect"]["h"] - 0.5) < 1e-9
              and abs(d1["aroll"]["y"] - 0.5) < 1e-9, d1)

        print("[7] boi canh anh AI + chu anh AI")
        design = {"assets": [{"id": "a1", "kind": "ai_image", "prompt": "x"}],
                  "scenes": [{"layout": "split", "source_id": "source_1", "src_start": 0, "src_end": 2, "panel": {"asset": "a1"}}]}
        ctx_doc = MD.asset_contexts(design)["a1"]
        with CV.use(1920, 1080):
            ctx_ng = MD.asset_contexts(design)["a1"]
            assets = MD.normalize_assets([{"id": "b", "kind": "ai_image", "prompt": "y"}], [])
        check("khung doc: boi canh anh khong co khung_video (khoa cache anh cu giu nguyen)", "khung_video" not in ctx_doc, ctx_doc)
        check("khung ngang: boi canh anh co khung_video + vai tro 'mot BEN'", "khung_video" in ctx_ng
              and "BEN" in ctx_ng["vai_tro"], ctx_ng)
        check("khung ngang: anh AI khong khai ti le -> 16:9", assets[0]["aspect"] == "16:9", assets)
        import asset_gen
        check("prompt anh co dong KHUNG VIDEO", "KHUNG VIDEO" in asset_gen._context_text(ctx_ng))
        import text_art
        lk = [{"key": "k", "tiers": [{"role": "chinh", "text": "CHỮ"}]}]
        check("chu anh AI: story khung ngang -> prompt co ghi chu khung ngang",
              "KHUNG VIDEO: NGANG" in text_art.sheet_prompt(lk, {}, {"khung_hinh": "NGANG"}, False, "/x.png")
              and "KHUNG VIDEO: NGANG" not in text_art.sheet_prompt(lk, {}, {}, False, "/x.png"))

        print("[8] tu lieu nguoi dung: ti le theo khung")
        import user_media as UM
        m = {"width": 1000, "height": 1000}
        doc = UM._cao(m)
        with CV.use(1920, 1080):
            ng = UM._cao(m)
        check("anh vuong w=1: doc cao 0.5625 khung, ngang cao 1.78 khung", abs(doc - 0.5625) < 1e-4 and abs(ng - 1.7778) < 1e-3,
              (doc, ng))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("\n" + ("TAT CA OK" if not FAILS else "LOI: %d — %s" % (len(FAILS), ", ".join(FAILS))))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
