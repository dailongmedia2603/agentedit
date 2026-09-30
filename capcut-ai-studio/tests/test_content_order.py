#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LUAT CUNG 2026-09-27 (user): noi dung video KHONG duoc dao thu tu — chi duoc cat bo im lang,
tieng dem, cau lap. Hook la BAN SAO dat len dau (than video van noi lai du).

Chay: HOME=$(mktemp -d) <venv_python> tests/test_content_order.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import providers     # noqa: E402
import prompt_store  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:400]))
    if not cond:
        FAILED.append(name)


print("[1] B1 dao thu tu (nhu du an Browser Skill: 33.7 -> 17.9 -> 43.9 -> 83.7 -> 72.2 ...) -> xep lai")
sel = [{"source_id": "source_1", "start": a, "end": b, "beat": bt} for a, b, bt in [
    (33.69, 43.89, "hook"), (17.87, 30.41, "setup"), (43.89, 50.25, "body"), (83.66, 89.22, "proof"),
    (72.24, 77.32, "twist"), (58.92, 64.58, "payoff"), (121.72, 125.84, "cta")]]
doi = []
out = providers.giu_thu_tu_nguon(sel, ["source_1"], doi)
check("start tang dan", [x["start"] for x in out] == sorted(x["start"] for x in sel), [x["start"] for x in out])
check("ghi lai la AI xep lech", any("thu tu" in c for c in doi), doi)
check("khong mat doan nao", len(out) == 7)

print("\n[2] Nhieu source: het source_1 roi toi source_2 (theo thu tu nguoi dung them)")
out = providers.giu_thu_tu_nguon([
    {"source_id": "source_2", "start": 0.0, "end": 3.0},
    {"source_id": "source_1", "start": 5.0, "end": 8.0},
    {"source_id": "source_1", "start": 1.0, "end": 4.0}], ["source_1", "source_2"])
check("source_1 (1, 5) roi source_2 (0)", [(x["source_id"], x["start"]) for x in out]
      == [("source_1", 1.0), ("source_1", 5.0), ("source_2", 0.0)], out)

print("\n[3] Chong gio nguon (noi lai cung mot cau) -> cat phan chong / bo doan trung han")
doi = []
out = providers.giu_thu_tu_nguon([
    {"source_id": "source_1", "start": 0.0, "end": 5.0},
    {"source_id": "source_1", "start": 3.0, "end": 9.0},
    {"source_id": "source_1", "start": 6.0, "end": 8.8}], ["source_1"], doi)
check("doan 2 bat dau tu 5.0", len(out) >= 2 and out[1]["start"] == 5.0, out)
check("doan 3 nam tron trong doan 2 -> bo", len(out) == 2, out)

print("\n[4] noi_lien: target_start lien tuc theo thu tu moi")
out = providers.giu_thu_tu_nguon([
    {"source_id": "source_1", "start": 8.0, "end": 12.0, "target_start": 0.0},
    {"source_id": "source_1", "start": 0.0, "end": 5.0, "target_start": 4.0, "speed": 1.0}],
    ["source_1"], noi_lien=True)
check("target_start 0 -> 5", [x["target_start"] for x in out] == [0.0, 5.0], out)

print("\n[5] cau_bi_bo: liet ke cau khong nam trong doan nao")
tr = {"source_1": [{"start": 0, "end": 2, "text": "cau mot"}, {"start": 2.5, "end": 3.0, "text": "ờ"},
                   {"start": 3.2, "end": 6, "text": "cau hai"}]}
bo = providers.cau_bi_bo(tr, [{"source_id": "source_1", "start": 0, "end": 2.1},
                              {"source_id": "source_1", "start": 3.2, "end": 6}])
check("chi con 'ờ' bi bo", [c["text"] for c in bo] == ["ờ"], bo)

print("\n[7] Nhieu video lon xon: thu tu GIUA video theo B1 (noi dung), kiem hop le")
doi = []
check("B1 xep source_2 truoc", providers.thu_tu_video({"thu_tu_video": ["source_2", "source_1"]},
                                                     ["source_1", "source_2"], doi) == ["source_2", "source_1"])
check("ghi nhat ky doi thu tu video", any("thu tu video" in c for c in doi), doi)
check("source bia -> bo, video bi quen -> noi vao sau",
      providers.thu_tu_video({"thu_tu_video": ["source_9", "source_3"]}, ["source_1", "source_2", "source_3"])
      == ["source_3", "source_1", "source_2"])
