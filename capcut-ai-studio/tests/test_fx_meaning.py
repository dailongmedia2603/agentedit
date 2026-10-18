#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HIEU UNG CO Y NGHIA + DUNG CHO (2026-10-16, video Yen Phan: vong ve cat ngang mat trong hook, vong khoanh chu lech, mot y
'vong khep' lap 3 lan).

- fx_moments: ban sao hook la khoanh khac RIENG (h<n>) voi bo cuc / chu / lop cua chinh no; than video khong lan chu hook.
- sanitize_plan: hieu ung chon khoanh khac h<n> -> anchor hook; bat buoc "y_nghia".
- cover_check: net ve chay qua loi mat -> bo; vong bao NGOAI mat -> giu.
- drop_dup_motifs: hieu ung ve lai vong / mui ten ma lop R4 da ve cung khoanh khac -> bo.
- ring_targets: vong khoanh chu nham dung tu (target_text > tu trong ngoac cua why > tu gan tam vong).

Chay: HOME=$(mktemp -d) <venv_python> tests/test_fx_meaning.py      (khong goi AI)
"""
import os
import sys
import json
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import fx_flow              # noqa: E402
import motion_design as MD  # noqa: E402
import hook_rule            # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


segs = [{"source_id": "s", "start": 28.0, "end": 31.0, "target_start": 3.0},
        {"source_id": "s", "start": 31.0, "end": 35.0, "target_start": 6.0}]
tr = {"s": [{"start": 32.3, "end": 33.7, "text": "who care for others"}]}
design = {
    "scenes": [{"layout": "card", "anchor": "hook", "card_y": 0.52, "source_id": "s", "src_start": 30.5, "src_end": 33.7},
               {"layout": "full", "source_id": "s", "src_start": 28.0, "src_end": 35.0}],
    "layers": [{"id": "hl", "type": "text", "anchor": "hook", "source_id": "s", "src_start": 32.3, "src_end": 33.7,
                "x": 0.5, "y": 0.3, "spans": [{"text": "who care for others", "size": 90}]},
               {"id": "hr", "type": "ring", "anchor": "hook", "source_id": "s", "src_start": 33.0, "src_end": 33.7,
                "why": "ôm lấy 'others'"},
               {"id": "bl", "type": "text", "source_id": "s", "src_start": 32.3, "src_end": 33.7, "x": 0.5, "y": 0.72,
                "spans": [{"text": "who care for others", "size": 80}]}]}
hook = {"source_id": "s", "src_start": 30.5, "src_end": 33.7, "caption": "care"}
faces = {"s": {"cx": 0.5, "cy": 0.4, "w": 0.3, "h": 0.2}}

print("[1] khoanh khac hook rieng")
ms = fx_flow.fx_moments(segs, tr, {}, {}, design=design, captions=[], faces=faces, hook=hook)
hm = [m for m in ms if m.get("anchor") == "hook"]
bm = [m for m in ms if m.get("anchor") != "hook"]
check("co khoanh khac h<n> cho ban sao hook", hm and all(m["id"].startswith("h") for m in hm), [m["id"] for m in ms])
h_txt = [c["text"] for m in hm for c in m.get("chu_tren_man_hinh") or []]
b_txt = [(m["id"], c.get("vung")) for m in bm for c in m.get("chu_tren_man_hinh") or []]
check("hook: bo cuc card + chu cua ban sao hook (y ~0.3)", any(m["bo_cuc"] == ["card"] for m in hm)
      and any(abs((c.get("vung") or [0, 0, 0, 0])[1] - 0.3) < 0.1 for m in hm for c in m.get("chu_tren_man_hinh") or []),
      hm)
check("than video: KHONG lan chu cua hook (chi chu y ~0.72)", b_txt and all(v and v[1] > 0.6 for _i, v in b_txt), b_txt)
check("hook card: mat_nguoi la ghi chu 'ctx.face' (khong toa do nguon)",
      all(isinstance(m.get("mat_nguoi"), str) and "ctx.face" in m["mat_nguoi"] for m in hm), [m.get("mat_nguoi") for m in hm])
check("than video full: mat_nguoi la toa do", any(isinstance(m.get("mat_nguoi"), dict) for m in bm))
check("hook thay lop hinh dang co (vong R4)", any(m.get("lop_hinh_dang_co") for m in hm), hm)
check("luat hook FX chi lay khoanh khac ban sao", all(m.get("anchor") == "hook"
                                                      for m in hook_rule.hook_moments_fx(ms, {"anchor": "hook"})))

print("\n[2] sanitize: anchor theo khoanh khac + bat buoc y_nghia")
base = {"kind": "overlay", "source_id": "s", "src_start": 32.3, "src_end": 33.7, "context": "x" * 20, "goal": "y" * 20,
        "why_fit": "z" * 20, "visual": "net cong mem ben canh khoi chu"}
ch = []
out = fx_flow.sanitize_plan({"effects": [dict(base, id="a", moment=hm[0]["id"], y_nghia="lam ro y cham soc quay ve"),
                                         dict(base, id="b", moment="m2", anchor="hook", y_nghia="lam ro y cham soc quay ve"),
                                         dict(base, id="c", moment="m2")]}, ms, ch)
ids = {e["id"]: e for e in out}
check("chon h<n> -> anchor hook", ids.get("a", {}).get("anchor") == "hook", out)
check("anchor hook nhung chon m2 -> doi sang khoanh khac hook", ids.get("b", {}).get("moment", "").startswith("h"), out)
check("thieu y_nghia -> bo", "c" not in ids and any("y_nghia" in c for c in ch), ch)
av = fx_flow._avoid_from_moments(ids["a"], ms, 1080, 1920)
check("vung ne cua hieu ung hook = chu cua hook", av and all(b["y"] < 0.5 * 1920 for b in av), av)

print("\n[3] net ve qua mat")
W, H = 1080, 1920
face = {"x": 540, "y": 1300, "w": 300, "h": 360}


def frames_file(svg):
    fd, p = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    with open(p, "w") as f:
        json.dump({"frames": [svg], "idx": [0] * 30, "fps": 30}, f)
    return p


line = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><path d="M300 1250 C 500 1350 700 1250 900 1320" ' \
       'stroke="#C8714E" stroke-width="3.5" fill="none"/></svg>'
ring = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><ellipse cx="540" cy="1300" rx="210" ry="250" ' \
       'stroke="#C8714E" stroke-width="4" fill="none"/></svg>'
r_line = fx_flow.cover_check(frames_file(line), face, W, H)
r_ring = fx_flow.cover_check(frames_file(ring), face, W, H)
if r_line is None and r_ring is None and not hook_rule._raster(ring, 54, 96) is not None:
    print("  (bo qua: may khong raster duoc SVG)")
else:
    check("net 3.5px cat ngang mat -> bo (%s)" % r_line, r_line and "qua mat" in r_line, r_line)
    check("vong bao NGOAI mat -> giu", r_ring is None, r_ring)

print("\n[4] mot y mot lan")
fx = [dict(base, id="v", anchor="hook", visual="mot vong hat dau om quanh chu others"),
      dict(base, id="t", anchor="hook", kind="transform", visual="day cham"),
      dict(base, id="p", anchor="hook", visual="hat bui nhe bay quanh khung"),
      dict(base, id="vb", visual="mot vong om quanh chu others")]
ch = []
kept = [e["id"] for e in fx_flow.drop_dup_motifs(fx, design["layers"], ch)]
check("vong trung lop vong R4 cung khoanh khac (hook) -> bo", "v" not in kept, (kept, ch))
check("than video (khong co vong R4 o than) -> giu", "vb" in kept, kept)
check("transform / hieu ung khac y -> giu", "t" in kept and "p" in kept, kept)
check("khong vong (phu dinh) khong tinh", "x" in [e["id"] for e in fx_flow.drop_dup_motifs(
    [dict(base, id="x", anchor="hook", visual="khong ve vong, chi hat sang nhe")], design["layers"], [])])

print("\n[5] vong khoanh chu nham dung tu")
T = {"id": "t1", "type": "text", "start": 0.0, "end": 3.0, "x": 0.5, "y": 0.3, "group": "g",
     "spans": [{"text": "who care for", "size": 90}, {"text": "others,", "size": 90}]}
R1 = {"id": "r1", "type": "ring", "start": 2.0, "end": 3.0, "x": 0.75, "y": 0.3, "w": 0.24, "group": "g", "_i": 0}
R2 = {"id": "r2", "type": "ring", "start": 2.0, "end": 3.0, "x": 0.1, "y": 0.9, "w": 0.2, "_i": 1}
R3 = {"id": "r3", "type": "ring", "start": 2.0, "end": 3.0, "x": 0.3, "y": 0.3, "w": 0.2, "_i": 2}
ch = []
MD.ring_targets([T, R1, R2, R3], [{"why": "ôm lấy 'others'"}, {"why": "khoanh mat"}, {"target_text": "care"}], ch)
check("why co 'others' -> khoanh 'others,'", R1.get("target") == {"layer": "t1", "text": "others,"}, R1)
check("vong xa chu (quanh vat) -> khong gan", "target" not in R2, R2)
check("target_text uu tien", R3.get("target") == {"layer": "t1", "text": "care"}, R3)
R4 = {"id": "r4", "type": "ring", "start": 2.0, "end": 3.0, "x": 0.68, "y": 0.3, "w": 0.24, "_i": 0}
MD.ring_targets([T, R4], [{"why": "nhan manh"}], [])
check("khong ghi tu -> chon tu gan tam vong nhat", (R4.get("target") or {}).get("text") == "others,", R4)

print("\n[6] luat R4: vong khoanh chu ghi target_text")
import creative             # noqa: E402
check("luat R4 co target_text", "target_text" in creative.luat("R4"))

print("\n%d loi" % len(FAILED) if FAILED else "\nTAT CA OK")
sys.exit(1 if FAILED else 0)
