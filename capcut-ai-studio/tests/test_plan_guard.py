#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test lop bao ve plan (plan_guard) — cac ham remotion_plan.build_spec dung chung.
Chay: python3 tests/test_plan_guard.py

Cac case deu lay tu loi THAT da xay ra tren video that (2026-09-22 .. 09-24).
Ham `dung()` goi cac buoc theo DUNG thu tu build_spec dung: go cau truc cu -> noi
timeline -> chuan bi meme -> hook len dau + meme cat vao -> quy doi gio nguon ->
can SFX -> chu khong de len doan meme.
"""
import os
import sys
import json
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar"))
import plan_guard as g  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    if cond:
        print("  ok   %s" % name)
    else:
        print("  FAIL %s %s" % (name, detail))
        FAILED.append(name)


def base_plan(**kw):
    p = {
        "source_videos": [{"id": "source_1", "path": "/tmp/a.mp4", "duration": 37.7}],
        "canvas": {"w": 1080, "h": 1920},
        "duration": 5.0,
        "segments": [{"source_id": "source_1", "start": 12.5, "end": 15.0, "target_start": 0.0},
                     {"source_id": "source_1", "start": 21.0, "end": 23.0, "target_start": 2.5}],
        "captions": [], "audio": [], "inserts": [], "scene_effects": [],
    }
    p.update(kw)
    return p


def dung(p):
    """Cac buoc cua plan_guard theo thu tu build_spec. Tra (plan, changes)."""
    ch = []
    g.strip_structure(p, ch)
    segs, dur = g.chuan_hoa_segments(p.get("segments"), ch)
    p["segments"] = segs
    p["duration"] = round(dur, 3)
    tmap = g.build_time_map(p)
    g.prepare_inserts(p, tmap, p["duration"], ch)
    g.apply_structure(p, ch)
    tmap = g.build_time_map(p)
    for c in p.get("captions") or []:
        if c.get("src_start") is not None:
            pref = "hook" if c.get("anchor") == "hook" else "body"
            tl = g.source_to_timeline(p, c.get("source_id"), c["src_start"], tmap, pref)
            tl_en = g.source_to_timeline(p, c.get("source_id"), c.get("src_end"), tmap, pref)
            if tl is not None:
                c["start"] = tl
                if tl_en is not None and tl_en > tl:
                    c["end"] = tl_en
    for a in p.get("audio") or []:
        if a.get("src_time") is not None:
            pref = "hook" if a.get("anchor") == "hook" else "body"
            tl = g.source_to_timeline(p, a.get("source_id"), a["src_time"], tmap, pref)
            if tl is not None:
                a["start"] = tl
    p["audio"] = sorted(p.get("audio") or [], key=lambda a: float(a.get("start", 0) or 0))
    g.mix_sfx(p, ch)
    g.clear_over_inserts(p, ch)
    return p, ch


def copy(p):
    return json.loads(json.dumps(p))


print("\n[1] Timeline — noi lien tuc, bo ho va chong lan, speed")
segs, dur = g.chuan_hoa_segments([
    {"source_id": "source_1", "start": 0, "end": 2, "target_start": 0},
    {"source_id": "source_1", "start": 5, "end": 8, "target_start": 9.0},  # ho 7s
])
check("ho tren timeline bi dong lai", abs(segs[1]["target_start"] - 2.0) < 0.01)
check("duration tinh lai dung", abs(dur - 5.0) < 0.01, "-> %s" % dur)
segs, dur = g.chuan_hoa_segments([
    {"source_id": "source_1", "start": 0, "end": 4, "target_start": 0, "speed": 2.0},
    {"source_id": "source_1", "start": 5, "end": 7, "target_start": 99},
])
check("doan speed 2x chi chiem 2s", abs(segs[1]["target_start"] - 2.0) < 0.01,
      "-> %s" % segs[1]["target_start"])
segs, _ = g.chuan_hoa_segments([{"source_id": "source_1", "start": 3.0, "end": 3.1}])
check("doan qua ngan bi bo", segs == [], segs)

print("\n[2] Quy doi gio NGUON sang gio TIMELINE")
# key_moment "lay cai gi cam ket" ket thuc o giay 15.0 CUA FILE GOC.
# Segment 1 map source 12.5-15.0 -> timeline 0-2.5 => phai ra 2.5 tren timeline.
p = base_plan()
tm = g.build_time_map(p)
check("src 15.0 (nguon) -> 2.5 (timeline)", abs(g.source_to_timeline(p, "source_1", 15.0, tm) - 2.5) < 0.01)
check("src 22.0 (nguon) -> 3.5 (timeline)", abs(g.source_to_timeline(p, "source_1", 22.0, tm) - 3.5) < 0.01)
# gio nguon da bi cat -> neo vao cuoi doan GAN NHAT truoc no, khong phai doan dau tien (loi that
# 2026-09-26: meme neo giay 109.7 bi chen len giay 1.3 cua video)
pc = {"segments": [{"source_id": "source_1", "start": 0, "end": 2, "target_start": 0},
                   {"source_id": "source_1", "start": 10, "end": 12, "target_start": 2},
                   {"source_id": "source_1", "start": 20, "end": 22, "target_start": 4}]}
check("gio nguon bi cat -> cuoi doan gan nhat truoc no",
      abs(g.source_to_timeline(pc, "source_1", 15.0) - 4.0) < 0.01, g.source_to_timeline(pc, "source_1", 15.0))
check("gio nguon bi cat (giua doan 1 va 2) -> cuoi doan 1",
      abs(g.source_to_timeline(pc, "source_1", 5.0) - 2.0) < 0.01, g.source_to_timeline(pc, "source_1", 5.0))
p, _ = dung(base_plan(audio=[{"file": "/tmp/boom.mp3", "source_id": "source_1", "src_time": 15.0}]))
check("SFX neo src_time 15.0 -> start 2.5", abs(p["audio"][0]["start"] - 2.5) < 0.01,
      "-> %s" % p["audio"][0]["start"])

print("\n[3] HOOK — doan dat nhat dat len dau video")


def hook_plan(**kw):
    p = {
        "source_videos": [{"id": "source_1", "path": "/tmp/a.mp4", "duration": 60.0}],
        "canvas": {"w": 1080, "h": 1920},
        "segments": [{"source_id": "source_1", "start": 0.0, "end": 12.0, "target_start": 0.0},
                     {"source_id": "source_1", "start": 20.0, "end": 30.0, "target_start": 12.0}],
        "speech": [{"source_id": "source_1", "start": 0.5, "end": 5.0},
                   {"source_id": "source_1", "start": 5.4, "end": 11.8},
                   {"source_id": "source_1", "start": 20.2, "end": 26.0},
                   {"source_id": "source_1", "start": 26.4, "end": 29.5}],
        "captions": [], "audio": [], "inserts": [], "scene_effects": [],
    }
    p.update(kw)
    return p


p, rep = dung(hook_plan(hook={"source_id": "source_1", "src_start": 22.3, "src_end": 25.6,
                              "reason": "cau soc nhat"}))
s0 = p["segments"][0]
check("hook nam o dau timeline", s0.get("kind") == "hook" and s0["target_start"] == 0.0)
check("hook lay dung doan nguon", abs(s0["start"] - 22.3) < 0.01, "-> %s" % s0["start"])
check("hook co chuyen canh tam sang than video", s0.get("transition") == g.HOOK_TRANSITION,
      "-> %s" % s0.get("transition"))
check("than video van bat dau tu dau", p["segments"][1]["start"] == 0.0)
check("timeline dai them dung bang hook",
      abs(p["duration"] - (22.0 + (s0["end"] - s0["start"]))) < 0.01, "-> %s" % p["duration"])
# hook cat giua cau -> keo ve ranh gioi cum tu
check("khong cat giua chung mot cau", abs(s0["end"] - 26.0) < 0.01, "-> %s" % s0["end"])
check("bao cao ghi chuyen canh tam (build_spec doi sang ten Remotion)",
      any("+ transition %s" % g.HOOK_TRANSITION in c for c in rep), rep)

# hook qua dai -> cat con toi da
p, _ = dung(hook_plan(hook={"source_id": "source_1", "src_start": 20.2, "src_end": 29.5}))
h = p["segments"][0]
check("hook dai bi cat ve <= %.0fs" % g.HOOK_MAX_SEC, h["end"] - h["start"] <= g.HOOK_MAX_SEC + 1e-3,
      "-> %.1fs" % (h["end"] - h["start"]))

# hook trung dau video -> bo (khong chieu hai lan lien tiep)
p, _ = dung(hook_plan(hook={"source_id": "source_1", "src_start": 0.5, "src_end": 4.0}))
check("bo hook trung voi dau video", p["segments"][0].get("kind") != "hook")

# caption/SFX neo theo gio nguon phai roi vao BAN GOC, khong phai ban sao o hook
p, _ = dung(hook_plan(
    hook={"source_id": "source_1", "src_start": 22.3, "src_end": 25.6},
    captions=[{"text": "MẤT 3 TỶ", "role": "hero", "source_id": "source_1",
               "src_start": 23.0, "src_end": 24.5}]))
hook_len = p["segments"][0]["end"] - p["segments"][0]["start"]
check("caption roi vao ban goc giua video, khong phai hook",
      p["captions"][0]["start"] > hook_len + 1e-3, "-> %.2f (hook dai %.2f)"
      % (p["captions"][0]["start"], hook_len))
# ...tru khi khai ro anchor="hook"
p, _ = dung(hook_plan(
    hook={"source_id": "source_1", "src_start": 22.3, "src_end": 25.6},
    captions=[{"text": "MẤT 3 TỶ", "role": "hero", "anchor": "hook", "source_id": "source_1",
               "src_start": 23.0, "src_end": 24.5}]))
check("anchor=hook thi chu nam tren hook", p["captions"][0]["start"] < 2.0,
      "-> %s" % p["captions"][0]["start"])

print("\n[4] Chen meme (inserts)")
# clip meme dai 47s, chi lay 1.6s; neo theo gio NGUON 22.0 -> timeline 3.5
p, _ = dung(base_plan(inserts=[{"meme_id": "x", "file": "/m.mp4", "_src_duration": 47.0,
                                "source_id": "source_1", "src_time": 22.0,
                                "src_start": 4.5, "duration": 1.6}]))
it = p["inserts"][0]
check("neo src 22.0 -> timeline 3.5", abs(it["start"] - 3.5) < 0.01, "-> %s" % it["start"])
check("cat dung doan clip", abs(it["src_end"] - (it["src_start"] + it["duration"])) < 0.01)
check("khong tran qua cuoi video", it["start"] + it["duration"] <= p["duration"] + 1e-3)
check("mode mac dinh la banner", it["mode"] == "banner")

# khong duoc cat qua do dai clip goc
p, _ = dung(base_plan(inserts=[{"meme_id": "x", "file": "/m.mp4", "_src_duration": 2.0,
                                "start": 0.5, "src_start": 1.8, "duration": 3.0}]))
check("khong vut meme di khi src_start qua sat cuoi clip", len(p["inserts"]) == 1)
it = p["inserts"][0]
check("lui diem cat lai cho du", it["src_start"] < 1.8, "-> %s" % it["src_start"])
check("khong cat vuot do dai clip goc", it["src_end"] <= 2.0 + 1e-3, "-> %s" % it["src_end"])

# 2 meme qua sat -> bo bot
p, _ = dung(base_plan(inserts=[{"file": "/a.mp4", "start": 1.0, "duration": 1.5},
                               {"file": "/b.mp4", "start": 1.6, "duration": 1.5}]))
check("bo meme cach < %.1fs" % g.INSERT_MIN_GAP, len(p["inserts"]) == 1)

# chen dai qua -> bi cap
p, _ = dung(base_plan(inserts=[{"file": "/a.mp4", "start": 0.5, "duration": 9.0}]))
check("cap do dai chen ve <= %.1fs" % g.CUTAWAY_MAX_SEC,
      p["inserts"][0]["duration"] <= g.CUTAWAY_MAX_SEC + 1e-3, "-> %s" % p["inserts"][0]["duration"])

# Gian cach phai tinh SAU khi quy doi src_time (bug that 2026-09-23): ca 2 neo bang
# src_time nen luc chua quy doi deu co start=0 — loc truoc la vut oan cai thu 2.
p, _ = dung(base_plan(inserts=[
    {"file": "/a.mp4", "source_id": "source_1", "src_time": 13.0, "duration": 1.2},
    {"file": "/b.mp4", "source_id": "source_1", "src_time": 22.0, "duration": 1.2},
]))
check("giu ca 2 meme neo bang src_time", len(p["inserts"]) == 2,
      "-> %s" % [i.get("start") for i in p["inserts"]])

print("\n[5] Chen meme kieu CAT — khong de len luc dang noi")
p, rep = dung(hook_plan(inserts=[
    {"meme_id": "wow", "file": "/m.mp4", "_src_duration": 8.0, "_w": 1920, "_h": 1080,
     "source_id": "source_1", "src_time": 7.0, "duration": 1.6, "why": "x"}]))
kinds = [s.get("kind") for s in p["segments"]]
check("meme thanh mot doan tren track chinh", kinds.count("insert") == 1, "-> %s" % kinds)
check("placement = cutaway", p["inserts"][0]["placement"] == "cutaway")
meme = [s for s in p["segments"] if s.get("kind") == "insert"][0]
truoc = [s for s in p["segments"] if s.get("kind") != "insert" and
         s["target_start"] < meme["target_start"]][-1]
sau = [s for s in p["segments"] if s.get("kind") != "insert" and
       s["target_start"] > meme["target_start"]][0]
check("video chinh bi cat doi dung cho", abs(truoc["end"] - sau["start"]) < 0.01,
      "-> %.2f / %.2f" % (truoc["end"], sau["start"]))
check("noi tiep ngay sau meme",
      abs(sau["target_start"] - (meme["target_start"] + 1.6)) < 0.01)
check("video dai them dung bang meme", abs(p["duration"] - (22.0 + 1.6)) < 0.01,
      "-> %s" % p["duration"])
check("meme cat ra thi phai co tieng", p["inserts"][0]["volume"] >= 0.25,
      "-> %s" % p["inserts"][0]["volume"])

# roi vao khoang lang -> duoc phep de len
p, _ = dung(hook_plan(inserts=[
    {"meme_id": "wow", "file": "/m.mp4", "_src_duration": 8.0,
     "source_id": "source_1", "src_time": 12.5, "duration": 1.5, "why": "x"}]))
check("roi vao khoang lang thi de len (overlay)",
      p["inserts"] and p["inserts"][0]["placement"] == g.PLACEMENT_OVER,
      "-> %s" % [i.get("placement") for i in p["inserts"]])
check("overlay khong cat track chinh",
      not [s for s in p["segments"] if s.get("kind") == "insert"])

# overlay + hook: gio cua meme phai dich theo do dai hook
p, _ = dung(hook_plan(
    hook={"source_id": "source_1", "src_start": 22.3, "src_end": 25.6},
    inserts=[{"meme_id": "wow", "file": "/m.mp4", "_src_duration": 8.0,
              "source_id": "source_1", "src_time": 12.5, "duration": 1.5, "why": "x"}]))
hook_len = p["segments"][0]["end"] - p["segments"][0]["start"]
check("meme de len dich theo hook", abs(p["inserts"][0]["start"] - (12.0 + hook_len)) < 0.3,
      "-> %.2f (hook %.2f)" % (p["inserts"][0]["start"], hook_len))

# AI doi de len nhung cho do dang noi -> ep ve cat
p, _ = dung(hook_plan(inserts=[
    {"meme_id": "wow", "file": "/m.mp4", "_src_duration": 8.0, "placement": "overlay",
     "source_id": "source_1", "src_time": 7.0, "duration": 1.5, "why": "x"}]))
check("ep overlay -> cutaway khi dang noi", p["inserts"][0]["placement"] == g.PLACEMENT_CUT)

# cat phai roi vao cho ngat cau
p, _ = dung(hook_plan(inserts=[
    {"meme_id": "wow", "file": "/m.mp4", "_src_duration": 8.0,
     "source_id": "source_1", "src_time": 5.2, "duration": 1.5, "why": "x"}]))
meme = [s for s in p["segments"] if s.get("kind") == "insert"][0]
truoc = [s for s in p["segments"] if s.get("kind") != "insert"
         and s["target_start"] < meme["target_start"]][-1]
check("keo diem cat ve cuoi cum tu (5.0)", abs(truoc["end"] - 5.0) < 0.01, "-> %s" % truoc["end"])

print("\n[6] Kich thuoc clip meme theo ti le khung")
check("clip doc trong khung doc -> phu kin khung",
      g.meme_layout(1080, 1920, 1080, 1920)[0] == "fullscreen")
check("clip 3:4 trong khung doc -> phong cho day chieu cao",
      abs(g.meme_layout(1080, 1440, 1080, 1920)[1] - 1.333) < 0.01,
      "-> %s" % g.meme_layout(1080, 1440, 1080, 1920)[1])
mode, scale, blur, _x, _y = g.meme_layout(1920, 1080, 1080, 1920)
check("clip ngang trong khung doc -> giu be ngang", mode == "banner" and scale == 1.0)
check("clip ngang khi CAT thi lap nen mo cho khoi vien den", blur == 2)
check("clip ngang khi DE LEN thi khong lam mo (ben duoi la A-roll)",
      g.meme_layout(1920, 1080, 1080, 1920, None, "overlay")[2] is None)
check("clip ngang trong khung ngang -> phu kin khung",
      g.meme_layout(1920, 1080, 1920, 1080)[0] == "fullscreen")

print("\n[7] Cuong do SFX — can theo loai tieng va ngu canh")
check("boom la tieng dam", g.sfx_family({"_name": "VINE BOOM SOUND"}) == "impact")
check("vo tay (co dau) van nhan ra", g.sfx_family({"_name": "Tiếng vỗ tay"}) == "crowd")
check("file to mom bi keo xuong", g.sfx_base_volume("comedy", 3.2) < 0.3,
      "-> %.2f" % g.sfx_base_volume("comedy", 3.2))
check("file nho bi keo len", g.sfx_base_volume("ui", -16.3) > 1.0,
      "-> %.2f" % g.sfx_base_volume("ui", -16.3))
p, _ = dung(hook_plan(audio=[
    {"sfx_id": "boom", "file": "/b.mp3", "_name": "VINE BOOM", "_lufs": -8.0,
     "source_id": "source_1", "src_time": 7.0},          # dang noi
    {"sfx_id": "boom2", "file": "/b.mp3", "_name": "VINE BOOM", "_lufs": -8.0,
     "source_id": "source_1", "src_time": 12.2},         # khoang lang
]))
noi, lang = p["audio"][0]["volume"], p["audio"][1]["volume"]
check("SFX trung giong noi bi ha xuong", noi < lang, "-> %.2f vs %.2f" % (noi, lang))
check("SFX khong bao gio cham tran on ao", max(noi, lang) <= g.SFX_VOL_MAX + 1e-6)
p, _ = dung(hook_plan(audio=[
    {"sfx_id": "x", "file": "/b.mp3", "_name": "ding", "_lufs": -12.0, "start": 2.0},
    {"sfx_id": "x", "file": "/b.mp3", "_name": "ding", "_lufs": -12.0, "start": 6.0},
    {"sfx_id": "x", "file": "/b.mp3", "_name": "ding", "_lufs": -12.0, "start": 10.0},
]))
vols = [a["volume"] for a in p["audio"]]
check("cung mot tieng lap lai thi nho dan", vols[0] > vols[1] > vols[2], "-> %s" % vols)
# 2026-10-01: chu nao cung co tieng -> cung mot tieng lap ca video; truoc day 0.85^n lam chu ve sau coi nhu mat tieng
p, _ = dung(hook_plan(audio=[{"sfx_id": "x", "file": "/b.mp3", "_name": "ding", "_lufs": -12.0, "start": 2.0 + 3.1 * k}
                             for k in range(9)]))
vols = [a["volume"] for a in p["audio"]]
check("lap lai ca video khong nho mai (toi da %d bac)" % g.SFX_REPEAT_MAX_STEPS,
      min(vols) >= max(vols) * g.SFX_REPEAT_DECAY ** g.SFX_REPEAT_MAX_STEPS * g.SFX_CROWD_DECAY - 1e-3, "-> %s" % vols)
p, _ = dung(hook_plan(audio=[
    {"sfx_id": "x", "file": "/b.mp3", "_name": "ding", "_lufs": -12.0, "start": 2.0,
     "volume": 0.95, "volume_fixed": True}]))
check("volume_fixed thi guard khong dong vao", p["audio"][0]["volume"] == 0.95)

print("\n[8] Cau truc dung lai duoc — chay lai / doi hook khong chong chat")
goc = hook_plan(hook={"source_id": "source_1", "src_start": 22.3, "src_end": 25.6},
                inserts=[{"meme_id": "wow", "file": "/m.mp4", "_src_duration": 8.0,
                          "source_id": "source_1", "src_time": 7.0, "duration": 1.6, "why": "x"}])
p1, _ = dung(copy(goc))
p2, _ = dung(copy(p1))
check("chay lai khong sinh them hook/meme",
      json.dumps(p1, sort_keys=True) == json.dumps(p2, sort_keys=True))
sua = copy(p1)
sua["hook"]["src_start"], sua["hook"]["src_end"] = 26.4, 29.5
p3, _ = dung(sua)
check("doi gio hook thi hook dung lai theo gio moi",
      abs(p3["segments"][0]["start"] - 26.4) < 0.01, "-> %s" % p3["segments"][0]["start"])
check("khong con hook cu nam lai",
      len([s for s in p3["segments"] if s.get("kind") == "hook"]) == 1)
bo = copy(p1)
bo["hook"] = None
p4, _ = dung(bo)
check("bo hook thi timeline ve dung do dai than video",
      abs(p4["duration"] - (22.0 + 1.6)) < 0.01, "-> %s" % p4["duration"])

print("\n[9] Tranh doan meme ma KHONG tu cat chu thanh 0 giay")
# Bug that (anh chup cua nguoi dung 2026-09-24): guard bao da tu sua
#   "captions19: cat duoi o 27.50s cho khong de len doan meme"
# roi ngay duoi lai bao con viec cho nguoi dung:
#   "cap19: chi hien 0.00s -> doc khong kip"
# Nguyen nhan: caption bat dau DUNG luc meme bat dau (st == a) nen "cat duoi"
# gan end = start. Guard tu de ra viec cho nguoi dung lam.


def plan_co_meme(caps):
    return {
        "source_videos": [{"id": "source_1", "path": "/tmp/a.mp4", "duration": 40.0}],
        "canvas": {"w": 1080, "h": 1920},
        "duration": 20.0,
        "segments": [
            {"source_id": "source_1", "start": 0.0, "end": 5.0, "target_start": 0.0},
            {"kind": "insert", "file": "/meme.mp4", "start": 0.0, "end": 1.6, "target_start": 5.0},
            {"source_id": "source_1", "start": 5.0, "end": 19.0, "target_start": 6.6},
        ],
        "captions": caps, "audio": [], "scene_effects": [],
    }


p = plan_co_meme([{"text": "Chốt lại một câu", "start": 5.0, "end": 7.0}])
ch = []
g.clear_over_inserts(p, ch)
c = p["captions"][0]
check("caption bat dau dung luc meme -> KHONG bi cat con 0s",
      c["end"] - c["start"] > g.MIN_CAPTION_SEC, "-> %.2f-%.2f" % (c["start"], c["end"]))
check("no duoc day ra SAU doan meme (6.6s)", abs(c["start"] - 6.6) < 0.01, c)
check("giu nguyen do dai 2.0s", abs((c["end"] - c["start"]) - 2.0) < 0.01, c)
check("co bao trong 'may da tu sua'", any("day ca khoi" in x for x in ch), ch)

# Cat duoi VAN la cach dung khi con du cho doc
p = plan_co_meme([{"text": "Câu dài chạy vào meme", "start": 2.0, "end": 7.0}])
ch = []
g.clear_over_inserts(p, ch)
c = p["captions"][0]
check("con du cho thi van cat duoi nhu cu", abs(c["end"] - 5.0) < 0.01 and c["start"] == 2.0, c)
check("bao dung viec da lam", any("cat duoi o 5.00s" in x for x in ch), ch)

# Khong con cho nao de hien -> bo han, chu khong de lai xac 0 giay
p = plan_co_meme([{"text": "Chữ sát đuôi video", "start": 19.8, "end": 21.5}])
p["segments"][2]["end"] = 19.0
p["duration"] = 20.0
ch = []
g.clear_over_inserts(p, ch)
check("chu nam ngoai video (khong cham meme) thi khong dong vao", len(p["captions"]) == 1, ch)

p = plan_co_meme([{"text": "Chữ kẹt cuối", "start": 5.0, "end": 5.2}])
p["duration"] = 6.0     # day ra sau meme la vuot qua video -> bo han
ch = []
g.clear_over_inserts(p, ch)
check("day ra ngoai video thi BO han, khong de lai xac 0 giay", p["captions"] == [], p["captions"])
check("co bao la da bo", any("bo han" in x for x in ch), ch)

print("\n[10] Cat o ranh gioi cau sau B2 (snap_segments_to_speech)")
speech = g.plan_speech(hook_plan(), gop=0)
segs = [{"source_id": "source_1", "start": 0.0, "end": 5.2}]    # 5.2 nam trong khoang lang 5.0-5.4
g.snap_segments_to_speech(segs, speech)
check("diem cat nam trong khoang lang thi giu nguyen", abs(segs[0]["end"] - 5.2) < 0.01, segs)
segs = [{"source_id": "source_1", "start": 0.0, "end": 11.5}]   # giua cum 5.4-11.8
ch = []
g.snap_segments_to_speech(segs, speech, ch)
check("diem cat giua cau -> keo ve het cau (11.8)", abs(segs[0]["end"] - 11.8) < 0.01, segs)
check("co ghi lai viec da keo", len(ch) == 1, ch)

print("\n[11] Thong so nguoi dung sua (menu 'Prompt & quy tac')")
goc_path = g.OVERRIDES_PATH
tmp = tempfile.mkdtemp(prefix="pg-rules-")
try:
    g.OVERRIDES_PATH = os.path.join(tmp, "prompt_overrides.json")
    with open(g.OVERRIDES_PATH, "w", encoding="utf-8") as f:
        # MIN_SIZE / ROLE_SPEC / server.* la quy tac cua luong CapCut cu: van nam trong file
        # cua nguoi dung nhung phai bi BO QUA, khong duoc lam guard crash.
        json.dump({"rules": {"MAX_SFX": 3, "HOOK_IDEAL.1": 4.5, "MIN_SIZE": 9,
                             "ROLE_SPEC.hero.size.0": 12, "server.review_max_rounds": 1,
                             "SFX_MIX.ui.lufs": "khong phai so"}}, f)
    g.apply_overrides(force=True)
    check("quy tac con dung duoc ap dung", g.MAX_SFX == 3 and g.HOOK_IDEAL == (3.0, 4.5),
          "-> %s %s" % (g.MAX_SFX, g.HOOK_IDEAL))
    check("quy tac cu cua CapCut bi bo qua (khong tao hang so moi)",
          not hasattr(g, "MIN_SIZE") and not hasattr(g, "ROLE_SPEC"))
    check("gia tri sai kieu bi bo qua, giu mac dinh",
          g.SFX_MIX["ui"]["lufs"] == g.rule_default("SFX_MIX.ui.lufs"))
    check("rule_default khong doi theo file", g.rule_default("MAX_SFX") == 6)
finally:
    g.OVERRIDES_PATH = goc_path
    g.apply_overrides(force=True)
check("khoi phuc ve ban goc khi khong con file tam", g.MAX_SFX == g.rule_default("MAX_SFX"))

print("\n" + "=" * 60)
if FAILED:
    print("FAIL %d: %s" % (len(FAILED), ", ".join(FAILED)))
    raise SystemExit(1)
print("TAT CA PASS")
