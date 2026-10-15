#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""NGON NGU CHU TREN VIDEO = ngon ngu loi noi cua video nguon (sidecar/ngon_ngu.py, 2026-10-15).

Video tieng Viet: story / prompt / khoa cache Y NHU TRUOC. Video tieng khac: luat ngon ngu noi bang code vao moi buoc viet
chu (B3 hook, DD dao dien, R4 thiet ke, R5 phu de, TXT-lib, chu anh AI, huy hieu anh AI) + OCR kiem chinh ta theo dung
ngon ngu + so khop chu khong chi Latin.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_ngon_ngu.py      (khong goi AI)
"""
import os
import sys
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import ngon_ngu             # noqa: E402
import providers            # noqa: E402
import text_art             # noqa: E402
import graphic_art          # noqa: E402
import speech_align         # noqa: E402
import speech_cut           # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


print("[1] Nhan ma ngon ngu")
for v, want in (("en", "en"), ("EN-us", "en"), ("English", "en"), ("tiếng Anh", "en"), ("vi|en", "vi"), ("vi-VN", "vi"),
                ("ja", "ja"), ("zh-Hans", "zh"), ("eng", "en"), ("mixed", None), ("", None), (None, None), ("???", None)):
    check("ma(%r) = %r" % (v, want), ngon_ngu.ma(v) == want, ngon_ngu.ma(v))

EN_TR = [{"text": "Today I want to show you three simple ways to grow your page fast"}]
VI_TR = [{"text": "Hôm nay mình sẽ chỉ cho các bạn ba cách đơn giản để tăng tương tác"}]
check("brief language en", ngon_ngu.cua_brief({"language": "en"}) == "en")
check("brief khong ghi language + transcript tieng Anh -> en",
      ngon_ngu.cua_brief({"sources": [{"transcript": EN_TR}]}) == "en")
check("brief khong ghi language + transcript tieng Viet -> vi",
      ngon_ngu.cua_brief({"sources": [{"transcript": VI_TR}]}) == "vi")
check("brief rong -> vi (nhu truoc)", ngon_ngu.cua_brief({}) == "vi" and ngon_ngu.cua_brief(None) == "vi")

print("\n[2] Video tieng Viet: khong doi gi")
check("story_view tieng Viet = None", ngon_ngu.story_view({"language": "vi"}) is None)
check("luat tieng Viet = ''", all(ngon_ngu.luat({}, b) == "" for b in ("B3", "DD", "R4", "R5", "TXT-lib", "image")))
check("ocr tieng Viet = vi-VT", ngon_ngu.ocr_langs(ngon_ngu.cua_story({})) == ["vi-VT"])
lk = [{"key": "k1", "tiers": [{"text": "MẤT 3 TỶ", "role": "chinh"}]}]
check("prompt chu anh AI tieng Viet y nhu cu (khong co khoi ngon ngu)",
      "NGON NGU CHU TREN VIDEO" not in text_art.sheet_prompt(lk, {}, {"tone": "vui"}, False, "/x.png"))

print("\n[3] Video tieng Anh: luat noi vao moi buoc viet chu")
nn = ngon_ngu.story_view({"language": "en"})
check("story_view en", nn == {"ma": "en", "ten": "TIENG ANH (English)"}, nn)
EN = {"tone": "vui", "ngon_ngu": nn}
check("cua_story en", ngon_ngu.cua_story(EN) == "en")
for b in ("B3", "DD", "R4", "R5", "TXT-lib", "image"):
    r = ngon_ngu.luat(EN, b)
    check("luat %s co 'TIENG ANH' + khong dich" % b, "TIENG ANH" in r and "KHONG dich" in r, r[:200])
check("ocr en = en-US", ngon_ngu.ocr_langs("en") == ["en-US"])
lk_en = [{"key": "k1", "tiers": [{"text": "LOST 3 BILLION", "role": "chinh"}]}]
pr = text_art.sheet_prompt(lk_en, {}, EN, False, "/x.png")
check("prompt chu anh AI: khoi ngon ngu nam TRUOC 'Tao xong'",
      "NGON NGU CHU TREN VIDEO: TIENG ANH" in pr and pr.index("NGON NGU CHU") < pr.index("Tao xong:"), pr[-800:])
items = graphic_art.items_from([{"id": "b1", "type": "badge", "label": "LEVEL 2"}], {})
pg = graphic_art.sheet_prompt(items, {}, EN, False, "/x.png")
check("prompt huy hieu anh AI co khoi ngon ngu", "CHU TRONG ANH la TIENG ANH" in pg, pg[-600:])
check("prompt huy hieu tieng Viet y nhu cu", "NGON NGU" not in graphic_art.sheet_prompt(items, {}, {}, False, "/x.png"))

seen, payloads = {}, {}
orig = providers.plan_chat


def fake_chat(msgs, **kw):
    seen[kw.get("step_label")] = msgs[0]["content"]
    try:
        payloads[kw.get("step_label")] = json.loads(msgs[-1]["content"])
    except Exception:
        pass
    return json.dumps({"hook": None, "captions": [], "chon": [], "khong_dung": []})


providers.plan_chat = fake_chat
import motion_design   # noqa: E402
import remotion_plan   # noqa: E402
import director        # noqa: E402
import text_tpl        # noqa: E402
seg = {"source_id": "source_1", "start": 0, "end": 5, "target_start": 0}
for story, tag in ((EN, "en"), ({"tone": "vui"}, "vi")):
    seen.clear()
    payloads.clear()
    providers.gpt_hook([seg], {}, {}, {}, story=story)
    motion_design.gpt_rm_design([seg], {}, {}, {}, story=story)
    remotion_plan.gpt_rm_captions([seg], {}, {}, {}, {}, story=story)
    director.gpt_direct([seg], {}, {}, {}, story=story, brief={})
    text_tpl._ask({"video": {}}, story=story)
    for lb in ("B3-hook", "R4-design", "R5-captions", "DD-chi-dao", "TXT-lib"):
        has = "NGON NGU CHU TREN VIDEO" in (seen.get(lb) or "")
        check("%s: prompt %s %s khoi ngon ngu" % (tag, lb, "CO" if tag == "en" else "KHONG co"),
              has == (tag == "en"), list(seen))
    check("%s: R5 payload language = %s" % (tag, tag), (payloads.get("R5-captions") or {}).get("language") == tag,
          payloads.get("R5-captions"))
providers.plan_chat = orig

print("\n[4] So khop chu khong chi Latin (tieng Viet / Anh y nhu truoc)")
check("norm tieng Viet", text_art.norm("Mất 3 TỶ đồng!") == "mat 3 ty dong")
check("norm tieng Anh", text_art.norm("Don't STOP now") == "don t stop now")
check("norm tieng Nga khong rong", text_art.norm("Привет мир") == "привет мир", text_art.norm("Привет мир"))
check("norm tieng Nhat khong rong", bool(text_art.norm("今日は")), text_art.norm("今日は"))
check("speech_align tokens tieng Viet nhu cu", speech_align.norm_tokens("Tui hổng biết") == ["toi", "khong", "biet"])
check("speech_align tokens tieng Nga", speech_align.norm_tokens("Привет, мир") == ["привет", "мир"])
check("speech_cut _norm tieng Anh", speech_cut._norm("Hello, World") == ["hello", "world"])
check("chu anh AI tieng Nga: OCR dung chu -> do khop cao", text_art._sim("Привет мир", "ПРИВЕТ МИР") == 1.0)

print("\n%d loi" % len(FAILED) if FAILED else "\nTAT CA OK")
sys.exit(1 if FAILED else 0)
