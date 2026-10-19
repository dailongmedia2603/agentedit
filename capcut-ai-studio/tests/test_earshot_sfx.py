#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO TAO AM THANH earshot (sidecar/sfx_gen.py + vendor/earshot, 2026-10-18):
[1] vendor nap duoc (khong torch), ngan hang + danh muc cho AI, bo mac dinh theo tone deu la tieng sach
[2] clean_gen: id sai -> None, nut khong hop tieng bi bo
[3] render: cache tat dinh, diem dong bo theo dang tieng (onset / dinh whoosh / cuoi riser), audit sach, pitch dung not
[4] bo tieng cua video (normalize_palette) + loc muc B7 (clean_audio: kho chi con tieng CO GIONG NOI)
[5] engine.resolve_plan_sfx hieu muc "gen"; plan_guard xep loai + muc to
[6] tieng tu gan (sfx_kit.auto_item): co bo tieng -> earshot, take theo su kien; plan cu -> kit-* nhu truoc
[7] luat hook: du phong + AI chon tieng TAO cung bo
[8] B7: prompt co luat + danh muc earshot, sfx_catalog chi con tieng co giong noi
[9] build_spec: muc gen dat DIEM DONG BO dung gio su kien; chu hero tu gan tieng cua bo; file cache mat -> tao lai

Chay: HOME=$(mktemp -d) <venv_python> tests/test_earshot_sfx.py     (can ffmpeg cho [9]; khong goi AI)
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import sfx_gen as G        # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


print("[1] vendor + danh muc")
check("earshot nap duoc", G.available(), G.load_error())
check("khong keo torch / transformers / matplotlib", not any(m in sys.modules for m in ("torch", "transformers",
                                                                                         "matplotlib")))
snd = G.sounds()
check("185 tieng sach (201 - 16 audit loi)", len(snd) == 185 and not (set(snd) & G.UNCLEAN), len(snd))
cat = G.catalog()
ids = {r["id"] for g in cat for r in g["tieng"]}
check("danh muc AI = moi tieng sach, nhom co mo ta + ho", ids == set(snd) and all(g["mo_ta"] and g["ho"] for g in cat),
      len(ids))
check("danh muc gon (< 75k ky tu, ~20k token ke ca nhan Gemini)", len(json.dumps(cat, ensure_ascii=False)) < 75000,
      len(json.dumps(cat, ensure_ascii=False)))
for key, (_, bo) in G.TONES.items():
    check("bo mac dinh '%s' du 8 ho, tieng sach" % key, set(bo) == set(G.FAMILIES) and all(s in snd for s in bo.values()),
          {f: s for f, s in bo.items() if s not in snd})
check("tone -> bo", G.tone_key("Kể chuyện nhẹ nhàng, tâm sự") == "nhe" and G.tone_key("hài hước bắt trend") == "vui"
      and G.tone_key("") == "gon" and G.tone_key("toi_gian") == "toi_gian")
check("family_of / align_of", G.family_of("swish/blade") == "swoosh" and G.family_of("fit/pop/lip_pop") == "pop"
      and G.align_of("whoosh_big/jet") == "peak" and G.align_of("riser/rush") == "end"
      and G.align_of("pro_impact/short") == "onset")
check("van tay doi theo nhan / luat", isinstance(G.fingerprint(), str) and len(G.fingerprint()) == 12)

print("[2] clean_gen")
check("id sai -> None", G.clean_gen({"sound": "khong/co"}) is None and G.clean_gen(None) is None)
check("tieng gio: bo pitch, apex qua dai bi bo, dur sai kieu bo",
      G.clean_gen({"sound": "whoosh_fast/tight", "pitch": "C5", "apex": 9, "dur": "x"}) == {"sound": "whoosh_fast/tight"})
check("chuoi id -> dict", G.clean_gen("pop/1") == {"sound": "pop/1"})
check("kalimba nhan pitch + take", G.clean_gen({"sound": "pluck/kalimba", "pitch": "e5", "take": "3"})
      == {"sound": "pluck/kalimba", "pitch": "E5", "take": 3})
check("dur kep [0.05, 6]", G.clean_gen({"sound": "riser/rush", "dur": 30})["dur"] == G.DUR_MAX)
check("impact khong nhan apex", "apex" not in G.clean_gen({"sound": "impact/punch", "apex": 0.2}))