check("B1 khong ghi -> giu thu tu dau vao", providers.thu_tu_video({}, ["source_1", "source_2"]) == ["source_1", "source_2"])
out = providers.giu_thu_tu_nguon([
    {"source_id": "source_1", "start": 0.0, "end": 4.0},
    {"source_id": "source_2", "start": 5.0, "end": 9.0},
    {"source_id": "source_2", "start": 0.0, "end": 4.0}], ["source_2", "source_1"])
check("het source_2 (0, 5) roi moi source_1", [(x["source_id"], x["start"]) for x in out]
      == [("source_2", 0.0), ("source_2", 5.0), ("source_1", 0.0)], out)

print("\n[8] Cuoi video A bi noi lai o dau video B -> bo ban o cuoi A, giu ban o B")
TR = {
    "source_1": [{"start": 0.0, "end": 3.0, "text": "Hôm nay mình sẽ chia sẻ cách làm video ngắn"},
                 {"start": 3.2, "end": 7.0, "text": "Đầu tiên các bạn cần chuẩn bị kịch bản thật rõ ràng"},
                 {"start": 7.2, "end": 11.0, "text": "Bước thứ hai là quay video ở nơi có ánh sáng tốt"}],
    "source_2": [{"start": 0.0, "end": 3.9, "text": "Bước thứ hai là quay video ở nơi có ánh sáng thật tốt"},
                 {"start": 4.1, "end": 8.0, "text": "Sau đó các bạn đưa video vào phần mềm để dựng"}],
}
sels = [{"source_id": "source_1", "start": 0.0, "end": 11.0}, {"source_id": "source_2", "start": 0.0, "end": 8.0}]
doi = []
out = providers.bo_trung_giua_video(sels, TR, ["source_1", "source_2"], doi)
check("source_1 cat con 0-7.0 (bo cau lap o cuoi)", [(x["source_id"], x["start"], x["end"]) for x in out]
      == [("source_1", 0.0, 7.0), ("source_2", 0.0, 8.0)], out)
check("ghi nhat ky trung giua video", any("trung giua video" in c for c in doi), doi)
out = providers.bo_trung_giua_video([{"source_id": "source_1", "start": 0.0, "end": 11.0},
                                     {"source_id": "source_2", "start": 4.1, "end": 8.0}],
                                    TR, ["source_1", "source_2"])
check("B1 da bo ban o source_2 -> khong cat gi them", out[0]["end"] == 11.0, out)
TR2 = {"source_1": [{"start": 0, "end": 2, "text": "Cảm ơn các bạn đã xem"}],
       "source_2": [{"start": 0, "end": 2, "text": "Cảm ơn các bạn đã xem"}]}
out = providers.bo_trung_giua_video([{"source_id": "source_1", "start": 0, "end": 2},
                                     {"source_id": "source_2", "start": 0, "end": 2}], TR2, ["source_1", "source_2"])
check("cau xa giao ngan (< 8 tu) khong bi coi la trung", len(out) == 2, out)

print("\n[6] Prompt mac dinh B1/B2 cam dao thu tu, B3 noi ro hook la ban sao")
b1, b2, b3 = providers._SELECT_SYSTEM, providers._TIMELINE_SYSTEM, providers._HOOK_SYSTEM
check("B1 co luat KHONG DAO THU TU", "KHONG DAO THU TU" in b1)
check("B1 khong con 'chon nhung doan TOT NHAT'", "TOT NHAT" not in b1)
check("B1 duration chi tham khao", "THAM KHAO" in b1)
check("B2 co luat KHONG DAO THU TU", "KHONG DAO THU TU" in b2 and "Chi dao thu tu" not in b2)
check("B2 khong con 'rut ngan cho vua duration_target'", "rut ngan cho vua" not in b2)
check("B3 hook la BAN SAO", "BAN SAO" in b3)
check("B1 co muc NHIEU VIDEO + thu_tu_video", "NHIEU VIDEO" in b1 and "thu_tu_video" in b1)
check("B2 theo thu_tu_video", "thu_tu_video" in b2)
check("prompt_store dang ky B1/B2", {"_SELECT_SYSTEM", "_TIMELINE_SYSTEM"} <= {p["id"] for p in prompt_store.PROMPTS})

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
