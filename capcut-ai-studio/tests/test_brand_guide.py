#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BRAND GUIDELINE (2026-10-01): 5 truong (Typography, Mau sac, Ngon ngu do hoa, Phong cach hinh anh, Ngon ngu chuyen
dong) phai toi DUNG buoc AI can no + duoc ep bang code (font / ma mau) tren ban dung.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_brand_guide.py      (can flask + ffmpeg)
"""
import copy
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import brand_guide as BG   # noqa: E402
import server              # noqa: E402
import providers           # noqa: E402
import engine              # noqa: E402
import meme_lib            # noqa: E402
import media_vision        # noqa: E402
import motion_design       # noqa: E402
import remotion_plan       # noqa: E402
import text_art            # noqa: E402
import fx_flow             # noqa: E402
import asset_gen           # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


BRAND = {"typography": "Tiêu đề Montserrat in hoa đậm, nội dung SVN-Gilroy",
         "colors": "Màu chính #E4002B, phụ #FFC72C, nền trắng #FFFFFF, viền rgb(20, 20, 20)",
         "graphics": "khối bo góc lớn, nét mảnh, sticker tối giản",
         "imagery": "ảnh sản phẩm thật, ánh sáng tự nhiên, tông ấm",
         "motion": "chuyển động mượt, nhẹ nhàng, không rung lắc, không chớp"}

# ---------------------------------------------------------------------------
print("[1] Chuan hoa + truong nao toi buoc nao")
check("rong / toan khoang trang -> None", BG.normalize({"typography": "  ", "colors": ""}) is None and BG.normalize(None) is None)
n = BG.normalize({"typography": "  Montserrat   đậm ", "x": "bo"})
check("gon khoang trang, bo khoa la", n == {"typography": "Montserrat đậm"}, n)
want = {"plan": {"typography", "colors", "graphics", "imagery", "motion"},
        "captions": {"typography", "colors"},
        "text_art": {"typography", "colors", "graphics", "imagery"},
        "image": {"colors", "graphics", "imagery"},
        "fx": {"motion", "colors", "graphics"}}
for st, ks in want.items():
    v = BG.view(BRAND, st) or {}
    check("buoc %s nhan dung %s" % (st, sorted(ks)), set(k for k in v if k in BG.FIELDS) == ks, sorted(v))
check("buoc khong lien quan khong nhan gi (chi chuyen dong -> anh)", BG.view({"motion": "mem"}, "image") is None)
check("font trong danh muc theo thu tu nhac ten (tieu de truoc)", BG.fonts(BRAND) == ["montserrat", "gilroy"], BG.fonts(BRAND))
check("ten font khong dau / viet thuong / 'be vietnam pro'", BG.fonts({"typography": "dung be vietnam pro cho moi chu"}) ==
      ["be_vietnam_pro"])
check("khong nhac ten font nao -> rong", BG.fonts({"typography": "chữ in hoa, đậm"}) == [])
check("ma mau: #hex, #rgb, rgb() -> #RRGGBB, khong trung", BG.hexes(BRAND) == ["#E4002B", "#FFC72C", "#FFFFFF", "#141414"]
      and BG.hexes({"colors": "#fc0 va #FFCC00"}) == ["#FFCC00"], BG.hexes(BRAND))

print("\n[2] Dua mau ve he mau thuong hieu")
H = BG.hexes(BRAND)
check("mau noi khac he -> mau thuong hieu gan nhat", BG.snap("#00A0FF", H) in ("#E4002B", "#FFC72C") and BG.snap("#FF7A00", H) == "#FFC72C"
      and BG.snap("#C8102E", H) == "#C8102E", (BG.snap("#00A0FF", H), BG.snap("#FF7A00", H)))
check("sac do gan mau thuong hieu (dam / nhat hon chut) -> giu", BG.snap("#D00028", H) == "#D00028")
check("trung tinh (trang / den / xam vien chu) -> giu", BG.snap("#FFFFFF", H) == "#FFFFFF" and BG.snap("rgba(0,0,0,0.55)", H) == "rgba(0,0,0,0.55)")
check("giu alpha + kieu viet", BG.snap("rgba(0,160,255,0.4)", H).startswith("rgba(") and BG.snap("rgba(0,160,255,0.4)", H).endswith(",0.4)")
      and len(BG.snap("#00A0FF80", H)) == 9, (BG.snap("rgba(0,160,255,0.4)", H), BG.snap("#00A0FF80", H)))
check("khong phai ma mau -> giu", BG.snap("MIỄN PHÍ", H) == "MIỄN PHÍ" and BG.snap("#1 bán chạy", H) == "#1 bán chạy")
svg = '<svg><rect fill="#00A0FF"/><circle stroke="rgba(0,160,255,0.5)" fill="#fff"/></svg>'
s2 = BG.snap_svg(svg, H)
check("khung SVG hieu ung: mau noi -> thuong hieu, trang giu", "#00A0FF" not in s2 and 'fill="#fff"' in s2 and "rgba(" in s2, s2)

print("\n[3] Bo phong cach + plan")
kit = {"palette": {"primary": "#0A84FF", "highlight": "#34C759", "text": "#FFFFFF"}, "fonts": {"impact": "oswald"},
       "subtitle": {"font": "lexend"}, "broll_style": "flat vector"}
k2 = BG.apply_kit(kit, BRAND)
check("khong sua bo goc", kit["palette"]["primary"] == "#0A84FF" and kit["fonts"] == {"impact": "oswald"})
check("palette ve he mau thuong hieu (trang giu)", k2["palette"]["primary"] in H and k2["palette"]["highlight"] in H
      and k2["palette"]["text"] == "#FFFFFF" and all(c in H for c in k2["palette"]["bg_gradient"]), k2["palette"])
check("font theo vai + phu de = font thuong hieu", k2["fonts"]["impact"] == "montserrat" and k2["fonts"]["body"] == "gilroy"
      and k2["subtitle"]["font"] == "gilroy", (k2["fonts"], k2["subtitle"]))
check("kieu anh minh hoa = Phong cach hinh anh (giu ghi chu cu)", k2["broll_style"].startswith(BG.normalize(BRAND)["imagery"])
      and "flat vector" in k2["broll_style"], k2["broll_style"])
k3 = BG.apply_kit(k2, BRAND)
check("ap lai on dinh", k3 == k2, (k3, k2))
check("khong video mau / R4 khong dat style -> van co bo thuong hieu", BG.apply_kit(None, BRAND)["palette"]["primary"] == "#E4002B")
p = {"brand_guide": BRAND,
     "layers": [{"id": "a", "type": "text", "spans": [{"text": "#1 BÁN CHẠY", "font": "anton", "color": "#00A0FF",
                                                       "stroke": {"width": 3, "color": "#000000"}},
                                                      {"text": "chỉ hôm nay", "font": "lexend", "gradient": ["#7C3AED", "#00A0FF"]}],
                 "box": {"color": "rgba(0,160,255,0.6)"}},
                {"id": "b", "type": "text", "text": "TIẾT KIỆM"}],
     "scenes": [{"layout": "card", "bg": {"kind": "gradient", "colors": ["#123456", "#00FF88"]}}],
     "caption_theme": {"accent": "#00FF00"},
     "captions": [{"text": "xin chào", "role": "support", "font": "anton"}, {"text": "SALE", "role": "hero"}]}
ch = []
BG.enforce_plan(p, ch)
sp = p["layers"][0]["spans"]
check("font tieu de -> font thuong hieu dau, font noi dung -> font cuoi", sp[0]["font"] == "montserrat" and sp[1]["font"] == "gilroy",
      [s["font"] for s in sp])
check("lop chu khong khai font -> font thuong hieu", p["layers"][1].get("font") == "montserrat", p["layers"][1])
check("mau chu / gradient / khung -> he thuong hieu; vien den giu", sp[0]["color"] in H and all(c in H for c in sp[1]["gradient"])
      and p["layers"][0]["box"]["color"].startswith("rgba(") and sp[0]["stroke"]["color"] == "#000000", p["layers"][0])
check("noi dung chu KHONG bi dung toi", sp[0]["text"] == "#1 BÁN CHẠY" and p["captions"][0]["text"] == "xin chào")
check("nen scene: mau noi -> thuong hieu", all(c in H for c in p["scenes"][0]["bg"]["colors"]), p["scenes"][0])
check("phu de: theme font + accent thuong hieu, caption ghi de font -> font noi dung",
      p["caption_theme"]["font_hero"] == "montserrat" and p["caption_theme"]["font_body"] == "gilroy"
      and p["caption_theme"]["accent"] in H and p["captions"][0]["font"] == "gilroy", (p["caption_theme"], p["captions"]))
check("nhat ky ghi so mau / font da ep", any("brand guideline" in c for c in ch), ch)
p_again = copy.deepcopy(p)
BG.enforce_plan(p_again, [])
check("ep lai on dinh", p_again == p)
check("chi mo ta (khong ma mau, khong ten font) -> khong ep gi, chi qua prompt",
      (lambda q: (BG.enforce_plan(q, []), q)[1])({"brand_guide": {"colors": "đỏ đô sang trọng"},
                                                   "layers": [{"spans": [{"color": "#00A0FF"}]}]})["layers"][0]["spans"][0]["color"] == "#00A0FF")

print("\n[4] Prompt tung buoc: dung truong, khong co Brand Guideline thi y nhu cu")
SEEN = {}


def fake_chat(name, messages, **k):
    lab = k.get("step_label")
    SEEN[lab] = {"sys": next((m["content"] for m in messages if m["role"] == "system"), ""),
                 "user": json.loads(next((m["content"] for m in messages if m["role"] == "user"), "{}"))}
    return "{}"


providers._chat = fake_chat
fx_flow.gpt_fx_code([{"id": "e1", "kind": "overlay", "src_start": 0, "src_end": 1, "visual": "vong tron"}], brand=BRAND)
fc = SEEN["FX-code"]
check("FX-code: chuyen dong + mau + do hoa, KHONG typography / anh",
      "Ngon ngu chuyen dong" in fc["sys"] and "#E4002B" in fc["sys"] and "khối bo góc" in fc["sys"]
      and "Montserrat" not in fc["sys"] and "ánh sáng tự nhiên" not in fc["sys"]
      and set(k for k in fc["user"]["brand_guideline"] if k in BG.FIELDS) == {"motion", "colors", "graphics"}, fc["user"])
fx_flow.gpt_fx_code([{"id": "e1", "kind": "overlay", "src_start": 0, "src_end": 1, "visual": "vong tron"}])
check("FX-code khong Brand Guideline: khong co khoi brand", "BRAND GUIDELINE" not in SEEN["FX-code"]["sys"]
      and "brand_guideline" not in SEEN["FX-code"]["user"])
ctx = motion_design.asset_contexts({"assets": [{"id": "a1", "kind": "ai_image", "prompt": "x"}]}, brand=BRAND)
txt = asset_gen._context_text(ctx["a1"])
check("anh AI: mau + do hoa + phong cach anh (+ ma mau), KHONG font / chuyen dong",
      "ánh sáng tự nhiên" in txt and "khối bo góc" in txt and "#E4002B" in txt and "Montserrat" not in txt
      and "không rung" not in txt, txt)
check("anh AI khong Brand Guideline: boi canh y nhu cu",
      "thuong_hieu" not in motion_design.asset_contexts({"assets": [{"id": "a1", "kind": "ai_image", "prompt": "x"}]})["a1"])
lk = [{"key": "k", "tiers": [{"text": "SALE", "role": "chinh"}]}]
pr = text_art.sheet_prompt(lk, {}, {}, False, "/tmp/x.png", brand=BRAND)
check("chu anh AI: font + mau + do hoa + anh, KHONG chuyen dong; truoc dong 'Tao xong'",
      "Montserrat" in pr and "#E4002B" in pr and "khối bo góc" in pr and "ánh sáng tự nhiên" in pr and "không rung" not in pr
      and pr.index("BRAND GUIDELINE") < pr.index("Tao xong"), pr[-900:])
check("chu anh AI khong Brand Guideline: y nhu cu", text_art.sheet_prompt(lk, {}, {}, False, "/tmp/x.png") ==
      text_art.sheet_prompt(lk, {}, {}, False, "/tmp/x.png", brand=None) and "BRAND GUIDELINE" not in
      text_art.sheet_prompt(lk, {}, {}, False, "/tmp/x.png"))

# ---------------------------------------------------------------------------
print("\n[5] Ca luong /remotion/autoplan (AI gia) + ban dung")
TMP = tempfile.mkdtemp(prefix="brand-")
SRC = os.path.join(TMP, "a.mp4")
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=16",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=16", "-shortest",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", SRC], check=True)
TRANSCRIPT = [{"start": 0.0, "end": 2.0, "text": "Giam gia ba muoi phan tram", "is_punchline": True},
              {"start": 2.3, "end": 5.8, "text": "chi trong hom nay thoi nhe"},
              {"start": 8.0, "end": 10.5, "text": "mua ngay keo het hang"}]
BRIEF = {"source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 16.0}],
         "sources": [{"id": "source_1", "summary": "ban hang my pham", "transcript": TRANSCRIPT,
                      "emotion_map": [{"start": 0, "end": 6, "emotion": "punch", "intensity": "high"}],
                      "key_moments": [{"start": 0.0, "end": 2.0, "type": "hook"}], "faces_region": "giua-tren"}]}
DESIGN = {"concept": "sale", "style": {"mood": "tre trung", "palette": {"primary": "#0A84FF", "accent": "#7C3AED"},
                                       "fonts": {"impact": "anton", "body": "lexend"}, "image_style": "3d render"},
          "scenes": [{"layout": "card", "source_id": "source_1", "src_start": 8.0, "src_end": 10.0,
                      "bg": {"kind": "gradient", "colors": ["#0A84FF", "#7C3AED"]}}],
          "layers": [{"id": "so", "type": "text", "source_id": "source_1", "src_start": 0.3, "src_end": 2.0, "x": 0.5,
                      "y": 0.3, "spans": [{"text": "-30%", "font": "anton", "size": 110, "color": "#0A84FF"},
                                           {"text": "hôm nay", "font": "lexend", "size": 40, "color": "#7C3AED"}]}],
          "assets": [{"id": "img1", "kind": "ai_image", "prompt": "lipstick on table", "aspect": "1:1",
                      "illustrates": "san pham"}],
          "transitions": [], "effects": [], "grade": {"preset": "none", "intensity": 0}}
TRA_LOI = {
    "B1-select": {"story_arc": "sale", "tone": "vui", "selections": [
        {"source_id": "source_1", "start": 0.0, "end": 5.8, "beat": "hook"},
        {"source_id": "source_1", "start": 8.0, "end": 10.5, "beat": "cta"}]},
    "B2-timeline": {"segments": [{"source_id": "source_1", "start": 0.0, "end": 5.8, "target_start": 0.0},
                                 {"source_id": "source_1", "start": 8.0, "end": 10.5, "target_start": 5.8}], "duration": 8.3},
    "B3-hook": {"hook": None},
    "R4-design": DESIGN, "R4-design-fix": DESIGN,
    "R5-captions": {"captions": [{"text": "MUA NGAY", "role": "hero", "source_id": "source_1", "src_start": 8.0,
                                  "src_end": 10.0, "font": "bungee", "accent": "#00FF00"}],
                    "caption_theme": {"font_body": "lexend", "font_hero": "anton", "accent": "#00FF00"}},
    "B6-inserts": {"inserts": []}, "B7-audio": {"audio": []},
}
NHAN, SYS = {}, {}


def fake_chat2(name, messages, **k):
    lab = k.get("step_label")
    NHAN[lab] = json.loads(next((m["content"] for m in messages if m["role"] == "user"), "{}"))
    SYS[lab] = next((m["content"] for m in messages if m["role"] == "system"), "")
    return json.dumps(TRA_LOI.get(lab, {}), ensure_ascii=False)


providers._chat = fake_chat2
SHEETS, CTXS = [], []
text_art.gen_sheet = lambda lk, *a, **k: (SHEETS.append(k.get("brand")), None)[1]
_orig_resolve = motion_design.resolve_assets
motion_design.resolve_assets = lambda assets, sv, style="", log=None, contexts=None: (CTXS.append((style, contexts)), [])[1]
server._can_gio_loi_noi = lambda brief: brief
media_vision.face_box = lambda *a, **k: None
import sfx_kit  # noqa: E402
sfx_kit.ensure_kit()
engine.sfx_catalog_for_plan = lambda *a, **k: []
meme_lib.meme_catalog_for_plan = lambda *a, **k: []


def run(brand):
    NHAN.clear()
    SYS.clear()
    SHEETS.clear()
    CTXS.clear()
    body = {"brief": BRIEF, "fresh": True, "title": "t", "edit_request": {"purpose": "ban hang"}}
    if brand is not None:
        body["brand_guide"] = brand
    with server.app.test_client() as c:
        r = c.post("/remotion/autoplan", json=body)
    return r.status_code, r.get_json() or {}


code, d = run(BRAND)
check("autoplan co Brand Guideline chay xong", code == 200 and d.get("ok"), d.get("error"))
plan, spec = d.get("plan") or {}, d.get("spec") or {}
r4 = NHAN.get("R4-design") or {}
check("R4 (ke hoach): nhan ca 5 truong + luat trong system prompt",
      set(k for k in (r4.get("brand_guideline") or {}) if k in BG.FIELDS) == set(BG.FIELDS)
      and "BRAND GUIDELINE" in SYS.get("R4-design", "") and "montserrat" in SYS.get("R4-design", ""), r4.get("brand_guideline"))
r5 = NHAN.get("R5-captions") or {}
check("R5 (phu de theo loi noi): typography + mau, khong chuyen dong",
      set(k for k in (r5.get("brand_guideline") or {}) if k in BG.FIELDS) == {"typography", "colors"}
      and "không rung" not in SYS.get("R5-captions", ""), r5.get("brand_guideline"))
for lab in ("B1-select", "B2-timeline", "B3-hook", "B6-inserts", "B7-audio"):
    check("%s: KHONG nhan Brand Guideline (khong lien quan -> giu cache)" % lab,
          "brand_guideline" not in json.dumps(NHAN.get(lab) or {}) and "BRAND GUIDELINE" not in SYS.get(lab, ""))
fxp = [l for l in NHAN if l and l.endswith("FX-plan")]
check("hieu ung (FX-plan / Hook-FX-plan): chuyen dong + mau + do hoa",
      fxp and all(set(k for k in (NHAN[l].get("brand_guideline") or {}) if k in BG.FIELDS) == {"motion", "colors", "graphics"}
                  and "Ngon ngu chuyen dong" in SYS[l] for l in fxp), fxp)
check("anh AI: boi canh tung anh co Brand Guideline (mau / do hoa / anh) + kieu anh = Phong cach hinh anh",
      CTXS and (CTXS[0][1] or {}).get("img1", {}).get("thuong_hieu", {}).get("imagery") and
      CTXS[0][0].startswith(BG.normalize(BRAND)["imagery"]), CTXS)
check("chu anh AI: nhan Brand Guideline", SHEETS and all(b == BG.normalize(BRAND) for b in SHEETS), SHEETS)
check("plan luu brand_guide + bo phong cach theo thuong hieu",
      plan.get("brand_guide") == BG.normalize(BRAND) and (plan.get("style_kit") or {}).get("palette", {}).get("primary") in H
      and (plan.get("style_kit") or {}).get("fonts", {}).get("impact") == "montserrat", plan.get("style_kit"))
lay = [L for L in spec.get("layers") or [] if L.get("type") == "text"]
fonts_used = {s.get("font") or L.get("font") for L in lay for s in L.get("spans") or []}
check("ban dung: lop chu chi dung font thuong hieu", lay and fonts_used <= {"montserrat", "gilroy"}, fonts_used)
cols = [s.get("color") for L in lay for s in L.get("spans") or [] if s.get("color")]
check("ban dung: mau chu noi deu thuoc he thuong hieu", cols and all(BG.snap(c, H) == c for c in cols)
      and not any(c.upper().startswith(("#0A84FF", "#7C3AED")) for c in cols), cols)
caps = spec.get("captions") or []
check("ban dung: phu de / chu hero font + accent thuong hieu", caps and all(c["font"] in ("montserrat", "gilroy") for c in caps)
      and all(BG.snap(c["accent"], H) == c["accent"] for c in caps), [(c["font"], c["accent"]) for c in caps])
bgs = [c for sc in spec.get("scenes") or [] for c in ((sc.get("bg") or {}).get("colors") or [])]
check("ban dung: nen scene theo he thuong hieu", all(BG.snap(c, H) == c for c in bgs), bgs)
check("nhat ky / bao cao ghi da ep thuong hieu", any("brand guideline" in c for c in (d.get("guard") or {}).get("fixed") or []))

code0, d0 = run(None)
check("autoplan KHONG Brand Guideline chay xong", code0 == 200 and d0.get("ok"), d0.get("error"))
check("khong Brand Guideline: khong buoc nao co khoi brand (prompt + payload y nhu truoc)",
      all("BRAND GUIDELINE" not in SYS[l] and "brand_guideline" not in json.dumps(NHAN[l]) for l in SYS),
      [l for l in SYS if "BRAND GUIDELINE" in SYS[l]])
lay0 = [L for L in (d0.get("spec") or {}).get("layers") or [] if L.get("type") == "text"]
check("khong Brand Guideline: font / mau AI chon giu nguyen",
      any((s.get("font") or L.get("font")) == "anton" for L in lay0 for s in L.get("spans") or []), lay0)
motion_design.resolve_assets = _orig_resolve

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
