#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""QUY TAC CHU (user 2026-09-27) — code tu ep, khong goi AI:
 1 khong icon emoji tho · 2 thu tu doc = thu tu loi noi · 3 chu ro net tren nen that · 4 anh AI dung boi canh
 5 chu sau nguoi khong bi che nhieu · 6 chu de len nhau co lop tach · 7 phan cap thi giac
 + khoa cache tinh ca prompt mac dinh.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_text_rules.py      (can ffmpeg + numpy)
"""
import os
import sys
import copy
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import numpy as np          # noqa: E402
import motion_design as MD  # noqa: E402
import media_vision         # noqa: E402
import remotion_plan as RP  # noqa: E402
import asset_gen            # noqa: E402
import prompt_store         # noqa: E402
import providers            # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


KIT = {}                      # khong co bo phong cach mac dinh (2026-09-27) — quy tac chu chay khong can kit
TMP = tempfile.mkdtemp(prefix="text-rules-")


def video(name, color):
    path = os.path.join(TMP, name)
    subprocess.run([RP._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=%s:size=270x480:rate=30:duration=4" % color, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    path], check=True)
    return path


print("[1] Khong icon emoji tho")
ch = []
L = {"id": "a", "type": "text", "x": 0.5, "y": 0.5,
     "spans": [{"text": "KHÓA NICK 🔒", "size": 150}, {"text": "🔥", "size": 80, "newline": True}]}
check("text_rules giu lop", MD.text_rules(L, KIT, ch))
check("bo emoji trong chu + span chi co emoji", [s["text"] for s in L["spans"]] == ["KHÓA NICK"], L["spans"])
L2 = {"id": "b", "type": "text", "x": 0.5, "y": 0.5, "spans": [{"text": "✅❌", "size": 90}]}
check("lop chi co emoji -> bo", MD.text_rules(L2, KIT, []) is False)
check("strip_emoji giu nguyen tieng Viet", MD.strip_emoji("Giảm tỷ lệ chết nick ✨") == "Giảm tỷ lệ chết nick")
check("DSL khong con loai emoji / emoji_pop duoc de xuat", "`emoji` (`emoji`, `size`)" not in MD.dsl_doc()
      and "`film_grain` · `emoji_pop`" not in MD.dsl_doc())
check("danh muc Remotion khong con emoji_pop", "emoji_pop" not in RP._by_id("effects"))
check("prompt R4 cam emoji", "KHONG ICON THO" in MD._RM_DESIGN_SYSTEM)

print("\n[2] Thu tu doc = thu tu loi noi")
ASR = {"source_1": [["Dùng", 40.0, 40.3], ["tool", 40.3, 40.6], ["rất", 42.0, 42.2], ["dễ", 42.2, 42.4],
                    ["bị", 42.4, 42.6], ["khóa", 42.7, 43.0], ["nick", 43.0, 43.3], ["giảm", 60.0, 60.3],
                    ["tỷ", 60.3, 60.5], ["lệ", 60.5, 60.7], ["chết", 60.8, 61.1], ["nick", 61.1, 61.4]]}
p = {"asr_words": ASR, "layers": [
    # 1 lop 2 span: AI dat 'KHOA NICK' tren 'rat de bi' (sai)
    {"type": "text", "source_id": "source_1", "src_start": 42.6, "src_end": 44.5, "x": 0.5, "y": 0.3,
     "spans": [{"text": "KHÓA NICK", "size": 160}, {"text": "rất dễ bị", "size": 80, "newline": True, "dy": -0.1}]},
    # 2 lop cung group: 'CHET NICK' (behind) y 0.25, 'giam ty le' y 0.36 (sai)
    {"type": "text", "group": "g2", "source_id": "source_1", "src_start": 60.7, "src_end": 62.5, "x": 0.5, "y": 0.25,
     "behind_subject": True, "spans": [{"text": "CHẾT NICK", "size": 200}]},
    {"type": "text", "group": "g2", "source_id": "source_1", "src_start": 60.7, "src_end": 62.5, "x": 0.5, "y": 0.36,
     "spans": [{"text": "giảm tỷ lệ", "size": 90}]},
]}
ch = []
MD.reading_order(p, ch)
sp = p["layers"][0]["spans"]
check("span noi truoc len dau", [s["text"] for s in sp] == ["rất dễ bị", "KHÓA NICK"], sp)
check("newline dung vi tri", not sp[0].get("newline") and sp[1].get("newline") is True, sp)
check("dy giu theo vi tri dong (dong 2 van chong -0.1)", sp[1].get("dy") == -0.1 and "dy" not in sp[0], sp)
a, b = p["layers"][1], p["layers"][2]
check("group: 'giam ty le' (noi truoc) nam TREN 'CHET NICK'", b["y"] < a["y"], (a["y"], b["y"]))
check("ghi nhat ky", any("thu tu doc" in c or "tren->duoi" in c for c in ch), ch)
p2 = copy.deepcopy(p)
MD.reading_order(p2, [])
check("chay lai khong doi (on dinh)", p2["layers"] == p["layers"])
p3 = {"asr_words": ASR, "layers": [
    {"type": "text", "source_id": "source_1", "src_start": 42.0, "src_end": 44.0, "x": 0.5, "y": 0.5,
     "spans": [{"text": "rất dễ bị", "size": 80}, {"text": "KHÓA NICK", "size": 160, "newline": True}]}]}
before = copy.deepcopy(p3)
MD.reading_order(p3, [])
check("da dung thu tu -> khong dong vao", p3 == before)

print("\n[7] Phan cap thi giac")
ch = []
L = {"id": "h", "type": "text", "x": 0.5, "y": 0.5, "font": "anton", "spans": [
    {"text": "ĐĂNG BÀI TỰ ĐỘNG", "font": "anton", "size": 120},
    {"text": "mọi tác vụ", "font": "montserrat", "size": 110, "newline": True},
    {"text": "ngay", "font": "great_vibes", "size": 60}]}
MD.text_rules(L, KIT, ch)
s0, s1, s2 = L["spans"]
check("tang phu khac font canh tranh -> nho ro (<= 75%)", s1["size"] <= 0.75 * s0["size"], (s0["size"], s1["size"]))
check("<= 2 font / to hop", len({s.get("font") for s in L["spans"]}) <= 2, [s.get("font") for s in L["spans"]])
L = {"id": "q", "type": "text", "x": 0.5, "y": 0.5, "spans": [
    {"text": "khác", "font": "great_vibes", "size": 100}, {"text": "NHƯ THẾ NÀO?", "font": "barlow_condensed", "size": 96, "newline": True}]}
MD.text_rules(L, KIT, [])
check("tang chinh = chu in dam (khong phai chu viet tay to hon)", L["spans"][1]["size"] >= 96 and L["spans"][0]["size"] <= 100, L["spans"])
L = {"id": "t", "type": "text", "x": 0.5, "y": 0.5, "box": {"color": "rgba(35,26,24,.92)"}, "spans": [
    {"text": "VẬN HÀNH", "font": "barlow_condensed", "size": 64, "color": "#FF8A00"},
    {"text": "KINH DOANH", "font": "barlow_condensed", "size": 64, "color": "#FFFFFF"}]}
MD.text_rules(L, KIT, [])
check("cung font khac mau cung co (nhan mau) -> giu nguyen", [s["size"] for s in L["spans"]] == [64, 64], L["spans"])
L = {"id": "m", "type": "text", "x": 0.5, "y": 0.5, "spans": [{"text": "a", "size": 50, "font": "anton"},
                                                         {"text": "b", "size": 30, "font": "great_vibes", "newline": True}]}
MD.text_rules(L, KIT, [])
check("to hop 2 font: tang chinh >= 84px, phu >= 40px", L["spans"][0]["size"] >= 84 and L["spans"][1]["size"] >= 40, L["spans"])
L = {"id": "w", "type": "text", "x": 0.5, "y": 0.5, "spans": [{"text": "CHỮ RẤT RẤT DÀI TRÀN KHUNG", "size": 200}]}
MD.text_rules(L, KIT, [])
check("chu tran khung -> thu vua 94%", MD._text_width(L) <= 0.95, MD._text_width(L))

print("\n[3a] Chu dac, glow vua phai")
ch = []
L = {"id": "o", "type": "text", "x": 0.5, "y": 0.5, "spans": [
    {"text": "BROWSER SKILL", "size": 150, "color": "rgba(255,255,255,0)", "stroke": {"color": "#FFFFFF", "width": 3}}]}
MD.text_rules(L, KIT, ch)
check("chu vien rong -> to dac", MD._rgba(L["spans"][0]["color"])[3] == 1.0, L["spans"][0])
L = {"id": "g", "type": "text", "x": 0.5, "y": 0.5,
     "spans": [{"text": "KHÓA NICK", "size": 150, "color": "#FF2A2A", "glow": {"color": "#FF1A1A", "size": 80}}]}
MD.text_rules(L, KIT, ch)
check("glow <= 30% co chu", L["spans"][0]["glow"]["size"] <= 45, L["spans"][0]["glow"])

print("\n[6] Chu de len nhau -> lop tach ro")
ch = []
L = {"id": "ov", "type": "text", "x": 0.5, "y": 0.5, "spans": [
    {"text": "ĐĂNG BÀI TỰ ĐỘNG", "font": "anton", "size": 130, "color": "#FFFFFF"},
    {"text": "& mọi tác vụ khác", "font": "great_vibes", "size": 70, "color": "#FFFFFF", "newline": True, "dy": -0.6}]}
MD.text_rules(L, KIT, ch)
up = L["spans"][1]
check("do chong gioi han 0.3em", up["dy"] == -0.3, up)
check("cung mau -> doi mau tang tren", up["color"].upper() != "#FFFFFF", up)
check("tang tren co vien tach day", up.get("stroke") and up["stroke"]["width"] >= 3, up)
A = {"id": "A", "type": "text", "start": 1, "end": 3, "track": 20, "x": 0.5, "y": 0.4,
     "spans": [{"text": "KHÓA NICK", "size": 160, "color": "#FFFFFF"}]}
B = {"id": "B", "type": "text", "start": 1, "end": 3, "track": 30, "x": 0.5, "y": 0.42,
     "spans": [{"text": "rất dễ bị", "size": 80, "color": "#FFFFFF"}]}
ch = []
MD.separate_group_overlaps({"layers": [A, B]}, KIT, ch)
check("2 lop chong nhau: lop tren doi mau + vien", B["spans"][0]["color"].upper() != "#FFFFFF" and B["spans"][0].get("stroke"),
      B["spans"][0])
check("chong qua nhieu -> tach ra bot", any("tach" in c for c in ch), ch)

L = {"id": "rp", "type": "text", "x": 0.5, "y": 0.5, "spans": [
    {"text": "một cái", "font": "great_vibes", "size": 70, "color": "#FFFFFF"},
    {"text": "REPO GITHUB", "font": "barlow_condensed", "size": 110, "color": "#FFFFFF", "newline": True, "dy": -0.2}]}
MD.text_rules(L, KIT, [])
check("cung mau chong nhau -> doi mau TANG PHU (nho), giu mau tang chinh",
      L["spans"][1]["color"] == "#FFFFFF" and L["spans"][0]["color"] != "#FFFFFF", L["spans"])
X = {"id": "X", "group": "uytin", "type": "text", "start": 1.0, "end": 4.0, "track": 20, "x": 0.5, "y": 0.3,
     "spans": [{"text": "UY TÍN", "size": 160}]}
X2 = {"id": "X2", "group": "uytin", "type": "text", "start": 1.0, "end": 4.0, "track": 20, "x": 0.5, "y": 0.2,
      "spans": [{"text": "tăng", "size": 80, "font": "great_vibes"}]}
Y = {"id": "Y", "group": "chet", "type": "text", "start": 2.5, "end": 5.0, "track": 20, "x": 0.5, "y": 0.32,
     "spans": [{"text": "giảm tỷ lệ", "size": 90}]}
ch = []
MD.separate_group_overlaps({"layers": [X, X2, Y]}, KIT, ch)
check("khac to hop chong nhau -> khoi truoc tat khi khoi sau hien (ca to hop)", X["end"] <= 2.6 and X2["end"] <= 2.6, (X, X2))
check("khoi sau giu nguyen mau", "color" not in Y["spans"][0], Y["spans"][0])

print("\n[3b] Chu ro tren NEN THAT (do do sang khung video)")
bright = video("bright.mp4", "0xE8D8C0")        # nen go sang (nhu anh 'KHOA NICK')
dark = video("dark.mp4", "0x101014")
for path, name in ((bright, "sang"), (dark, "toi")):
    spec = {"width": 1080, "height": 1920, "scenes": [],
            "clips": [{"start": 0, "end": 4, "srcStart": 0, "speed": 1, "path": path}],
            "layers": [{"id": "r", "type": "text", "start": 0.5, "end": 2.5, "x": 0.5, "y": 0.3,
                        "spans": [{"text": "KHÓA NICK", "size": 150, "color": "#FF2A2A", "font": "anton"}]},
                       {"id": "w", "type": "text", "start": 0.5, "end": 2.5, "x": 0.5, "y": 0.6,
                        "spans": [{"text": "trình duyệt", "size": 90, "color": "#FFFFFF"}]}]}
    ch = []
    MD.ensure_legible(spec, KIT, ch)
    r, w = spec["layers"]
    if name == "sang":
        check("nen sang: chu do -> vien toi", r["spans"][0].get("stroke", {}).get("color") == MD.DARK_SEP, r["spans"][0])
        check("nen sang: chu trang -> vien toi + bong", w["spans"][0].get("stroke") and w.get("shadow"), w)
    else:
        check("nen toi: chu trang tuong phan du -> khong them vien", not w["spans"][0].get("stroke"), w["spans"][0])
        check("nen gan den: chu do tuong phan 5.1 (>= 4.5) -> doc duoc, khong can vien", not r["spans"][0].get("stroke"),
              r["spans"][0])
spec = {"width": 1080, "height": 1920, "scenes": [], "clips": [],
        "layers": [{"id": "bx", "type": "text", "start": 0, "end": 2, "x": 0.5, "y": 0.5,
                    "box": {"color": "rgba(245,240,230,0.95)"}, "spans": [{"text": "trích dẫn", "size": 50, "color": "#FFFFFF"}]}]}
MD.ensure_legible(spec, KIT, [])
check("chu trang tren hop nen sang -> doi mau toi", spec["layers"][0]["spans"][0]["color"] == "#1B1412",
      spec["layers"][0]["spans"][0])
spec = {"width": 1080, "height": 1920, "scenes": [], "clips": [],
        "layers": [{"id": "u", "type": "text", "start": 0, "end": 2, "x": 0.5, "y": 0.5,
                    "spans": [{"text": "không đo được nền", "size": 80, "color": "#FFFFFF"}]}]}
MD.ensure_legible(spec, KIT, [])
check("khong do duoc nen -> van them vien + bong (an toan)", spec["layers"][0]["spans"][0].get("stroke")
      and spec["layers"][0].get("shadow"))

print("\n[5] Chu sau nguoi khong bi che nhieu (mat na tach nguoi gia)")
H, W = 480, 270
mask = np.zeros((H, W), dtype=bool)
top = int(0.22 * H)
mask[top:, int(0.3 * W):int(0.7 * W)] = True                 # dau + nguoi: cot giua tu y 0.22 xuong
media_vision.matte_mask = lambda path, t, down=4: mask
media_vision.matte_head = lambda path, t: {"top": 0.22, "cx": 0.5, "w": 0.4}
clip = {"start": 0, "end": 5, "srcStart": 0, "speed": 1, "path": "x"}
matte = {"path": "m", "srcStart": 0}
hero = {"id": "hero", "type": "text", "group": "g", "behind": True, "start": 1, "end": 3, "x": 0.5, "y": 0.25,
        "spans": [{"text": "CHẾT NICK", "size": 200}]}
sub = {"id": "sub", "type": "text", "group": "g", "start": 1, "end": 3, "x": 0.5, "y": 0.34,
       "spans": [{"text": "giảm tỷ lệ", "size": 90}]}
spec = {"width": 1080, "height": 1920, "layers": [hero, sub]}
c0 = MD._cover(mask, MD._bbox(hero))
ch = []
MD._behind_clear([hero], clip, matte, spec, ch)
c1 = MD._cover(mask, MD._bbox(hero))
check("truoc: bi che nhieu", c0[0] > MD.BEHIND_MAX_COVER or c0[1] > MD.BEHIND_MAX_COVER_TOP, c0)
check("sau: che <= 22%% va nua tren <= 10%%", c1[0] <= MD.BEHIND_MAX_COVER and c1[1] <= MD.BEHIND_MAX_COVER_TOP, c1)
check("tang phu cung to hop di theo", abs((sub["y"] - hero["y"]) - (0.34 - 0.25)) < 0.02 or "thu nho" in " ".join(ch),
      (hero["y"], sub["y"], ch))
face = (0.5 - 0.24, 0.23, 0.5 + 0.24, 0.22 + 0.4 * 1.35 * 1080 / 1920)
sb = MD._bbox(sub)
check("tang phu khong de len mat", not (sb[1] < face[3] and sb[3] > face[1]), (sb, face))
# nguoi che gan het khung -> khong the doc duoc sau nguoi -> dua ra truoc
full = np.zeros((H, W), dtype=bool)
full[int(0.05 * H):, :] = True
media_vision.matte_mask = lambda path, t, down=4: full
media_vision.matte_head = lambda path, t: {"top": 0.3, "cx": 0.5, "w": 0.5}
h2 = {"id": "h2", "type": "text", "behind": True, "start": 1, "end": 3, "x": 0.5, "y": 0.35,
      "spans": [{"text": "SAU NGƯỜI", "size": 200}]}
ch = []
MD._behind_clear([h2], clip, matte, {"width": 1080, "height": 1920, "layers": [h2]}, ch)
check("khong cho nao doc duoc -> chu ra TRUOC nguoi", not h2.get("behind") and any("TRUOC" in c for c in ch), (h2, ch))
check("... va nam tren dau", MD._bbox(h2)[3] <= 0.3, MD._bbox(h2))

print("\n[5b] Toa do khung hinh <-> khung nguon co jump-cut zoom (khop AutoEdit.tsx)")
clipz = {"srcW": 1080, "srcH": 1920, "scale": 1.3, "x": 0, "y": 0, "face": {"cx": 0.5, "cy": 0.5}}
to_c, to_s, kw = MD.clip_map(clipz)
cx, cy = to_c(0.5, 0.25)
check("zoom 1.3: dinh dau nguon y 0.25 -> khung hinh 0.175", abs(cy - 0.175) < 1e-6 and abs(cx - 0.5) < 1e-6, (cx, cy))
sx, sy = to_s(*to_c(0.31, 0.62))
check("quy doi 2 chieu khop nhau", abs(sx - 0.31) < 1e-9 and abs(sy - 0.62) < 1e-9, (sx, sy))
check("be ngang nguon -> khung hinh nhan 1.3", abs(kw - 1.3) < 1e-9, kw)
check("mat to theo zoom khi ne mat", abs(MD._zoom_at({"segments": [{"target_start": 0, "start": 5, "end": 9, "scale": 1.2}]}, 2.0) - 1.2) < 1e-9)
L = {"id": "sc", "type": "text", "x": 0.5, "y": 0.5, "spans": [{"text": "rất dễ bị", "font": "great_vibes", "size": 50}]}
MD.text_rules(L, KIT, [])
check("chu viet tay qua nho -> du co nhin thay", L["spans"][0]["size"] * MD.SCRIPT_VIS >= MD.MIN_VIS_PX - 0.1, L["spans"])

print("\n[8] Phu de loi noi KHONG chong / sat chu noi bat")
hero = {"id": "tk", "type": "text", "start": 1.0, "end": 3.0, "x": 0.5, "y": 0.44,
        "spans": [{"text": "TÀI KHOẢN", "size": 110, "font": "barlow_condensed"},
                  {"text": "CỦA MÌNH", "size": 110, "font": "barlow_condensed", "newline": True}]}
cap = {"role": "support", "start": 1.2, "end": 2.8, "y": 0.043, "size": 66, "text": "bằng chính tài khoản của mình"}
spec = {"width": 1080, "height": 1920, "layers": [hero], "captions": [dict(cap)], "clips": [], "scenes": []}
ch = []
MD.dodge_subtitles(spec, ch)
c = spec["captions"][0]
cy, h2 = (c["y"] + 1) / 2, MD._caption_half(c)
y0, y1 = MD._layer_band(hero)
gap = max(y0 - (cy + h2), (cy - h2) - y1)
check("phu de 2 dong cach chu noi bat 2 dong >= 4%% khung", gap >= MD.SUB_GAP - 1e-6, (gap, c["y"]))
check("uoc chieu cao phu de dung so dong (66px, 29 ky tu -> 2 dong)", MD._caption_half(cap) * 2 * 1920 > 66 * 2.4, MD._caption_half(cap))
check("chieu cao lop chu co maxWidth tinh them dong tu xuong",
      MD._text_height({"maxWidth": 0.4, "spans": [{"text": "MỘT CÂU RẤT DÀI CẦN XUỐNG DÒNG", "size": 100}]}) >
      MD._text_height({"spans": [{"text": "MỘT CÂU RẤT DÀI CẦN XUỐNG DÒNG", "size": 100}]}) * 1.8)
full = [dict(hero, id="h%d" % k, y=0.12 + k * 0.12) for k in range(6)]
spec = {"width": 1080, "height": 1920, "layers": full, "captions": [dict(cap, start=0.5, end=3.5)], "clips": [], "scenes": []}
ch = []
MD.dodge_subtitles(spec, ch)
caps = spec["captions"]
check("khong con cho trong -> chi hien phu de NGOAI luc chu noi bat hien",
      all(x["end"] <= 1.0 + 1e-6 or x["start"] >= 3.0 - 1e-6 for x in caps) and any("chi hien ngoai" in m or "an trong" in m for m in ch),
      (caps, ch))
spec = {"width": 1080, "height": 1920, "layers": [dict(hero, replacesSubtitle=True)], "captions": [dict(cap)], "clips": [], "scenes": []}
MD.dodge_subtitles(spec, [])
check("lop chu thay phu de (replacesSubtitle) -> phu de da tu an, khong doi cho", spec["captions"][0]["y"] == cap["y"])

print("\n[4] Anh AI dung boi canh")
design = {"assets": [{"id": "post", "kind": "ai_image", "prompt": "laptop showing a social feed", "illustrates": "dang bai"}],
          "scenes": [{"layout": "split", "source_id": "source_1", "src_start": 83.6, "src_end": 89.2,
                      "panel": {"asset": "post"}}],
          "layers": [{"type": "text", "source_id": "source_1", "src_start": 84.0, "src_end": 86.0,
                      "spans": [{"text": "ĐĂNG BÀI TỰ ĐỘNG"}]}]}
tr = {"source_1": [{"start": 83.66, "end": 89.22, "text": "đăng bài lên Facebook, fanpage và nhóm"},
                   {"start": 95.0, "end": 97.0, "text": "câu khác không liên quan"}]}
ctx = MD.asset_contexts(design, tr, {"story_arc": "Browser Skill giúp đăng bài không bị khóa nick", "tone": "chia sẻ"})["post"]
check("boi canh co cau dang noi", "fanpage" in ctx.get("loi_noi", "") and "không liên quan" not in ctx.get("loi_noi", ""), ctx)
check("boi canh co vai tro (nua tren)", "nua TREN" in ctx.get("vai_tro", ""), ctx)
check("boi canh co chu hien cung luc", "ĐĂNG BÀI TỰ ĐỘNG" in ctx.get("chu_tren_anh", ""), ctx)
full_prompt = asset_gen.build_prompt("laptop showing a social feed", "3:4", "photoreal", False, ctx, "/tmp/x.png")
check("prompt tao anh gom mo ta + boi canh + yeu cau", all(k in full_prompt for k in (
    "laptop showing a social feed", "fanpage", "DUNG NOI DUNG", "KHONG co chu", "/tmp/x.png")), full_prompt[:300])
k1 = asset_gen._key("p", "3:4", "s", False, ctx)
k2 = asset_gen._key("p", "3:4", "s", False, dict(ctx, loi_noi="khac"))
check("boi canh khac -> tao anh moi (khoa bo nho dem khac)", k1 != k2)
check("prompt R4 yeu cau prompt anh 7 phan + illustrates", "7 phan" in MD._RM_DESIGN_SYSTEM and "illustrates" in MD._RM_DESIGN_SYSTEM)
check("prompt tao anh dang ky trong menu", "_ASSET_IMAGE_PROMPT" in {x["id"] for x in prompt_store.PROMPTS})

print("\n[+] Khoa cache tinh ca prompt MAC DINH")
f1 = prompt_store.fingerprint()
old = providers._SELECT_SYSTEM
providers._SELECT_SYSTEM = old + "\nthay doi mac dinh"
f2 = prompt_store.fingerprint()
providers._SELECT_SYSTEM = old
check("doi prompt mac dinh -> van tay doi (buoc chay lai that)", f1 != f2 and prompt_store.fingerprint() == f1)

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