print("[3] render")
w = G.render({"sound": "whoosh_fast/tight", "dur": 0.7, "apex": 0.45})
check("whoosh: file + dinh dung 0.45s (+-5ms)", os.path.isfile(w["file"]) and abs(w["sync_s"] - 0.45) < 0.005
      and w["align"] == "peak", w)
w2 = G.render({"sound": "whoosh_fast/tight", "dur": 0.7, "apex": 0.45})
check("cache: cung khoa -> cung file", w2["file"] == w["file"])
r = G.render({"sound": "riser/rush", "dur": 1.2})
check("riser: dong bo o CUOI (~dur)", r["align"] == "end" and 1.0 <= r["sync_s"] <= 1.2, r)
p = G.render({"sound": "pluck/kalimba", "pitch": "E5"})
check("pitch E5 do lai dung not", (p["edits"].get("pitch") or {}).get("ok") is True, p.get("edits"))
im = G.render({"sound": "impact/deep"})
check("impact duoi dai -> 3.5s (spec phat 4s dau)", abs(float(im["dur_s"]) - G.LONG_CAP) < 0.01, im["dur_s"])
t1, t2 = G.render({"sound": "pop/1"}), G.render({"sound": "pop/1", "take": 2})
check("take khac -> file khac", t1["file"] != t2["file"])
check("audit sach", all("clean" in str(x.get("checks")) for x in (w, r, t1)), [w["checks"], r["checks"], t1["checks"]])

print("[4] bo tieng cua video + loc B7")
pal = G.normalize_palette({"tong": "vui", "chat": "hai, nay", "bo": {"pop": {"sound": "pop/3", "pitch": "G5"},
                                                                   "boom": {"sound": "nope"},
                                                                   "ding": {"sound": "pluck/kalimba", "level_db": -20}}})
check("ho AI chon giu, ho sai / thieu -> mac dinh theo tong",
      pal["bo"]["pop"] == {"sound": "pop/3", "pitch": "G5"} and pal["bo"]["boom"]["sound"] == G.TONES["vui"][1]["boom"]
      and pal["nguon"] == "ai+mac_dinh" and "boom" in pal["ho_mac_dinh"], pal)
check("level_db kep [-8, 3]", pal["bo"]["ding"]["level_db"] == -8.0)
check("AI khong tra bo -> mac dinh theo tone cau chuyen", G.normalize_palette(None, "tâm sự")["tong"] == "nhe")
items = [{"gen": {"sound": "swish/blade"}, "start": 3.0, "purpose": "transition", "volume": 0.9},
         {"gen": {"sound": "sai/id"}, "start": 4.0},
         {"sfx_id": "meme-wow", "src_time": 5.0},
         {"sfx_id": "kit-pop", "src_time": 6.0},
         {"role": "bgm", "music_id": "x"}]
keep, dropped = G.clean_audio(items, {"meme-wow"})
check("giu gen hop le (bo volume AI dat), tieng co giong noi, nhac nen; bo id sai + tieng khong loi cua kho",
      [a.get("sfx_id") or a.get("role") for a in keep] == ["es:swish/blade", "meme-wow", "bgm"]
      and "volume" not in keep[0] and len(dropped) == 2, (keep, dropped))
keep2, _ = G.clean_audio([{"sfx_id": "pop/1", "start": 1.0}, {"sfx_id": "es:swish/blade", "start": 2.0}], set())
check("AI ghi id earshot vao sfx_id -> chuyen thanh gen", [a.get("gen") for a in keep2]
      == [{"sound": "pop/1"}, {"sound": "swish/blade"}], keep2)
check("speech_only", G.speech_only([{"id": "a", "has_speech": True}, {"id": "b"}]) == [{"id": "a", "has_speech": True}])

print("[5] resolve + mix")
import engine        # noqa: E402
import plan_guard    # noqa: E402
plan = {"audio": [{"gen": {"sound": "pro_impact/short"}, "source_id": "s", "src_time": 2.0, "purpose": "punch"},
                  {"gen": {"sound": "khong/co"}, "start": 1.0}]}
engine.resolve_plan_sfx(plan)
a = plan["audio"][0] if plan["audio"] else {}
check("resolve: file + do to + _sync + id es:, muc sai bi bo", len(plan["audio"]) == 1 and os.path.isfile(a.get("file", ""))
      and a.get("_lufs") is not None and a.get("sfx_id") == "es:pro_impact/short" and "_sync" in a, plan["audio"])
