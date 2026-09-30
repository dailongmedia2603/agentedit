#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CHU ANH AI (2026-09-27): gom cum chu noi bat -> tam chu (nen trong suot) -> cat tung tang +
vi tri tung tu + kiem chinh ta OCR -> dat vao lop chu luc dung. KHONG ap cho phu de karaoke.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_text_art.py      (can ffmpeg; OCR can Vision macOS)
Tam chu gia lap bang ffmpeg drawtext (khong goi AI).
"""
import os
import sys
import json
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import text_art             # noqa: E402
import motion_design as MD  # noqa: E402
import remotion_plan as RP  # noqa: E402
import prompt_store         # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


FONT = next((f for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Unicode.ttf")
             if os.path.isfile(f)), None)
TMP = tempfile.mkdtemp(prefix="txtart-")


def sheet(rows, path, opaque=False):
    """Tam chu gia: moi hang mot dong chu, cach xa nhau, nen trong suot (hoac nen den neu opaque)."""
    bg = "color=c=black:s=1024x1536" if opaque else "color=c=black@0.0:s=1024x1536,format=rgba"
    parts = []
    for i, (txt, size) in enumerate(rows):
        y = 140 + i * int(1300 / max(1, len(rows)))
        safe = txt.replace(":", r"\:").replace("'", r"\'")
        parts.append("drawtext=fontfile='%s':text='%s':fontsize=%d:fontcolor=white:borderw=6:bordercolor=black:"
                     "x=(w-text_w)/2:y=%d" % (FONT, safe, size, y))
    subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-y", "-f", "lavfi", "-i", bg, "-vf", ",".join(parts),
                    "-frames:v", "1", path], check=True)
    return path


print("[1] Gom cum chu noi bat — to hop nhieu lop cung group = MOT cum, phan cap dung")
layers = [
    {"type": "text", "group": "g1", "y": 0.37, "spans": [{"text": "trên chính", "size": 58, "font": "great_vibes"}]},
    {"type": "text", "group": "g1", "y": 0.44, "spans": [{"text": "TÀI KHOẢN", "size": 110}, {"text": "CỦA MÌNH", "size": 110}]},
    {"type": "text", "y": 0.6, "spans": [{"text": "KHÓA NICK 🔒", "size": 150}]},
    {"type": "text", "reveal": "dim_to_bright", "spans": [{"text": "thẻ trích dẫn dài", "size": 50}]},
    {"type": "text", "spans": [{"text": "một câu rất rất dài vượt quá giới hạn số ký tự cho phép của chữ ảnh", "size": 60}]},
    {"type": "counter", "to": 100},
]
caps = [{"role": "support", "text": "phụ đề karaoke không đụng"}, {"role": "hero", "text": "3 TRIỆU"}]
lk = text_art.lockups_from(layers, caps, "LẤY GÌ CAM KẾT?")
tiers = [[(t["role"], t["text"]) for t in x["tiers"]] for x in lk]
check("group g1 -> 1 cum: phu 'trên chính' + chinh 'TÀI KHOẢN CỦA MÌNH'",
      [("phu", "trên chính"), ("chinh", "TÀI KHOẢN CỦA MÌNH")] in tiers, tiers)
check("bo emoji trong chu", [("chinh", "KHÓA NICK")] in tiers, tiers)
check("khong lay the trich dan / chu qua dai / bo dem", not any("trích" in t or "giới hạn" in t for x in tiers for _, t in x), tiers)
check("lay chu hero + chu hook, KHONG lay phu de karaoke",
      [("chinh", "3 TRIỆU")] in tiers and [("chinh", "LẤY GÌ CAM KẾT?")] in tiers and not any("karaoke" in t for x in tiers for _, t in x), tiers)

print("\n[2] Cat tam chu: tung hang, kiem chinh ta OCR, vi tri tung tu")
lk2 = [{"key": "a", "tiers": [{"text": "trên chính", "role": "phu", "size": 60}, {"text": "TÀI KHOẢN CỦA MÌNH", "role": "chinh", "size": 110}]},
       {"key": "b", "tiers": [{"text": "KHÓA NICK", "role": "chinh", "size": 150}]}]
text_art.ART_DIR = os.path.join(TMP, "art")
p1 = sheet([("trên chính", 70), ("TÀI KHOẢN CỦA MÌNH", 90), ("KHÓA NICK", 130)], os.path.join(TMP, "s1.png"))
ok, bad = text_art.slice_sheet(p1, lk2)
check("cat dat ca 2 cum", set(ok) == {"a", "b"} and not bad, (list(ok), bad))
if "a" in ok:
    t0, t1 = ok["a"]["tiers"]
    check("manh anh ton tai + kich thuoc", os.path.isfile(t0["file"]) and t1["w"] > t0["w"] and t1["core_h"] > 20, (t0, t1))
    check("OCR doc dung (gan dung)", t1.get("ocr_sim") is None or t1["ocr_sim"] >= text_art.OCR_MIN, t1.get("ocr"))
    check("vi tri tung tu khi dem dung so tu", len(t1.get("words") or []) == 4 and all(0 <= a < b <= 1 for a, b in t1["words"]),
          t1.get("words"))
p2 = sheet([("trên chính", 70), ("TÀI KHOẢN CỦA MÌNH", 90)], os.path.join(TMP, "s2.png"))
ok2, bad2 = text_art.slice_sheet(p2, lk2)
check("thieu hang -> ca tam loi (khong gan nham chu)", not ok2 and bad2, (ok2, bad2))
p3 = sheet([("trên chính", 70), ("TÀI KHOẢN CỦA MÌNH", 90), ("KHÓA NICK", 130)], os.path.join(TMP, "s3.png"), opaque=True)
ok3, bad3 = text_art.slice_sheet(p3, lk2)
check("anh khong trong suot -> loi", not ok3 and any("trong suot" in r for _, r in bad3), bad3)
p4 = sheet([("trên chính", 70), ("SAI CHỮ HOÀN TOÀN", 90), ("KHÓA NICK", 130)], os.path.join(TMP, "s4.png"))
ok4, bad4 = text_art.slice_sheet(p4, lk2)
check("sai chinh ta (OCR khac chu goc) -> cum do loi, cum dung van dat", "a" not in ok4 and "b" in ok4, (list(ok4), bad4))

print("\n[3] Dieu phoi: tam dau lam mau phong cach, tao lai cum loi 1 lan, van loi -> chu code")
calls = []


def fake_gen(sheet_lk, style, story, ref=None, log=None, timeout=480):
    calls.append(([x["key"] for x in sheet_lk], ref))
    rows = []
    for x in sheet_lk:
        for t in x["tiers"]:
            rows.append(("SAI CHỮ HOÀN TOÀN" if x["key"] == "hong" else t["text"], 80 if t["role"] == "phu" else 110))
    return sheet(rows, os.path.join(TMP, "g%d.png" % len(calls)))


text_art.gen_sheet = fake_gen
lk3 = [{"key": "k%d" % i, "tiers": [{"text": "CHỮ SỐ %d" % i, "role": "chinh", "size": 120}]} for i in range(4)] + \
      [{"key": "hong", "tiers": [{"text": "UY TÍN", "role": "chinh", "size": 120}]}]
res = text_art.make_text_art(lk3, style={"mood": "x"}, story={})
check("4 cum dat, 1 cum hong", len(res["items"]) == 4 and [f["key"] for f in res["failed"]] == ["hong"], res["failed"])
check("tam dau tao KHONG mau, cac tam sau dung tam dau lam mau", calls[0][1] is None and all(c[1] for c in calls[1:]), calls)
check("cum hong duoc tao lai 1 lan", sum(1 for c in calls if "hong" in c[0]) == 2, calls)

print("\n[4] Dung: lop chu -> tang anh theo co chu da tinh; chu hero -> lop chu anh; phu de karaoke giu nguyen")
arts = {"items": {"a": ok["a"], "b": ok["b"]}} if "a" in ok and "b" in ok else {"items": {}}
lookup = MD.art_index({"text_art": arts})
L = {"id": "L1", "type": "text", "x": 0.5, "y": 0.44, "spans": [{"text": "TÀI KHOẢN", "size": 110}, {"text": "CỦA MÌNH", "size": 110}]}
check("lop chu khop tang -> co art", MD._attach_art(L, lookup, [], "L1") and len(L["art"]) == 1, L.get("art"))
if L.get("art"):
    a = L["art"][0]
    tier = ok["a"]["tiers"][1]
    core_w = a["w"] * tier["core_w"] / tier["w"]
    want = min(0.94 * 1080 * tier["core_w"] / tier["w"], MD._text_width({"spans": L["spans"]}) * 1080)
    check("be ngang chu anh = be ngang chu thiet ke (hoac vua 94% khung)", abs(core_w - want) / want < 0.03, (core_w, want))
    check("khong con khoa tam", all("_pad" not in x for x in L["art"]), L["art"])
    check("kich thuoc khoi = kich thuoc anh (ne mat / phu de dung)", abs(MD._text_height(L) * 1920 - a["h"]) < 1.5)
L2 = {"id": "L2", "type": "text", "x": 0.5, "y": 0.3, "spans": [{"text": "CHỮ KHÁC", "size": 110}]}
check("dong khong co anh -> giu chu code", not MD._attach_art(L2, lookup, [], "L2") and "art" not in L2)
spec = {"width": 1080, "height": 1920, "layers": [], "clips": [], "scenes": [], "captions": [
    {"role": "hero", "text": "KHÓA NICK", "start": 1, "end": 2, "y": -0.4, "size": 120},
    {"role": "support", "text": "khóa nick", "start": 1, "end": 2, "y": 0.5, "size": 48}]}
MD.hero_captions_to_art(spec, {"text_art": arts}, [])
check("chu hero -> lop chu anh, bo caption hero", len(spec["layers"]) == 1 and spec["layers"][0].get("art")
      and [c["role"] for c in spec["captions"]] == ["support"], (spec["layers"], spec["captions"]))
check("phu de karaoke khong bi doi thanh anh", spec["captions"][0]["text"] == "khóa nick")

print("\n[5] Prompt dang ky")
check("_TEXT_ART_PROMPT dang ky", "_TEXT_ART_PROMPT" in {x["id"] for x in prompt_store.PROMPTS})
pr = text_art.sheet_prompt(lk2, {"mood": "cong nghe"}, {"story_arc": "x"}, True, "/tmp/o.png")
check("prompt: nen trong suot + dung chinh ta + tung hang + mau phong cach", all(k in pr for k in (
    "TRONG SUOT", "CHINH XAC", '"TÀI KHOẢN CỦA MÌNH"', "ANH DINH KEM", "/tmp/o.png")), pr[:200])

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
