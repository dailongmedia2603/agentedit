#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test luong Video Remotion: plan -> RenderSpec (khong goi AI, khong can mang).

Chay:  HOME=$(mktemp -d) <venv_python> tests/test_remotion_plan.py
(can ffmpeg de tao video thu; HOME tam de khong doc prompt_overrides.json cua may that)
"""
import os
import sys
import json
import copy
import shutil
import tempfile
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sidecar"))

import remotion_plan as RP  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % (detail,)))
    if not cond:
        FAILS.append(name)


def ff(*args):
    subprocess.run([RP._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def make_media(tmp):
    src = os.path.join(tmp, "src.mp4")
    ff("-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=30", "-f", "lavfi",
       "-i", "sine=frequency=440:duration=30", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", src)
    meme = os.path.join(tmp, "meme.mp4")
    ff("-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=4", "-c:v", "libx264",
       "-pix_fmt", "yuv420p", meme)
    sfx = os.path.join(tmp, "boom.mp3")
    ff("-f", "lavfi", "-i", "sine=frequency=90:duration=6", sfx)
    return src, meme, sfx


def base_plan(src, meme, sfx):
    speech = [{"source_id": "source_1", "start": float(a), "end": float(a) + 1.8} for a in range(0, 28, 2)]
    return {
        "engine": "remotion",
        "source_videos": [{"id": "source_1", "path": src, "name": "src.mp4", "duration": 30.0}],
        "canvas": {"w": 1080, "h": 1920}, "fps": 30,
        "segments": [
            {"source_id": "source_1", "start": 0.0, "end": 6.0, "target_start": 0.0, "beat": "setup",
             "transition": "Dissolve"},
            {"source_id": "source_1", "start": 8.0, "end": 14.0, "target_start": 6.0, "beat": "body",
             "rm_transition": {"type": "crossfade", "duration": 0.5}},
            {"source_id": "source_1", "start": 16.0, "end": 22.0, "target_start": 12.0, "beat": "payoff"},
        ],
        "hook": {"source_id": "source_1", "src_start": 17.0, "src_end": 20.8, "caption": "SỐC CHƯA",
                 "rm_transition": {"type": "zoom_in", "duration": 0.35}},
        "caption_theme": {"style_body": "karaoke", "style_hero": "hero_title", "font_body": "lexend",
                          "karaoke_fx": "fill_sweep", "text_edge": "soft_shadow", "weight_body": 600,
                          "font_hero": "anton", "accent": "#FF3B5C"},
        "captions": [
            {"text": "Mở đầu câu chuyện", "role": "support", "source_id": "source_1", "src_start": 0.2, "src_end": 2.0},
            {"text": "chồng giờ với câu trên", "role": "support", "source_id": "source_1", "src_start": 1.2, "src_end": 3.0},
            {"text": "CON SỐ", "role": "hero", "source_id": "source_1", "src_start": 9.0, "src_end": 10.5,
             "position": "lower"},
            {"text": "câu phụ cùng lúc", "role": "support", "source_id": "source_1", "src_start": 9.0, "src_end": 10.5},
            {"text": "đoạn đã bị cắt", "role": "support", "source_id": "source_1", "src_start": 6.5, "src_end": 7.5},
            {"text": "kiểu sai vai", "role": "micro", "style": "hero_title", "source_id": "source_1",
             "src_start": 18.0, "src_end": 19.0, "y": 0.95},
        ],
        "scene_effects": [
            {"type": "zoom_punch", "source_id": "source_1", "src_start": 9.0, "src_end": 10.0, "intensity": 0.8},
            {"type": "khong_ton_tai", "source_id": "source_1", "src_start": 2.0, "src_end": 3.0},
            {"type": "emoji_pop", "source_id": "source_1", "src_start": 3.0, "src_end": 4.0,
             "params": {"emoji": "😱 thừa"}},
            {"type": "flash", "source_id": "source_1", "src_start": 3.2, "src_end": 3.5},
            {"type": "shake", "source_id": "source_1", "src_start": 4.0, "src_end": 4.6},
            {"type": "emoji_pop", "source_id": "source_1", "src_start": 18.5, "src_end": 19.5},
        ],
        "grade": {"preset": "warm", "intensity": 1.7},
        "inserts": [{"meme_id": "m1", "file": meme, "source_id": "source_1", "src_time": 11.9,
                     "placement": "cutaway", "duration": 1.5, "_src_duration": 4.0, "_w": 640, "_h": 360}],
        "audio": [
            {"sfx_id": "boom", "file": sfx, "source_id": "source_1", "src_time": 9.0},
            {"sfx_id": "boom", "file": sfx, "source_id": "source_1", "src_time": 9.2},
            {"sfx_id": "boom", "file": sfx, "source_id": "source_1", "src_time": 7.0},
        ],
        "speech": speech,
    }


def main():
    tmp = tempfile.mkdtemp(prefix="rm-test-")
    try:
        src, meme, sfx = make_media(tmp)
        plan = base_plan(src, meme, sfx)
        goc = copy.deepcopy(plan)
        RP.hook_caption(plan)
        spec, rep = RP.build_spec(plan)
        print("fixed:\n   " + "\n   ".join(rep["fixed"]))

        print("[1] cau truc")
        clips = spec["clips"]
        kinds = [c["kind"] for c in clips]
        check("clip dau la hook", kinds[0] == "hook", kinds)
        check("co doan meme CAT vao", "insert" in kinds, kinds)
        hook = clips[0]
        check("hook mang chuyen canh Remotion zoom_in", (hook["transitionOut"] or {}).get("type") == "zoom_in",
              hook["transitionOut"])
        check("timeline lien tuc", all(abs(a["end"] - b["start"]) < 1e-3 for a, b in zip(clips, clips[1:])),
              [(c["start"], c["end"]) for c in clips])
        check("do dai = clip cuoi", abs(spec["duration"] - clips[-1]["end"]) < 1e-3)
        check("khong con key transition CapCut", all("transition" not in c for c in clips))
        ins = [c for c in clips if c["kind"] == "insert"][0]
        check("meme ngang trong khung doc -> fit blur", ins["fit"] == "blur", ins["fit"])
        check("meme cat vao co tieng", ins["volume"] >= 0.25, ins["volume"])
        before_ins = clips[clips.index(ins) - 1]
        check("doan truoc meme khong chuyen canh vao meme", before_ins["transitionOut"] is None,
              before_ins["transitionOut"])

        print("[2] chuyen canh can chat lieu hai ben")
        body1 = [c for c in clips if c["kind"] == "body"]
        trs = [c["transitionOut"] for c in clips if c["transitionOut"]]
        check("crossfade con (du chat lieu) hoac da doi kieu cat", all(
            (t["type"] == "crossfade" and t["overlap"]) or not t["overlap"] for t in trs), trs)
        for c in clips:
            t = c["transitionOut"]
            if t and t["overlap"]:
                check("tay cam truoc >= 0", c["srcStart"] - 0 >= 0)

        print("[3] caption")
        caps = spec["captions"]
        texts = [c["text"] for c in caps]
        check("caption doan da cat bi bo", "đoạn đã bị cắt" not in texts, texts)
        hook_cap = [c for c in caps if c["text"] == "SỐC CHƯA"]
        check("co caption hook o dau video", hook_cap and hook_cap[0]["start"] < hook["end"], hook_cap)
        check("caption hook la hero_title", hook_cap and hook_cap[0]["style"] == "hero_title")
        sup = sorted([c for c in caps if c["role"] == "support"], key=lambda c: c["start"])
        check("phu de khong chong gio", all(a["end"] <= b["start"] + 1e-3 for a, b in zip(sup, sup[1:])),
              [(c["text"], c["start"], c["end"]) for c in sup])
        hero = [c for c in caps if c["text"] == "CON SỐ"][0]
        # "câu phụ cùng lúc" (4 chu, karaoke) -> luat karaoke chia 2+2: lay cum dau
        phu = [c for c in caps if c["text"] == "câu phụ"][0]
        check("hero va phu de cung luc bi tach vung", abs(hero["y"] - phu["y"]) >= 0.24, (hero["y"], phu["y"]))
        check("hero uppercase + font hero", hero["uppercase"] and hero["font"] == "anton", hero)
        check("phu de dung font body", phu["font"] == "lexend", phu["font"])
        micro = [c for c in caps if c["text"] == "kiểu sai vai"][0]
        check("micro doi kieu sai vai -> lower_third", micro["style"] == "lower_third", micro["style"])
        check("y bi keo khoi vung giao dien che", micro["y"] <= RP.SAFE_Y[1] + 1e-6, micro["y"])
        tl_hero = hero["start"]
        check("hero quy doi dung (co hook dich)", abs(tl_hero - (hook["end"] + 6.0 + 1.0)) < 0.05,
              (tl_hero, hook["end"]))
        check("khong caption nao de len meme", all(not (c["start"] < ins["end"] - 1e-3 and c["end"] > ins["start"] + 1e-3)
                                                     for c in caps), [(c["text"], c["start"], c["end"]) for c in caps])

        print("[4] hieu ung")
        types = [e["type"] for e in spec["effects"]]
        check("id la bi bo", "khong_ton_tai" not in types, types)
        check("zoom_punch giu", "zoom_punch" in types, types)
        # 2026-09-27: icon emoji tho bi cam — emoji_pop luon bi bo (ke ca plan cu / video mau co khai)
        check("emoji_pop bi bo (icon tho)", "emoji_pop" not in types, types)
        check("hieu ung manh cach nhau >= 2.5s", "shake" not in types, types)

        print("[5] tong mau + SFX")
        check("grade intensity bi kep <= 1", spec["grade"]["intensity"] <= 1.0, spec["grade"])
        auds = spec["audio"]
        # tieng code tu gan cho chu (luat chu co tieng, bo tieng kit-*) tach rieng khoi SFX cua plan
        plan_auds = [a for a in auds if a["path"] == sfx]
        check("SFX sat nhau bi bo", len(plan_auds) == 1, [(a["start"], a["name"]) for a in auds])
        # con lai dung SFX o giay nguon 9.0 -> than video 7.0 -> timeline = hook + 7.0
        check("SFX gio nguon da cat khoi timeline bi bo, con dung cai o 9.0s nguon",
              len(plan_auds) == 1 and abs(plan_auds[0]["start"] - (hook["end"] + 7.0)) < 0.05,
              [(a["start"], hook["end"]) for a in plan_auds])
        # LUAT CHU CO TIENG (2026-10-01): chu hook + micro chua co tieng -> tu gan; hero 'CON SO' trung luc SFX 9.0 -> dung chung
        starts = [a["start"] for a in auds]
        for c in caps:
            if c["role"] in ("hero", "micro"):
                check("chu %s '%s' co tieng luc hien" % (c["role"], c["text"]),
                      any(c["start"] - 0.2 <= t <= c["start"] + 0.3 for t in starts), (c["start"], starts))
        check("khong 2 tieng chong cung luc", all(b_ - a_ >= 0.12 for a_, b_ in zip(sorted(starts), sorted(starts)[1:])),
              sorted(starts))
        check("SFX dai bi cat <= 4s", all(a["srcEnd"] - a["srcStart"] <= 4.0 + 1e-6 for a in auds))
        check("SFX co am luong do guard tinh", all(0 < a["volume"] <= 1 for a in auds), auds)

        print("[6] ham thuan")
        spec2, _ = RP.build_spec(plan)
        check("chay lai ra y het", json.dumps(spec, sort_keys=True) == json.dumps(spec2, sort_keys=True))
        RP.hook_caption(goc)
        check("khong sua plan dau vao", json.dumps(goc, sort_keys=True, default=str) ==
              json.dumps(plan, sort_keys=True, default=str))

        print("[6b] ranh gioi doan + khong doi caption khoi loi noi (loi that 2026-09-25)")
        # B2 dua doan 15.8-17.0 len DAU video (beat hook), roi 0-15.8, roi 17-22.
        p2 = {
            "engine": "remotion",
            "source_videos": [{"id": "source_1", "path": src, "name": "src.mp4", "duration": 30.0}],
            "segments": [
                {"source_id": "source_1", "start": 15.8, "end": 17.0, "target_start": 0.0, "beat": "hook"},
                {"source_id": "source_1", "start": 0.0, "end": 15.8, "target_start": 1.2},
                {"source_id": "source_1", "start": 17.0, "end": 22.0, "target_start": 17.0},
            ],
            "captions": [
                {"text": "câu một", "role": "support", "source_id": "source_1", "src_start": 14.8, "src_end": 15.8},
                {"text": "Tui sử dụng thấy ổn", "role": "support", "source_id": "source_1",
                 "src_start": 17.0, "src_end": 19.5},
                {"text": "trùng lặp", "role": "support", "source_id": "source_1", "src_start": 17.1, "src_end": 18.0},
                {"text": "câu sau", "role": "support", "source_id": "source_1", "src_start": 19.5, "src_end": 21.0},
                {"text": "neo hook sai", "role": "hero", "anchor": "hook", "source_id": "source_1",
                 "src_start": 5.0, "src_end": 6.0},
            ],
            "scene_effects": [{"type": "zoom_punch", "anchor": "hook", "source_id": "source_1",
                               "src_start": 15.9, "src_end": 16.8}],
            "audio": [{"sfx_id": "b", "file": sfx, "source_id": "source_1", "src_time": 17.0, "anchor": "hook"}],
            "speech": [],
        }
        sp2, rep2 = RP.build_spec(p2)
        by = {c["text"]: c for c in sp2["captions"]}
        # 5 chu karaoke -> luat <= 3 chu chia 3+2: cum dau bat dau 17.0, cum cuoi het 19.5
        c17, c17b = by.get("Tui sử dụng"), by.get("thấy ổn")
        check("src 17.0 (ranh gioi) -> timeline 17.0, khong phai 1.2",
              c17 and c17b and abs(c17["start"] - 17.0) < 0.01 and abs(c17b["end"] - 19.5) < 0.01, (c17, c17b))
        check("caption trung lap bi BO, khong bi doi gio", "trùng lặp" not in by, list(by))
        check("caption sau giu dung gio loi noi", by.get("câu sau") and abs(by["câu sau"]["start"] - 19.5) < 0.01,
              by.get("câu sau"))
        check("cau truoc ranh gioi giu dung (14.8 -> 16.0)", by.get("câu một") and abs(by["câu một"]["start"] - 16.0) < 0.01,
              by.get("câu một"))
        check("anchor hook khi khong co hook -> lui ve than video", by.get("neo hook sai") and
              abs(by["neo hook sai"]["start"] - 6.2) < 0.01, by.get("neo hook sai"))
        check("hieu ung anchor hook khong bi vut", len(sp2["effects"]) == 1 and abs(sp2["effects"][0]["start"] - 0.1) < 0.01,
              sp2["effects"])
        au_plan = [a for a in sp2["audio"] if a["path"] == sfx]
        check("SFX o ranh gioi 17.0 -> dau doan sau (17.0)", len(au_plan) == 1 and abs(au_plan[0]["start"] - 17.0) < 0.01,
              sp2["audio"])

        print("[6c] LUAT karaoke <= 3 chu / luc + plan chon font / hieu ung (user 2026-10-08)")
        import plan_guard
        check("quy tac mac dinh 3 chu", plan_guard.KARAOKE_MAX_WORDS == 3, plan_guard.KARAOKE_MAX_WORDS)
        sup_k = [c for c in caps if c["role"] == "support" and c["style"] in RP.KARAOKE_STYLES]
        check("moi phu de karaoke <= 3 chu", sup_k and all(len(c["text"].split()) <= 3 for c in sup_k),
              [c["text"] for c in sup_k])
        check("moi phu de karaoke co moc tung chu khop chu", all(
            c["words"] and [w["text"] for w in c["words"]] == c["text"].split() for c in sup_k),
              [(c["text"], c["words"]) for c in sup_k])
        check("cum karaoke noi tiep, khong chong gio", all(
            a["end"] <= b["start"] + 1e-3 for a, b in zip(sup_k, sup_k[1:])), [(c["text"], c["start"], c["end"]) for c in sup_k])
        check("phu de lay hieu ung / vien / do dam plan chon", all(
            c["fx"] == "fill_sweep" and c["edge"] == "soft_shadow" and c.get("weight") == 600 for c in sup_k),
              [(c.get("fx"), c.get("edge"), c.get("weight")) for c in sup_k])
        words = [{"text": w, "start": i * 0.3, "end": i * 0.3 + 0.25} for i, w in
                 enumerate("Và Thanh nhận ra một điều lạ".split())]
        g = RP.karaoke_groups(words, 3)
        check("7 chu -> 3+2+2 (khong de 1 chu le)", [len(x) for x in g] == [3, 2, 2], g)
        w2 = [dict(w) for w in words[:5]]
        w2[1]["text"] = "Thanh,"
        check("ngat o dau phay truoc", [len(x) for x in RP.karaoke_groups(w2, 3)] == [2, 3], RP.karaoke_groups(w2, 3))
        w3 = [dict(w) for w in words[:4]]
        for w in w3[3:]:
            w["start"] += 1.0
            w["end"] += 1.0
        check("ngat o cho ngung noi", [len(x) for x in RP.karaoke_groups(w3, 3)] == [3, 1], RP.karaoke_groups(w3, 3))
        cap = {"id": "cap9", "text": " ".join(w["text"] for w in words), "start": 0.0, "end": 2.2, "role": "support",
               "style": "karaoke", "words": words, "emphasis": ["điều"]}
        ch = []
        parts = RP.split_karaoke([cap], ch)
        check("tach dung 3 cum, id rieng", [p["id"] for p in parts] == ["cap9-1", "cap9-2", "cap9-3"], parts)
        check("cum dau giu gio bat dau, cum cuoi giu gio ket thuc",
              parts[0]["start"] == 0.0 and parts[-1]["end"] == 2.2, parts)
        check("cum sau hien dung luc noi chu dau cua no", abs(parts[1]["start"] - words[3]["start"]) < 1e-6, parts[1])
        check("nhan manh di theo cum chua chu do", parts[2]["emphasis"] == ["điều"] and parts[0]["emphasis"] == [], parts)
        check("chay lai giu nguyen (idempotent)", RP.split_karaoke(parts, []) == parts)
        nw = RP.split_karaoke([dict(cap, words=None)], [])
        check("khong co moc Whisper -> van chia theo do dai chu", len(nw) == 3 and all(p["words"] for p in nw), nw)
        ob = dict(cap, style="outline_bold")
        check("kieu khong phai karaoke -> giu nguyen", RP.split_karaoke([ob], []) == [ob])
        check("prompt R5 co luat karaoke + danh muc", all(k in RP.karaoke_note() for k in (
            "TOI DA 3 CHU", "karaoke_fx", "text_edge", "weight_body", "fill_sweep", "soft_shadow")))
        for fx in RP.KARAOKE_FX:
            check("hieu ung karaoke %s duoc ve" % fx["id"], ("'%s'" % fx["id"]) in open(os.path.join(
                HERE, "..", "remotion-src", "Captions.tsx"), encoding="utf-8").read())
        for ed in RP.TEXT_EDGES:
            check("vien chu %s duoc ve" % ed["id"], ("'%s'" % ed["id"]) in open(os.path.join(
                HERE, "..", "remotion-src", "Captions.tsx"), encoding="utf-8").read())

        print("[7] catalog <-> composition")
        cat = RP.load_catalog()
        fonts_ts = open(os.path.join(HERE, "..", "remotion-src", "fonts.ts"), encoding="utf-8").read()
        look_ts = open(os.path.join(HERE, "..", "remotion-src", "look.ts"), encoding="utf-8").read()
        auto_ts = open(os.path.join(HERE, "..", "remotion-src", "AutoEdit.tsx"), encoding="utf-8").read()
        caps_ts = open(os.path.join(HERE, "..", "remotion-src", "Captions.tsx"), encoding="utf-8").read()
        for f in cat["fonts"]:
            check("font %s co trong fonts.ts" % f["id"], ("%s:" % f["id"]) in fonts_ts)
        for g in cat["grades"]:
            check("grade %s co trong look.ts" % g["id"], ("%s:" % g["id"]) in look_ts)
        for t in cat["transitions"]:
            if t["id"] != "cut":
                check("transition %s duoc ve" % t["id"], ("'%s'" % t["id"]) in look_ts)
        for e in cat["effects"]:
            check("effect %s duoc ve" % e["id"], ("'%s'" % e["id"]) in look_ts or ("'%s'" % e["id"]) in auto_ts)
        for st in cat["caption_styles"]:
            check("caption style %s duoc ve" % st["id"], ("'%s'" % st["id"]) in caps_ts)

        motion_tests(tmp, src, sfx)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("\n%s (%d loi)" % ("PASS" if not FAILS else "FAIL", len(FAILS)))
    sys.exit(1 if FAILS else 0)


def motion_tests(tmp, src, sfx):
    """Bo cuc + lop do hoa + tai nguyen (khong goi AI). Tach nguoi (Vision) duoc GIA LAP de test
    nhanh va giong nhau tren moi may."""
    import motion_design as MD
    import media_vision
    import prompt_store
    import reference_video

    img = os.path.join(tmp, "broll.png")
    ff("-f", "lavfi", "-i", "color=c=orange:s=540x960", "-frames:v", "1", img)
    calls = []
    orig = (media_vision.available, media_vision.subject_matte, media_vision.matte_head)
    media_vision.available = lambda: True
    media_vision.subject_matte = lambda path, a, b, fps=30: calls.append((a, b)) or {
        "path": os.path.join(tmp, "m.webm"), "srcStart": round(a, 3), "srcEnd": round(b, 3)}
    media_vision.matte_head = lambda path, t: {"top": 0.3, "cx": 0.6, "w": 0.3}
    try:
        S = "source_1"
        p = {
            "engine": "remotion",
            "source_videos": [{"id": S, "path": src, "name": "src.mp4", "duration": 30.0}],
            "segments": [{"source_id": S, "start": 0.0, "end": 20.0, "target_start": 0.0}],
            "faces": {S: {"cx": 0.5, "cy": 0.4, "w": 0.3, "h": 0.2}},
            "assets": [{"id": "anh", "kind": "ai_image", "path": img}],
            "captions": [
                {"text": "Phụ Đề Một", "role": "support", "source_id": S, "src_start": 1.0, "src_end": 2.5},
                {"text": "chữ to trùng", "role": "hero", "source_id": S, "src_start": 3.0, "src_end": 4.0},
                {"text": "đụng lớp chữ", "role": "support", "source_id": S, "src_start": 12.2, "src_end": 13.5},
            ],
            "scenes": [
                {"layout": "split", "source_id": S, "src_start": 5.0, "src_end": 7.0, "panel": {"asset": "anh"}},
                {"layout": "broll", "source_id": S, "src_start": 7.0, "src_end": 8.0, "panel": {"asset": "khong_co"}},
                {"layout": "card", "source_id": S, "src_start": 9.0, "src_end": 11.0, "popout": True},
                {"layout": "tam_bay", "source_id": S, "src_start": 11.0, "src_end": 12.0},
            ],
            "layers": [
                {"id": "dem", "type": "text", "source_id": S, "src_start": 3.0, "src_end": 4.5, "x": 0.5, "y": 0.4,
                 "group": "g1", "spans": [{"text": "ĐÈ MẶT", "font": "anton", "size": 60}], "sfx": "boom"},
                {"id": "phu", "type": "text", "source_id": S, "src_start": 3.1, "src_end": 4.5, "x": 0.5, "y": 0.5,
                 "group": "g1", "spans": [{"text": "viết tay", "font": "khong_co_font", "size": 50}]},
                {"id": "sau", "type": "text", "source_id": S, "src_start": 1.0, "src_end": 2.0, "x": 0.5, "y": 0.35,
                 "behind_subject": True, "spans": [{"text": "RẤT RỘNG SAU ĐẦU", "font": "anton", "size": 200}]},
                {"id": "lop_y", "type": "text", "source_id": S, "src_start": 12.0, "src_end": 14.0, "x": 0.5,
                 "y": 0.77, "spans": [{"text": "NÚT", "size": 50}], "enter": {"preset": "khong_co", "duration": 9}},
                {"id": "sai", "type": "hinh_la", "source_id": S, "src_start": 1.0, "src_end": 2.0},
                {"id": "anh_hong", "type": "image", "asset": "khong_co", "source_id": S, "src_start": 1.0, "src_end": 2.0},
            ] + [{"id": "b%d" % k, "type": "badge", "label": "CẤP", "value": str(k), "source_id": S,
                  "src_start": 15.0 + k * 0.1, "src_end": 17.0, "x": 0.25 * (k + 1), "y": 0.15} for k in range(3)],
            "speech": [],
            # bo phong cach VIDEO MAU cua phien (khong con mac dinh): phu de chu thuong theo video mau
            "style_kit": {"_nguon": "video_mau", "subtitle": {"case": "lower", "y_full": 0.77}},
        }
        sp, rep = RP.build_spec(p)
        print("[8] bo cuc (scenes)")
        lay = [(s_["layout"], s_["start"], s_["end"]) for s_ in sp["scenes"]]
        check("layout la bi bo", all(l[0] != "tam_bay" for l in lay), lay)
        check("split co panel anh + rect nua tren", sp["scenes"][0]["panel"]["path"] == img and
              abs(sp["scenes"][0]["panelRect"]["h"] - 0.5) < 1e-6, sp["scenes"][0])
        check("broll thieu anh -> full", any(l[0] == "full" for l in lay), lay)
        card = [s_ for s_ in sp["scenes"] if s_["layout"] == "card"][0]
        check("card khai popout -> dau troi khoi the", 0.14 <= (card.get("popout") or 0) <= 0.3, card)
        check("card khong ghi mau nen -> mau LAY TU VIDEO, khong hoa van cai san",
              card["bg"]["kind"] == "gradient" and card["bg"]["pattern"] == "none"
              and card["bg"]["colors"] != ["#F8D2B4", "#EB8A4F", "#D9622B"], card["bg"])
        p_np = copy.deepcopy(p)
        for s_ in p_np["scenes"]:
            s_.pop("popout", None)
        card_np = [s_ for s_ in RP.build_spec(p_np)[0]["scenes"] if s_["layout"] == "card"][0]
        check("card KHONG khai popout -> khong troi (khong mac dinh)", not card_np.get("popout"), card_np)
        # mat to (canh can) -> khoang troi lon hon de khong cat phang dinh dau
        p_can = dict(p, faces={S: {"cx": 0.5, "cy": 0.4, "w": 0.6, "h": 0.34}})
        sp_can, _ = RP.build_spec(p_can)
        card_can = [s_ for s_ in sp_can["scenes"] if s_["layout"] == "card"][0]
        check("canh can mat -> pop-out cao hon", card_can.get("popout", 0) > card["popout"] + 0.05, card_can.get("popout"))
        print("[9] lop do hoa")
        L = {x["id"].rsplit("_", 1)[0]: x for x in sp["layers"]}
        check("loai lop la / anh hong bi bo", "sai" not in L and "anh_hong" not in L, list(L))
        check("font la -> bo font (dung mac dinh)", "font" not in L["phu"]["spans"][0], L["phu"]["spans"][0])
        check("chu de len mat -> doi xuong duoi cam", L["dem"]["y"] > 0.4 + 0.2 * 0.6, L["dem"]["y"])
        check("tang cung group di theo", abs((L["phu"]["y"] - L["dem"]["y"]) - 0.1) < 0.02, (L["phu"]["y"], L["dem"]["y"]))
        check("preset la bi bo", (L["lop_y"].get("enter") or {}).get("preset") != "khong_co", L["lop_y"])
        check("hang huy hieu vao lech nhau = 1 nhip (khong bi cat)", all(("b%d" % k) in L for k in range(3)), list(L))
        fcs = MD.face_in_canvas({"layout": "split", "aroll": {"x": 0, "y": 0.5, "w": 1, "h": 0.5}},
                                {"cx": 0.5, "cy": 0.5, "w": 0.5, "h": 0.3}, 576, 1024)
        check("mat trong khung chia doi: tam ~ 0.5 + 0.42*0.5", fcs and abs(fcs["cy"] - 0.71) < 0.02, fcs)
        check("broll: khong thay A-roll -> khong ne mat", MD.face_in_canvas({"layout": "broll"}, {"cx": 0.5, "cy": 0.5, "h": 0.3}, 576, 1024) is None)
        print("[10] sau nguoi + pop-out (tach nguoi gia lap)")
        sau = L["sau"]
        check("lop behind giu co", sau.get("behind") is True, sau)
        check("neo ngang dinh dau (chu rong: top + 0.12*cao)", abs(sau["y"] - (0.3 + MD._text_height(sau) * 0.12)) < 0.01, sau["y"])
        check("canh giua theo tam dau", abs(sau["x"] - 0.6) < 0.05 or MD._text_width(sau) > 0.9, sau["x"])
        subj = [c for c in sp["clips"] if c.get("subject")]
        check("clip co ban tach nguoi", len(subj) == 1, sp["clips"])
        check("chi tach doan can (khong ca clip 20s)", calls and calls[0][1] - calls[0][0] < 13, calls)
        media_vision.subject_matte = lambda *a, **k: None
        sp_b, rep_b = RP.build_spec(p)
        check("tach nguoi hong -> bo co behind + tat pop-out",
              not any(x.get("behind") for x in sp_b["layers"]) and not any(s_.get("popout") for s_ in sp_b["scenes"]),
              [x.get("behind") for x in sp_b["layers"]])
        print("[11] phu de + SFX trong che do do hoa")
        caps = {c["text"]: c for c in sp["captions"]}
        check("hero trung gio lop chu -> bo", "chữ to trùng" not in caps, list(caps))
        check("phu de theo bo phong cach VIDEO MAU: chu thuong", "phụ đề một" in caps, list(caps))
        c_ne = caps.get("đụng lớp chữ")
        check("phu de ne lop chu", c_ne is not None and abs((c_ne["y"] + 1) / 2 - 0.77) > 0.02, c_ne)
        names = [a["name"] for a in sp["audio"]]
        check("lop co sfx -> tu gan tieng trong bo motion", any("boom" in n.lower() for n in names), names)
        print("[12] tien ich + tai lieu")
        lt = MD.layer_texts(p["layers"])
        check("layer_texts lay chu + sfx", any(r["text"] == "ĐÈ MẶT" and r.get("sfx") == "boom" for r in lt), lt)
        check("layers_as_heroes danh dau DA CO SFX", any("DA CO SFX" in h["text"] for h in MD.layers_as_heroes(p["layers"])))
        kit = MD.style_kit_for({"style_kit": {"palette": {"primary": "#123456"}, "subtitle": {"size": 50}}})
        check("style kit = NGUYEN bo cua video mau, khong tron mac dinh", kit["palette"] == {"primary": "#123456"}
              and kit["subtitle"] == {"size": 50} and kit["_nguon"] == "video_mau" and "layouts" not in kit, kit)
        check("khong video mau -> khong co bo phong cach", MD.style_kit_for(None) is None and MD.style_kit_for({}) is None
              and MD.style_kit_for({"summary": "x"}) is None)
        check("khong con file / ham bo mac dinh", not hasattr(MD, "load_style_default") and not os.path.exists(
            os.path.join(HERE, "..", "sidecar", "assets", "remotion_style_default.json")))
        ss = MD.session_style({"style": {"mood": "pastel nhe", "palette": {"highlight": "#FFB6C1", "x": "khong-mau"},
                                         "fonts": {"impact": "anton", "la": "font_la"}, "image_style": "soft pastel"}})
        check("R4 tu dat phong cach phien: kiem mau + font", ss["palette"] == {"highlight": "#FFB6C1"} and
              ss["fonts"] == {"impact": "anton"} and ss["broll_style"] == "soft pastel" and ss["_nguon"] == "phien_nay", ss)
        san = reference_video._sanitize_kit({"fonts": {"impact": "anton", "script": "font_la"}, "la": 1,
                                           "subtitle": {"font": "font_la", "size": 40}, "recipes": [{"name": "x"}]})
        check("sanitize kit: bo font la, truong la, recipe rong", san and san["fonts"] == {"impact": "anton"} and
              "la" not in san and "font" not in san["subtitle"] and "recipes" not in san, san)
        wins = reference_video.strip_windows(215.0, [2.0, 40.0, 77.0, 116.0, 155.0, 200.0])
        check("dai khung day: hook + giua + cuoi", wins[0][0] == 0.0 and wins[-1][0] > 200 and len(wins) >= 5, wins)
        for pid in ("_RM_DESIGN_SYSTEM", "_RM_STYLE_KIT_PROMPT", "_RM_VISUAL_SYSTEM"):
            check("prompt %s dang ky + doc duoc" % pid, len(prompt_store.default_prompt(pid)) > 200)
        for rid in ("remotion-dsl.md", "edit-glossary.md"):
            check("tai lieu %s dang ky + doc duoc" % rid, len(prompt_store.get_ref(rid)) > 1000 and
                  any(r["id"] == rid for r in prompt_store.REFS))
        layers_ts = open(os.path.join(HERE, "..", "remotion-src", "Layers.tsx"), encoding="utf-8").read()
        for pr in sorted(MD.ENTER | MD.EXIT | MD.LOOP | MD.EASING):
            check("preset %s duoc ve" % pr, ("'%s'" % pr) in layers_ts or ("%s:" % pr) in layers_ts)
        for ty in MD.LAYER_TYPES:
            check("loai lop %s duoc ve" % ty, ("'%s'" % ty) in layers_ts)
        print("[13] tu kiem thiet ke R4 (dem chi tieu)")
        kit_t = MD.style_kit_for({"style_kit": {
            "recipes": [{"name": "a", "layers": [{}]}, {"name": "b", "layers": [{}]}, {"name": "c", "layers": [{}]}],
            "layouts": [{"layout": "full", "share": 0.4}, {"layout": "split", "share": 0.3}, {"layout": "card", "share": 0.2},
                        {"layout": "graphic", "share": 0.1}],
            "motion": {"density": "3 lop / 10 giay"}, "broll_style": "3D render"}})
        ngheo = {"scenes": [{"layout": "full"}, {"layout": "split", "panel": {"asset": "x"}}],
                 "assets": [{"id": "x", "kind": "source_frame"}],
                 "layers": [{"type": "text", "src_start": k * 3.0, "y": 0.62, "spans": [{"text": "A"}]} for k in range(8)]}
        th = MD.audit_design(ngheo, kit_t, 36, has_hook=True)
        for key in ("bo cuc", "tai nguyen", "lop do hoa", "cong thuc"):
            check("tu kiem theo bo video mau bat thieu: %s" % key, any(x.startswith(key) for x in th), th)
        th0 = MD.audit_design(ngheo, None, 36, has_hook=True)
        check("khong video mau -> khong ep chi tieu phong cach nao", th0 == [], th0)
        th_s = MD.audit_design({"scenes": [{"layout": "split", "src_start": 1, "src_end": 3}]}, None, 36)
        check("khong video mau van bat loi cau truc (split khong co hinh)", any("chua co hinh" in x for x in th_s), th_s)
        giau = {"scenes": [{"layout": "split", "panel": {"asset": "a1"}}, {"layout": "card"}, {"layout": "graphic"},
                           {"layout": "broll", "panel": {"asset": "a2"}}],
                "assets": [{"id": "a1", "kind": "ai_image"}, {"id": "a2", "kind": "ai_image"}],
                "layers": [{"type": "text", "anchor": "hook" if k == 0 else None, "src_start": k * 2.0, "y": 0.1 * (k % 7) + 0.1,
                            "recipe": "abc"[k % 3], "group": "g%d" % (k // 2),
                            "spans": [{"text": "A"}, {"text": "b", "newline": True}]} for k in range(18)]}
        th2 = MD.audit_design(giau, kit_t, 36, has_hook=True)
        check("thiet ke du chi tieu -> khong thieu", not th2, th2)
        dsl = prompt_store.get_ref("remotion-dsl.md")
        for kw in ("behind_subject", "group", "popout", "src_time"):
            check("tai lieu DSL co '%s'" % kw, kw in dsl)
    finally:
        media_vision.available, media_vision.subject_matte, media_vision.matte_head = orig


if __name__ == "__main__":
    main()