check("sfx_family theo nhom tieng (impact), khong doan ten", plan_guard.sfx_family(a) == "impact")
check("sfx_family: hover tick ('air' trong id) van la ui",
      plan_guard.sfx_family(G.resolve({"gen": {"sound": "pro_hover_tick/soft"}})) == "ui")
check("_world_db cong level_db cua bo", plan_guard._world_db({"_gen_db": -3.0}) == -3.0
      and plan_guard._world_db({"sfx_id": "x"}) == 0.0)

print("[6] tieng tu gan")
import sfx_kit       # noqa: E402
old = sfx_kit.auto_item("pop", 1.0, "L1", "ui")
check("plan cu (khong bo tieng) -> kit-pop", old and old["sfx_id"] == "kit-pop" and old["start"] == 1.0, old)
bo = G.default_palette("gon")
with G.use(bo):
    a1 = sfx_kit.auto_item("pop", 5.0, "L1", "ui")
    takes = {sfx_kit.auto_item("pop", 5.0, "L%d" % i, "ui")["gen"].get("take", 1) for i in range(12)}
    wh = sfx_kit.auto_item("whoosh", 5.0, "W1", "transition")
    rs = sfx_kit.auto_item("riser", 5.0, "R1", "reveal")
    ty = sfx_kit.auto_item("typewriter", 5.0, "T1", "ui")
    tp = sfx_kit.auto_item("typing", 5.0, "T2", "ui", dur=1.1)
    imp = sfx_kit.auto_item("impact", 5.0, "I1", "punch")
check("bo tieng -> tieng cua bo, onset dung su kien", a1["gen"]["sound"] == bo["bo"]["pop"]["sound"]
      and abs(a1["start"] - 5.0) < 0.03 and a1["_from_layer"] == "L1", a1)
check("nhieu su kien -> nhieu take (khong lap y het)", len(takes) >= 3, takes)
check("whoosh: bat dau truoc su kien <= 0.25s, dinh ~0.12s sau", 4.75 <= wh["start"] <= 5.0, wh["start"])
check("riser: ket thuc dung su kien", abs(rs["start"] + rs["_sync"] - 5.0) < 0.01, rs["start"])
check("ho la -> None (giu luong cu)", ty is None)
check("typing: dur = thoi gian chu go", tp["gen"].get("dur") == 1.1, tp["gen"])
check("alias impact -> boom", imp["gen"]["sound"] == bo["bo"]["boom"]["sound"])
check("ngoai use -> luong cu", G.active() is None)

print("[7] luat hook")
import hook_rule     # noqa: E402
m = {"source_id": "s", "src_start": 10.0, "src_end": 13.5, "anchor": "hook"}
fb = hook_rule.fallback_sfx(m, [{"id": "meme", "has_speech": True}], "manh", palette=bo)
check("du phong manh -> 2 lop: tieng dap CO DUOI ngay dau + whoosh lon o nhip sau (bo 'gon' qua mong -> tieng hook rieng)",
      len(fb) == 2 and fb[0]["gen"]["sound"].startswith(hook_rule.HOOK_BOOM_OK) and fb[0]["src_time"] <= 10.05
      and fb[1]["gen"]["sound"].startswith(hook_rule.HOOK_WHOOSH_OK) and 11.0 < fb[1]["src_time"] < 13.5
      and all(x["anchor"] == "hook" for x in fb), fb)
bo_day = dict(bo, bo=dict(bo["bo"], boom={"sound": "sub_drop/808"}))
fb3 = hook_rule.fallback_sfx(m, [], "manh", palette=bo_day)
check("bo tieng da co boom du day -> dung boom cua bo", fb3[0]["gen"]["sound"] == "sub_drop/808", fb3)
fb2 = hook_rule.fallback_sfx(m, [], "nhe", palette=bo)
check("du phong nhe -> 1 whoosh LON mem", len(fb2) == 1 and fb2[0]["gen"]["sound"].startswith(hook_rule.HOOK_WHOOSH_OK), fb2)
got = hook_rule.clean_sfx({"audio": [{"gen": {"sound": "pro_impact/short"}, "src_time": 9.0},
                                     {"sfx_id": "meme", "src_time": 11}]}, m, [{"id": "meme", "has_speech": True}])
check("Hook-SFX: nhan tieng tao (kep vao hook), bo meme co giong", len(got) == 1 and got[0]["gen"]["sound"] ==
      "pro_impact/short" and got[0]["src_time"] == 10.0, got)
