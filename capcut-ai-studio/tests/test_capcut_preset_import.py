#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test bo chuyen preset CapCut -> mau chu (sidecar/capcut_preset_import.py), khong can CapCut.

Chay: HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_capcut_preset_import.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sidecar"))
import capcut_preset_import as imp  # noqa: E402

ok = 0


def check(name, cond):
    global ok
    if not cond:
        raise SystemExit("FAIL " + name)
    ok += 1
    print("  ok ", name)


print("[1] doc bang Lua kieu LumiExportData")
src = """
local data = {}
local ae_attribute = {
    ["LumiMotionBlur3D_40-effect0"] = {
        ["rotation_y"] = -30,
        ["pivot"] = Amaz.Vector3f(0.5, 0.5, 0),
        ["mirrorEdge"] = false,
    },
    ["LumiLayer_1297-trs-blend"] = { ["opacity"] = 100, ["blendMode"] = "Normal", },
    ["LumiMotionBlur2D_27-effect0"] = { ["scale_x"] = 1, ["position"] = Amaz.Vector2f(0.5, 0.5), },
}
local ae_keyframes = {
    ["LumiLayer_27-trs-matte#opacity#number"] =
{
	{
		{0.33, 0, 0.25, 1, },
		{0, 0.933333, },
		{{0, }, {100, }, },
		{6417, },
		{0, },
	},
},
}
local ae_sliderInfos = {
    ['effects_adjust_rotate'] = {
        {'LumiMotionBlur3D_40-effect0', 'rotation_y', 'number', {true, }, 1, 2, -2, 1, {0, }, {0, }, },
    },
    ['effects_adjust_texture'] = {
        {'LumiLayer_1297-trs-blend', 'opacity', 'number', {true, }, 1, 1, 0, 1, {0, }, {0, }, },
    },
    ['effects_adjust_size'] = {
        {'LumiMotionBlur2D_27-effect0', 'scale_x', 'number', {true, }, 1, 3.5, 0.3, 1, {0, }, {0, }, },
    },
    ['effects_adjust_vertical_shift'] = {
        {'LumiMotionBlur2D_27-effect0', 'position', 'vector', {false, true, }, 1, 2, -1, 1, {0, 1, }, {0, 1, }, },
    },
}
local ae_animationInfos = { animationMode = 1, speedInfo = {1, 0.5, 2, }, }
"""
import re  # noqa: E402

lumi = {}
for m in re.finditer(r"local\s+(ae_\w+)\s*=\s*", src):
    p = imp._LuaParser(src)
    p.i = m.end()
    lumi[m.group(1)] = p.value()
check("Vector3f -> list", lumi["ae_attribute"]["LumiMotionBlur3D_40-effect0"]["pivot"] == [0.5, 0.5, 0.0])
check("bool / chuoi", lumi["ae_attribute"]["LumiMotionBlur3D_40-effect0"]["mirrorEdge"] is False
      and lumi["ae_attribute"]["LumiLayer_1297-trs-blend"]["blendMode"] == "Normal")
check("bang khoa ten (animationInfos)", lumi["ae_animationInfos"]["animationMode"] == 1
      and lumi["ae_animationInfos"]["speedInfo"] == [1, 0.5, 2])
k = imp._keys(lumi, "LumiLayer_27-trs-matte#opacity#number")
check("keyframe AE", k == [[[0.33, 0, 0.25, 1], [0, 0.933333], [[0], [100]], [6417], [0]]])

print("[2] thanh truot (LumiParamsSetter:updateSlider) — so lieu that cua 'May phat nhac 3'")
after = imp._slider_apply(lumi, {"effects_adjust_rotate": 0.5, "effects_adjust_texture": 0.0,
                                 "effects_adjust_size": 0.21875, "effects_adjust_vertical_shift": 0.6666667})
check("xoay 3D 0.5 -> 0 do", abs(after[("LumiMotionBlur3D_40-effect0", "rotation_y")]) < 1e-9)
check("texture 0 -> lop may phat nhac tat", after[("LumiLayer_1297-trs-blend", "opacity")] == 0)
check("size 0.219 -> scale ~1", abs(after[("LumiMotionBlur2D_27-effect0", "scale_x")] - 1.0) < 1e-6)
pos = after[("LumiMotionBlur2D_27-effect0", "position")]
check("dich doc 0.667 -> giu 0.5", abs(pos[0] - 0.5) < 1e-9 and abs(pos[1] - 0.5) < 1e-6)

