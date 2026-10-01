#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test LUONG THONG TIN giua cac buoc lap ke hoach Video Remotion (/remotion/autoplan).

Chay: HOME=$(mktemp -d) <venv_python> tests/test_info_flow.py      (can flask + ffmpeg)

Yeu cau cua nguoi dung 2026-09-24: cac buoc phai lien ket va truyen thong tin chat
che — moi buoc nhan DU nhung gi no can tu cac buoc truoc. Truoc do:
  - B1/B2 khong thay loi thoai -> cat giua cau;
  - story_arc cua B1 khong toi buoc nao;
  - video mau chi toi B1 va caption;
  - SFX va meme khong biet nhau, SFX khong biet transition/chu hero/hook.

Gia lap AI o tang `providers._chat` (khong phai o gpt_*) de test DI QUA code dung
payload that cua tung buoc, roi doc lai dung cai tung buoc NHAN DUOC.
"""
import os
import sys
import json
import shutil
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import server          # noqa: E402
import providers       # noqa: E402
import engine          # noqa: E402
import meme_lib        # noqa: E402
import media_vision    # noqa: E402
import remotion_plan   # noqa: E402
import text_art        # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:400]))
    if not cond:
        FAILED.append(name)


TMP = tempfile.mkdtemp(prefix="info-flow-")
SRC = os.path.join(TMP, "a.mp4")
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=30",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=30", "-shortest",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", SRC], check=True)

TRANSCRIPT = [
    {"start": 0.0, "end": 2.0, "text": "Toi mat ba ty trong mot dem", "is_punchline": True},
    {"start": 2.3, "end": 5.8, "text": "vi tin mot loi quang cao"},
    {"start": 8.0, "end": 10.5, "text": "Dung bao gio lam nhu toi", "emphasis": ["Dung bao gio"]},
    {"start": 10.8, "end": 13.9, "text": "hay kiem tra truoc khi chuyen tien"},
    {"start": 20.0, "end": 25.0, "text": "CAU BI CAT BO KHONG DUOC LOT XUONG"},
]
BRIEF = {
    "source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 30.0}],
    "sources": [{
        "id": "source_1", "summary": "chia se bai hoc mat tien",
        "transcript": TRANSCRIPT,
        "emotion_map": [{"start": 0, "end": 6, "emotion": "punch", "intensity": "high"},
                        {"start": 20, "end": 25, "emotion": "soft", "intensity": "low"}],
        "key_moments": [{"start": 0.0, "end": 2.0, "type": "hook"},
                        {"start": 21.0, "end": 22.0, "type": "climax"}],
        "faces_region": "giua-tren",
    }],
    "style": "fast",
}
REF = {
    "summary": "nhip nhanh", "format": "talking_head", "style_fingerprint": ["cat 2s/lan"],
    "pacing": {"energy": "high", "average_shot_seconds": 2.0},
    "structure": [{"start": 0, "end": 3, "role": "hook"}],
    "editing_language": {"camera_motion": [{"type": "punch zoom"}]},
    "captions": {"density": "high", "hierarchy": {"levels": 2}},
    "audio": {"sfx_pattern": [{"type": "whoosh", "trigger": "chuyen canh"}]},
    "shot_system": {"broll_usage": {"frequency": "low"}},
    "attention_system": {"visual_refresh_rate": "2s"},
    # bo phong cach boc tu CHINH video mau nay (luot 2) — phien co video mau thi R4 phai nhan dung bo nay
    "style_kit": {"palette": {"primary": "#0A84FF", "highlight": "#34C759"}, "fonts": {"impact": "oswald"}},
}
STORY_ARC = "Mo bang con so soc -> vi sao mat tien -> chot loi khuyen"
DESIGN = {
    "concept": "canh bao lua dao",
    "scenes": [{"layout": "card", "source_id": "source_1", "src_start": 9.0, "src_end": 11.0}],
    "layers": [{"id": "so", "type": "text", "source_id": "source_1", "src_start": 0.5, "src_end": 2.0,
                "x": 0.5, "y": 0.3, "spans": [{"text": "3 TỶ", "font": "anton", "size": 90},
                                               {"text": "mất trong 1 đêm", "size": 40}]}],
    "assets": [],
    "transitions": [{"segment_index": 1, "type": "whip_left", "duration": 0.3}],
    "effects": [], "grade": {"preset": "warm", "intensity": 0.5},
}

# Tra loi gia theo step_label. B2 CO Y cat giua cau + de khoang trong + khong ghi beat.
TRA_LOI = {
    # B1 + B2 CO Y DAO THU TU (doan giay 8 len truoc) -> code phai ep ve thu tu goc (luat cung 2026-09-27)
    "B1-select": {"story_arc": STORY_ARC, "tone": "nghiem tuc chia se", "selections": [
        {"source_id": "source_1", "start": 8.0, "end": 13.9, "beat": "payoff", "purpose": "loi khuyen"},
        {"source_id": "source_1", "start": 0.0, "end": 5.8, "beat": "hook", "purpose": "con so soc"}]},
    "B2-timeline": {"segments": [
        {"source_id": "source_1", "start": 8.0, "end": 13.6, "target_start": 0.0},    # 13.6 giua cau
        {"source_id": "source_1", "start": 0.0, "end": 5.5, "target_start": 7.0}],    # 5.5 giua cau 2.3-5.8; ho 7.0
        "duration": 13.0},
    "B3-hook": {"hook": {"source_id": "source_1", "src_start": 8.0, "src_end": 10.5,
                         "caption": "DUNG LAM THE", "transition": "flash", "reason": "x"}},
    "R4-design": DESIGN,
    "R4-design-fix": DESIGN,
    "R5-captions": {"captions": [
        {"text": "MAT 3 TY", "role": "hero", "source_id": "source_1", "src_start": 0.0, "src_end": 2.0}],
        "caption_theme": {}},
    "B6-inserts": {"inserts": [{"meme_id": "wow-1", "source_id": "source_1", "src_time": 5.8,
                                "placement": "cutaway", "duration": 1.5, "why": "phan ung"}]},
    "B7-audio": {"audio": []},
    # LUAT HOOK: B7 / R4 chua dat gi cho hook -> hook_rule nho AI bo sung dung phan thieu
    "Hook-FX": {"effects": [{"type": "shake", "source_id": "source_1", "src_start": 8.2, "src_end": 8.8, "anchor": "hook",
                             "why": "cu soc 'dung lam the' can rung manh"}]},
    "Hook-SFX": {"audio": [{"sfx_id": "kit-boom", "source_id": "source_1", "src_time": 8.1, "anchor": "hook",
                            "purpose": "punch", "why": "dam mo hook"}]},
}
NHAN = {}      # step_label -> payload user da parse
SYS = {}       # step_label -> system prompt
THU_TU = []


def fake_chat(name, messages, **k):
    lab = k.get("step_label")
    user = next((m["content"] for m in messages if m["role"] == "user"), "{}")
    THU_TU.append(lab)
    NHAN[lab] = json.loads(user)
    SYS[lab] = next((m["content"] for m in messages if m["role"] == "system"), "")
    return json.dumps(TRA_LOI.get(lab, {}), ensure_ascii=False)


providers._chat = fake_chat
ART_CALLS = []
text_art.gen_sheet = lambda lk, *a, **k: (ART_CALLS.append([x['key'] for x in lk]), None)[1]   # khong goi GPT that
server._can_gio_loi_noi = lambda brief: brief          # can gio Whisper co test rieng (test_speech_align)
media_vision.face_box = lambda *a, **k: None           # Vision co test rieng; khong can o day
import sfx_kit  # noqa: E402
sfx_kit.ensure_kit()                                   # kho tieng tu tao (HOME tam) -> SFX AI chon co file that
engine.sfx_catalog_for_plan = lambda *a, **k: [{"id": "kit-boom", "name": "Boom", "emotion": "punch", "use_when": "chot"}]
meme_lib.meme_catalog_for_plan = lambda *a, **k: [{"id": "wow-1", "name": "Wow", "emotion": "positive",
                                                   "use_when": "sau con so soc", "tags": []}]

try:
    with server.app.test_client() as c:
        r = c.post("/remotion/autoplan", json={
            "brief": BRIEF, "reference_analysis": REF, "fresh": True, "title": "test",
            "edit_request": {"purpose": "canh bao lua dao", "duration": "30"},
        })
        d = r.get_json() or {}

    print("\n[0] Route + thu tu")
    check("remotion/autoplan chay xong", r.status_code == 200 and d.get("ok"), (r.status_code, d.get("error")))
    # FX-plan khong dat hieu ung nao -> hook chua co hinh: AI tu viet lai (Hook-FX-plan) truoc, khong duoc thi
    # chon trong kho (Hook-FX)
    check("thu tu cac buoc dung (+ luat hook bo sung sau cung)", [x for x in THU_TU if x != "R4-design-fix"] ==
          ["B1-select", "B2-timeline", "B3-hook", "R4-design", "R5-captions", "FX-plan", "B6-inserts", "B7-audio",
           "Hook-FX-plan", "Hook-FX", "Hook-SFX"], THU_TU)
    check("R4 thiet ke: khong khai hieu ung (buoc FX lam), khong con luat hook R4 cua luong cu",
          'KHONG khai "effects"' in SYS.get("R4-design", "") and "LUAT HOOK" not in SYS.get("R4-design", ""))
    _p0 = d.get("plan") or {}
    _sp0 = d.get("spec") or {}
    check("luat hook: AI bo sung hieu ung hinh cho hook (anchor hook)",
          any(e.get("anchor") == "hook" and e.get("type") == "shake" for e in _p0.get("scene_effects") or []),
          _p0.get("scene_effects"))
    check("luat hook: AI bo sung SFX cho hook", any(a.get("anchor") == "hook" for a in _p0.get("audio") or []), _p0.get("audio"))
    _hk_end = max([c.get("end", 0) for c in _sp0.get("clips") or [] if c.get("kind") == "hook"] or [0])
    check("spec: hook co ca hieu ung hinh + SFX", any(e.get("start", 99) < _hk_end for e in _sp0.get("effects") or [])
          and any(a.get("start", 99) < _hk_end for a in _sp0.get("audio") or []), (_sp0.get("effects"), _sp0.get("audio")))
    _hs = NHAN.get("Hook-SFX", {})
    check("Hook-SFX nhan khoanh khac hook + kho SFX + hieu ung hinh da co",
          (_hs.get("hook") or {}).get("anchor") == "hook" and _hs.get("sfx_catalog") and _hs.get("hieu_ung_hinh"), _hs)
    check("_pipeline ghi ket qua luat hook", (_p0.get("_pipeline") or {}).get("luat_hook"), _p0.get("_pipeline"))
    check("R4 thiet ke dung duoc -> khong goi R4 du phong", "R4-visual" not in THU_TU, THU_TU)

    def tr_texts(tr_by_src):
        return [t.get("text") for items in (tr_by_src or {}).values() for t in items]

    print("\n[1] B1 thay loi thoai")
    b1 = NHAN.get("B1-select", {})
    src = (b1.get("source_analysis") or {}).get("sources", [{}])[0]
    check("B1 nhan transcript cua source", len(src.get("transcript") or []) == 5, src.get("transcript"))
    check("B1 giu co is_punchline", (src.get("transcript") or [{}])[0].get("is_punchline") is True)

    print("\n[2] B2 nhan cau chuyen + loi thoai trong doan chon + nhip video mau")
    b2 = NHAN.get("B2-timeline", {})
    check("B2 co story_arc cua B1", (b2.get("cau_chuyen") or {}).get("story_arc") == STORY_ARC, b2.get("cau_chuyen"))
    check("B2 co tone", (b2.get("cau_chuyen") or {}).get("tone") == "nghiem tuc chia se")
    check("B2 nhan selections DA xep theo thu tu goc", [x.get("start") for x in b2.get("selections") or []] == [0.0, 8.0],
          b2.get("selections"))
    check("B2: nhip_truyen cua cau chuyen cung theo thu tu goc",
          [x.get("beat") for x in (b2.get("cau_chuyen") or {}).get("nhip_truyen") or []] == ["hook", "payoff"])
    sel0 = (b2.get("selections") or [{}])[0]
    check("B2: loi_thoai cua doan 0 dung 2 cau", [t["text"] for t in sel0.get("loi_thoai", [])]
          == ["Toi mat ba ty trong mot dem", "vi tin mot loi quang cao"], sel0.get("loi_thoai"))
    check("B2: co pacing video mau", (b2.get("phong_cach_mau") or {}).get("pacing", {}).get("average_shot_seconds") == 2.0)
    check("B2: KHONG nhan phan audio cua video mau", "audio" not in (b2.get("phong_cach_mau") or {}))

    print("\n[3] Code lien ket B1->B2: gan beat, keo ve ranh gioi cau, noi lien timeline")
    b3 = NHAN.get("B3-hook", {})
    tm = b3.get("timeline_map") or []
    check("segment 0 ket thuc o het cau (5.5 -> 5.8)", tm and tm[0]["nguon_den"] == 5.8, tm[:1])
    check("segment 1 ket thuc o het cau (13.6 -> 13.9)", len(tm) > 1 and tm[1]["nguon_den"] == 13.9, tm[1:])
    check("timeline noi lien (seg1 bat dau 5.8, khong phai 7.0)", len(tm) > 1 and tm[1]["timeline_tu"] == 5.8, tm)
    check("beat duoc gan tu B1 khi B2 bo trong", [x.get("beat") for x in tm] == ["hook", "payoff"], tm)

    print("\n[4] B3 hook: cau chuyen + chi du lieu CON tren timeline + chuyen canh Remotion")
    check("B3 co story_arc", (b3.get("cau_chuyen") or {}).get("story_arc") == STORY_ARC)
    check("B3 khong thay cau da bi cat", "CAU BI CAT BO KHONG DUOC LOT XUONG" not in tr_texts(b3.get("transcript")),
          tr_texts(b3.get("transcript")))
    check("B3 khong thay key_moment ngoai timeline",
          all(k["start"] < 14 for ks in (b3.get("key_moments") or {}).values() for k in ks), b3.get("key_moments"))
    check("B3 co structure video mau", "structure" in (b3.get("phong_cach_mau") or {}))
    ids = {t["id"] for t in remotion_plan.load_catalog().get("transitions") or []}
    goi_y = b3.get("transition_goi_y") or []
    check("B3 nhan goi y chuyen canh LAY TU danh muc Remotion",
          goi_y and all(t.get("id") in ids for t in goi_y), goi_y)

    print("\n[5] R4 thiet ke")
    r4 = NHAN.get("R4-design", {})
    check("R4 biet hook", (r4.get("hook") or {}).get("src_start") == 8.0, r4.get("hook"))
    check("R4 co story_arc", (r4.get("cau_chuyen") or {}).get("story_arc") == STORY_ARC)
    check("R4 segment co beat", [s.get("beat") for s in r4.get("segments", [])] == ["hook", "payoff"])
    check("R4 thay cau nhan manh trong segment",
          any(t.get("is_punchline") for t in (r4.get("segments") or [{}])[0].get("transcript", [])),
          (r4.get("segments") or [{}])[0])
    check("R4 co ngon ngu dung video mau", "editing_language" in (r4.get("phong_cach_mau") or {}))
    check("R4 nhan DUNG bo phong cach cua video mau (khong tron mac dinh)",
          r4.get("style_kit") == REF["style_kit"], r4.get("style_kit"))

    print("\n[6] R5 phu de")
    r5 = NHAN.get("R5-captions", {})
    check("R5 biet hook + caption hook", (r5.get("hook") or {}).get("caption") == "DUNG LAM THE", r5.get("hook"))
    check("R5 co story_arc", (r5.get("cau_chuyen") or {}).get("story_arc") == STORY_ARC)
    check("R5 co edit_request trong cau chuyen",
          ((r5.get("cau_chuyen") or {}).get("edit_request") or {}).get("purpose") == "canh bao lua dao")
    check("R5 co phong cach chu video mau", "captions" in (r5.get("phong_cach_mau") or {}))
    check("R5 biet lop chu do hoa cua R4 (khong viet trung)",
          any("3 TỶ" in (x.get("text") or "") for x in r5.get("lop_do_hoa_da_co") or []), r5.get("lop_do_hoa_da_co"))

    print("\n[7] B6 meme")
    b6 = NHAN.get("B6-inserts", {})
    check("B6 thay chu hero cua R5", [h.get("text") for h in b6.get("chu_hero", [])] == ["MAT 3 TY"], b6.get("chu_hero"))
    check("B6 biet hook", (b6.get("hook") or {}).get("src_end") == 10.5)
    check("B6 khong thay cau da bi cat", "CAU BI CAT BO KHONG DUOC LOT XUONG" not in tr_texts(b6.get("transcript")))
    check("B6 co broll_usage video mau", "shot_system" in (b6.get("phong_cach_mau") or {}))

    print("\n[8] B7 SFX nhan tat ca nhung gi da dat")
    b7 = NHAN.get("B7-audio", {})
    da_co = b7.get("da_co_tren_timeline") or {}
    check("B7 thay chuyen canh cua R4 (kem gio timeline)",
          da_co.get("transitions") == [{"segment_index": 1, "type": "whip_left", "timeline_tu": 5.8}],
          da_co.get("transitions"))
    heroes = [h.get("text") or "" for h in da_co.get("chu_hero", [])]
    check("B7 thay chu hero cua R5", "MAT 3 TY" in heroes, heroes)
    check("B7 thay lop chu do hoa cua R4", any("3 TỶ" in h for h in heroes), heroes)
    check("B7 thay meme cua B6", [m.get("meme_id") for m in da_co.get("meme", [])] == ["wow-1"], da_co.get("meme"))
    check("B7 biet hook", (b7.get("hook") or {}).get("src_start") == 8.0)
    check("B7 co story_arc + tone", (b7.get("cau_chuyen") or {}).get("tone") == "nghiem tuc chia se")
    check("B7 co kieu SFX video mau", "audio" in (b7.get("phong_cach_mau") or {}))
    check("B7 KHONG nhan phan caption video mau", "captions" not in (b7.get("phong_cach_mau") or {}))

    print("\n[9] Plan cuoi mang theo cau chuyen + dung duoc ban Remotion")
    plan = d.get("plan") or {}
    pip = plan.get("_pipeline") or {}
    check("plan la cua Remotion", plan.get("engine") == "remotion", plan.get("engine"))
    check("_pipeline co story_arc + tone", pip.get("story_arc") == STORY_ARC and pip.get("tone"), pip)
    check("_pipeline ghi dung thu tu buoc", pip.get("thu_tu") == ["B1-select", "B2-timeline", "B3-hook", "R4-design",
                                                                  "assets", "R5-captions", "TXT-art", "FX-plan",
                                                                  "FX-code", "B6-inserts", "B7-audio"],
          pip.get("thu_tu"))
    body = [s for s in plan.get("segments", []) if s.get("beat")]
    check("segments trong plan con beat", {s.get("beat") for s in body} >= {"hook", "payoff"}, plan.get("segments"))
    spec = d.get("spec") or {}
    check("co RenderSpec voi doan video", len(spec.get("clips") or []) >= 2, spec.get("clips"))
    check("hook dung len dau spec", abs(((spec.get("clips") or [{}])[0].get("srcStart") or 0) - 8.0) < 0.3,
          (spec.get("clips") or [{}])[0])
    # Hook la BAN SAO: sau hook, than video chay lai tu dau theo thu tu goc va VAN noi doan hook (giay 8)
    than = [round(c.get("srcStart") or 0, 1) for c in (spec.get("clips") or [])[1:]]
    check("sau hook: than video bat dau tu dau nguon (giay 0)", than[:1] == [0.0], than)
    check("than video van co doan da sao chep lam hook (giay 8-10.5)",
          any(abs(x - 8.0) < 0.3 for x in than), than)
    check("than video theo thu tu tang dan", than == sorted(than), than)
    check("bao cao guard khong con nhac transition CapCut",
          not any("White" in f or "kho/thu vien" in f for f in (d.get("guard") or {}).get("fixed") or []),
          (d.get("guard") or {}).get("fixed"))

    print("\n[10] Khong co video mau -> cac buoc van chay, khong co phong_cach_mau")
    NHAN.clear()
    THU_TU.clear()
    with server.app.test_client() as c:
        r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True})
    check("chay duoc khi khong co video mau", r.status_code == 200 and (r.get_json() or {}).get("ok"),
          (r.get_json() or {}).get("error"))
    check("khong buoc nao nhan phong_cach_mau", not any("phong_cach_mau" in p for p in NHAN.values()),
          [k for k, p in NHAN.items() if "phong_cach_mau" in p])
    check("khong video mau -> R4 KHONG nhan bo phong cach nao (tu thiet ke theo noi dung)",
          "R4-design" in NHAN and NHAN["R4-design"].get("style_kit") is None, NHAN.get("R4-design", {}).get("style_kit"))
    plan10 = (r.get_json() or {}).get("plan") or {}
    check("plan khong luu bo phong cach mac dinh", not plan10.get("style_kit"), plan10.get("style_kit"))

    print("\n[11] HIEU UNG TU VIET (luong duy nhat): FX-plan -> FX-code sau R5, khong dung hieu ung mau trong kho")
    NHAN.clear()
    THU_TU.clear()
    TRA_LOI["R4-design"] = dict(DESIGN, effects=[{"type": "zoom_punch", "source_id": "source_1", "src_start": 1, "src_end": 2}],
                                layers=DESIGN["layers"] + [{"id": "sl", "type": "speedlines", "source_id": "source_1",
                                                            "src_start": 1, "src_end": 2, "x": 0.5, "y": 0.5}])
    TRA_LOI["FX-plan"] = {"effects": [{"id": "fx1", "kind": "overlay", "layer": "front", "source_id": "source_1",
                                       "src_start": 0.5, "src_end": 1.8,
                                       "context": "nguoi noi tiet lo 'toi mat ba ty trong mot dem', giong soc",
                                       "goal": "nguoi xem cam thay cu soc cua con so",
                                       "why_fit": "vet toa tu mat bung ra dung luc noi 'ba ty' nhan manh cu soc",
                                       "visual": "10 vet trang mo toa tu tam mat, bung ra 0.3s roi tat dan"},
                                      {"id": "fx2", "kind": "transform", "source_id": "source_1", "anchor": "hook",
                                       "src_start": 8.1, "src_end": 9.9,
                                       "context": "hook mo bang cau 'dung lam the' dut khoat, nguoi noi nghiem mat",
                                       "goal": "nguoi xem giat minh dung lai ngay giay dau",
                                       "why_fit": "rung manh ngan dung chu 'dung' lam cau canh bao dap vao mat",
                                       "visual": "2 cu dap camera 20% o chu 'dung' va chu 'the', moi cu 0.3s"}],
                          "bo_qua": [{"moment": "m2", "ly_do": "loi khuyen nhe nhang, khong can hieu ung"}]}
    TRA_LOI["FX-code"] = {"effects": [{"id": "fx1", "fit_check": {"ok": True, "reason": "dung cu soc"},
                                       "code": "function render(ctx){ const k = env(ctx.t, ctx.d); return h('svg', {width: ctx.W, height: ctx.H}, h('circle', {cx: 540, cy: 700, r: 200 * k + 1, fill: 'none', stroke: alpha('#ffffff', k), 'stroke-width': 6})) }"},
                                      {"id": "fx2", "fit_check": {"ok": True, "reason": "dung cau canh bao"},
                                       "code": "function transform(ctx){ const p = (c) => clamp(1 - Math.abs(ctx.t - c) / 0.15, 0, 1); return {scale: 1 + 0.2 * Math.max(p(0.08), p(1.2))}; }"}]}
    with server.app.test_client() as c:
        # client cu con gui edit_flow "v1" (nut da go) -> van chay luong moi
        r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "edit_flow": "v1",
                                               "edit_request": {"purpose": "canh bao lua dao"}})
    d11 = r.get_json() or {}
    check("chay xong (edit_flow 'v1' cu bi bo qua)", r.status_code == 200 and d11.get("ok"), d11.get("error"))
    seq = [x for x in THU_TU if x != "R4-design-fix"]
    check("v2: FX-plan + FX-code chay sau R5, truoc B6", seq.index("FX-plan") == seq.index("R5-captions") + 1
          and seq.index("FX-code") == seq.index("FX-plan") + 1 and seq.index("B6-inserts") > seq.index("FX-code"), seq)
    fxp = NHAN.get("FX-plan", {})
    km = fxp.get("khoanh_khac") or []
    check("FX-plan nhan boi canh TUNG khoanh khac (loi noi + cam xuc + bo cuc + mat)",
          km and km[0].get("loi_noi") and "cam_xuc" in km[0] and km[0].get("bo_cuc") and km[0].get("mat_nguoi") is not None
          or (km and km[0].get("loi_noi") and "bo_cuc" in km[0]), km[:1])
    check("FX-plan nhan cau chuyen + phong cach phien", (fxp.get("cau_chuyen") or {}).get("story_arc") == STORY_ARC)
    check("FX-code nhan boi canh + muc tieu cua hieu ung", (NHAN.get("FX-code", {}).get("effects") or [{}])[0].get("goal"))
    p11 = d11.get("plan") or {}
    check("plan co hieu ung tu viet (kem boi canh / muc tieu)", len(p11.get("fx") or []) == 2 and p11["fx"][0].get("why_fit"),
          p11.get("fx"))
    check("v2: hook da co hieu ung tu viet -> khong goi bo sung hinh", not any(x in THU_TU for x in ("Hook-FX-plan", "Hook-FX")),
          THU_TU)
    check("v2: hook chua co SFX -> AI bo sung", "Hook-SFX" in THU_TU and any(a.get("anchor") == "hook" for a in p11.get("audio") or []),
          (THU_TU, p11.get("audio")))
    check("v2: khong con hieu ung mau trong kho (effects / speedlines)", not p11.get("scene_effects")
          and not any(L.get("type") == "speedlines" for L in p11.get("layers") or []), (p11.get("scene_effects"), p11.get("layers")))
    check("_pipeline ghi luong v2", (p11.get("_pipeline") or {}).get("luong") == "v2")
    check("spec co khung hieu ung", len((d11.get("spec") or {}).get("fx") or []) == 1, (d11.get("spec") or {}).get("fx"))
    check("v2: buoc chu anh AI co chay (gom cum chu noi bat -> tao tam chu)", len(ART_CALLS) >= 1 and "TXT-art" in (p11.get("_pipeline") or {}).get("thu_tu", []),
          (ART_CALLS, (p11.get("_pipeline") or {}).get("thu_tu")))
    check("tao anh hong -> van dung duoc video bang chu code", d11.get("ok") and not any(L.get("art") for L in (d11.get("spec") or {}).get("layers") or []))

    print("\n[12] VIEC CODEX CHAY NEN (2026-09-30): anh AI + chu anh AI song song voi cac buoc Claude; Claude KHONG dong thoi")
    import time as _time
    import threading as _th
    import motion_design   # noqa: E402
    import run_log         # noqa: E402
    IMG = os.path.join(TMP, "anh.png")
    subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                    "-i", "color=red:s=64x64", "-frames:v", "1", IMG], check=True)
    MOC = []                                              # (step_label, bat dau, ket thuc) moi luot Claude gia
    CHAM = {"B6-inserts": 0.3, "FX-plan": 0.8}

    def fake_cham(name, messages, **k):
        lab = k.get("step_label")
        t0 = _time.time()
        _time.sleep(CHAM.get(lab, 0.05))
        try:
            return fake_chat(name, messages, **k)
        finally:
            MOC.append((lab, t0, _time.time()))

    ANH, CHU = {}, {}

    def fake_resolve(assets, source_videos, style="", log=None, contexts=None):
        ANH.update(t0=_time.time(), run=run_log.current(), luong=_th.current_thread().name, ctx=contexts)
        _time.sleep(1.2)                                  # Codex tao anh (~1-3 phut that)
        for a in assets:
            if a["id"] == "anh_hong":
                a["error"] = "Codex khong tao duoc"
            else:
                a["path"] = IMG
        ANH["t1"] = _time.time()
        return assets

    def fake_sheet(lk, *a, **k):
        CHU.setdefault("t0", _time.time())
        CHU.setdefault("luong", _th.current_thread().name)      # tam dau tien chay o luong TXT-art
        _time.sleep(1.0)                                  # Codex tao tam chu (~1-3 phut that)
        CHU["t1"] = _time.time()
        return None

    _goc = providers._chat, motion_design.resolve_assets, text_art.gen_sheet
    providers._chat, motion_design.resolve_assets, text_art.gen_sheet = fake_cham, fake_resolve, fake_sheet
    TRA_LOI["R4-design"] = dict(DESIGN, assets=[
        {"id": "anh_tot", "kind": "ai_image", "prompt": "the ngan hang bi khoa", "aspect": "9:16"},
        {"id": "anh_hong", "kind": "ai_image", "prompt": "dong tien bay mat", "aspect": "1:1"}])
    NHAN.clear()
    THU_TU.clear()
    try:
        t_bat_dau = _time.time()
        with server.app.test_client() as c:
            r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "_run": {"id": "test-nen"},
                                                   "edit_request": {"purpose": "canh bao lua dao"}})
        t_tong = _time.time() - t_bat_dau
    finally:
        providers._chat, motion_design.resolve_assets, text_art.gen_sheet = _goc
    d12 = r.get_json() or {}
    moc = {lab: (a, b) for lab, a, b in MOC}
    check("chay xong", r.status_code == 200 and d12.get("ok"), d12.get("error"))
    check("thu tu cac buoc Claude giu nguyen nhu cu", [x for x in THU_TU if x != "R4-design-fix"][:9] ==
          ["B1-select", "B2-timeline", "B3-hook", "R4-design", "R5-captions", "FX-plan", "FX-code", "B6-inserts",
           "B7-audio"], THU_TU)
    lan_luot = sorted(MOC, key=lambda x: x[1])
    check("KHONG co 2 luot Claude nao chay cung luc", all(b[1] >= a[2] - 1e-3 for a, b in zip(lan_luot, lan_luot[1:])),
          [(lab, round(a - t_bat_dau, 2), round(b - t_bat_dau, 2)) for lab, a, b in lan_luot])
    check("tao anh chay o luong nen, van ghi vao nhat ky cua lan chay",
          str(ANH.get("luong", "")).startswith("autoplan-nen") and (ANH.get("run") or {}).get("id") == "test-nen", ANH)
    check("anh AI nhan boi canh (asset_contexts) nhu truoc", isinstance(ANH.get("ctx"), dict) and "anh_tot" in ANH["ctx"],
          ANH.get("ctx"))
    check("R5 KHONG cho tao anh (bat dau khi anh con dang tao)", moc["R5-captions"][0] < ANH["t1"], (moc["R5-captions"], ANH))
    check("chu anh AI chay o luong nen", str(CHU.get("luong", "")).startswith("autoplan-nen"), CHU)
    check("B6 + B7 KHONG cho chu anh AI (bat dau khi chu con dang tao)",
          moc["B6-inserts"][0] < CHU["t1"] and moc["B7-audio"][0] < CHU["t1"], (moc.get("B6-inserts"), moc.get("B7-audio"), CHU))
    check("ca lan chay ngan hon cong don anh 1.2s + chu 2x1.0s + B6 0.3s", t_tong < 3.5, round(t_tong, 2))
    p12 = d12.get("plan") or {}
    check("plan chi ghep sau khi anh xong: anh tot co duong dan", [a.get("id") for a in p12.get("assets") or []] == ["anh_tot"],
          p12.get("assets"))
    check("anh loi -> van bao canh bao cho nguoi dung", any("anh_hong" in w for w in d12.get("warnings") or []),
          d12.get("warnings"))
    ev = [json.loads(x) for x in open(run_log.events_path("test-nen"), encoding="utf-8") if x.strip()]
    tieu_de = [(e.get("step"), e.get("title")) for e in ev]
    check("nhat ky co TXT-art chay nen (truoc day luong phu bi mat nhat ky)", ("TXT-art", "Bắt đầu TXT-art") in tieu_de,
          tieu_de)
    check("nhat ky co ket qua tai nguyen hinh 1/2", ("assets", "Tài nguyên hình: 1/2 xong") in tieu_de, tieu_de)
    check("ket qua tai nguyen hinh ghi SAU khi anh xong", next(e["ts"] for e in ev if e.get("step") == "assets"
                                                              and e.get("kind") == "result") >= ANH["t1"])
finally:
    shutil.rmtree(TMP, ignore_errors=True)

print("\n" + "=" * 60)
if FAILED:
    print("CO %d TEST FAIL:" % len(FAILED))
    for f in FAILED:
        print("  -", f)
    sys.exit(1)
print("TAT CA PASS")
