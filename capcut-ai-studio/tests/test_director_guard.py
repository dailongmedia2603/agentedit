#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test DAO DIEN v5 + GIAM SAT (2026-10-17, tai lieu Dao-dien-ai): bang quyet dinh theo tung doan, 4 dinh luat, ho so
nhip, giao viec + bu viec, lop dung nen (khung / dong bang / nen diu / vien nguoi), muc tieng theo nang luong, nhac tat +
bat lai, do tren ban dung, video dai 2 luot, ca luong autoplan (AI gia).

Chay: HOME=$(mktemp -d) <venv_python> tests/test_director_guard.py      (can flask + ffmpeg)

[1] normalize v5: phu kin doan, neo theo gio TUNG CHU, chong nhon, ha nhiet, diem nhan >= 2 bo phan, hook theo muc bat
    buoc, khoang lang trung hook bi bo, quyet dinh KHOANG_LANG -> khoang lang, ho so nhip
[2] ban chi dao GON tung bo phan (view_for / story_for)
[3] giao viec: deliveries / missing / r4_audit / sfx_supplement / loc tieng meme
[4] lop dung nen: apply_framing (khung theo lenh, ha nhiet -> nha, chong dung im, dong bang, hook)
[5] build_spec: dong bang (tieng van chay), day cham keo suot doan, nen diu + vien nguoi, tieng chu theo nang luong
[6] nhac nen: cat dut + bat lai (duong am luong)
[7] do tren ban dung: tuong quan / diem nhan yeu / dung im / qua tai -> bo lop phu (khong bo lop qd)
[8] buoc duyet khong bo phan tu thuc hien quyet dinh manh
[9] video dai: 2 luot (tong + bang quyet dinh theo cum)
[10] CA LUONG autoplan (AI gia): R4 thieu lenh -> vong tu sua; FX thieu -> FX-bo-sung; B7 thieu -> code dat tieng; giam sat
"""
import copy
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))
os.environ["STUDIO_LICENSE_OFF"] = "1"

import director          # noqa: E402
import director_guard as DG  # noqa: E402
import providers         # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


SENT = ["Tôi mất ba tỷ trong một đêm", "vì tin một lời quảng cáo", "Và rồi tôi đã làm lại từ đầu",
        "Hai năm sau tôi kiếm được năm tỷ", "nhờ một thói quen nhỏ", "Hãy kiểm tra trước khi chuyển tiền"]
TR = {"source_1": [{"start": i * 3.0, "end": i * 3.0 + 2.8, "text": t} for i, t in enumerate(SENT)]}
ASR = {"source_1": []}
for i, t in enumerate(SENT):
    ws = t.split()
    for j, w in enumerate(ws):
        a = i * 3.0 + j * 2.8 / len(ws)
        ASR["source_1"].append([w, round(a, 3), round(a + 2.8 / len(ws), 3)])
SEGS = [{"source_id": "source_1", "start": i * 3.0, "end": i * 3.0 + 2.9, "target_start": round(i * 2.9, 3)}
        for i in range(6)]
HOOK = {"source_id": "source_1", "src_start": 9.0, "src_end": 11.8, "caption": "NĂM TỶ", "do_dai": 2.8}

RAW = {
    "chu_de_that": "Cái giá của một lần tin quảng cáo", "y_tuong_lon": "Biên lai bị đóng dấu đỏ",
    "the_gioi_hinh": "giấy biên lai, mực dấu đỏ", "the_loai": "cảnh báo tài chính", "cuong_do": 3,
    "mau_nhan": "đỏ son #C0392B cho con dấu",
    "am_thanh": {"the_gioi": "dien_anh", "mat_do_sfx": "vua",
                 "nhac_tat": {"segment": 1, "loi_noi": "vì tin một lời quảng cáo", "khi": "truoc", "kieu": "cat",
                              "bat_lai": {"segment": 4, "loi_noi": "nhờ một thói quen nhỏ", "khi": "truoc"}}},
    "hook": {"cam_xuc": "tò mò", "cach_mo": "chữ NĂM TỶ đập xuống", "muc_do": "nhe"},
    "nhip": [{"tu_segment": 0, "den_segment": 2, "vai_tro": "day_len", "nang_luong": 3},
             {"tu_segment": 3, "den_segment": 5, "vai_tro": "chot", "nang_luong": 3}],
    "khoang_lang": [{"segment": 3, "loi_noi": "Hai năm sau tôi kiếm được năm tỷ", "vi_sao": "trùng hook -> phải bị bỏ"}],
    "hook_qd": {"y_do": "NHIP_NEN", "nang_luong": 2, "neo": {"tu": "năm tỷ"},
                "giao_viec": {"R4": "chữ NĂM TỶ đập xuống giữa khung", "FX": "khung giật nhẹ"}},
    "quyet_dinh": [
        {"segment": 0, "y_do": "NHAN_TU_KHOA", "nang_luong": 3, "neo": {"tu": "ba tỷ"}, "khung": "trung",
         "giao_viec": {"R4": "chữ BA TỶ đỏ son đúng lúc nói"}},
        {"segment": 1, "y_do": "NHAN_TU_KHOA", "nang_luong": 3, "neo": {"tu": "quảng cáo"},
         "giao_viec": {"R4": "chữ QUẢNG CÁO"}},
        {"segment": 2, "y_do": "BUNG_NO", "nang_luong": 5, "neo": {"tu": "làm lại"}, "khung": "can", "nen": "lam_toi",
         "giao_viec": {"FX": "khung đập mạnh theo chữ làm lại"}},
        {"segment": 3, "y_do": "SO_LIEU", "nang_luong": 4, "neo": {"tu": "năm tỷ"}, "khung": "can",
         "giao_viec": {"R4": "số chạy 0 -> 5 tỷ", "B7": "ding"}},
        {"segment": 5, "y_do": "KHOANG_LANG", "nang_luong": 1, "neo": {"tu": "kiểm tra trước"},
         "giao_viec": {"B7": "không được giữ"}},
    ],
}

print("[1] normalize v5")
cd = director.normalize(RAW, SEGS, TR, story={"tone": "nghiem tuc"}, hook=HOOK, asr_words=ASR,
                        hook_level=("manh", "theo yêu cầu edit: bắt trend"))
qd = cd["quyet_dinh"]
check("6 quyet dinh phu kin 6 doan, doan 4 (AI bo trong) -> nhip nen tu dien",
      len(qd) == 6 and [q["segment"] for q in qd] == list(range(6)) and qd[4]["y_do"] == "NHIP_NEN" and qd[4].get("_tu_dien"),
      [(q["segment"], q["y_do"]) for q in qd])
w_ba = next(w for w in ASR["source_1"] if w[0] == "ba")
check("neo 'ba tỷ' = gio TUNG CHU Whisper", qd[0]["neo"].get("src_start") == w_ba[1] and qd[0]["neo"].get("khop_tung_chu"),
      qd[0]["neo"])
check("chong nhon: 2 NHAN_TU_KHOA lien nhau -> doan sau ve nhip nen", qd[1]["y_do"] == "NHIP_NEN" and not qd[1]["giao_viec"],
      qd[1])
check("diem nhan nang luong 5 chi giao FX -> code giao them B7", set(qd[2]["giao_viec"]) == {"FX", "B7"}, qd[2]["giao_viec"])
check("bat buoc ha nhiet: sau nang luong 5, doan sau 4 -> 3", qd[3]["nang_luong"] == 3, qd[3])
hq = cd["hook_qd"]
check("hook: muc bat buoc 'manh' -> muc_do manh, nang luong 5, y do khong phai nhip nen",
      cd["hook"]["muc_do"] == "manh" and hq["nang_luong"] == 5 and hq["y_do"] == "MO_CAU_HOI" and hq["anchor"] == "hook",
      (cd["hook"], hq))
check("khoang lang trung cau hook bi bo; quyet dinh KHOANG_LANG (doan 5) -> khoang lang",
      [k["segment"] for k in cd["khoang_lang"]] == [5], cd["khoang_lang"])
check("KHOANG_LANG khong giao viec", qd[5]["giao_viec"] == {}, qd[5])
check("ho so nhip theo cuong do 3 + loai 'tai chinh' (khong rung / loe)",
      cd["ho_so_nhip"]["cuong_do"] == 3 and cd["ho_so_nhip"]["rung_loe"] is False and cd["ho_so_nhip"]["zoom_max"] == 1.15,
      cd["ho_so_nhip"])
check("nhac tat: cat dut + bat lai o doan 4", cd["am_thanh"]["nhac_tat"]["kieu"] == "cat"
      and cd["am_thanh"]["nhac_tat"]["bat_lai"]["segment"] == 4, cd["am_thanh"]["nhac_tat"])
check("ghi lai moi chinh sua cua code (_sua)", len(cd["_sua"]) >= 4, cd["_sua"])

print("\n[2] ban chi dao gon tung bo phan")
v4 = director.view_for(cd, "R4")
check("R4: viec_cua_ban chi lenh R4 (doan 0, 3, hook) kem neo + gio nguon",
      sorted(str(v["qd"]) for v in v4["viec_cua_ban"]) == ["0", "3", "hook"]
      and next(v for v in v4["viec_cua_ban"] if v["qd"] == 0)["neo"]["src_start"] == w_ba[1], v4["viec_cua_ban"])
v7 = director.view_for(cd, "B7")
check("B7: thay am_thanh day du; R4 chi thay the gioi", "nhac_tat" in v7["am_thanh"] and "nhac_tat" not in v4["am_thanh"],
      (v7["am_thanh"], v4["am_thanh"]))
check("duong nang luong 6 doan", len(v4["duong_nang_luong"]) == 6)
check("story_for khong co chi dao -> story y nguyen", director.story_for({"a": 1}, None, "R4") == {"a": 1})

print("\n[3] giao viec + bu viec")
design = {"layers": [{"id": "l0", "type": "text", "source_id": "source_1", "src_start": 0.6, "src_end": 2.0, "qd": 0},
                     {"id": "lx", "type": "text", "source_id": "source_1", "src_start": 9.5, "src_end": 10.5}]}
fx_list = [{"id": "fx1", "moment": "m3", "source_id": "source_1", "src_start": 6.2, "src_end": 7.5}]
dv = DG.deliveries(cd, design, {"captions": []}, fx_list, {"inserts": []}, {"audio": []})
check("R4 doan 0 (co qd) da lam; doan 3 khong qd nhung lop nam trong doan -> tinh la da lam",
      dv[0]["R4"] is True and dv[3]["R4"] is True, dv)
check("FX doan 2 (khoanh khac m3) da lam; B7 doan 2 + 3 chua", dv[2]["FX"] and not dv[2]["B7"] and not dv[3]["B7"], dv)
miss = DG.missing(cd, dv)
check("missing: B7 doan 2, B7 doan 3 (nang luong 3), R4 + FX cua hook",
      sorted((str(m["qd"]), m["bo_phan"]) for m in miss) == [("2", "B7"), ("3", "B7"), ("hook", "FX"), ("hook", "R4")], miss)
aud = DG.sfx_supplement(cd, {"audio": []}, [{"id": "kw-dien_anh-boom", "peak_time": 0.1},
                                            {"id": "kw-dien_anh-ding"}], dv)
b2 = next((a for a in aud if a["qd"] == 2), None)
check("code dat tieng bo the gioi: doan 2 BUNG_NO -> boom dung neo - peak", b2 and b2["sfx_id"] == "kw-dien_anh-boom"
      and abs(b2["src_time"] - (qd[2]["neo"]["src_start"] - 0.1)) < 1e-6, aud)
check("doan 3 SO_LIEU -> ding", any(a["qd"] == 3 and a["sfx_id"] == "kw-dien_anh-ding" for a in aud), aud)
r4 = DG.r4_audit({"layers": []}, director.view_for(cd, "R4"))
check("r4_audit: thiet ke rong -> bao 3 lenh (doan 0, 3, hook) kem neo", len(r4) == 3 and any("hook" in x for x in r4)
      and any("ba tỷ" in x for x in r4), r4)
check("loc tieng meme: the gioi dien anh -> bo 'rizz'; vui nhon -> giu",
      not director.library_sfx_ok({"id": "rizz-1", "tags": ["vine boom"]}, cd)
      and director.library_sfx_ok({"id": "rizz-1", "tags": ["vine boom"]}, dict(cd, am_thanh={"the_gioi": "vui_nhon"}))
      and director.library_sfx_ok({"id": "door-knock", "name": "go cua"}, cd))

print("\n[4] lop dung nen (khung)")
segs = copy.deepcopy(SEGS)
hook = dict(HOOK)
notes = DG.apply_framing(segs, cd, events=[], hook=hook)
sc = [s["scale"] for s in segs]
check("doan 0 'trung' 1.068, doan 2 'can' = zoom_max 1.15", sc[0] == round(1 + 0.45 * 0.15, 3) and sc[2] == 1.15, sc)
check("sau cao trao (nang luong 5) doan 3 xin 'can' -> 'nha' 1.0", sc[3] == 1.0, sc)
check("hook: khung mac dinh theo muc manh -> can", hook["scale"] == 1.15, hook)
cd2 = copy.deepcopy(cd)
for q in cd2["quyet_dinh"]:
    q.update(y_do="NHIP_NEN", khung="giu", nang_luong=2)
cd2["quyet_dinh"][1]["khung"] = "dong_bang"
segs2 = copy.deepcopy(SEGS)
n2 = DG.apply_framing(segs2, cd2, events=[])
check("chong dung im: 6 doan 'giu' khong co nhip hinh nao -> co doan day cham", any(s.get("zoom_ramp") == "slow" for s in segs2)
      and n2, (n2, [(s["scale"], s.get("zoom_ramp")) for s in segs2]))
check("dong bang: doan 1 co freeze tai dau doan", segs2[1].get("freeze") == {"src": 3.0, "dur": DG.FREEZE_SEC}, segs2[1])

print("\n[5] build_spec voi lenh dao dien")
import remotion_plan    # noqa: E402
import sfx_kit          # noqa: E402
TMP = tempfile.mkdtemp(prefix="ddg-")
SRC = os.path.join(TMP, "a.mp4")
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=20",
                "-f", "lavfi", "-i", "sine=frequency=300:duration=20", "-shortest",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", SRC], check=True)
sfx_kit.ensure_kit()
try:
    sfx_kit.ensure_worlds()
except Exception as ex:
    print("  (bo the gioi:", ex, ")")
import engine           # noqa: E402
plan = {"engine": "remotion", "source_videos": [{"id": "source_1", "path": SRC, "duration": 20.0}],
        "segments": copy.deepcopy(segs), "chi_dao": cd, "hook": None, "fps": 30, "canvas": {"w": 1080, "h": 1920},
        "speech": [{"source_id": "source_1", "start": t["start"], "end": t["end"]} for t in TR["source_1"]],
        "bg_focus": None, "subject_fx": None}
plan["segments"][1]["freeze"] = {"src": 3.0, "dur": 0.8}
plan["segments"][4]["zoom_ramp"] = "slow"
plan["segments"][4]["scale"] = 1.06
bg, sub = DG.focus_items(cd, DG.accent_hex(cd))
plan["bg_focus"], plan["subject_fx"] = bg, sub
plan["audio"] = [{"sfx_id": "kw-dien_anh-pop", "source_id": "source_1", "src_time": 1.0, "purpose": "reveal"},
                 {"sfx_id": "kw-dien_anh-pop", "source_id": "source_1", "src_time": 6.5, "purpose": "reveal"}]
plan = engine.resolve_plan_sfx(plan)
spec, rep = remotion_plan.build_spec(plan)
check("build_spec ra spec", spec is not None, rep.get("issues") if rep else rep)
c1 = next((c for c in spec["clips"] if abs(c["srcStart"] - 3.0) < 0.05), None)
check("dong bang: clip doan 1 co freezes 0.8s, tieng van chay (volume giu)", c1 and c1.get("freezes")
      and abs(c1["freezes"][0]["end"] - c1["freezes"][0]["start"] - 0.8) < 0.05 and c1["volume"] > 0, c1)
c4 = next((c for c in spec["clips"] if abs(c["srcStart"] - 12.0) < 0.05), None)
check("day cham: zoom keo suot clip doan 4", c4 and c4.get("zoomFrom") is not None
      and abs(c4["zoomDur"] - (c4["end"] - c4["start"])) < 0.01, c4)
check("nen diu (doan 2 lam_toi) vao spec.bgFocus quanh neo", spec.get("bgFocus") and spec["bgFocus"][0]["dim"] > 0
      and spec["bgFocus"][0]["start"] < 6.0 + 2.9, spec.get("bgFocus"))
sfx = sorted([a for a in spec["audio"] if a.get("role") != "bgm"], key=lambda a: a["start"])
check("tieng chu theo nang luong: doan 0 (3) va doan 2 (5) — doan nang luong 3 nho hon",
      len(sfx) == 2 and sfx[0]["volume"] < sfx[1]["volume"], [(a["start"], a["volume"], a.get("rel")) for a in sfx])
ew = DG.energy_windows(plan, remotion_plan.map_range)
check("energy_windows: 6 doan than video", len(ew) == 6 and ew[2][2] == 5, ew)

# sua sau review (2026-10-17): co HOOK -> giam sat quy gio tren clip ban dung cuoi; dong bang chiu mep doan doi; ban chi dao
# cu (v4) khong doi muc tieng
plan_h = copy.deepcopy(plan)
plan_h["hook"] = {"source_id": "source_1", "src_start": 12.0, "src_end": 15.8, "caption": "X", "transition": "cut"}
plan_h["segments"][1]["freeze"] = {"src": 2.8, "dur": 0.8}       # mep dau doan (3.0) nam SAU giay dong bang
spec_h, _ = remotion_plan.build_spec(plan_h)
hook_len = max(c["end"] for c in spec_h["clips"] if c["kind"] == "hook")
r0 = DG.spec_range(spec_h, "source_1", 0.0, 2.9)
check("spec_range: doan 0 nam SAU ban sao hook tren ban dung cuoi", r0 and r0[0] >= hook_len - 0.05, (r0, hook_len))
c1h = next((c for c in spec_h["clips"] if c["kind"] == "body" and abs(c["srcStart"] - 3.0) < 0.05), None)
check("dong bang van ap khi mep dau doan nam sau giay dong bang <= 0.6s", c1h and c1h.get("freezes"), c1h)
rh = DG.measure(spec_h, plan_h)
check("measure co hook: doan 0 bat dau sau hook", rh["doan"][0]["tu"] >= hook_len - 0.05, rh["doan"][:1])
old = dict(plan, chi_dao={k: v for k, v in cd.items() if k not in ("quyet_dinh", "hook_qd")})
check("ban chi dao cu (khong bang quyet dinh) -> khong cua so nang luong (giu muc tieng da duyet)",
      DG.energy_windows(old, remotion_plan.map_range) == [])

print("\n[6] nhac nen: cat dut + bat lai")
import music_lib        # noqa: E402
env = music_lib._envelope(10.0, 30.0, 0.0, [], [], 0.0, 0.0, mutes=[(15.0, 22.0, 0.06, 0.8)])
g = {round(10.0 + t, 3): v for t, v in env}


def at(t):
    pts = sorted(g.items())
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t0 <= t <= t1:
            return v0 + (v1 - v0) * (t - t0) / max(1e-6, t1 - t0)
    return pts[-1][1]
check("truoc lenh: nhac du; trong khoang tat: 0; sau bat lai: du lai", at(14.0) > 0.9 and at(18.0) < 0.01
      and at(15.1) < 0.01 and at(23.5) > 0.9, [(t, round(at(t), 3)) for t in (14.0, 14.95, 15.1, 18.0, 22.4, 23.5)])
mm = director.music_mutes(dict(plan, chi_dao=cd), remotion_plan.map_range)
check("music_mutes: 1 lenh (tat o doan 1, bat lai doan 4, fade cat 0.06)", len(mm) == 1 and mm[0][1] is not None
      and mm[0][2] == director.MUSIC_CUT_FADE and mm[0][1] > mm[0][0], mm)

print("\n[7] do tren ban dung")
rp = DG.measure(spec, plan, remotion_plan.map_range)
check("measure: co tuong quan / doan / dung im", "doan" in rp and len(rp["doan"]) == 6 and "dung_im" in rp, rp.keys())
fake = {"duration": 20.0, "fps": 30, "clips": [{"id": "c0", "kind": "body", "start": 0, "end": 20, "scale": 1.0}],
        "layers": [{"id": "b%d_%d" % (i, i), "type": "box", "start": 10.0, "end": 12.0, "enter": {"duration": 0.6}}
                   for i in range(5)] + [{"id": "q_9", "type": "text", "start": 10.0, "end": 12.0}],
        "captions": [], "audio": [], "overlays": [], "scenes": []}
pl = {"chi_dao": cd, "layers": [{"id": "b%d" % i, "type": "box"} for i in range(5)] + [{"id": "q", "type": "text", "qd": 0}],
      "segments": SEGS}
rp2 = DG.measure(fake, pl, remotion_plan.map_range)
check("qua tai: 6 lop vao cung luc", rp2.get("qua_tai"), rp2.get("qua_tai"))
fx_notes = DG.relieve_overload(pl, fake, rp2)
ids = [L["id"] for L in pl["layers"]]
check("bo lop phu gay qua tai, KHONG bo lop qd", fx_notes and "q" in ids and len(ids) < 6, (fx_notes, ids))

print("\n[8] buoc duyet bao ve phan tu cua quyet dinh manh")
cd_s = copy.deepcopy(cd)
cd_s["quyet_dinh"][2]["nang_luong"] = 5
des = {"layers": [{"id": "big", "type": "text", "source_id": "source_1", "src_start": 6.5, "src_end": 7.5, "qd": 2},
                  {"id": "small", "type": "text", "source_id": "source_1", "src_start": 6.6, "src_end": 7.4}]}
pl_, idx = director.review_view(cd_s, des, {"captions": []}, [], [], {"inserts": []}, {"audio": []}, SEGS)
check("review_view: nhip co quyet dinh + da_lam", any(b.get("quyet_dinh") for b in pl_["ban_dung"]))
res = {"bo": [{"id": "layer:big", "ly_do": "x"}, {"id": "layer:small", "ly_do": "y"}, {"id": "sfx:0", "ly_do": "z"}]}
aud_r = {"audio": [{"sfx_id": "rizz-meme", "source_id": "source_1", "src_time": 6.6, "qd": 2},
                   {"sfx_id": "kw-dien_anh-pop", "source_id": "source_1", "src_time": 7.0}]}
pl_, idx = director.review_view(cd_s, des, {"captions": []}, [], [], {"inserts": []}, aud_r, SEGS)
_, nts = director.apply_review(res, idx, des, {"captions": []}, [], {"transitions": []}, {"inserts": []}, aud_r)
check("giu lop 'big' (qd doan 2 nang luong 5), bo lop 'small'", [L["id"] for L in des["layers"]] == ["big"], (nts, des))
check("tieng CUOI cua quyet dinh manh bi duyet bo -> doi sang tieng bo the gioi (BUNG_NO -> boom), khong mat tieng",
      len(aud_r["audio"]) == 2 and aud_r["audio"][0]["sfx_id"] == "kw-dien_anh-boom", (nts, aud_r))

print("\n[8b] sua sau lan chay that (2026-10-17)")
import hook_rule        # noqa: E402
cd_cam = dict(cd, cam=["Punch-in zoom 1.0->1.2 dap vao mat", "loe sang trang"],
              hook=dict(cd["hook"], cach_mo="KHONG zoom dap vao mat; mo bang bong bong chat"))
ban = director.banned_catalog(cd_cam)
check("chieu dao dien cam -> loai kho: zoom_punch + flash", {"zoom_punch", "flash"} <= ban, ban)
fb = hook_rule.fallback_effect({"source_id": "source_1", "src_start": 9.0, "src_end": 12.0, "anchor": "hook"}, "manh",
                               banned=ban)
check("du phong hook manh khong con chieu bi cam, khong lap loai", not ({e["type"] for e in fb} & ban)
      and len({e["type"] for e in fb}) == len(fb), [e["type"] for e in fb])
_p = {"audio": [{"sfx_id": "kw-dien_anh-pop", "purpose": "punch"} for _ in range(30)]
      + [{"sfx_id": "kw-dien_anh-boom", "purpose": "punch", "qd": 13}]}
_p = engine.resolve_plan_sfx(_p)
check("tran so SFX khong cat tieng lenh dao dien (qd)", any(a.get("qd") == 13 for a in _p["audio"]),
      len(_p["audio"]))
fake_s = {"clips": [{"kind": "body", "start": 0.0, "end": 6.0, "srcStart": 12.0, "speed": 1.0, "sourceId": "source_1"}]}
pl_s = {"chi_dao": cd, "segments": [dict(sg, scale=1.0) for sg in SEGS]}
fs = DG.fix_static(pl_s, fake_s, {"dung_im": [[0.5, 3.5]]})
check("dung im con lai -> doan chua khoang do day cham", fs and pl_s["segments"][4].get("zoom_ramp") == "slow"
      and pl_s["segments"][4]["scale"] > 1.0, (fs, pl_s["segments"][4]))

print("\n[9] video dai: 2 luot")
LONG = [{"source_id": "source_1", "start": i * 3.0, "end": i * 3.0 + 2.9, "target_start": i * 2.9} for i in range(32)]
LTR = {"source_1": [{"start": i * 3.0, "end": i * 3.0 + 2.8, "text": "cau so %d co tu khoa %d" % (i, i)} for i in range(32)]}
check("needs_split: 32 doan -> chia; 20 doan (60s) -> khong; 6 doan -> khong", director.needs_split(LONG)
      and not director.needs_split(LONG[:20]) and not director.needs_split(SEGS))
calls = []


def fake_chat(name, messages, **k):
    lab = k.get("step_label")
    calls.append(lab)
    if lab == "DD-chi-dao":
        sysm = next(m["content"] for m in messages if m["role"] == "system")
        assert "VIDEO DAI" in sysm
        return json.dumps(dict(RAW, quyet_dinh=[], nhip=[{"tu_segment": 0, "den_segment": 31, "nang_luong": 3}]),
                          ensure_ascii=False)
    user = json.loads(next(m["content"] for m in messages if m["role"] == "user"))
    segs_ = [r["segment_index"] for r in user["cum"]["segments"]]
    return json.dumps({"quyet_dinh": [{"segment": i, "y_do": "NHAN_TU_KHOA" if i % 3 == 0 else "NHIP_NEN",
                                       "nang_luong": 3, "neo": {"tu": "tu khoa %d" % i},
                                       "giao_viec": {"R4": "chu %d" % i} if i % 3 == 0 else {}} for i in segs_]})


_orig = providers._chat
providers._chat = fake_chat
raw_long = director.gpt_direct(LONG, LTR, {}, {}, story={}, brief={})
providers._chat = _orig
cdl = director.normalize(raw_long, LONG, LTR, story={})
check("luot 1 + %d luot cum (DD-canh)" % (len(calls) - 1), calls[0] == "DD-chi-dao" and calls.count("DD-canh") >= 3, calls)
check("bang quyet dinh 32 doan tu cac cum, khong doan nao tu dien",
      len(cdl["quyet_dinh"]) == 32 and not any(q.get("_tu_dien") for q in cdl["quyet_dinh"]),
      [(q["segment"], q["y_do"], q.get("_tu_dien")) for q in cdl["quyet_dinh"]])

print("\n[10] Ca luong autoplan (AI gia)")
import server           # noqa: E402
import meme_lib         # noqa: E402
import media_vision     # noqa: E402
import text_art         # noqa: E402
BRIEF = {"source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 20.0}],
         "sources": [{"id": "source_1", "summary": "bai hoc mat tien", "transcript": TR["source_1"], "asr_words": ASR["source_1"],
                      "emotion_map": [{"start": 0, "end": 6, "emotion": "punch", "intensity": "high", "evidence": "giong run"}],
                      "key_moments": [{"start": 6.0, "end": 8.8, "type": "climax", "description": "lam lai"}]}]}
DD_RAW = copy.deepcopy(RAW)
TRA = {
    "B1-select": {"story_arc": "mat tien -> lam lai", "tone": "nghiem tuc", "selections": [
        {"source_id": "source_1", "start": s["start"], "end": s["end"]} for s in SEGS]},
    "B2-timeline": {"segments": [{"source_id": "source_1", "start": s["start"], "end": s["end"],
                                  "target_start": s["target_start"]} for s in SEGS]},
    "B3-hook": {"hook": {"source_id": "source_1", "src_start": 9.0, "src_end": 11.8, "caption": "NĂM TỶ",
                         "transition": "cut", "reason": "x"}},
    "DD-chi-dao": DD_RAW,
    # R4 lan 1 KHONG ghi qd va bo sot lenh doan 0 -> vong tu sua (R4-design-fix) phai nhan "lenh dao dien"
    "R4-design": {"concept": "x", "scenes": [], "assets": [], "effects": [], "layers": [
        {"id": "s3", "type": "counter", "source_id": "source_1", "src_start": 9.6, "src_end": 11.0, "to": 5, "x": 0.5, "y": 0.3,
         "qd": 3}]},
    "R4-design-fix": {"concept": "x", "scenes": [], "assets": [], "effects": [], "layers": [
        {"id": "s0", "type": "text", "source_id": "source_1", "src_start": 0.8, "src_end": 2.4, "x": 0.5, "y": 0.3, "qd": 0,
         "spans": [{"text": "BA TỶ", "font": "anton", "size": 110}], "enter": {"preset": "drop"}},
        {"id": "s3", "type": "counter", "source_id": "source_1", "src_start": 9.6, "src_end": 11.0, "to": 5, "x": 0.5, "y": 0.3,
         "qd": 3},
        {"id": "h1", "type": "text", "source_id": "source_1", "src_start": 9.4, "src_end": 11.0, "x": 0.5, "y": 0.3,
         "anchor": "hook", "qd": "hook", "spans": [{"text": "NĂM TỶ", "font": "anton", "size": 120}]}]},
    "R5-captions": {"captions": [], "caption_theme": {}},
    "FX-plan": {"effects": []},          # FX bo sot lenh doan 2 -> FX-bo-sung
    "FX-bo-sung": {"effects": [
        {"id": "x", "moment": "m3", "kind": "transform", "source_id": "source_1", "src_start": 6.6, "src_end": 7.6, "qd": 2,
         "context": "nguoi noi lam lai tu dau", "goal": "nguoi xem cam thay bung no", "y_nghia": "khuech dai cau lam lai",
         "why_fit": "khung dap theo chu lam lai", "visual": "khung dap vao 8% roi nha"}]},
    "FX-code": {"effects": [{"id": "dd1", "fit_check": {"ok": True},
                             "code": "function transform(ctx){ return {scale: 1 + 0.08 * env(ctx.t, ctx.d, 0.3, 0.3)} }"}]},
    "B6-inserts": {"inserts": []},
    "B7-audio": {"audio": [{"sfx_id": "rizz-meme", "source_id": "source_1", "src_time": 9.2, "anchor": "hook", "purpose": "punch"}]},
    "DD-duyet": {"nhan_xet": "ổn", "diem": {"dung_chu_de": 8}, "bo": [], "thieu": [{"segment": 2, "viec": "chưa đủ mạnh"}]},
}
NHAN, SYS, THU = {}, {}, []


def fake_chat2(name, messages, **k):
    lab = k.get("step_label")
    THU.append(lab)
    NHAN[lab] = json.loads(next((m["content"] for m in messages if m["role"] == "user"), "{}"))
    SYS[lab] = next((m["content"] for m in messages if m["role"] == "system"), "")
    return json.dumps(TRA.get(lab, {}), ensure_ascii=False)


providers._chat = fake_chat2
text_art.gen_sheet = lambda *a, **k: None
server._can_gio_loi_noi = lambda brief: brief
media_vision.face_box = lambda *a, **k: None
meme_lib.meme_catalog_for_plan = lambda *a, **k: []
_cat0 = engine.sfx_catalog_for_plan
engine.sfx_catalog_for_plan = lambda: _cat0() + [{"id": "rizz-meme", "name": "rizz", "tags": ["vine boom"], "use_when": "soc"}]
with server.app.test_client() as c:
    r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "project": "ddg-A",
                                           "edit_request": {"style": "bắt trend, nhanh"}})
d = r.get_json() or {}
check("autoplan chay xong", r.status_code == 200 and d.get("ok"), d.get("error"))
plan = d.get("plan") or {}
check("B3 truoc DD; DD truoc R4", THU.index("B3-hook") < THU.index("DD-chi-dao") < THU.index("R4-design"), THU)
check("dao dien nhan rang buoc hook 'manh' tu yeu cau edit",
      ((NHAN.get("DD-chi-dao") or {}).get("rang_buoc") or {}).get("hook_muc_do", {}).get("muc") == "manh",
      (NHAN.get("DD-chi-dao") or {}).get("rang_buoc"))
fixu = NHAN.get("R4-design-fix") or {}
check("R4 bo sot lenh -> vong tu sua nhan 'lenh dao dien'", "R4-design-fix" in THU
      and any("lenh dao dien" in x for x in fixu.get("thieu_can_bo_sung") or []), fixu.get("thieu_can_bo_sung"))
check("R4 nhan viec_cua_ban (chi lenh R4)", ((NHAN.get("R4-design") or {}).get("cau_chuyen") or {}).get("chi_dao", {})
      .get("viec_cua_ban"), list(((NHAN.get("R4-design") or {}).get("cau_chuyen") or {}).get("chi_dao", {}).keys()))
check("FX bo sot lenh doan 2 -> FX-bo-sung chay, hieu ung vao plan", "FX-bo-sung" in THU
      and any(e.get("id") == "dd1" for e in plan.get("fx") or []), (THU, [e.get("id") for e in plan.get("fx") or []]))
check("B7 khong thay tieng meme 'rizz' (the gioi dien anh)", "rizz-meme" not in SYS.get("B7-audio", ""))
dd_sfx = [a for a in plan.get("audio") or [] if a.get("_dd")]
check("B7 bo sot lenh tieng -> code dat tieng bo the gioi co qd", dd_sfx and all(str(a.get("sfx_id", "")).startswith("kw-dien_anh-")
                                                                             for a in dd_sfx), plan.get("audio"))
gs = (plan.get("_pipeline") or {}).get("giam_sat") or {}
check("_pipeline.giam_sat co tom tat + doan", gs.get("tom_tat") and gs.get("doan"), gs)
check("plan co chi_dao.quyet_dinh + hook_qd", len((plan.get("chi_dao") or {}).get("quyet_dinh") or []) == 6
      and (plan.get("chi_dao") or {}).get("hook_qd"))
check("plan segments da dung khung theo lenh (doan 2 can)", abs(float(plan["segments"][2].get("scale") or 0) - 1.15) < 1e-6,
      [s.get("scale") for s in plan.get("segments") or []])
check("duyet ghi muc 'thieu' cua dao dien", any("thiếu" in x for x in ((plan.get("_pipeline") or {}).get("dao_dien_duyet")
                                                                   or {}).get("thay_doi") or []))
providers._chat = _orig

print()
if FAILED:
    print("CO %d TEST FAIL: %s" % (len(FAILED), FAILED))
    sys.exit(1)
print("TAT CA PASS")