print("[3] keyframe chu + transform")
seg = {"clip": {"transform": {"x": -0.037, "y": -0.1005}, "scale": {"x": 1.33, "y": 1.33}, "rotation": 0},
       "common_keyframes": [{"property_type": "KFTypeGlobalAlpha",
                             "keyframe_list": [{"time_offset": 0, "values": [0.0], "curveType": "Line"},
                                               {"time_offset": 433334, "values": [1.0], "curveType": "Line"}]}]}
check("transform", imp._transform(seg) == {"x": -0.037, "y": -0.1005, "scale": 1.33, "rotation": 0.0})
check("keyframe alpha", imp._cc_keys(seg) == {"alpha": [[0.0, 0.0], [0.433334, 1.0]]})
bad = {"common_keyframes": [{"property_type": "KFTypeGlobalAlpha",
                             "keyframe_list": [{"time_offset": 0, "values": [0.0], "curveType": "Bezier"}]}]}
try:
    imp._cc_keys(bad)
    check("cong keyframe la -> bao loi", False)
except ValueError:
    check("cong keyframe la -> bao loi ro rang", True)
check("mau hex", imp._rgb("#beffff") == [190 / 255, 1.0, 1.0])

print("[4] keyframe cong (FreeCurve) -> tay nam bezier")
seg2 = {"common_keyframes": [{"property_type": "KFTypeScaleX", "keyframe_list": [
    {"time_offset": 0, "values": [1.0], "curveType": "FreeCurveIn", "left_control": {"x": 0, "y": 0}, "right_control": {"x": 520000, "y": -0.15}},
    {"time_offset": 2033333, "values": [0.8], "curveType": "FreeCurveOut", "left_control": {"x": -338000, "y": 0}, "right_control": {"x": 0, "y": 0}}]}]}
k2 = imp._cc_keys(seg2)["scale"]
check("moc 1 co tay phai (giay)", k2[0] == [0.0, 1.0, 0.0, 0.0, 0.52, -0.15])
check("moc 2 co tay trai", k2[1][:4] == [2.033333, 0.8, -0.338, 0.0])

print("[5] hoat anh Transform.lua (Mo dan)")
import tempfile  # noqa: E402
d = tempfile.mkdtemp()
open(os.path.join(d, "Transform.lua"), "w").write("""
local function funcEaseAction4(t, b, c, d)
    t = t/d
    local controls = {0, 0, 1, 1}
    return b
end
function Transform.new(construct, ...)
    local self = setmetatable({}, Transform)
    self.actions =
    {
        { startPosition = Amaz.Vector3f(0.0, 0.0, 0.0), endPosition = Amaz.Vector3f(0.0, 0.0, 0.0), actionFunction = funcEaseAction1, startTime = 0.0, endTime = 1.0 },
        { startAlpha = 1.0, endAlpha = 0.0, actionFunction = funcEaseAction4, startTime = 0.0, endTime = 1.0 },
        { blurIntensity = 0.0, blurType = 0, blurDirection = Amaz.Vector2f(1, 0), actionFunction = Amaz.Ease.linear, startTime = 0.0, endTime = 1.0 },
    }
    return self
end
""")
an = imp._transform_anim({"path": d, "name": "Mo dan", "start": 600000, "duration": 333333}, 2.0)
check("Mo dan: alpha 1 -> 0, tuyen tinh", an["alpha"] == [1.0, 0.0] and an["easeAlpha"] == [0.0, 0.0, 1.0, 1.0])
check("Mo dan: moc thoi gian", abs(an["start"] - 0.6) < 1e-9 and abs(an["duration"] - 0.333333) < 1e-9)

print("[6] clip video thuong (LE VIP2-01): mask 'Van ban' -> o chu to bang khung video, .mov alpha -> chuoi khung")
import json as _json  # noqa: E402
import shutil as _sh  # noqa: E402
import subprocess as _sp  # noqa: E402
FONT = next((f for f in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf",
                         "/System/Library/Fonts/Helvetica.ttc"] if os.path.exists(f)), None)
if not FONT or not _sh.which("ffmpeg"):
    print("  (bo qua: thieu font he thong / ffmpeg)")
