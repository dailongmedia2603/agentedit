#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SUA LOI EDIT 2026-10-18 (video test IMG_4608):
- noi vap / lap chu ("sợ bị... bị rớt"): goi y code + Claude chi ra (cat_vap) -> kiem + cat than video / hook
- chu hook hien DUNG luc noi (khong phai tu giay 0); lop chu noi rong hon loi ('RAO CAN LON NHAT') van bam loi
- khong dau gach trong chu hien thi
- zoom khung chi khi can (B2 + hieu ung tu viet)
- canh shot: anh nen AI (shot_lib.ensure_backdrops + spec_shot backdrop), khong nen ke o (motion_design._bg)

Chay: HOME=$(mktemp -d) <venv_python> tests/test_edit_fixes.py      (khong goi AI, khong can ffmpeg cho phan lon)
"""
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import plan_guard          # noqa: E402
import remotion_plan as RP  # noqa: E402
import speech_cut as SC    # noqa: E402
import shot_lib            # noqa: E402
import fx_flow             # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


print("[1] dau gach")
cases = {"Agent — toàn phần": "Agent, toàn phần", "— Bắt đầu ngay": "Bắt đầu ngay", "3-4 tháng": "3-4 tháng",
         "e-commerce": "e-commerce", "Làm–ăn": "Làm ăn", "1–3 ngày": "1-3 ngày", "24/7 - không nghỉ": "24/7, không nghỉ"}
for a, b in cases.items():
    check("bo_dau_gach %r" % a, plan_guard.bo_dau_gach(a) == b, plan_guard.bo_dau_gach(a))
spec = {"captions": [{"text": "A — B", "words": [{"text": "—"}]}], "layers": [{"spans": [{"text": "X – Y"}]}],
        "scenes": [{"shot": {"texts": {"t": "Một — hai", "l": ["a - b", "c"]}}}], "hook": {"caption": "SỢ — RỚT"}}
n = plan_guard.lam_sach_dau_gach(spec)
check("lam_sach_dau_gach duyet caption / lop / shot / hook", n >= 5 and spec["layers"][0]["spans"][0]["text"] == "X, Y"
      and spec["scenes"][0]["shot"]["texts"]["l"][0] == "a, b" and spec["hook"]["caption"] == "SỢ, RỚT", (n, spec))
check("chay lai khong doi", plan_guard.lam_sach_dau_gach(spec) == 0)

print("[2] zoom chi khi can")
segs = [{"start": i * 3.0, "end": i * 3.0 + 3.0, "scale": 1.12 if i % 2 else 1.06, "beat": "body"} for i in range(30)]
segs[10]["beat"] = "payoff"
RP.han_che_zoom(segs, [])
zoomed = [i for i, s in enumerate(segs) if s["scale"] > 1.0]
starts = [i for i in zoomed if i == 0 or segs[i - 1]["scale"] == 1.0]
check("so lan zoom giam manh (30 doan -> <= 7 lan)", len(starts) <= 7, starts)
check("lan zoom cach nhau >= %.0fs" % RP.ZOOM_MIN_GAP,
      all((b - a) * 3.0 >= RP.ZOOM_MIN_GAP for a, b in zip(starts, starts[1:])), starts)
check("muc zoom <= %.2f" % RP.ZOOM_MAX, max(s["scale"] for s in segs) <= RP.ZOOM_MAX)
before = [dict(s) for s in segs]
RP.han_che_zoom(segs, [])
check("han_che_zoom on dinh", [s["scale"] for s in segs] == [s["scale"] for s in before])
fxs = {"fxTransforms": [{"id": "a", "start": 1.0, "values": {"scale": [1.0, 1.1, 1.0], "brightness": [1, 1.1, 1]}},
                        {"id": "b", "start": 8.0, "values": {"scale": [1.0, 1.1, 1.0], "brightness": [1, 1.2, 1]}},
                        {"id": "c", "start": 12.0, "values": {"scale": [1.0, 1.2, 1.0]}},
                        {"id": "d", "start": 30.0, "values": {"scale": [1.0, 1.1, 1.0]}}]}
fx_flow._han_che_zoom_fx(fxs, [])
check("FX: zoom sat nhau bi bo (giu hieu ung khac)", [t["id"] for t in fxs["fxTransforms"]] == ["a", "b", "d"]
      and "scale" not in fxs["fxTransforms"][1]["values"], fxs)
# 2026-10-19: luat zoom xoa zoom cua hieu ung hook thu 2 -> khung nha ve 100% giua cau hook; con dich x/y -> truot lech
fxh = {"clips": [{"kind": "hook", "start": 0, "end": 4.2}, {"kind": "body", "start": 4.2, "end": 60}],
       "fxTransforms": [{"id": "h1", "start": 0.0, "values": {"scale": [1.0, 1.14, 1.16]}},
                        {"id": "h2", "start": 1.77, "values": {"scale": [1.16, 1.21, 1.25], "x": [2, 4, 4]}},
                        {"id": "b1", "start": 10.0, "values": {"scale": [1.0, 1.1, 1.0], "x": [0, 3, 0], "y": [0, -10, 0],
                                                               "saturate": [1, 0.8, 1]}},
                        {"id": "b2", "start": 12.0, "values": {"scale": [1.0, 1.1, 1.0],
                                                               "x": [0, 9, -9, 9, -9, 9, -9, 0]}}]}
fx_flow._han_che_zoom_fx(fxh, [])
v = {t["id"]: t["values"] for t in fxh["fxTransforms"]}
check("FX: zoom trong HOOK khong bi bo (nhieu nhip dap)", "scale" in v["h1"] and "scale" in v["h2"] and "x" in v["h2"], v)
check("FX: bo zoom than video thi bo ca dich tam x/y (giu mau); x/y la rung thi giu",
      set(v["b1"]) == {"saturate"} and set(v["b2"]) == {"x"}, v)
import plan_guard  # noqa: E402
mp = {"_voice_lufs": -16.0, "speech": [{"source_id": "s", "start": 10.0, "end": 14.0}, {"source_id": "s", "start": 20, "end": 40}],
      "segments": [{"kind": "hook", "source_id": "s", "start": 10.0, "end": 14.0, "target_start": 0.0},
                   {"kind": "body", "source_id": "s", "start": 20.0, "end": 40.0, "target_start": 4.0}],
      "audio": [{"start": 0.02, "anchor": "hook", "_es": "impact", "_play_lufs": -10.0, "sfx_id": "es:impact/punch"},
                {"start": 0.05, "anchor": "hook", "_es": "whoosh", "_play_lufs": -13.0, "sfx_id": "es:whoosh_big/swell"},
                {"start": 2.5, "anchor": "hook", "_es": "riser", "_play_lufs": -12.0, "sfx_id": "es:riser/rush"},
                {"start": 8.0, "_es": "impact", "_play_lufs": -15.0, "sfx_id": "es:pro_impact/short"}]}
plan_guard.mix_sfx(mp, [])
rel = [a["_rel_db"] for a in mp["audio"]]
check("SFX hook: khong lui sau giong / khong nhuong nhau -> impact to hon giong, whoosh + riser ~ ngang giong",
      rel[0] >= 3.0 and rel[1] >= -1.0 and rel[2] >= -1.0, rel)
check("SFX than video van lui sau giong khi dang noi (khong doi)", rel[3] < 1.0, rel)

print("[3] noi vap / lap chu")
words = [("sợ", 90.52, 91.04), ("bị", 91.04, 91.52), ("bị", 91.52, 92.24), ("rớt", 92.84, 93.28), ("hợp", 93.28, 93.48),
         ("đồng", 93.48, 93.7), ("cái", 95.0, 95.2), ("cái", 95.5, 95.7), ("này", 95.7, 95.9)]
hints = SC.stutter_hints(words)
check("goi y: lap 1 chu 'bị bị'", any(h["kieu"] == "lap 1 chu" and abs(h["tu"] - 91.04) < 0.01 for h in hints), hints)
check("goi y: 'cái cái'", any(h["kieu"] == "lap 1 chu" and abs(h["tu"] - 95.0) < 0.01 for h in hints), hints)
check("goi y: chu keo dai", any(h["kieu"].startswith("keo dai") for h in hints), hints)
check("compact_words", SC.compact_words(words[:2]) == "sợ@90.52 bị@91.04")
ch = []
cuts = SC.normalize_stutter_cuts([{"source_id": "s", "start": 91.52, "end": 92.84, "bo": "bị"},
                                  {"source_id": "s", "start": 40.0, "end": 49.0, "bo": "ca cau"},       # qua dai
                                  {"source_id": "x", "start": 1.0, "end": 1.5},                         # sai nguon
                                  {"source_id": "s", "start": 95.0, "end": 95.5, "bo": "cái"}], {"s": words}, ch)
check("kiem cat_vap: giu 2 cho hop le", [(c["start"], c["end"]) for c in cuts] == [(91.52, 92.84), (95.0, 95.5)], cuts)
plan = {"asr_words": {"s": [[w, a, b] for w, a, b in words]}, "source_videos": []}
seg = {"source_id": "s", "start": 90.4, "end": 96.0, "target_start": 0.0, "kind": "hook"}
out = SC.cut_stutters(plan, [seg], cuts, ch, label="hook")
check("cat 2 cho vap -> 3 manh, giu kind hook", len(out) == 3 and all(o.get("kind") == "hook" for o in out),
      [(o["start"], o["end"]) for o in out])
check("manh 1 het o dau 'bị' thu 2, manh 2 bat dau o 'rớt'", abs(out[0]["end"] - 91.52) < 0.02 and abs(out[1]["start"] - 92.84) < 0.02,
      [(o["start"], o["end"]) for o in out])
again = SC.cut_stutters(plan, out, cuts, [], label="hook")
check("cut_stutters chay lai khong doi", [(o["start"], o["end"]) for o in again] == [(o["start"], o["end"]) for o in out])

print("[4] chu hook hien dung luc noi")
asr = {"s": [[w, a, b] for w, a, b in words]}
c = {"text": "SỢ RỚT HỢP ĐỒNG", "anchor": "hook", "src_start": 87.6, "src_end": 96.0, "source_id": "s"}
wt = RP._bam_chu_whisper(c, asr, 0, [])
check("chu hook neo vao chu 'sợ' (khong tu dau hook)", wt and abs(c["src_start"] - 90.52) < 0.01, c)
c2 = {"text": "SỢ RỚT HỢP ĐỒNG", "src_start": 87.6, "src_end": 96.0, "source_id": "s"}
check("chu thuong lech > 0.8s van khong tin (giu luat cu)", RP._bam_chu_whisper(c2, asr, 0, []) is None)
lw = [("Nó", 88.24, 88.68), ("là", 88.68, 88.86), ("cái", 88.86, 89.06), ("rào", 89.06, 89.26), ("cản", 89.26, 89.72),
      ("về", 89.72, 89.88)]
toks = SC._norm("RÀO CẢN LỚN NHẤT")
m = SC._match(lw, toks, 87.6, 92.0, anchor=88.32)
check("lop 'RAO CAN LON NHAT' bam 'rào cản' (khop 2 chu dau)", m is not None and abs(lw[m[0]][1] - 89.06) < 0.01, m)
check("khong khop bua 1 chu", SC._match(lw, SC._norm("CẢN TRỞ LỚN NHẤT"), 87.6, 92.0, anchor=88.32) is None)

print("[5] nen canh shot + khong ke o")
cat = shot_lib.load()
bd = next((m for m in cat if m.get("backdrop") and m.get("kind") == "insert" and not m.get("images")
           and m.get("brand") != "required"), None)
check("co mau ho tro anh nen", bd is not None)
design = {"assets": [], "scenes": [{"layout": "graphic", "src_start": 1, "src_end": 5, "shot": {"id": bd["id"], "texts": {}}},
                                   {"layout": "graphic", "src_start": 20, "src_end": 25,
                                    "shot": {"id": bd["id"], "texts": {}, "bg_asset": "mine"}}]}
design["assets"].append({"id": "mine", "kind": "ai_image", "prompt": "x"})
n_add = shot_lib.ensure_backdrops(design, {"story_arc": "AI Agent cho doanh nghiep"})
check("tu khai anh nen cho canh chua co", n_add == 1 and design["scenes"][0]["shot"]["bg_asset"].startswith("shotbg_"), design)
check("anh nen R4 da khai -> gan role shot_bg", design["assets"][0].get("role") == "shot_bg")
bgp = next(a for a in design["assets"] if a["id"].startswith("shotbg_"))["prompt"]
check("prompt anh nen cam chu / luoi", "no text" in bgp.lower() or "absolutely no text" in bgp.lower(), bgp)
check("chay lai khong them nua", shot_lib.ensure_backdrops(design, {}) == 0)
import motion_design as MD
many = [{"id": "a%d" % i, "kind": "ai_image", "prompt": "p"} for i in range(8)] + \
       [{"id": "b%d" % i, "kind": "ai_image", "prompt": "p", "role": "shot_bg"} for i in range(7)]
na = MD.normalize_assets(many, [])
check("anh nen tinh tran rieng (6 minh hoa + %d nen)" % shot_lib.MAX_SHOT_BG,
      sum(1 for a in na if a.get("role") != "shot_bg") == MD.MAX_AI_IMAGES
      and sum(1 for a in na if a.get("role") == "shot_bg") == shot_lib.MAX_SHOT_BG, [a["id"] for a in na])
tmp = tempfile.mkdtemp()
png = os.path.join(tmp, "bg.png")
open(png, "wb").write(b"\x89PNG" + b"0" * 2000)
txt = {s["id"]: ("12" if s.get("role") == "number" else "Chữ") for s in bd.get("slots") or [] if not s.get("optional")}
for s in bd.get("slots") or []:
    if s.get("list") and s["id"] in txt:
        txt[s["id"]] = ["Chữ"] * int(s["list"].get("min") or 1)
sc = {"id": "scene0", "start": 0.0, "end": shot_lib.dur_range(bd)[0] + 0.5, "layout": "graphic"}
ok = shot_lib.spec_shot({"shot": {"id": bd["id"], "texts": txt, "bg_asset": "bg"}}, sc, {"source_videos": []},
                        {"bg": {"id": "bg", "kind": "ai_image", "path": png}}, [], {})
check("spec_shot: anh nen vao spec", ok and sc["shot"].get("backdrop") == png, sc)
bg = MD._bg({"colors": ["#111111", "#222222"], "pattern": "grid"}, {}, {})
check("nen code khong con ke o (pattern none)", bg.get("pattern") == "none", bg)

print()
if FAILED:
    print("FAIL %d: %s" % (len(FAILED), ", ".join(FAILED)))
    sys.exit(1)
print("OK — sua loi edit")
