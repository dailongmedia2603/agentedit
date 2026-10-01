#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""2026-10-01 (user): (1) MOI chu hien ra deu co tieng, khong con tran 16 SFX; (2) huy hieu co chu -> AI tao ANH ca
phan tu (graphic_art), khac chu anh AI; (4) huy hieu ve bang code khong con mau cam co dinh — mau theo video;
(5) giong noi qua nho -> nang vua nghe ro (voice_boost), giong chuan -> giu nguyen; (6) luat sang tao noi vao cac buoc.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_badge_voice.py      (can ffmpeg; OCR that can Vision macOS)
Khong goi AI: anh huy hieu gia lap bang PIL, giong noi gia lap bang ffmpeg.
"""
import copy
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import creative             # noqa: E402
import graphic_art          # noqa: E402
import motion_design as MD  # noqa: E402
import plan_guard           # noqa: E402
import prompt_store         # noqa: E402
import remotion_plan as RP  # noqa: E402
import speech_cut           # noqa: E402
import text_art             # noqa: E402
import voice_boost as VB    # noqa: E402

FAILED = []
TMP = tempfile.mkdtemp(prefix="badgevoice-")


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


def ff(*args):
    subprocess.run([RP._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


# ---------------------------------------------------------------------------
print("[1] Moi chu hien ra deu co tieng (khong tran so SFX)")
layers = [{"id": "t%d" % i, "type": "text", "start": 2.0 * i, "end": 2.0 * i + 1.5,
           "spans": [{"text": "CHU %d" % i, "size": 120}], "enter": {"preset": "pop"}} for i in range(40)]
layers += [{"id": "b1", "type": "badge", "start": 81.0, "end": 83.0, "label": "BƠI"},
           {"id": "c1", "type": "counter", "start": 85.0, "end": 87.0},
           {"id": "g1", "type": "text", "start": 81.05, "end": 83.0, "spans": [{"text": "cung nhip", "size": 60}]}]
caps = [{"text": "HERO", "role": "hero", "start": 90.0, "end": 91.0, "_n": 0},
        {"text": "phu de", "role": "support", "start": 92.0, "end": 93.0, "_n": 1},
        {"text": "Ten", "role": "micro", "start": 94.0, "end": 95.0, "_n": 2}]
have = [{"sfx_id": "x", "start": 10.05, "file": "/x.wav"}]          # tieng co san trung chu t5 (10.0s)
add = MD.ensure_text_sfx(layers, caps, have, 200.0, [])
starts = sorted([a["start"] for a in add] + [10.05])
covered = lambda t: any(t - MD.TEXT_SFX_EARLY <= s <= t + MD.TEXT_SFX_LATE for s in starts)  # noqa: E731
check("40 chu + huy hieu + bo dem + hero + micro deu co tieng (khong con tran 16)",
      all(covered(L["start"]) for L in layers) and covered(90.0) and covered(94.0), starts)
check("phu de (support) khong gan tieng", not covered(92.0), starts)
check("chu da co tieng trung luc -> khong gan them", not any(abs(a["start"] - 10.0) < 0.01 for a in add))
check("chu hien cung nhip (<=0.15s) dung chung 1 tieng", not any(abs(a["start"] - 81.05) < 0.01 for a in add))
# loi that: 'TOÁN' hien 0.36s sau 'BƠI', 0.29s truoc 'THI ĐUA' -> phai co tieng RIENG (khong an ke tieng THI ĐUA)
row = [{"id": n, "type": "badge", "start": t, "end": 5.0, "label": n} for n, t in (("BOI", 0.876), ("TOAN", 1.24), ("THI", 1.531))]
add2 = MD.ensure_text_sfx(row, [], [{"sfx_id": "kit-pop", "start": 0.876}, {"sfx_id": "kit-pop", "start": 1.531}], 10.0, [])
check("chu giua 2 chu co tieng van co tieng rieng", [a["_from_layer"] for a in add2] == ["TOAN"], add2)
fam = {a["_from_layer"]: a["sfx_id"] for a in add}
check("tieng hop chu: bo dem -> ding, huy hieu -> pop, chu nho -> click",
      fam.get("c1") == "kit-ding" and fam.get("b1") == "kit-pop" and fam.get("cap2") == "kit-click", fam)
check("tieng tu gan duoc danh dau la tieng cua chu", all(MD.is_text_sfx(a) and a.get("_auto_text") for a in add))
check("khong con hang so tran SFX_CAP_MOTION", not hasattr(MD, "SFX_CAP_MOTION"))

print("[1b] tran MAX_SFX cua B7 khong cat tieng cho chu (reveal)")
import engine  # noqa: E402
lib = {e["id"]: e for e in engine.sfx_list()}
kid = next(iter(k for k in lib if k.startswith("kit-")), None)
if kid:
    plan = {"audio": [{"sfx_id": kid, "purpose": "reveal", "src_time": i} for i in range(10)]
            + [{"sfx_id": kid, "purpose": "punch", "src_time": 50 + i} for i in range(10)]}
    engine.resolve_plan_sfx(plan)
    au = plan["audio"]
    check("10 tieng reveal giu du + tieng khac bi chan o MAX_SFX",
          sum(a["purpose"] == "reveal" for a in au) == 10 and sum(a["purpose"] == "punch" for a in au) == plan_guard.MAX_SFX,
          [(a["purpose"]) for a in au])

print("[1c] prompt B7 khong con '2-5 SFX'")
check("prompt B7 mac dinh khong con gioi han 2-5", "2-5" not in prompt_store.default_prompt("_AUDIO_SYSTEM"))

# ---------------------------------------------------------------------------
print("[2] Huy hieu co chu -> anh AI ca phan tu (graphic_art)")
R4 = [{"id": "b1", "group": "g_list", "type": "badge", "label": "BƠI", "src_start": 114.75, "source_id": "source_1",
       "why": "muc 1", "active": True},
      {"id": "b2", "group": "g_list", "type": "badge", "label": "TOÁN", "src_start": 115.1, "source_id": "source_1"},
      {"id": "b3", "group": "g_list", "type": "badge", "label": "THI ĐUA", "src_start": 117.3, "source_id": "source_1"},
      {"id": "b4", "group": "g_list", "type": "badge", "label": "BƠI"},                   # trung noi dung -> 1 muc
      {"id": "t1", "type": "text", "spans": [{"text": "KHONG PHAI HUY HIEU"}]}]
tr = {"source_1": [{"start": 114.5, "end": 116.0, "text": "con muon hoc boi"}]}
items = graphic_art.items_from(R4, tr)
check("chi lop badge, bo trung", [it["label"] for it in items] == ["BƠI", "TOÁN", "THI ĐUA"], items)
check("muc mang y nghia + loi noi luc hien", items[0]["y_nghia"] == "muc 1" and "boi" in items[0]["loi_noi"], items[0])
check("ca nhom ve CHUNG mot anh (mot bo dong nhat)", [len(g) for g in graphic_art._groups(items)] == [3])
pr = graphic_art.sheet_prompt(items, {"palette": {"primary": "#FFD23F"}, "mood": "tuoi sang"}, {"tone": "am ap"}, False, "/o.png")
check("prompt la PHAN TU DO HOA (khong chi chu), co du 3 phan tu + mau video",
      "PHAN TU DO HOA" in pr and pr.count("Phan tu ") >= 3 and "#FFD23F" in pr and "/o.png" in pr)
check("prompt khong ep mau cam / mau mac dinh", "cam" not in pr.lower().split("mau lay tu")[0][-40:])
check("prompt sua duoc trong menu (dang ky prompt_store, khoa rieng)",
      any(p["id"] == "_GRAPHIC_ART_PROMPT" and p.get("own_key") for p in prompt_store.PROMPTS))
pr2 = graphic_art.sheet_prompt(items, None, None, False, "/o.png", attempt=2)
check("lan tao lai co prompt khac (khong lay lai anh loi trong cache)", pr2 != pr and "LAN TAO LAI" in pr2)

try:
    from PIL import Image, ImageDraw, ImageFont
    FONT = next((f for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Unicode.ttf")
                 if os.path.isfile(f)), None)
except ImportError:
    Image = None
if Image is not None and FONT:
    img = Image.new("RGBA", (1024, 1536), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fnt = ImageFont.truetype(FONT, 110)
    for i, (it, cy) in enumerate(zip(items, (260, 768, 1276))):
        d.ellipse((312, cy - 200, 712, cy + 200), fill=(250, 220, 90, 255), outline=(60, 120, 230, 255), width=22)
        w = d.textlength(it["label"], font=fnt)
        d.text((512 - w / 2, cy - 62), it["label"], font=fnt, fill=(30, 30, 40, 255))
    sp = os.path.join(TMP, "gfx_sheet.png")
    img.save(sp)
    ok, bad = graphic_art.slice_sheet(sp, items)
    check("cat dung 3 phan tu tu 1 anh", len(ok) == 3, bad)
    if ok:
        k = items[2]["key"]
        check("phan tu giu hinh tron (khong bi cat ngang)", 0.8 <= ok[k]["w"] / ok[k]["h"] <= 1.25, ok[k])
        check("OCR doc ra dung chu (neu co Vision)", ok[k]["ocr_sim"] is None or ok[k]["ocr_sim"] >= graphic_art.OCR_MIN, ok[k])
    wrong = [dict(items[0], label="CHỮ KHÁC HẲN", key="zz")] + items[1:]
    ok2, bad2 = graphic_art.slice_sheet(sp, wrong)
    import vision_onnx
    if graphic_art._vision_ocr() or vision_onnx.ocr_ready():           # co OCR (Vision macOS / ONNX Windows)
        check("OCR sai chu -> phan tu do bi loai (ve bang code)", "zz" not in ok2, bad2)
        check("quet dai ngang khong nhan nham chu sai", graphic_art.read_text(
            text_art._rgba(sp)[1076:1476, 312:713], "CHỮ KHÁC HẲN")[1] < graphic_art.OCR_MIN)
    # dat vao lop badge
    plan = {"graphic_art": {"items": ok}}
    L = {"type": "badge", "label": "TOÁN", "w": 0.22}
    attached = MD._attach_graphic(L, graphic_art.lookup(plan), [], "b")
    check("lop badge nhan anh AI, than phan tu rong = be ngang thiet ke",
          attached and abs(L["art"][0]["w"] - 0.22 * 1080 * ok[items[1]["key"]]["w"] / ok[items[1]["key"]]["core_w"]) < 1.0, L)
    check("contains: chu nam trong OCR co them net trang tri", graphic_art.contains("~ THI DUA *", "THI ĐUA") == 1.0)
else:
    print("  (bo qua cat anh: thieu PIL / font)")

# ---------------------------------------------------------------------------
print("[4] Huy hieu ve bang code: mau theo video, khong mau cam co dinh")
kit = {"palette": {"primary": "#FFD23F", "accent": "#3FA9F5", "highlight": "#FF5A5F", "text": "#FFFFFF",
                   "bg_gradient": ["#FFF4D6", "#FFC75F"]}}
L = {"type": "badge", "label": "BƠI"}
MD.badge_colors(L, kit)
check("nen lay tu bg_gradient cua video", L["fillGradient"] == ["#FFF4D6", "#FFC75F"], L)
check("vien lay tu mau nhan cua video", L["strokeColor"] == "#3FA9F5", L)
lum = sum(MD._lum(MD._rgba(c)) for c in L["fillGradient"]) / 2
check("chu tuong phan voi nen (>= 4.5)", MD._contrast(MD._lum(MD._rgba(L["color"])), lum) >= 4.5, L)
L2 = {"type": "badge", "label": "X"}
MD.badge_colors(L2, {"palette": {"primary": "#1B5E20"}})
check("bang mau khac -> huy hieu khac mau", L2["fillGradient"] != L["fillGradient"] and L2["strokeColor"] != L["strokeColor"], L2)
L3 = {"type": "badge", "label": "X", "fill": "#000000", "strokeColor": "#FFFFFF"}
MD.badge_colors(L3, kit)
check("mau AI da khai thi giu; nen toi -> chu trang", L3["strokeColor"] == "#FFFFFF" and L3["color"] == "#FFFFFF" and "fillGradient" not in L3, L3)
tsx = open(os.path.join(ROOT, "remotion-src", "Layers.tsx"), encoding="utf-8").read()
blk = tsx[tsx.index("case 'badge'"):tsx.index("case 'counter'")]
check("Layers.tsx: khong con mau cam co dinh cua huy hieu",
      not any(c in blk for c in ("#F28B3C", "#E2601F", "#FFD2A8", "#FFF3E6", "255,140,50")), blk[:200])
check("Layers.tsx: huy hieu co anh AI -> ve anh", "L.art && L.art.length" in blk)

# ---------------------------------------------------------------------------
print("[5] Giong noi nho -> nang vua nghe ro; giong chuan -> giu nguyen")
g, why = VB.decide_one(-34.4, -22.4, None)
check("qua nho (-34.4) -> nang ~19.4 dB", abs(g - 19.4) < 0.05, (g, why))
g, why = VB.decide_one(-15.5, -3.0, None)
check("da chuan (-15.5) -> giu nguyen", g == 0.0, why)
g, why = VB.decide_one(-19.5, -10.0, None)
check("hoi nho 4.5 dB, Gemini nghe ro -> giu nguyen", g == 0.0, why)
g, why = VB.decide_one(-19.5, -10.0, {"muc_to": "hoi_nho", "nghe_ro": False})
check("hoi nho 4.5 dB + Gemini nghe khong ro -> nang", abs(g - 4.5) < 0.05, why)
g, why = VB.decide_one(-30.0, -4.0, None)
check("dinh tieng da cao -> chi nang toi muc khong ep dinh qua 6 dB", abs(g - (VB.PEAK_CEIL + VB.LIMIT_PUSH + 4.0)) < 0.05, (g, why))
g, _ = VB.decide_one(-60.0, -50.0, None)
check("nang toi da MAX_GAIN", g == VB.MAX_GAIN)
check("Gemini viet tieng Viet co dau van nhan", (VB.gemini_view({"giong_noi": {"muc_to": "Hơi nhỏ"}}) or {}).get("muc_to") == "hoi_nho")
check("prompt Gemini hieu nguon co yeu cau danh gia giong noi (ke ca prompt user sua)",
      "giong_noi" in __import__("providers")._source_prompt([{"id": "source_1"}]))

src = os.path.join(TMP, "quiet.mp4")
# giong gia: tieng noi nho (~ -31 LUFS; sine lavfi mac dinh bien do 1/8) 2s / lang 1s, xen ke
ff("-f", "lavfi", "-i", "testsrc=size=320x568:rate=30:duration=12", "-f", "lavfi",
   "-i", "sine=frequency=220:duration=12,volume='if(lt(mod(t,3),2),0.3,0)':eval=frame",
   "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", src)
tr = {"source_1": [{"start": 3.0 * k, "end": 3.0 * k + 2.0, "text": "cau %d" % k} for k in range(4)]}
svs = [{"id": "source_1", "path": src, "name": "quiet.mp4", "duration": 12.0}]
res = VB.assess([{"id": "source_1"}], svs, tr)
v = res["source_1"]
check("do + quyet dinh nang giong nho", v["gain_db"] >= 10 and v["do_lufs"] is not None, v)
plan = {"source_videos": copy.deepcopy(svs), "voice_boost": res,
        "segments": [{"source_id": "source_1", "start": 0.0, "end": 11.0, "target_start": 0.0}]}
p1 = VB.apply(copy.deepcopy(plan), [])
bp = p1["source_videos"][0]["path"]
check("ban lam viec giong da nang thay video phat tieng", bp != src and os.path.isfile(bp), p1["source_videos"])
check("do dac de cat van tren file goc (orig_path)", speech_cut._src_paths(p1)["source_1"] == src)
after = VB.measure_level(bp, VB.speech_ranges(tr["source_1"]))
check("giong sau khi nang ~ muc tieu", after is not None and abs(after - VB.TARGET_LUFS) <= 1.5, (v["do_lufs"], after))
check("muc nang = muc thieu (khong vuot tran)", abs(v["gain_db"] - (VB.TARGET_LUFS - v["do_lufs"])) < 0.15, v)
pk = VB.peak_p99(bp, VB.speech_ranges(tr["source_1"]))
check("dinh tieng khong vuot -1 dBFS (khong meo)", pk is not None and pk <= VB.PEAK_CEIL + 0.3, pk)
check("voice_level cong muc nang -> SFX can theo giong SAU khi nang",
      abs(speech_cut.voice_level(p1) - (speech_cut.voice_level(plan) + v["gain_db"])) < 0.15)
p2 = VB.apply(copy.deepcopy(p1), [])
check("ap dung lai (dung lai spec) khong nang chong 2 lan", p2["source_videos"][0]["path"] == bp, p2["source_videos"])
dur = lambda f: float(json.loads(subprocess.run([RP._ffbin("ffprobe"), "-v", "error", "-show_entries", "format=duration",  # noqa: E731
                                                 "-of", "json", f], capture_output=True, text=True).stdout)["format"]["duration"])
check("do dai giu nguyen (hinh copy, tieng khop)", abs(dur(bp) - dur(src)) < 0.05, (dur(bp), dur(src)))
ok_plan = {"source_videos": copy.deepcopy(svs), "voice_boost": {"source_1": {"gain_db": 0.0}}}
check("giong chuan -> khong tao ban moi", VB.apply(copy.deepcopy(ok_plan), [])["source_videos"][0]["path"] == src)

# ---------------------------------------------------------------------------
print("[6] Luat sang tao + cam xuc noi vao cac buoc thiet ke")
for b in ("B3", "R4", "R5", "FX", "B6", "B7"):
    check("luat sang tao co trong buoc %s" % b, "SANG TAO + CAM XUC" in creative.luat(b))
check("luat sang tao sua duoc trong menu", any(p["id"] == "_CREATIVE_RULE" for p in prompt_store.PROMPTS))

print()
if FAILED:
    print("FAIL %d: %s" % (len(FAILED), "; ".join(FAILED)))
    sys.exit(1)
print("TAT CA OK")