import providers     # noqa: E402
seen = {}
providers_plan_chat = providers.plan_chat
providers.plan_chat = lambda msgs, **kw: (seen.update(sys=msgs[0]["content"], user=msgs[1]["content"]),
                                          '{"audio": []}')[1]
try:
    hook_rule.gpt_hook_sfx(m, [], palette=bo)
    check("Hook-SFX prompt co luat earshot + gen_catalog + bo tieng", "BO TAO AM THANH" in seen["sys"]
          and '"gen_catalog"' in seen["user"] and '"bo_am_thanh"' in seen["user"])

    print("[8] B7")
    providers.gpt_audio({}, {}, [{"id": "meme", "name": "wow", "has_speech": True}], segments=[], transcript_data={},
                        story={"tone": "vui"}, gen_catalog=G.catalog())
    check("B7: luat earshot + danh muc trong system prompt", "BO TAO AM THANH" in seen["sys"]
          and "whoosh_fast/tight" in seen["sys"] and '"bo_am_thanh"' in seen["sys"])
    seen.clear()
    providers.gpt_audio({}, {}, [], segments=[], transcript_data={}, gen_catalog=G.catalog())
    check("B7 van chay khi kho khong con tieng nao (chi bo tao)", "sys" in seen)
finally:
    providers.plan_chat = providers_plan_chat

print("[9] build_spec")
import remotion_plan as RP  # noqa: E402
ff = RP._ffbin("ffmpeg")
tmp = tempfile.mkdtemp(prefix="es-test-")
src = os.path.join(tmp, "src.mp4")
subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=12",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                src], check=True)
base = {"engine": "remotion", "source_videos": [{"id": "source_1", "path": src, "name": "src.mp4", "duration": 12.0}],
        "canvas": {"w": 1080, "h": 1920}, "fps": 30,
        "segments": [{"source_id": "source_1", "start": 0.0, "end": 10.0, "target_start": 0.0, "beat": "body"}],
        "captions": [{"text": "CON SỐ", "role": "hero", "source_id": "source_1", "src_start": 6.0, "src_end": 7.0}],
        "audio": [{"gen": {"sound": "whoosh_fast/tight", "dur": 0.7, "apex": 0.45}, "start": 3.0, "purpose": "transition"},
                  {"gen": {"sound": "riser/rush", "dur": 1.2}, "source_id": "source_1", "src_time": 5.0, "purpose": "reveal"}],
        "speech": [], "am_thanh": G.default_palette("gon")}
p = copy.deepcopy(base)
engine.resolve_plan_sfx(p)
spec, rep = RP.build_spec(p)
au = {a["name"]: a for a in (spec or {}).get("audio") or []}
whs = au.get("Tạo: whoosh_fast/tight")
rsr = au.get("Tạo: riser/rush")
check("whoosh: dinh roi dung 3.0s", whs and abs(whs["start"] + 0.45 - 3.0) < 0.01, (spec or {}).get("audio"))
check("riser: ket thuc dung 5.0s", rsr and abs(rsr["start"] + 1.2 - 5.0) < 0.06, rsr)
hero = [a for a in spec["audio"] if a.get("textAuto")]
check("chu hero tu gan tieng TAO cua bo (pop)", hero and str(hero[0]["name"]).startswith("Tạo: ")
      and hero[0]["name"].endswith(base["am_thanh"]["bo"]["pop"]["sound"]), spec["audio"])
check("build_spec khong sua plan truyen vao", p["audio"][0].get("start") == 3.0)
shutil.rmtree(os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "earshot"))
spec2, _ = RP.build_spec(p)
check("cache bi xoa -> tao lai tieng, ket qua y het", [(a["name"], a["start"]) for a in spec2["audio"]]
      == [(a["name"], a["start"]) for a in spec["audio"]] and all(os.path.isfile(a["path"]) for a in spec2["audio"]))
p_old = copy.deepcopy(base)
p_old.pop("am_thanh")
p_old["audio"] = []
spec3, _ = RP.build_spec(p_old)
check("plan cu (khong am_thanh) -> chu hero dung kit-* nhu truoc",
      any(a.get("textAuto") and "es:" not in str(a.get("name")) and not str(a.get("name")).startswith("Tạo: ")
          for a in spec3["audio"]), spec3["audio"])
shutil.rmtree(tmp, ignore_errors=True)

print("\n%s" % ("TAT CA OK" if not FAILED else "LOI %d: %s" % (len(FAILED), ", ".join(FAILED))))
sys.exit(1 if FAILED else 0)
