# -*- coding: utf-8 -*-
"""Sinh effects_index.json ĐẦY ĐỦ (toàn bộ bộ CapCut gồm cả VIP/Pro) + tag de query.
Chay bang venv cua engine. Ghi vao skill capcut-make-video/assets/effects_index.json."""
import os, sys, re, json
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "CapCutAPI")); os.chdir(os.path.join(ROOT, "CapCutAPI"))
import pyJianYingDraft as d

OUT = os.path.join(ROOT, ".claude/skills/capcut-make-video/assets/effects_index.json")

def toks(s):
    s = re.sub(r'(?<!^)(?=[A-Z])', ' ', s).replace('_', ' ')
    s = re.sub(r'\d+', ' ', s)
    return set(t.lower() for t in s.split() if t)

# token -> emotion
EMO = [
 ("punch",    {"shake","flash","explosion","lightning","boom","strobe","crash","quake","impact","thunder","glitch","rgb","bad","blackout"}),
 ("positive", {"heart","hearts","kiss","love","star","stars","starry","sparkle","twinkle","firework","fireworks","gold","diamond","disco","glow","bling","angel","aura","butterfly","money","crown","rainbow"}),
 ("negative", {"noise","static","error","broken","crack","shatter","mosaic","pixel","snow","horror","scary","zombie","blood","distorted","level"}),
 ("nostalgic",{"film","retro","vintage","old","grain","vhs","reel","projector","camcorder","sketch","ink"}),
 ("soft",     {"fade","dissolve","blur","dream","dreamy","float","smoke","cloud","water","ripple","light","leak","bokeh","heartbeat"}),
]
HIGH = {"shake","flash","explosion","lightning","boom","strobe","crash","quake","glitch","zoom","rgb","bad","disco","firework","fireworks","crack","shatter"}
LOW  = {"fade","dissolve","blur","soft","dream","float","light","leak","heartbeat","mini","subtle","slow"}

# emotion -> situations (tiếng Việt, cho AI map)
SIT = {
 "punch":    ["cú đấm / nói thẳng", "cao trào", "nhấn câu chốt"],
 "positive": ["thành công / tiền bạc", "vui / tích cực", "hook hấp dẫn"],
 "negative": ["tiêu cực / thất bại", "view tụt / thuật toán", "cảnh báo"],
 "nostalgic":["hoài niệm / kể chuyện", "nhìn lại quá khứ"],
 "soft":     ["tâm sự / cảm xúc lắng", "chuyển mạch mượt"],
 "neutral":  ["dùng chung / trang trí"],
}
APPLY = {
 "transition":'add_video/add_image(transition="KEY")',
 "scene_effect":'add_effect(effect_type="KEY", effect_category="scene", params=[])',
 "character_effect":'add_effect(effect_type="KEY", effect_category="character", params=[])',
 "intro_anim":'add_image(intro_animation="KEY")',
 "outro_anim":'add_image(outro_animation="KEY")',
 "combo_anim":'add_image(combo_animation="KEY")',
 "text_intro":'add_text(intro_animation="KEY")',
 "text_outro":'add_text(outro_animation="KEY")',
 "text_loop":'add_text loop animation',
 "mask":'add_video/add_image(mask_type="KEY")',
 "filter":'(API chưa có add_filter trực tiếp — cần mở rộng)',
 "font":'add_text(font="KEY")',
 "voice_filter":'xử lý audio (voice filter)',
 "voice_character":'xử lý audio (đổi giọng)',
}

def emotion_of(tk):
    for label, group in EMO:
        if tk & group: return label
    return "neutral"
def intensity_of(tk):
    if tk & HIGH: return "high"
    if tk & LOW: return "low"
    return "medium"

def params_of(v):
    ps = getattr(v, "params", None) or []
    out = []
    for p in ps:
        try: out.append({"name": p.name, "default": p.default_value, "min": p.min_value, "max": p.max_value})
        except Exception: pass
    return out

SETS = [
 ("CapCut_Transition_type","transition"),
 ("CapCut_Video_scene_effect_type","scene_effect"),
 ("CapCut_Video_character_effect_type","character_effect"),
 ("CapCut_Intro_type","intro_anim"),
 ("CapCut_Outro_type","outro_anim"),
 ("CapCut_Group_animation_type","combo_anim"),
 ("CapCut_Text_intro","text_intro"),
 ("CapCut_Text_outro","text_outro"),
 ("CapCut_Text_loop_anim","text_loop"),
 ("CapCut_Mask_type","mask"),
 ("Filter_type","filter"),
 ("Font_type","font"),
 ("CapCut_Voice_filters_effect_type","voice_filter"),
 ("CapCut_Voice_characters_effect_type","voice_character"),
]

items = []
counts = {}
for enum_name, cat in SETS:
    o = getattr(d, enum_name, None)
    if not o: continue
    n = 0
    for m in o:
        v = m.value
        disp = getattr(v, "name", None) or getattr(v, "title", "") or m.name
        tk = toks(m.name) | toks(disp)
        emo = emotion_of(tk)
        rec = {
            "key": m.name,
            "category": cat,
            "name": disp,
            "vip": bool(getattr(v, "is_vip", False)),
            "emotion": emo,
            "intensity": intensity_of(tk),
            "situations": SIT.get(emo, []),
            "params": params_of(v) if cat in ("scene_effect","character_effect","filter","font","voice_filter","voice_character") else [],
            "apply": APPLY.get(cat, "").replace("KEY", m.name),
        }
        items.append(rec); n += 1
    counts[cat] = n

data = {
    "_meta": {
        "source": "pyJianYingDraft metadata (CapCut International set)",
        "total": len(items),
        "counts": counts,
        "note": "Bao gom CA hieu ung VIP/Pro (vip=true). emotion/intensity/situations la tag suy luan tu ten de query; verify bang swatch khi can.",
        "emotions": ["punch","positive","negative","nostalgic","soft","neutral"],
        "categories": sorted(set(c for _, c in SETS)),
    },
    "effects": items,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("Ghi:", OUT)
print("Tong:", len(items), "| VIP:", sum(1 for i in items if i["vip"]))
print("Theo nhom:", json.dumps(counts, ensure_ascii=False))