else:
    root = tempfile.mkdtemp()
    nen = os.path.join(root, "nen.mp4")
    quet = os.path.join(root, "quet.mov")
    _sp.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=108x192:r=30:d=2", "-f", "lavfi", "-i",
             "anullsrc=r=44100:cl=stereo", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", nen], check=True)
    from PIL import Image as _Im
    box = _Im.new("RGBA", (192, 192), (0, 0, 0, 0))
    box.paste((255, 0, 0, 255), (40, 60, 70, 70))
    box.save(os.path.join(root, "box.png"))
    _sp.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-r", "30", "-i", os.path.join(root, "box.png"), "-t", "2",
             "-pix_fmt", "argb", "-c:v", "qtrle", quet], check=True)
    US_ = 1_000_000

    def seg(sid, mid, start, dur, refs=(), vol=1.0, kf=None, src=0):
        return {"id": sid, "material_id": mid, "target_timerange": {"start": int(start * US_), "duration": int(dur * US_)},
                "source_timerange": {"start": int(src * US_), "duration": int(dur * US_)}, "volume": vol,
                "clip": {"alpha": 1.0, "rotation": 0.0, "scale": {"x": 1.0, "y": 1.0}, "transform": {"x": 0.0, "y": 0.0}},
                "extra_material_refs": list(refs), "common_keyframes": kf or []}
    vid = lambda i, path, w, h, audio: {"id": i, "type": "video", "path": path, "width": w, "height": h, "has_audio": audio,  # noqa: E731
                                        "material_name": os.path.basename(path), "crop": {}}
    inner = {"canvas_config": {"width": 1080, "height": 1920}, "duration": 2 * US_, "materials": {
        "videos": [vid("V1", nen, 1080, 1920, True), vid("V2", quet, 1920, 1920, False)],
        "speeds": [{"id": "SP", "speed": 1.1}],
        "common_mask": [{"id": "MK", "resource_type": "text", "name": "Van ban",
                         "config": {"centerX": 0.0, "centerY": 0.0, "feather": 0.0, "invert": False, "rotation": 0.0},
                         "text_config": {"content": "THAY ĐỔI", "font_path": FONT, "scale": 165.107, "bold_width": 1.0}}],
        "audios": [{"id": "A1", "name": "Clip ghep47", "path": ""}]},
        "tracks": [{"type": "video", "segments": [seg("S1", "V1", 0.2, 1.5, ["MK"], kf=[{"property_type": "KFTypeAlpha", "keyframe_list": [
                        {"time_offset": 0, "values": [0.0], "curveType": "Line"}, {"time_offset": 33333, "values": [1.0], "curveType": "Line"}]}])]},
                   {"type": "video", "segments": [seg("S2", "V2", 0.1, 1.8, ["SP"])]},
                   {"type": "audio", "segments": [seg("S3", "A1", 0.3, 0.5)]}]}
    outer = {"materials": {"drafts": [{"id": "D1", "draft": inner}], "videos": [{"id": "OV", "type": "video"}]},
             "tracks": [{"type": "video", "segments": [seg("S0", "OV", 0, 1.0, ["D1"], vol=2.0)]}]}
    pdir = os.path.join(root, "LE TEST - 01")
    os.makedirs(os.path.join(pdir, "preset_draft"))
    _json.dump(outer, open(os.path.join(pdir, "preset_draft", "draft_content.json"), "w"))
    sp = imp.import_preset(pdir, os.path.join(root, "out"))
    kids = sp["root"]["children"]
    mask_txt = kids[0]["children"][0]
    check("mask chu -> o chu (slot) mang khung video", mask_txt["type"] == "text" and mask_txt["fillFrames"]["ext"] == "jpg"
          and sp["slots"][0]["sample"] == "THAY ĐỔI")
    check("mask chu: co chu theo em = 0.8655 x scale, lam dam", abs(mask_txt["emPx"] - 0.8655 * 165.107) < 1e-6 and mask_txt["bold"] > 0)
    check("keyframe nhap nhay nam o group clip", kids[0]["keyframes"]["alpha"][1] == [0.033333, 1.0])
    fr = kids[1]["children"][0]
    check(".mov alpha -> chuoi PNG, toc do 1.1, cat sat vung co hinh",
          fr["type"] == "frames" and fr["seq"]["ext"] == "png" and fr["seq"]["speed"] == 1.1 and fr["seq"]["rect"][2] < 1080)
    # chi trich khung trong do dai mau (1.0s): (1.0 - 0.1) * 1.1 * 30 ~ 30 khung, khong phai ca 2s
    check("chi trich khung thuc su hien", fr["seq"]["count"] <= 32)
    check("khung lam tron (offset +0.5)", abs(fr["seq"]["offset"] - 0.5) < 1e-9)
    check("am thanh khong file bi bo + canh bao", sp["audio"] == [] and any("Clip ghep47" in w for w in sp["_warnings"]))
    n_files = len(os.listdir(os.path.join(root, "out", fr["seq"]["dir"])))
    check("file khung da chep vao thu muc mau", n_files == fr["seq"]["count"])
    check("border_color rong -> khong vien", "border" not in mask_txt)
    check("chu mau IN HOA -> textCase upper", mask_txt.get("textCase") == "upper")

print("\n%d ok" % ok)
