#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Than video (2026-10-20): khung chat co thiet ke, khung chat cho canh chia doi (xep cho trong, khong lap hook), luat
nhip than video, cong kiem duyet y nghia, chuoi body_pipeline. Khong goi AI that.
Chay: HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_body_rules.py"""
import copy
import os
import sys

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)
os.chdir(SIDE)
FAIL = []


def check(name, ok, info=None):
    print(("  ok   " if ok else "  FAIL ") + name + ("" if ok else " -> %s" % (info,)))
    if not ok:
        FAIL.append(name)


import body_pipeline  # noqa: E402
import body_rhythm  # noqa: E402
import body_visual  # noqa: E402
import effect_review  # noqa: E402
import hook_fx  # noqa: E402
import motion_design as MD  # noqa: E402
import split_visual  # noqa: E402

print("[1] Luat y nghia + tham my noi vao moi buoc thiet ke")
import creative  # noqa: E402
txt = creative.luat("R4")
check("creative.luat co luat y nghia (muc dich, doc 1 giay, tham my, chuyen dong muot)",
      "LUAT Y NGHIA" in txt and "DOC DUOC TRONG 1 GIAY" in txt and "THAM MY" in txt and "CHUYEN DONG MUOT" in txt)

print("[2] Lop khung chat (chat_spec)")
kit = {"palette": {"accent": "#00D2FF", "primary": "#0A1626"}, "fonts": {"body": "x"}}
L0 = {"type": "chat", "source_id": "s", "src_start": 100.0, "src_end": 105.0,
      "chat": {"title": "Khách hàng 🔥", "status": "TRẢ LỜI 24/24",
               "messages": [{"side": "left", "text": "Tuần này đăng mấy bài em?", "src_time": 101.2},
                            {"side": "right", "text": "Dạ 12 bài ạ", "src_time": 102.5},
                            {"side": "left", "text": "", "src_time": 103}]}}
ch = MD.chat_spec(L0, L0, kit, {})
check("tin nhan gio NGUON -> giay tu luc lop bat dau, bo tin rong, bo emoji o ten",
      [m["at"] for m in ch["messages"]] == [1.2, 2.5] and ch["title"] == "Khách hàng" and ch["status"] == "TRẢ LỜI 24/24", ch)
check("mau theo bang mau video: tin phai = accent, chu toi tren accent sang",
      ch["theme"]["right"] == "#00D2FF" and ch["theme"]["rightText"] == "#0B1220", ch["theme"])

print("[3] Khung chat cho canh chia doi (split_visual.apply)")
plan = {"scenes": [{"layout": "split", "panel": {"asset": "a1"}, "source_id": "s", "src_start": 100.0, "src_end": 106.0},
                   {"layout": "split", "panel": {"asset": "a2"}, "source_id": "s", "src_start": 92.0, "src_end": 96.0},
                   {"layout": "split", "panel": {"asset": "a3"}, "source_id": "s", "src_start": 120.0, "src_end": 125.0}],
        "layers": [{"type": "text", "source_id": "s", "src_start": 101, "src_end": 103, "y": 0.1,
                    "spans": [{"text": "TRẢ LẠI TIỀN", "size": 110}]},
                   {"type": "text", "source_id": "s", "src_start": 120, "src_end": 124, "y": 0.2,
                    "spans": [{"text": "A", "size": 300}, {"text": "B", "size": 300, "newline": True}]}],
        "assets": [{"id": "a1", "kind": "ai_image", "path": "/x"}], "audio": [],
        "am_thanh": {"bo": {"ding": {"sound": "pro_notify/ding_2045"}, "pop": {"sound": "pro_pop_in/round"}}}}
ok5 = {"giu": True, "diem": {k: 5 for k in ("muc_dich", "dung_nghia", "phu_hop_chu_de", "khong_thua", "doc_duoc_1_giay")}}
msgs = [{"vai": "khach", "chu": "Bài viết không đúng ý rồi em", "luc": 101.0},
        {"vai": "agent", "chu": "Dạ em sửa ngay ạ", "luc": 103.0}]
props = [{"_id": "u0", "_kind": "nang_cap", "canh": 0, "ten_khung": "Khách hàng", "tin_nhan": msgs},
         {"_id": "u1", "_kind": "nang_cap", "canh": 1, "tin_nhan": msgs},
         {"_id": "u2", "_kind": "nang_cap", "canh": 2, "tin_nhan": msgs},
         {"_id": "u9", "_kind": "nang_cap", "canh": 0, "tin_nhan": msgs}]
logs = []
pl = copy.deepcopy(plan)
n = split_visual.apply(pl, props, {"u0": ok5, "u1": ok5, "u2": ok5, "u9": {"giu": False, "diem": {}}}, [], (91.9, 96.1),
                       log=logs.append)
chats = [L for L in pl["layers"] if L.get("type") == "chat"]
check("dat 1 khung chat: canh trong hook (lap hook) bo, panel day chu bo, kiem duyet khong dat bo",
      n == 1 and len(chats) == 1 and any("lap lai hook" in x for x in logs) and any("khong con cho" in x for x in logs)
      and any("kiem duyet khong dat" in x for x in logs), logs)
c = chats[0]
check("khung chat ne chu do hoa dang co (xep duoi 'TRẢ LẠI TIỀN'), trong panel, tin nhan dung ben",
      c["y"] > 0.1 + 0.05 and c["y"] + split_visual._card_h(2) <= split_visual.PANEL_BOT + 1e-6
      and [m["side"] for m in c["chat"]["messages"]] == ["left", "right"], c)
snd = [a for a in pl["audio"] if a.get("_split")]
check("tieng tung tin theo bo tieng video: tin den ding, tin di pop, dung gio",
      [a["gen"]["sound"] for a in snd] == ["pro_notify/ding_2045", "pro_pop_in/round"]
      and abs(snd[0]["src_time"] - 101.0) < 0.01, snd)
it = effect_review.collect(pl, {})
check("cong kiem duyet khong duyet lai khung chat / tieng khung chat (da qua 2 luot)",
      not any(x["id"].startswith("sfx:") for x in it) and not any("chat" in x["mo_ta"] for x in it), it)

print("[4] Nhip than video (body_rhythm)")
spec = {"duration": 60.0, "clips": [{"kind": "hook", "start": 0, "end": 4, "path": "/v", "srcStart": 90, "scale": 1},
                                    {"kind": "body", "start": 4, "end": 60, "path": "/v", "srcStart": 0, "scale": 1}],
        "scenes": [{"start": 11, "end": 13}], "layers": [{"start": 30}], "fx": [], "fxTransforms": [], "effects": []}
g = body_rhythm.gaps(spec, 6.0)
check("do khoang dung im > 6s trong than video (sau hook)", g == [(4.0, 11.0), (13.0, 30.0), (30.0, 59.0)], g)
spec_c = dict(spec, scenes=[{"start": 11, "end": 13}, {"layout": "split", "start": 15, "end": 28}])
g2 = body_rhythm.gaps(spec_c, 6.0)
check("thoi gian dang co canh chia doi khong tinh la dung im (khong dat chu nhan de len anh)",
      (13.0, 30.0) not in g2 and not any(x < 28 and y > 15 for x, y in g2), g2)
pl2 = {"source_videos": [{"id": "s", "path": "/v"}], "layers": [],
       "asr_words": {"s": [["mất", 14.0, 14.3], ["khách", 14.3, 14.6], ["hàng", 14.6, 14.9]]},
       "style_kit": {"palette": {"text": "#FFFFFF", "primary": "#0A1626"}, "fonts": {"impact": "f1"}}}
rows = [{"id": 1, "source_id": "s", "gio_nguon": [9.0, 26.0], "dai_giay": 17.0, "tu_trong_khoang": []},
        {"id": 2, "source_id": "s", "gio_nguon": [26.0, 55.0], "dai_giay": 29.0, "tu_trong_khoang": []},
        {"id": 3, "source_id": "s", "gio_nguon": [55.0, 58.0], "dai_giay": 6.5, "tu_trong_khoang": []}]
res = {"khoang": [{"id": 1, "lam": "chu_nhan", "chu": "MẤT KHÁCH HÀNG", "tu_luc": 14.0, "den_luc": 15.2,
                   "muc_dich": "nhan noi dau chinh cua doan"},
                  {"id": 2, "lam": "giu_lang", "ly_do": "doan tam su can lang"},
                  {"id": 3, "lam": "chu_nhan", "chu": "ok", "muc_dich": ""}]}
lg = []
n = body_rhythm.apply(pl2, res, rows, log=lg.append)
L = pl2["layers"][0] if pl2["layers"] else {}
check("chu nhan co muc dich duoc them (thay phu de, mau / font video); giu lang ghi ly do; chu khong muc dich bo",
      n == 1 and L.get("replaces_subtitle") and L["spans"][0]["text"] == "MẤT KHÁCH HÀNG" and L.get("font") == "f1"
      and any("giu lang" in x for x in lg) and any("khong ro muc dich" in x for x in lg), (pl2["layers"], lg))

rows2 = [{"id": 5, "source_id": "s", "gio_nguon": [60.0, 70.0], "dai_giay": 10.0, "tu_trong_khoang": [],
          "chu_gan_day": ["khoảng cỡ", "3-4 THÁNG"]}]
lg2 = []
n2 = body_rhythm.apply(copy.deepcopy(pl2), {"khoang": [{"id": 5, "lam": "chu_nhan", "chu": "3-4 tháng", "tu_luc": 62,
                                                        "muc_dich": "nhan moc thoi gian"}]}, rows2, log=lg2.append)
check("chu nhan lap chu do hoa gan day (3-4 THÁNG) -> bo", n2 == 0 and any("lap chu" in x for x in lg2), lg2)

print("[5] Cong kiem duyet y nghia (effect_review.apply)")
pl3 = {"fx": [{"id": "fx1", "kind": "overlay"}, {"id": "fx2", "kind": "overlay"}],
       "layers": [{"type": "text", "spans": [{"text": "khoảng cỡ"}]}], "audio": [], "inserts": [{"meme_id": "m"}]}
items = effect_review.collect(pl3, {})
ev = {"fx:fx1": {"giu": True, "diem": {k: 5 for k in effect_review.TIEU_CHI}},
      "fx:fx2": {"giu": True, "diem": dict({k: 5 for k in effect_review.TIEU_CHI}, muc_dich=2)},
      "meme:0": {"giu": False, "diem": {}}}
kept, dropped = effect_review.apply(pl3, items, ev)
check("bo muc diem thap / giu=false; muc AI khong cham thi giu (khong bo vi thieu danh gia)",
      [e["id"] for e in pl3["fx"]] == ["fx1"] and pl3["inserts"] == [] and len(pl3["layers"]) == 1, pl3)

print("[6] Chuoi than video (body_pipeline.run) voi AI gia")
calls = []


def fake_step(name, payload, fn):
    calls.append(name)
    return {"Body-visual": {"the_gioi": {"chu_de": "x"}, "diem": []}}.get(name, {})


built = []
pl4 = copy.deepcopy(plan)
pl4["hook"] = {"src_start": 91.9, "src_end": 96.1}
sp4 = {"duration": 30.0, "clips": [{"kind": "hook", "start": 0, "end": 4, "path": "/v"},
                                   {"kind": "body", "start": 4, "end": 30, "path": "/v", "srcStart": 0}]}
out = body_pipeline.run(pl4, sp4, build=lambda p: (built.append(1) or sp4, {}), step=fake_step, moments=[], story={},
                        emit=lambda m, lvl="info": None)
check("chay du buoc (hinh minh hoa -> khung chat -> kiem duyet -> nhip), AI tra rong van khong loi",
      "Body-visual" in calls and "Split-visual" in calls and "Kiem-duyet-y-nghia" in calls and "Nhip-than" in calls
      and out[1] is sp4, calls)


def boom(name, payload, fn):
    raise RuntimeError("AI hong")


out = body_pipeline.run(copy.deepcopy(pl4), sp4, build=lambda p: (sp4, {}), step=boom, moments=[], story={},
                        emit=lambda m, lvl="info": None)
check("buoc nao loi -> bo qua, plan van dung duoc", out[1] is sp4)

print("[7] Chuyen bo cuc muot: morph toi thieu")
check("MORPH_MIN >= 0.35", MD.MORPH_MIN >= 0.35)

print("\n" + ("TAT CA OK" if not FAIL else "CO %d TEST FAIL: %s" % (len(FAIL), FAIL)))
sys.exit(1 if FAIL else 0)
