#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Su co that 2026-09-27 (IMG_3839) — cac ham dung chung cua luong lap ke hoach:
  1. Chu hien LECH gio noi: 'mình là / MR VI CODING' hien tre 2.7s (Whisper bo sot cau dau -> khop nham chu
     'mình' cua cau sau), 'đăng bài lên' nhay sang lan noi lai 2.9s sau.
  2. Cat trung SAI: nguoi noi liet ke 'đăng bài trên fanpage, nhóm...' roi vap, liet ke LAI -> B1 giu ca hai;
     buoc cat an toan lui dau doan vao phan B1 da bo ('Ví dụ như là'); 1.9s im lang truoc 'thì đây là...'.
  3. Luat hook: hook BAT BUOC co hieu ung hinh + am thanh gay chu y (khong ep loai); SFX hook bi keo ra
     khoi hook theo lop chu cua than video.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_cut_hook_rules.py
"""
import copy
import json
import os
import sys

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

import numpy as np  # noqa: E402

import speech_cut as SC  # noqa: E402
import providers  # noqa: E402
import hook_rule  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


def plan_of(words, segs, **kw):
    p = {"asr_words": {"source_1": [list(w) for w in words]}, "segments": segs,
         "source_videos": [{"id": "source_1", "path": "/khong/co.mp4", "duration": 200.0}]}
    p.update(kw)
    return p


def seg(st, en, ts=0.0, **kw):
    return dict({"source_id": "source_1", "start": st, "end": en, "target_start": ts}, **kw)


def cap(text, a, b):
    return {"role": "support", "source_id": "source_1", "text": text, "src_start": a, "src_end": b}


def txt(text, a, group=None, **kw):
    return dict({"type": "text", "source_id": "source_1", "src_start": a, "src_end": a + 2.0, "group": group,
                 "spans": [{"text": text}]}, **kw)


# ---------------------------------------------------------------------------
print("[1] Chu khop loi noi — khong nhay sang cau khac")
# Whisper BO SOT cau dau (0-4.17: 'Hello mọi người, mình là Mr Vi Coding thì à'), chu dau tien 'Hôm' 4.17
W1 = [("Hôm", 4.17, 4.79), ("nay", 4.79, 5.41), ("mình", 5.41, 5.57), ("sẽ", 5.57, 5.75), ("chia", 5.75, 6.05),
      ("sẻ", 6.05, 6.47), ("cho", 6.47, 7.03), ("mọi", 7.03, 7.23), ("người", 7.23, 7.5)]
p = plan_of(W1, [seg(1.97, 8.0)],
            captions=[cap("Hello mọi người, mình là", 1.97, 3.07), cap("Mr Vi Coding", 3.07, 4.17),
                      cap("Hôm nay mình sẽ chia sẻ", 4.17, 6.47)],
            layers=[txt("mình là", 2.55, "g"), txt("MR VI CODING", 3.07, "g"),
                    {"type": "image", "source_id": "source_1", "src_start": 3.3, "src_end": 5.0, "group": "g"}])
ch = []
SC.snap_layers(p, ch)
check("'mình là' giu 2.55 (khong khop nham 'mình sẽ' 5.41)", p["layers"][0]["src_start"] == 2.55, ch)
check("'MR VI CODING' + hinh cung nhom giu nguyen", p["layers"][1]["src_start"] == 3.07 and p["layers"][2]["src_start"] == 3.3, ch)

# lan noi lai co cum chu DAY DU hon o xa 2.9s: van chon cho gan gio AI dat
W2 = [("vụ", 84.70, 84.88), ("là", 84.88, 85.02), ("đăng", 85.02, 85.20), ("bại", 85.20, 85.36), ("trên", 85.36, 85.52),
      ("Facebook,", 85.52, 85.78), ("tất", 86.10, 86.44), ("vụ", 86.44, 86.62), ("là", 86.62, 86.76), ("đăng", 86.76, 86.92),
      ("bại", 86.92, 87.08), ("trên", 87.08, 87.24), ("fan", 87.24, 87.44), ("bay,", 87.44, 87.70), ("đăng", 88.04, 88.26),
      ("bại", 88.26, 88.44), ("lên", 88.44, 88.60), ("nhóm,", 88.60, 89.00)]
p = plan_of(W2, [seg(84.5, 89.2)],
            captions=[cap("đăng bài trên facebook nè,", 85.02, 86.11), cap("tác vụ là đăng bài trên fanpage nè,", 86.11, 88.04),
                      cap("đăng bài lên nhóm nè,", 88.04, 89.22)],
            layers=[txt("đăng bài lên", 85.02)])
SC.snap_layers(p, [])
check("'đăng bài lên' o dau danh sach 85.02 -> 84.90 (khong nhay 87.92)", abs(p["layers"][0]["src_start"] - 84.90) < 0.02,
      p["layers"][0])

# cum ngan + chu dem chen giua khi noi: 'rất LÀ quan trọng' = 'RẤT QUAN TRỌNG'
W3 = [("này", 64.88, 65.06), ("nó", 65.06, 65.20), ("điều", 65.20, 65.32), ("rất", 65.32, 65.54), ("là", 65.54, 65.66),
      ("quan", 65.66, 65.78), ("trọng", 65.78, 66.06), ("nha", 66.06, 66.3)]
p = plan_of(W3, [seg(64.5, 66.5)], layers=[txt("RẤT QUAN TRỌNG", 65.66)])
SC.snap_layers(p, [])
check("'RẤT QUAN TRỌNG' hien ngay truoc 'rất' (65.20)", abs(p["layers"][0]["src_start"] - 65.20) < 0.02, p["layers"][0])

# khong co cau phu de lam moc: chu 1 tu thong dung khop o xa -> KHONG doi
W4 = [("hôm", 10.0, 10.3), ("nay", 10.3, 10.6), ("mình", 12.4, 12.6), ("đi", 12.6, 12.8)]
p = plan_of(W4, [seg(9.5, 13.5)], layers=[txt("MÌNH", 10.2, src_end=11.8)])
SC.snap_layers(p, [])
check("khong moc cau + khop xa > 1.5s bang 1 chu -> giu nguyen", p["layers"][0]["src_start"] == 10.2, p["layers"][0])

# hinh cung nhom doi theo lop khop GAN no nhat
W5 = [("alpha", 10.0, 10.4), ("x", 10.5, 10.9), ("beta", 12.0, 12.3), ("gamma", 12.3, 12.6)]
p = plan_of(W5, [seg(9.5, 13.5)],
            layers=[txt("ALPHA", 10.3, "g"), txt("BETA GAMMA", 11.4, "g"),
                    {"type": "image", "source_id": "source_1", "src_start": 11.6, "src_end": 13.0, "group": "g"}])
SC.snap_layers(p, [])
dB = p["layers"][1]["src_start"] - 11.4
check("hinh (11.6) doi theo 'BETA GAMMA' (gan nhat), khong theo lop dau nhom",
      abs(p["layers"][2]["src_start"] - (11.6 + dB)) < 1e-6 and dB > 0.3, p["layers"])

# SFX cua HOOK khong bi keo ra ngoai hook theo lop chu cua than video
W6 = [("là", 61.5, 61.82), ("tăng", 61.82, 62.1), ("ý", 62.1, 62.3), ("tính", 62.3, 62.6)]
p = plan_of(W6, [seg(61.0, 66.0)], hook={"source_id": "source_1", "src_start": 61.82, "src_end": 66.38},
            layers=[txt("tăng uy tín", 61.82)],
            audio=[{"sfx_id": "boom", "source_id": "source_1", "src_time": 61.82, "anchor": "hook"},
                   {"sfx_id": "pop", "source_id": "source_1", "src_time": 61.82}])
SC.snap_layers(p, [])
check("lop than video doi 61.82 -> 61.70", abs(p["layers"][0]["src_start"] - 61.70) < 1e-6, p["layers"][0])
check("SFX hook giu 61.82 (van nam trong hook)", p["audio"][0]["src_time"] == 61.82, p["audio"][0])
check("SFX than video doi theo lop", abs(p["audio"][1]["src_time"] - 61.70) < 1e-6, p["audio"][1])

# ---------------------------------------------------------------------------
print("\n[2] Noi lai sau cho vap (bo_lap_trong_video)")
TR = {"source_1": [
    {"start": 81.16, "end": 82.14, "text": "mà điều khiển trình duyệt"},
    {"start": 82.14, "end": 82.62, "text": "để mà làm"},
    {"start": 82.62, "end": 83.66, "text": "những cái tác vụ gì đó,"},
    {"start": 83.66, "end": 85.02, "text": "ví dụ như tác vụ là"},
    {"start": 85.02, "end": 86.11, "text": "đăng bài trên facebook nè,"},
    {"start": 86.11, "end": 88.04, "text": "tác vụ là đăng bài trên fanpage nè,"},
    {"start": 88.04, "end": 89.22, "text": "đăng bài lên nhóm nè,"},
    {"start": 89.22, "end": 91.12, "text": "hoặc là bất kỳ"},
    {"start": 91.12, "end": 91.96, "text": "những cái tác vụ nào đó khác."},
    {"start": 92.06, "end": 97.36, "text": "Ờ ví dụ như là ờ,"},
    {"start": 97.36, "end": 99.80, "text": "tức là nó sẽ giúp cho mọi người"},
    {"start": 99.80, "end": 102.22, "text": "có thể là đăng bài trên fanpage nè,"},
    {"start": 102.22, "end": 103.60, "text": "đăng bài ở trên nhóm,"},
    {"start": 103.60, "end": 106.28, "text": "rồi có thể đăng bài ở trên X."},
    {"start": 106.28, "end": 107.46, "text": "Thì những cái kênh đó"},
    {"start": 107.46, "end": 108.82, "text": "nó sẽ đều giúp cho mọi người"},
]}
sels = [{"source_id": "source_1", "start": 77.32, "end": 91.96}, {"source_id": "source_1", "start": 97.36, "end": 108.82}]
ch, rm = [], []
out = providers.bo_lap_trong_video(copy.deepcopy(sels), TR, ch, removed=rm)
check("bo lan liet ke truoc tu cau lap 'tác vụ là đăng bài trên fanpage' (86.11) toi cho vap",
      [(s["start"], s["end"]) for s in out] == [(77.32, 86.11), (97.36, 108.82)], out)
check("ghi khoang da bo + nhat ky", rm and rm[0]["start"] == 86.11 and rm[0]["end"] == 91.96 and ch, (rm, ch))
check("chay lai: khong bo them", providers.bo_lap_trong_video(out, TR, []) == out)

EMPH = {"source_1": [
    {"start": 61.82, "end": 62.78, "text": "tăng cái uy tín,"},
    {"start": 62.78, "end": 64.58, "text": "giảm tỷ lệ chết nick."},
    {"start": 64.58, "end": 65.32, "text": "Cái này là một điều"},
    {"start": 65.32, "end": 66.38, "text": "rất là quan trọng nha."},
    {"start": 67.4, "end": 68.00, "text": "Cái việc mà giảm tỷ lệ chết nick"},
    {"start": 68.00, "end": 68.68, "text": "và nó có thể"},
    {"start": 68.68, "end": 69.88, "text": "điều khiển được cái trình duyệt"},
]}
s2 = [{"source_id": "source_1", "start": 61.82, "end": 66.38}, {"source_id": "source_1", "start": 67.4, "end": 69.88}]
check("nhac lai co chu y 1 cau (ke ca co khoang nghi) -> KHONG bo",
      providers.bo_lap_trong_video(copy.deepcopy(s2), EMPH, []) == s2)
LIST = {"source_1": [
    {"start": 10.0, "end": 11.0, "text": "đăng bài trên facebook nè,"},
    {"start": 11.0, "end": 12.0, "text": "đăng bài trên fanpage nè,"},
    {"start": 13.5, "end": 14.5, "text": "đăng bài lên nhóm nè,"},
    {"start": 14.5, "end": 15.5, "text": "đăng bài trên tiktok nè"},
]}
s3 = [{"source_id": "source_1", "start": 10.0, "end": 12.0}, {"source_id": "source_1", "start": 13.5, "end": 15.5}]
check("danh sach dai (chi chung 'đăng bài') ngat giua chung -> KHONG bo",
      providers.bo_lap_trong_video(copy.deepcopy(s3), LIST, []) == s3)

segs = [seg(85.02, 88.04), seg(88.04, 91.96), seg(97.36, 102.22)]
ch = []
segs = providers.ton_trong_da_bo(segs, rm, ch)
check("B2 dua lai phan da bo -> cat ra", [(s["start"], s["end"]) for s in segs] == [(85.02, 86.11), (97.36, 102.22)], segs)

# ---------------------------------------------------------------------------
print("\n[3] Mep ke phan da bo: khong lui vao, dang co tieng thi tien toi cho ngat")
W7 = [("khác.", 91.5, 92.06), ("Ví", 96.58, 96.98), ("dụ", 96.98, 97.14), ("như", 97.14, 97.36), ("là", 97.36, 97.56),
      ("nó", 97.56, 98.74), ("sẽ", 98.74, 98.96), ("giúp", 98.96, 99.16), ("cho", 99.16, 99.32), ("mọi", 99.32, 99.52),
      ("người", 99.52, 99.80)]
db = np.full(int(120 / SC.HOP) + 1, -60.0, dtype=np.float32)
for a, b in ((91.5, 92.06), (96.70, 97.59), (97.94, 98.35), (98.46, 99.8)):
    db[int(round(a / SC.HOP)):int(round(b / SC.HOP))] = -20.0
orig_energy = SC.energy
SC.energy = lambda path: db
removed = [{"source_id": "source_1", "start": 91.96, "end": 97.36, "ly_do": "tieng dem"}]
s_old = [seg(97.36, 99.8)]
SC.fix_segment_cuts(plan_of(W7, s_old), s_old, [])
check("(cu) khong biet phan da bo -> lui ve dau cau 'Ví' (giu hanh vi cu)", s_old[0]["start"] < 96.7, s_old)
s_new = [seg(97.36, 99.8)]
providers.gioi_han_cat(s_new, removed, [])
ch = []
SC.fix_segment_cuts(plan_of(W7, s_new), s_new, ch)
check("ke phan da bo -> khong lui vao 'Ví dụ như', tien toi khoang lang 97.59-97.94",
      97.85 <= s_new[0]["start"] <= 97.94 and s_new[0].get("hard_lo") == 97.11, (s_new, ch))
ch2 = []
SC.fix_segment_cuts(plan_of(W7, s_new), s_new, ch2)
check("chay lai (build_spec): khong doi", not ch2, ch2)
SC.energy = orig_energy

print("\n[4] Khoang lang / 'Ờ' o dau doan (loi Gemini xac nhan)")
W8 = [("cái...", 114.46, 114.92), ("thì", 116.82, 117.22), ("đây", 117.22, 117.48), ("là", 117.48, 117.70),
      ("một", 117.70, 117.92), ("cái", 117.92, 118.70)]
TR8 = {"source_1": [{"start": 114.92, "end": 118.70, "text": "Ờ thì đây là một cái"}]}
s8 = [seg(114.92, 118.70)]
ch = []
SC.trim_filler_edges(plan_of(W8, s8), s8, TR8, ch)
check("'Ờ' + 1.9s lang truoc 'thì' -> vao ngay truoc 'thì'", abs(s8[0]["start"] - 116.67) < 0.02 and ch, (s8, ch))
TR9 = {"source_1": [{"start": 1.97, "end": 3.07, "text": "Hello mọi người, mình là"},
                    {"start": 3.07, "end": 4.17, "text": "Mr Vi Coding thì à"},
                    {"start": 4.17, "end": 6.47, "text": "hôm nay mình sẽ chia sẻ"}]}
s9 = [seg(1.97, 6.47)]
SC.trim_filler_edges(plan_of(W1, s9), s9, TR9, [])
check("Whisper bo sot cau that ('Hello mọi người...') -> KHONG cat", s9[0]["start"] == 1.97, s9)

# ---------------------------------------------------------------------------
print("\n[5] Luat hook")
seen = {}
orig_chat = providers.plan_chat


def fake_chat(msgs, **kw):
    seen[kw.get("step_label")] = msgs[0]["content"]
    return json.dumps({"hook": None, "audio": [], "effects": []})


providers.plan_chat = fake_chat
import fx_flow  # noqa: E402
import motion_design  # noqa: E402
import remotion_plan  # noqa: E402
providers.gpt_hook([seg(0, 5)], {}, {}, {})
providers.gpt_audio({}, {}, [{"id": "x"}], segments=[seg(0, 5)], hook_visuals=[{"loai": "shake"}])
fx_flow.gpt_fx_plan([], hook={"src_start": 1})
motion_design.gpt_rm_design([seg(0, 5)], {}, {}, {})
remotion_plan.gpt_rm_visual([seg(0, 5)], {})
providers.plan_chat = orig_chat
for lb in ("B3-hook", "B7-audio", "FX-plan"):
    check("luat hook noi vao prompt %s" % lb, "LUAT HOOK" in (seen.get(lb) or ""), list(seen))
# luong duy nhat (2026-09-28): R4 thiet ke KHONG khai hieu ung — hieu ung hook do FX tu viet (luat o prompt FX);
# R4 du phong (R4-visual, khi R4 thiet ke hong) van chon hieu ung trong kho -> van phai co luat hook
r4 = seen.get("R4-design") or ""
check("R4 thiet ke: khong khai hieu ung, khong noi luat hook R4 cua luong cu",
      'KHONG khai "effects"' in r4 and "LUAT HOOK" not in r4, list(seen))
check("luat hook noi vao prompt R4 du phong (R4-visual)", "LUAT HOOK" in (seen.get("R4-visual") or ""), list(seen))
check("khong ep loai hieu ung", "KHONG co loai hieu ung mac dinh" in hook_rule.LUAT_HOOK)

spec = {"duration": 30, "clips": [{"kind": "hook", "start": 0, "end": 4.4}, {"kind": "body", "start": 4.4, "end": 30}],
        "effects": [{"type": "zoom_punch", "start": 8, "end": 9}], "audio": [{"role": "sfx", "start": 6, "name": "pop"}]}
r = hook_rule.check(spec)
check("kiem: hook thieu ca hinh + tieng", r["thieu"] == ["visual", "sound"], r)
spec2 = dict(spec, fxTransforms=[{"id": "fx5", "start": 0.96, "end": 2}], audio=[{"role": "sfx", "start": 0.0, "name": "boom"}])
check("kiem: co transform tu viet + SFX trong hook -> du", hook_rule.check(spec2)["thieu"] == [])
spec3 = {"duration": 30, "clips": [{"kind": "body", "start": 0, "end": 30}], "effects": [{"type": "flash", "start": 1, "end": 1.3}],
         "audio": []}
check("khong co hook -> xet 3.5s dau video", hook_rule.check(spec3)["thieu"] == ["sound"] and hook_rule.window(spec3) == (0.0, 3.5))

CAT = [{"id": "vine-boom", "sound_type": "impact", "emotion": "punch", "intensity": "manh", "has_speech": False},
       {"id": "voice", "has_speech": True}, {"id": "ding", "sound_type": "ding", "intensity": "nhe"},
       {"id": "soft-whoosh", "sound_type": "whoosh", "intensity": "nhe"}]
plan = {"hook": {"source_id": "source_1", "src_start": 61.82, "src_end": 66.38, "caption": "GIẢM CHẾT NICK"},
        "segments": [seg(1.0, 60.0)], "audio": [], "scene_effects": [], "source_videos": [{"id": "source_1"}]}


def fake_build(pl):
    """Spec gia: hieu ung kho cua hook -> 'effects' (gio timeline = gio nguon - dau hook); SFX hook -> audio."""
    h0 = pl["hook"]["src_start"]
    eff = [{"type": e["type"], "intensity": e.get("intensity", 0.7), "start": round(e["src_start"] - h0, 2),
            "end": round(e["src_end"] - h0, 2)} for e in pl.get("scene_effects") or [] if e.get("anchor") == "hook"]
    aud = [{"role": "sfx", "start": round(a["src_time"] - h0, 2), "volume": 0.8, "name": a["sfx_id"]}
           for a in pl.get("audio") or [] if a.get("anchor") == "hook"]
    return {"duration": 30, "clips": [{"kind": "hook", "start": 0, "end": 4.5}], "effects": eff, "audio": aud}, {"ok": True}


def ai_step(name, payload, fn):
    if name == "Hook-SFX":
        return {"audio": [{"sfx_id": "voice", "src_time": 61.9}, {"sfx_id": "ding", "src_time": 61.9, "why": "chot"}]}
    if name == "Hook-FX":
        return {"effects": [{"type": "zoom_punch", "src_start": 61.88, "src_end": 62.4, "intensity": 0.8, "why": "dap mo hook"},
                            {"type": "shake", "src_start": 63.8, "src_end": 64.4, "why": "soc o cau chot"}]}
    return None


import engine  # noqa: E402
orig_resolve = engine.resolve_plan_sfx
engine.resolve_plan_sfx = lambda pl, **kw: pl
pl, sp, rep, notes = hook_rule.ensure(copy.deepcopy(plan), fake_build(plan)[0], fake_build, ai_step, sfx_catalog=CAT)
check("AI bo sung SFX (bo tieng co giong nguoi) + hieu ung toan khung 2 nhip, anchor hook",
      [a["sfx_id"] for a in pl["audio"]] == ["ding"] and pl["audio"][0]["anchor"] == "hook"
      and [e["type"] for e in pl["scene_effects"]] == ["zoom_punch", "shake"] and pl["scene_effects"][0]["anchor"] == "hook",
      (pl["audio"], pl["scene_effects"]))
check("sau bo sung: hook dat (muc vua mac dinh)", not hook_rule._problems(hook_rule.check(sp, "vua", pl)) and rep is not None,
      hook_rule.check(sp, "vua", pl)["yeu"])
pl, sp, rep, notes = hook_rule.ensure(copy.deepcopy(plan), fake_build(plan)[0], fake_build, lambda n, p_, f: None,
                                      sfx_catalog=CAT)
check("AI khong tra loi -> du phong muc vua (tieng dam + dap camera 2 nhip), ghi ro, DAT",
      pl["audio"] and pl["audio"][0]["sfx_id"] == "vine-boom" and [e["type"] for e in pl["scene_effects"]][:2] == ["zoom_punch", "zoom_punch"]
      and any("du phong" in n for n in notes) and not hook_rule._problems(hook_rule.check(sp, "vua", pl)),
      (pl["scene_effects"], notes))
ok_spec = {"duration": 30, "clips": [{"kind": "hook", "start": 0, "end": 4}],
           "effects": [{"type": "zoom_punch", "intensity": 0.8, "start": 0.2, "end": 0.8},
                       {"type": "zoom_punch", "intensity": 0.8, "start": 2.0, "end": 2.6}],
           "audio": [{"role": "sfx", "start": 0.1}]}
pl, sp, rep, notes = hook_rule.ensure(copy.deepcopy(plan), ok_spec, fake_build, ai_step, sfx_catalog=CAT)
check("hook da dat -> khong goi AI, khong dung lai (ghi so do)", rep is None and sp is ok_spec and "đạt" in notes[0], notes)

print("\n[6] Do NHIP + hieu ung TOAN KHUNG, muc do theo TONE / YEU CAU EDIT")
check("muc do: B3 ghi -> dung", hook_rule.muc_do({"hook": {"attention": {"muc_do": "nhe", "ly_do_muc_do": "tam su"}}})[0] == "nhe")
check("muc do: yeu cau edit 'vui, bat trend' THANG B3 'vua'",
      hook_rule.muc_do({"hook": {"attention": {"muc_do": "vua"}}}, {"edit_request": {"style": "nhanh, vui, bắt trends"}})[0] == "manh")
check("muc do: doan theo tone", hook_rule.muc_do({}, {"tone": "kể chuyện nhẹ nhàng, sâu lắng"})[0] == "nhe"
      and hook_rule.muc_do({}, {"tone": "chia sẻ kiến thức"})[0] == "vua")
FPS = 30
push = {"scale": [1 + 0.06 * min(1, i / 50.0) for i in range(60)]}                   # day may cham 6%
punch = {"scale": [1 + 0.16 * min(1, i / 4.0) for i in range(20)]}                    # dap 16% trong 0.13s roi GIU
zc = {"scale": [1 + 0.1 * min(1, i / 4.0) for i in range(20)], "x": [-9 * min(1, i / 4.0) for i in range(20)]}
shake = {"x": [(12 if i % 2 else -12) for i in range(20)]}
e_push, _, _ = hook_rule._transform_events(push, FPS, 0.0)
e_punch, h_punch, _ = hook_rule._transform_events(punch, FPS, 0.0)
e_zc, h_zc, d_zc = hook_rule._transform_events(zc, FPS, 0.0)
e_sh, h_sh, _ = hook_rule._transform_events(shake, FPS, 0.0)
check("day may cham 6% = khong co nhip nao trong luc day (chi co cu bat ve nho khi het)",
      not [e for e in e_push if e[0] < 1.9] and all(e[2] < 0.5 for e in e_push), e_push)
check("dap 16% roi GIU = 1 nhip ro luc dap (+ 1 nhip bat ve khi het), KHONG tinh trang thai giu",
      e_punch and e_punch[0][2] >= 1.0 and e_punch[0][0] < 0.1 and len(e_punch) <= 2, e_punch)
check("dich tam khi phong to KHONG tinh la rung", d_zc["rung_px_khung"] == 0 and not h_zc, d_zc)
check("rung doi chieu lien tuc = nhip manh + gat", e_sh and max(x[2] for x in e_sh) >= 1.5 and h_sh, e_sh)

import tempfile  # noqa: E402
TMP = tempfile.mkdtemp(prefix="hookfx-")


def frames_file(name, svg_of, n=30):
    path = os.path.join(TMP, name + ".json")
    json.dump({"v": 1, "fps": 30, "n": n, "frames": [svg_of(i) for i in range(n)], "idx": list(range(n))}, open(path, "w"))
    return path


SVG = '<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">%s</svg>'
vig = frames_file("vig", lambda i: "" if i < 2 else SVG % ('<rect x="0" y="0" width="1080" height="1920" fill="rgba(0,0,0,%.2f)"/>' % min(0.5, 0.05 * i)))
badge = frames_file("badge", lambda i: "" if i < 2 else SVG % '<circle cx="540" cy="300" r="140" fill="#ff4757"/>', n=120)
thin = frames_file("thin", lambda i: SVG % '<path d="M 200 1100 L 260 1100" stroke="#b6ff3b" stroke-width="4" fill="none"/>')
r_vig, r_badge, r_thin = hook_rule._overlay_events(vig, 0.0), hook_rule._overlay_events(badge, 0.0), hook_rule._overlay_events(thin, 0.0)
check("lop toi ca khung hien dan = TOAN KHUNG, co nhip (khung trong luc dau van do duoc)", r_vig and r_vig[1] and r_vig[0], r_vig)
check("huy hieu nho bat ra = co nhip nhung KHONG toan khung", r_badge and r_badge[0] and not r_badge[1], r_badge)
check("net manh dung yen = khong nhip, khong toan khung", r_thin and not r_thin[1] and not [e for e in r_thin[0] if e[0] > 0.1], r_thin)

hook_spec = lambda eff, fx=None, fxt=None, aud=None, layers=None: {  # noqa: E731
    "duration": 60, "clips": [{"kind": "hook", "start": 0, "end": 4.4}], "effects": eff, "fx": fx or [],
    "fxTransforms": fxt or [], "layers": layers or [],
    "audio": aud if aud is not None else [{"role": "sfx", "start": 0.0, "volume": 0.7}]}
r = hook_rule.check(hook_spec([], fxt=[{"id": "fx5", "start": 0.96, "end": 2.8, "values": push}]), "vua")
check("video cu: day may nhe luc 0.96s -> toan khung YEU + khong cham dau hook",
      any("toàn khung mạnh nhất" in x or "TOÀN KHUNG" in x for x in r["yeu"]["visual"])
      and any("chạm" in x for x in r["yeu"]["visual"]), r["yeu"])
# video 2026-09-28: dap 0.03s roi GIU + huy hieu nho + hinh bat 2.38s -> muc manh: thieu nhip, dung im lau
sp_v3 = hook_spec([], fxt=[{"id": "fx1", "start": 0.0, "end": 4.4, "values": {"scale": [1 + 0.2 * min(1, i / 8.0) for i in range(132)]}}],
                  fx=[{"id": "fx2", "start": 0.0, "end": 4.0, "file": badge}],
                  layers=[{"id": "hk2", "type": "image", "start": 2.38, "end": 4.0, "enter": {"preset": "pop", "duration": 0.3}}])
r = hook_rule.check(sp_v3, "manh")
check("hook dap roi dung im (nhu video moi) -> muc manh: CHUA DAT vi dung im qua lau",
      any("đứng im" in x for x in r["yeu"]["visual"]), r["yeu"])
beats3 = {"scale": [1 + 0.2 * max(0.0, 1 - min(abs(i - c) for c in (2, 40, 80)) / 5.0) for i in range(120)]}
r = hook_rule.check(hook_spec([], fxt=[{"id": "h", "start": 0.0, "end": 4.0, "values": beats3}]), "manh")
check("3 cu dap 20% (0.07s, 1.3s, 2.7s) -> dat muc manh", not r["yeu"]["visual"], r["yeu"])
r = hook_rule.check(hook_spec([{"type": "light_leak", "intensity": 0.8, "start": 0.1, "end": 3.5}]), "nhe")
check("tone nhe: vet sang am ro rang, muot -> DAT muc nhe", not r["yeu"]["visual"], r["yeu"])
r = hook_rule.check(hook_spec([], fxt=[{"id": "fxs", "start": 0.05, "end": 0.8, "values": shake}]), "nhe")
check("tone nhe: rung gat -> QUA GAT", any("gắt" in x for x in r["yeu"]["visual"]), r["yeu"])
sp_body = hook_spec([{"type": "zoom_punch", "intensity": 0.8, "start": 0.1, "end": 0.7},
                     {"type": "zoom_punch", "intensity": 0.8, "start": 2.0, "end": 2.6}],
                    fxt=[{"id": "b", "start": 30, "end": 31, "values": shake}])
r = hook_rule.check(sp_body, "vua")
check("than video co cu rung manh hon -> hook phai noi bat hon", any("thân video" in x for x in r["yeu"]["visual"]), r["yeu"])
r = hook_rule.check(hook_spec([{"type": "zoom_punch", "intensity": 0.9, "start": 0.1, "end": 0.7},
                               {"type": "zoom_punch", "intensity": 0.9, "start": 2.0, "end": 2.6}],
                              aud=[{"role": "sfx", "start": 2.4, "volume": 0.7}]), "vua")
check("SFX hook vao muon (2.4s) -> yeu am thanh", r["yeu"]["sound"], r["yeu"])

# tone nhe + hieu ung hook gat -> AI lam lai em hon; hieu ung gat bi bo
plan_n = copy.deepcopy(plan)
plan_n["hook"]["attention"] = {"muc_do": "nhe", "ly_do_muc_do": "ke chuyen tam su"}
plan_n["scene_effects"] = [{"type": "shake", "anchor": "hook", "source_id": "source_1", "src_start": 61.9, "src_end": 62.5, "intensity": 0.8}]
plan_n["audio"] = [{"sfx_id": "soft-whoosh", "anchor": "hook", "source_id": "source_1", "src_time": 61.85}]
seen_fx = {}


def soft_step(name, payload, fn):
    seen_fx[name] = payload
    if name == "Hook-FX":
        return {"effects": [{"type": "flash", "src_start": 61.9, "src_end": 62.2},             # gat -> loai
                            {"type": "light_leak", "src_start": 61.88, "src_end": 63.2, "intensity": 0.8, "why": "am ap"}]}
    return None


pl, sp, rep, notes = hook_rule.ensure(plan_n, fake_build(plan_n)[0], fake_build, soft_step, sfx_catalog=CAT)
check("tone nhe: bo rung gat, nhan vet sang em (loai flash AI de xuat)",
      [e["type"] for e in pl["scene_effects"]] == ["light_leak"], pl["scene_effects"])
check("AI nhan muc do + so do van de", seen_fx.get("Hook-FX", {}).get("muc") == "nhe"
      and any("gắt" in x for x in seen_fx["Hook-FX"].get("vd") or []), seen_fx.get("Hook-FX"))
check("sau lam lai: dat muc nhe", not hook_rule._problems(hook_rule.check(sp, "nhe", pl)), hook_rule.check(sp, "nhe", pl)["yeu"])
plan_n2 = copy.deepcopy(plan)
plan_n2["hook"]["attention"] = {"muc_do": "nhe"}
pl, sp, rep, notes = hook_rule.ensure(plan_n2, fake_build(plan_n2)[0], fake_build, lambda n, p_, f: None, sfx_catalog=CAT)
check("tone nhe + AI khong tra loi -> du phong EM (focus + tieng em), khong dap / boom",
      [e["type"] for e in pl["scene_effects"]] == ["focus"] and pl["audio"][0]["sfx_id"] in ("soft-whoosh", "ding"),
      (pl["scene_effects"], pl["audio"]))
plan_m = copy.deepcopy(plan)
pl, sp, rep, notes = hook_rule.ensure(plan_m, fake_build(plan_m)[0], fake_build, lambda n, p_, f: None, sfx_catalog=CAT,
                                      story={"edit_request": {"style": "vui, bắt trend"}})
check("muc manh + AI khong tra loi -> du phong du 3 nhip, khong dung im qua 1.5s -> DAT",
      len(pl["scene_effects"]) >= 3 and not hook_rule._problems(hook_rule.check(sp, "manh", pl)),
      (pl["scene_effects"], hook_rule.check(sp, "manh", pl)["yeu"]))

# siet khoang nghi
print("\n[7] Siet khoang nghi theo nhip video")
check("nhip: nhanh 0.30 / thuong 0.45 / nhe 0.75",
      SC.pause_limit({"edit_request": {"style": "nhanh, vui"}}) == 0.30 and SC.pause_limit({"tone": "chia sẻ"}) == 0.45
      and SC.pause_limit({"tone": "tâm sự nhẹ nhàng"}) == 0.75)
W9 = [("một", 10.0, 10.3), ("hai", 10.3, 10.6), ("ba", 11.4, 11.7), ("bốn", 11.7, 12.0), ("năm", 12.8, 13.1), ("sáu", 13.1, 13.4)]
db9 = np.full(int(40 / SC.HOP) + 1, -60.0, dtype=np.float32)
for a, b in ((10.0, 10.62), (11.4, 12.02), (12.8, 13.42), (14.3, 15.0)):
    db9[int(round(a / SC.HOP)):int(round(b / SC.HOP))] = -20.0
W9 += [("bảy", 14.3, 14.6), ("tám", 14.6, 15.0)]
SC.energy = lambda path: db9
p9 = plan_of(W9, [])
segs9 = [seg(9.9, 13.6, 0.0, scale=1.1), seg(13.6, 15.1, 3.7)]
ch = []
out9 = SC.tighten_pauses(p9, copy.deepcopy(segs9), 0.30, ch)
check("khoang lang 0.78s giua doan -> tach doan, giu 80ms moi ben; doan sau doi khung (jump-cut)",
      len(out9) >= 3 and abs(out9[0]["end"] - (10.62 + 0.08)) < 0.02 and abs(out9[1]["start"] - (11.4 - 0.08)) < 0.02
      and out9[1]["scale"] != out9[0]["scale"], [(s["start"], s["end"], s.get("scale")) for s in out9])
check("cho noi 2 doan (duoi 0.18s + dau 0.7s lang) -> cat", any("cho noi" in c for c in ch)
      and abs(out9[-1]["start"] - (14.3 - 0.06)) < 0.02, (ch, out9[-1]))
ch2 = []
SC.fix_segment_cuts(p9, out9, ch2)
check("cat an toan chay lai khong noi lai khoang nghi (on dinh)", not ch2, ch2)
out_slow = SC.tighten_pauses(p9, copy.deepcopy(segs9), 0.75, [])
check("tone nhe (giu toi 0.75s) -> khoang 0.78s van cat, khoang ngan hon giu", len(out_slow) >= 2)
SC.energy = orig_energy
engine.resolve_plan_sfx = orig_resolve

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
