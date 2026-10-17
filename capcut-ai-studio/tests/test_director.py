#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test DAO DIEN (sidecar/director.py, 2026-10-15) + THE GIOI AM THANH (sfx_kit.WORLDS).

Chay: HOME=$(mktemp -d) <venv_python> tests/test_director.py      (can flask + ffmpeg)

[1] chuan hoa ban chi dao (nhip phu kin, cuong do, muc hook, the gioi, trich loi -> gio nguon)
[2] gan nhan "chieu" tu mo ta hieu ung that (cac ke hoach cu tren may user)
[3] so tay: ghi / doc / chieu lap nhieu / khong tinh chinh du an
[4] buoc duyet: bo / doi trong danh muc, khong dung hook, tran 45%
[5] bo tieng the gioi: tao, chon theo the gioi, muc to
[6] CA LUONG /remotion/autoplan (AI gia): chi dao toi B3..B7, danh muc SFX theo the gioi, duyet ap vao plan, khoang lang
    khong SFX, tieng chu theo the gioi, muc hook theo dao dien, so tay ghi lai
"""
import os
import sys
import json
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))
os.environ["STUDIO_LICENSE_OFF"] = "1"

import director        # noqa: E402
import sfx_kit         # noqa: E402
import engine          # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


TR = {"source_1": [
    {"start": 0.0, "end": 2.0, "text": "Toi mat ba ty trong mot dem", "is_punchline": True},
    {"start": 2.3, "end": 5.8, "text": "vi tin mot loi quang cao"},
    {"start": 8.0, "end": 10.5, "text": "Dung bao gio lam nhu toi", "emphasis": ["Dung bao gio"]},
    {"start": 10.8, "end": 13.9, "text": "hay kiem tra truoc khi chuyen tien"},
]}
SEGS = [{"source_id": "source_1", "start": 0.0, "end": 5.8, "target_start": 0.0, "beat": "hook"},
        {"source_id": "source_1", "start": 8.0, "end": 13.9, "target_start": 5.8, "beat": "payoff"}]

RAW = {
    "chu_de_that": "Cái giá của một lần tin quảng cáo", "dieu_dong_lai": "Kiểm tra trước khi chuyển tiền",
    "y_tuong_lon": "Màn hình chuyển khoản như hiện trường vụ án: biên lai bị đóng dấu đỏ",
    "the_gioi_hinh": "giấy biên lai, mực dấu đỏ, ánh đèn bàn lạnh",
    "mo_tip": [{"ten": "con dấu đỏ", "mo_ta": "đóng lên con số ở đầu, lặp lại nhẹ ở lời khuyên"}],
    "the_loai": "cảnh báo", "cuong_do": 2, "ly_do_cuong_do": "cần niềm tin",
    "am_thanh": {"the_gioi": "toi_gian", "ly_do": "tĩnh, nghiêm", "nhac": "không nhạc", "mat_do_sfx": "thua"},
    "hook": {"cam_xuc": "sốc lặng", "cach_mo": "đóng dấu đỏ lên số 3 tỷ", "muc_do": "nhẹ"},
    "nhip": [{"tu_segment": 0, "den_segment": 0, "vai_tro": "cao_trao", "nang_luong": 4, "cam_xuc": "sốc",
              "hinh": "dấu đỏ", "chu_nhan": ["3 tỷ"]},
             {"tu_segment": 1, "den_segment": 1, "vai_tro": "lang", "nang_luong": 2, "cam_xuc": "tỉnh lại"}],
    "khoanh_khac_dau_an": [{"segment": 0, "loi_noi": "mất ba tỷ trong một đêm", "y_tuong": "dấu đỏ đập xuống",
                            "vi_sao": "câu sốc"}],
    "khoang_lang": [{"segment": 1, "loi_noi": "hãy kiểm tra trước khi chuyển tiền", "vi_sao": "để lời khuyên trơn"},
                    {"segment": 0, "loi_noi": "mất ba tỷ trong một đêm", "vi_sao": "trùng dấu ấn -> phải bị bỏ"}],
    "cam": ["dải sáng chéo", "rung khung"],
}

print("[1] Chuan hoa ban chi dao")
cd = director.normalize(RAW, SEGS, TR, story={"tone": "nghiem tuc"})
check("ban chi dao hop le", isinstance(cd, dict) and cd["y_tuong_lon"].startswith("Màn hình"), cd)
check("cuong do 2, hook nhe, the gioi toi_gian", cd["cuong_do"] == 2 and cd["hook"]["muc_do"] == "nhe"
      and cd["am_thanh"]["the_gioi"] == "toi_gian", (cd["cuong_do"], cd["hook"], cd["am_thanh"]))
check("2 nhip phu kin 2 segment, co gio nguon + timeline",
      [(b["tu_segment"], b["den_segment"]) for b in cd["nhip"]] == [(0, 0), (1, 1)]
      and cd["nhip"][1]["nguon"] == [{"source_id": "source_1", "tu": 8.0, "den": 13.9}]
      and cd["nhip"][1]["timeline_tu"] == 5.8, cd["nhip"])
check("trich loi (co dau) -> gio nguon cua cau", cd["khoanh_khac_dau_an"][0]["src_start"] == 0.0
      and cd["khoanh_khac_dau_an"][0]["src_end"] == 2.0, cd["khoanh_khac_dau_an"])
check("khoang lang trung dau an bi bo, con 1 (10.8-13.9)", [(k["src_start"], k["src_end"]) for k in cd["khoang_lang"]]
      == [(10.8, 13.9)], cd["khoang_lang"])
gap = director.normalize(dict(RAW, nhip=[{"tu_segment": 1, "den_segment": 1, "nang_luong": 9}], cuong_do="x",
                              am_thanh={"the_gioi": "khong-co"}, hook={}), SEGS, TR, story={"tone": "vui ve hai huoc"})
check("nhip thieu dau -> phu tu segment 0; nang luong kep 1-5",
      gap["nhip"][0]["tu_segment"] == 0 and gap["nhip"][-1]["den_segment"] == 1 and gap["nhip"][0]["nang_luong"] == 5,
      gap["nhip"])
check("cuong do sai -> doan theo tone (vui -> 4), muc hook + the gioi suy theo cuong do",
      gap["cuong_do"] == 4 and gap["hook"]["muc_do"] == "manh" and gap["am_thanh"]["the_gioi"] == "dien_anh",
      (gap["cuong_do"], gap["hook"], gap["am_thanh"]))
check("ban rong -> None", director.normalize({"nhip": []}, SEGS, TR) is None)
nt = director.normalize(dict(RAW, am_thanh=dict(RAW["am_thanh"], nhac_tat={"segment": 1, "loi_noi": "Đừng bao giờ làm như tôi",
                                                                           "khi": "trước"})), SEGS, TR)
check("nhac_tat: trich loi -> gio nguon cau + truoc", (nt["am_thanh"]["nhac_tat"] or {}).get("src_start") == 8.0
      and nt["am_thanh"]["nhac_tat"]["khi"] == "truoc", nt["am_thanh"])
check("nhac_tat trich sai -> None", director.normalize(dict(RAW, am_thanh=dict(RAW["am_thanh"], nhac_tat={
    "segment": 1, "loi_noi": "cau khong he co"})), SEGS, TR)["am_thanh"]["nhac_tat"] is None)
cap = director.capabilities()
check("kha nang bo dung: font theo id danh muc + chuyen canh + kieu vao", any(f.get("id") == "lexend" for f in cap["font"])
      and "whip_left" in cap["chuyen_canh"] and "drop" in cap["kieu_vao_chu"] and "khong cat lai" in cap["noi_dung"], cap)
for b in ("B3", "R4", "R5", "FX", "B6", "B7"):
    check("luat dao dien noi vao %s" % b, "CHI DAO CUA DAO DIEN" in director.luat(b))

print("\n[2] Gan nhan chieu tu mo ta hieu ung")
SAMPLES = {
    "Tâm zoom đặt vào mặt (0.452, 0.36). Nhịp 1 (0-0.25s): punch-in từ 1.00 lên 1.12, ease-out mạnh": {"punch_zoom"},
    "Một dải sáng chéo 25°, rộng khoảng 18% chiều ngang khung. Lõi trắng": {"light_sweep"},
    "Bốn góc khung ngắm dạng chữ L, nét trắng #FFFFFF dày khoảng 0.006 khung": {"viewfinder"},
    "Thanh ngang mảnh tại y≈0.905, x 0.10-0.90, cao khoảng 0.008 khung. Rãnh là navy": {"progress_bar"},
    "Light leak vàng ấm tỏa từ góc trên trái": {"light_leak"},
    "6 tia lấp lánh hình sao 4 cánh, màu vàng": {"sparkle"},
}
for txt, want in SAMPLES.items():
    got = set(director.tag_text(txt))
    check("nhan '%s...'" % txt[:30], want <= got, got)

print("\n[3] So tay dao dien")
mk = lambda fx: {"fx": [{"visual": v} for v in fx], "segments": [], "layers": [], "audio": [], "style_kit": {"fonts": {"impact": "anton"}},
                 "chi_dao": {"y_tuong_lon": "y", "mo_tip": [{"ten": "m"}], "am_thanh": {"the_gioi": "am_ap"}}}
director.remember(mk(["punch-in 1.00 lên 1.12", "dải sáng chéo"]), project="p1")
director.remember(mk(["punch-in 1.0 lên 1.15", "4 góc khung ngắm chữ L"]), project="p2")
director.remember(mk(["dải sáng chéo quét"]), project="p3")
rec = director.recent(project="p3")
check("recent bo chinh du an, moi nhat truoc", [r.get("chieu_da_dung") for r in rec][0] and len(rec) == 2, rec)
ov = director.overused(project="p9")
check("chieu lap >= 2 video: punch_zoom + light_sweep", ov.get("punch_zoom") == 2 and ov.get("light_sweep") == 2
      and "viewfinder" not in ov, ov)
director.remember(mk(["dải sáng chéo"]), project="p1")
check("ghi lai cung du an -> thay ban cu (khong nhan doi)",
      sum(1 for v in director._load_memory()["videos"] if v["project"] == "p1") == 1)

print("\n[4] Buoc duyet")
design = {"layers": [{"id": "a", "type": "text", "source_id": "source_1", "src_start": 0.5, "spans": [{"text": "3 TỶ"}],
                      "enter": {"preset": "pop"}},
                     {"id": "b1", "type": "text", "group": "g", "source_id": "source_1", "src_start": 9.0,
                      "spans": [{"text": "ĐỪNG"}], "enter": {"preset": "pop"}},
                     {"id": "b2", "type": "text", "group": "g", "source_id": "source_1", "src_start": 9.2,
                      "spans": [{"text": "bao giờ"}], "enter": {"preset": "pop"}},
                     {"id": "h", "type": "text", "anchor": "hook", "source_id": "source_1", "src_start": 8.1,
                      "spans": [{"text": "HOOK"}]}]}
fx = [{"id": "f1", "source_id": "source_1", "src_start": 1, "visual": "dải sáng chéo quét"},
      {"id": "f2", "source_id": "source_1", "src_start": 8.2, "anchor": "hook", "visual": "punch-in"},
      {"id": "f3", "source_id": "source_1", "src_start": 11, "visual": "light leak"}]
visual = {"transitions": [{"segment_index": 1, "type": "whip_left", "duration": 0.3}]}
caps = {"captions": [{"text": "MẤT 3 TỶ", "role": "hero", "source_id": "source_1", "src_start": 0.2}]}
ins, aud = {"inserts": []}, {"audio": [{"sfx_id": "kw-toi_gian-click", "source_id": "source_1", "src_time": 11.5}]}
pl, idx = director.review_view(cd, design, caps, fx, visual["transitions"], ins, aud, SEGS, overused_tags={"light_sweep": 3})
ids = {it["id"] for b in pl["ban_dung"] for it in b["phan_tu"]}
check("ban dung co du loai phan tu + gom to hop", {"layer:a", "group:g", "layer:h", "fx:f1", "fx:f2", "fx:f3", "tr:1",
                                                  "sfx:0", "cap:0"} <= ids, ids)
check("phan tu xep dung nhip (f3 o nhip 2)", any(it["id"] == "fx:f3" for it in pl["ban_dung"][1]["phan_tu"]), pl["ban_dung"])
check("thong ke lap + chieu lap nhieu + danh muc", pl["thong_ke_lap"]["kieu_vao_chu"].get("pop") == 3
      and pl["chieu_lap_nhieu"] and "write_on" in pl["danh_muc"]["kieu_vao"])
res = {"bo": [{"id": "fx:f1", "ly_do": "rap khuon"}, {"id": "fx:f2", "ly_do": "thu bo hook"},
              {"id": "fx:f3", "ly_do": "khoang lang"}, {"id": "khong-co"}],
       "doi_kieu_vao": [{"id": "group:g", "preset": "write_on"}, {"id": "layer:a", "preset": "khong-ton-tai"},
                        {"id": "layer:h", "preset": "fade"}],
       "doi_chuyen_canh": [{"id": "tr:1", "type": "cut"}]}
fx2, notes = director.apply_review(res, idx, design, caps, list(fx), visual, ins, aud)
check("bo f1 (rap khuon); giu f2 (hook); f3 vuot tran 45%% cua 3 hieu ung -> giu",
      [e["id"] for e in fx2] == ["f2", "f3"], [e["id"] for e in fx2])
check("doi kieu vao ca to hop; preset la -> bo qua; lop hook khong doi",
      [L["enter"]["preset"] for L in design["layers"] if L.get("group") == "g"] == ["write_on", "write_on"]
      and design["layers"][0]["enter"]["preset"] == "pop" and "enter" not in design["layers"][3], design["layers"])
check("doi chuyen canh -> cat thang", visual["transitions"] == [], visual)
check("ghi chu thay doi", any("bỏ fx:f1" in n for n in notes) and any("thuộc hook" in n for n in notes), notes)

print("\n[5] Bo tieng the gioi")
n = sfx_kit.ensure_worlds()
lib = {e["id"]: e for e in engine.sfx_list()}
check("40 tieng (5 the gioi x 8 ho) co file + do to", n == 40 and all(
    os.path.isfile(lib[sfx_kit.world_id(w, f)]["file"]) and lib[sfx_kit.world_id(w, f)].get("lufs_m") is not None
    for w in sfx_kit.WORLDS for f in sfx_kit.WORLD_FAMILIES), n)
check("chay lai khong tao lai", sfx_kit.ensure_worlds() == 0)
with sfx_kit.use_world("vui_nhon"):
    check("use_world -> tieng cua bo do (impact -> boom)", sfx_kit.family_file("impact")[0] == "kw-vui_nhon-boom")
check("ngoai use_world -> kit-* cu", sfx_kit.family_file("pop")[0] == "kit-pop")
check("toi gian nho hon 4 dB", sfx_kit.world_gain_db("kw-toi_gian-pop") == -4.0 and sfx_kit.world_gain_db("kit-pop") == 0.0)
import plan_guard  # noqa: E402
check("mix_sfx doc chinh muc the gioi", plan_guard._world_db({"sfx_id": "kw-am_ap-ding"}) == -1.5)

print("\n[5b] Luat hook: khuech dai hieu ung cua dao dien truoc khi dung kho")
import fx_flow  # noqa: E402
bv = fx_flow.boost_values({"scale": [1.0, 1.05, 1.1], "y": [0.0, 20.0, 40.0], "brightness": [1.0, 1.1, 1.0], "n": 3}, 2.0)
check("boost x2: lech so voi khung goc nhan doi (scale, y, sang)", bv["scale"][1] == 1.1 and bv["y"][2] == 80.0
      and bv["brightness"][1] == 1.2 and bv["n"] == 3, bv)
check("boost: dich y lon -> phong them cho khung kin (scale >= 1 + 2*y/H)", bv["scale"][2] >= 1 + 2 * 80 / 1920.0, bv["scale"])
check("boost 1 / rong -> giu nguyen", fx_flow.boost_values({"scale": [1.2]}, 1.0) == {"scale": [1.2]}
      and fx_flow.boost_values({"scale": [1.2]}, None) == {"scale": [1.2]})
check("boost co tran an toan", fx_flow.boost_values({"scale": [1.5]}, 5)["scale"][0] == 1.6)
import hook_rule as HR  # noqa: E402
_orig = HR.check, HR.muc_do, HR.hook_moment
HR.hook_moment = lambda plan, transcript_data=None: {"source_id": "source_1", "src_start": 0.0, "src_end": 2.0, "anchor": "hook"}
_goi = []


def _fake_check(spec, level=None, plan=None):
    b = max([e.get("_boost") or 1.0 for e in (plan or {}).get("fx") or []] or [1.0])
    ok = b >= 1.8
    return {"do": {"manh_nhat": 0.6 * b, "can": 1.1}, "yeu": {"visual": [] if ok else ["yeu"], "sound": []}, "thieu": []}


HR.check = _fake_check
HR.muc_do = lambda plan, story=None: ("manh", "test")
_pl = {"fx": [{"id": "h", "anchor": "hook", "kind": "transform", "code": "x"}], "audio": [{"anchor": "hook"}]}
_pl2, _sp, _rep, _notes = HR.ensure(_pl, {"ok": 1}, build=lambda p: ({"ok": 1}, {}),
                                     step=lambda *a, **k: _goi.append(a[0]) or {})
HR.check, HR.muc_do, HR.hook_moment = _orig
check("hieu ung dao dien yeu -> khuech dai x1.8, KHONG goi AI, khong chen hieu ung kho",
      _pl2["fx"][0].get("_boost") == 1.8 and not _goi and not _pl2.get("scene_effects")
      and any("khuech dai" in n for n in _notes), (_goi, _notes, _pl2))

print("\n[6] Ca luong /remotion/autoplan voi dao dien")
import server          # noqa: E402
import providers       # noqa: E402
import meme_lib        # noqa: E402
import media_vision    # noqa: E402
import remotion_plan   # noqa: E402
import text_art        # noqa: E402
import hook_rule       # noqa: E402

TMP = tempfile.mkdtemp(prefix="director-")
SRC = os.path.join(TMP, "a.mp4")
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=20",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=20", "-shortest",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", SRC], check=True)
BRIEF = {"source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 20.0}],
         "sources": [{"id": "source_1", "summary": "chia se bai hoc mat tien", "transcript": TR["source_1"],
                      "emotion_map": [{"start": 0, "end": 6, "emotion": "punch", "intensity": "high",
                                       "evidence": "giong run"}],
                      "key_moments": [{"start": 0.0, "end": 2.0, "type": "hook", "description": "con so soc"}],
                      "faces_region": "giua-tren"}]}
LAYERS = [{"id": "so", "type": "text", "source_id": "source_1", "src_start": 0.5, "src_end": 2.0, "x": 0.5, "y": 0.3,
           "spans": [{"text": "3 TỶ", "font": "anton", "size": 90}], "enter": {"preset": "pop"}, "sfx": "boom"},
          {"id": "lang", "type": "text", "source_id": "source_1", "src_start": 11.2, "src_end": 12.5, "x": 0.5, "y": 0.3,
           "spans": [{"text": "KIỂM TRA", "font": "anton", "size": 90}], "enter": {"preset": "pop"}, "sfx": "pop"}]
TRA_LOI = {
    "B1-select": {"story_arc": "so soc -> loi khuyen", "tone": "nghiem tuc", "selections": [
        {"source_id": "source_1", "start": 0.0, "end": 5.8, "beat": "hook"},
        {"source_id": "source_1", "start": 8.0, "end": 13.9, "beat": "payoff"}]},
    "B2-timeline": {"segments": [{"source_id": "source_1", "start": 0.0, "end": 5.8, "target_start": 0.0},
                                 {"source_id": "source_1", "start": 8.0, "end": 13.9, "target_start": 5.8}]},
    "DD-chi-dao": RAW,
    "B3-hook": {"hook": {"source_id": "source_1", "src_start": 0.0, "src_end": 2.0, "caption": "MẤT 3 TỶ",
                         "transition": "cut", "reason": "x"}},
    "R4-design": {"concept": "dau do", "scenes": [], "layers": LAYERS, "assets": [], "effects": [],
                  "transitions": [{"segment_index": 1, "type": "whip_left", "duration": 0.3}]},
    "R5-captions": {"captions": [], "caption_theme": {}},
    "FX-plan": {"effects": [
        {"id": "fx1", "kind": "overlay", "layer": "front", "source_id": "source_1", "src_start": 3.0, "src_end": 4.5,
         "context": "nguoi noi ke vi tin mot loi quang cao", "goal": "nhan manh su ngay tho luc tin quang cao",
         "y_nghia": "lam ro y dang noi luc do (du lieu test)", "why_fit": "dai sang cheo quet qua cau de nhan manh",
         "visual": "Một dải sáng chéo 25 độ quét ngang khung"},
        {"id": "fx2", "kind": "overlay", "layer": "front", "source_id": "source_1", "anchor": "hook", "src_start": 0.1,
         "src_end": 1.6, "context": "hook: toi mat ba ty trong mot dem", "goal": "nguoi xem soc lang truoc con so",
         "y_nghia": "lam ro y dang noi luc do (du lieu test)", "why_fit": "dau do dap xuong so 3 ty nhu bien ban",
         "visual": "con dau do tron dap xuong giua khung, muc loang"}]},
    "FX-code": {"effects": [
        {"id": "fx1", "fit_check": {"ok": True}, "code": "function render(ctx){ return h('svg', {width: ctx.W, height: ctx.H}, h('rect', {x: 0, y: 0, width: ctx.W * env(ctx.t, ctx.d), height: 40, fill: '#ffffff'})) }"},
        {"id": "fx2", "fit_check": {"ok": True}, "code": "function render(ctx){ const k = env(ctx.t, ctx.d); return h('svg', {width: ctx.W, height: ctx.H}, h('circle', {cx: 540, cy: 900, r: 300 * k + 1, fill: alpha('#c0392b', 0.8 * k)})) }"}]},
    "B6-inserts": {"inserts": []},
    "B7-audio": {"audio": [
        {"sfx_id": "kw-toi_gian-ding", "source_id": "source_1", "src_time": 4.0, "purpose": "reveal"},
        {"sfx_id": "kw-toi_gian-click", "source_id": "source_1", "src_time": 12.0, "purpose": "ui"},
        {"sfx_id": "kw-toi_gian-boom", "source_id": "source_1", "src_time": 0.15, "anchor": "hook", "purpose": "punch"}]},
    "DD-duyet": {"nhan_xet": "Dải sáng chéo là chiêu rập khuôn, bỏ.", "diem": {"dung_chu_de": 8},
                 "bo": [{"id": "fx:fx1", "ly_do": "dải sáng chéo rập khuôn, trái 'cam'"}],
                 "doi_kieu_vao": [{"id": "layer:so", "preset": "drop", "ly_do": "con dấu rơi xuống"}]},
}
NHAN, SYS, THU_TU = {}, {}, []


def fake_chat(name, messages, **k):
    lab = k.get("step_label")
    THU_TU.append(lab)
    NHAN[lab] = json.loads(next((m["content"] for m in messages if m["role"] == "user"), "{}"))
    SYS[lab] = next((m["content"] for m in messages if m["role"] == "system"), "")
    return json.dumps(TRA_LOI.get(lab, {}), ensure_ascii=False)


providers._chat = fake_chat
text_art.gen_sheet = lambda *a, **k: None
server._can_gio_loi_noi = lambda brief: brief
media_vision.face_box = lambda *a, **k: None
meme_lib.meme_catalog_for_plan = lambda *a, **k: [{"id": "wow-1", "name": "Wow", "emotion": "positive", "use_when": "x"}]
sfx_kit.ensure_kit()

with server.app.test_client() as c:
    r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "project": "du-an-A",
                                           "edit_request": {"purpose": "canh bao lua dao"}})
d = r.get_json() or {}
check("autoplan chay xong", r.status_code == 200 and d.get("ok"), d.get("error"))
seq = [x for x in THU_TU if x != "R4-design-fix"]
dd = NHAN.get("DD-chi-dao", {})
check("B3 ngay sau B2, DD-chi-dao ngay sau B3 (dao dien biet hook that), DD-duyet ngay sau B7",
      seq.index("B3-hook") == seq.index("B2-timeline") + 1 and seq.index("DD-chi-dao") == seq.index("B3-hook") + 1
      and seq.index("R4-design") == seq.index("DD-chi-dao") + 1 and seq.index("DD-duyet") == seq.index("B7-audio") + 1, seq)
check("dao dien nhan hook da chon + rang buoc (muc hook / ho so nhip) + tu vung y do",
      (dd.get("hook") or {}).get("src_start") == 0.0 and (dd.get("rang_buoc") or {}).get("ho_so_nhip_theo_cuong_do")
      and any(x.get("id") == "BUNG_NO" for x in dd.get("tu_vung_y_do") or []), {k: dd.get(k) for k in ("hook", "rang_buoc")})
check("dao dien nhan timeline (loi noi + cam xuc kem bang chung + khoanh khac) + tom tat Gemini + the gioi am thanh",
      dd.get("timeline") and dd["timeline"][0]["loi_noi"] and dd["timeline"][0]["cam_xuc"][0].get("bang_chung")
      and dd["timeline"][0].get("khoanh_khac") and dd.get("video") and len(dd.get("the_gioi_am_thanh") or []) == 5, dd)
check("du an dau tien: so tay chua co video nao", not dd.get("so_tay_gan_day") or all(
    v.get("chu_de") != "Cái giá của một lần tin quảng cáo" for v in dd.get("so_tay_gan_day")), dd.get("so_tay_gan_day"))
for lab in ("R4-design", "R5-captions", "FX-plan", "B6-inserts", "B7-audio"):
    p = NHAN.get(lab, {})
    cau = p.get("cau_chuyen") or {}
    check("%s nhan ban chi dao + luat dao dien" % lab,
          (cau.get("chi_dao") or {}).get("y_tuong_lon", "").startswith("Màn hình") and "CHI DAO CUA DAO DIEN" in SYS.get(lab, ""),
          list(cau.keys()))
b7sys = SYS.get("B7-audio", "")
check("danh muc SFX cua B7: co bo toi_gian, khong kit-* chung, khong bo the gioi khac",
      "kw-toi_gian-ding" in b7sys and '"kit-' not in b7sys and "kw-am_ap-" not in b7sys, b7sys[-600:])
plan, spec = d.get("plan") or {}, d.get("spec") or {}
check("plan co ban chi dao", (plan.get("chi_dao") or {}).get("am_thanh", {}).get("the_gioi") == "toi_gian")
check("duyet: bo fx1 (dai sang cheo), giu fx2 (hook)", [e.get("id") for e in plan.get("fx") or []] == ["fx2"],
      [e.get("id") for e in plan.get("fx") or []])
check("duyet: doi kieu vao lop 'so' -> drop", next(L for L in plan.get("layers") or [] if L["id"] == "so")["enter"]["preset"] == "drop")
check("_pipeline ghi nhan xet duyet + thu tu co DD", (plan.get("_pipeline") or {}).get("dao_dien_duyet", {}).get("thay_doi")
      and "DD-chi-dao" in plan["_pipeline"]["thu_tu"] and "DD-duyet" in plan["_pipeline"]["thu_tu"], plan.get("_pipeline"))
hook_len = max([c.get("end", 0) for c in spec.get("clips") or [] if c.get("kind") == "hook"] or [0])
win = director.silent_windows(plan, remotion_plan.map_range)
check("khoang lang quy ra gio timeline (sau hook)", win and win[0][0] > hook_len, (win, hook_len))
sfx = [a for a in spec.get("audio") or [] if a.get("role") != "bgm"]
in_quiet = [a for a in sfx if any(w0 <= a["start"] <= w1 for w0, w1 in win)]
check("khong SFX nao trong khoang lang (ca tieng B7 lan tieng chu tu gan)", not in_quiet, in_quiet)
check("tieng chu / lop / B7 deu thuoc bo toi_gian (khong con kit-*)", sfx and all(
    os.path.basename(str(a.get("path"))).startswith("kw-toi_gian-") for a in sfx),
    [(a.get("name"), os.path.basename(str(a.get("path")))) for a in sfx])
# tieng du phong cua LUAT HOOK thay tieng hook / tieng tu gan qua nho dung sat (khong bi luat gian cach bo)
import copy as _copy  # noqa: E402
_pa = _copy.deepcopy(plan)
_pa["audio"] = [{"sfx_id": "kw-toi_gian-click", "source_id": "source_1", "src_time": 0.0, "anchor": "hook", "purpose": "ui"},
                {"sfx_id": "kw-toi_gian-boom", "source_id": "source_1", "src_time": 0.02, "anchor": "hook",
                 "_hook_rule": "fallback", "purpose": "punch"}]
import engine as _eng  # noqa: E402
_pa = _eng.resolve_plan_sfx(_pa)
_sa, _ra = remotion_plan.build_spec(_pa)
_early = [os.path.basename(a["path"]) for a in _sa["audio"] if a["start"] < 0.3 and a.get("role") != "bgm"]
check("tieng du phong luat hook thay tieng hook qua nho dung sat", "kw-toi_gian-boom.wav" in _early
      and "kw-toi_gian-click.wav" not in _early, (_early, [c for c in _ra.get("fixed") or [] if "hook" in c][:3]))
# tat nhac: plan co nhac_tat -> music_stop ra gio timeline (truoc cau)
_p2 = dict(plan, chi_dao=dict(plan["chi_dao"], am_thanh=dict(plan["chi_dao"]["am_thanh"], nhac_tat={
    "source_id": "source_1", "src_start": 10.8, "src_end": 13.9, "khi": "truoc"})))
_stop = director.music_stop(_p2, remotion_plan.map_range)
_hit = remotion_plan.map_range(_p2, "source_1", 10.8, 13.9, "body")
check("music_stop = dau cau (gio timeline) - 0.15", _stop is not None and abs(_stop - (_hit[0] - 0.15)) < 1e-6, (_stop, _hit))
check("dao dien nhan bang kha nang bo dung", (NHAN.get("DD-chi-dao", {}).get("kha_nang_bo_dung") or {}).get("font"))
lv, why = hook_rule.muc_do(plan, {"chi_dao": plan["chi_dao"]})
check("muc hook theo dao dien (nhe)", lv == "nhe" and "đạo diễn" in why, (lv, why))
check("yeu cau edit van uu tien hon dao dien", hook_rule.muc_do(plan, {"chi_dao": plan["chi_dao"],
                                                                        "edit_request": {"style": "vui, bat trend"}})[0] == "manh")
mem = director._load_memory()["videos"]
check("so tay ghi du an A", any(v.get("project") == "du-an-A" and v.get("the_gioi_am_thanh") == "toi_gian" for v in mem), mem[-1:])

# du an B: dao dien thay so tay (co du an A) — dung lai cache buoc truoc thi khong goi, nen fresh
NHAN.clear()
THU_TU.clear()
with server.app.test_client() as c:
    r2 = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "project": "du-an-B"})
check("du an B chay xong", r2.status_code == 200 and (r2.get_json() or {}).get("ok"), (r2.get_json() or {}).get("error"))
so_tay = NHAN.get("DD-chi-dao", {}).get("so_tay_gan_day") or []
check("du an B: dao dien thay du an A trong so tay", any(v.get("y_tuong_lon", "").startswith("Màn hình") for v in so_tay), so_tay)

# dao dien loi -> cac buoc chay nhu truoc, khong co chi_dao, danh muc khong co bo the gioi
TRA_LOI["DD-chi-dao"] = {"nhip": []}
NHAN.clear()
THU_TU.clear()
with server.app.test_client() as c:
    r3 = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "project": "du-an-C"})
d3 = r3.get_json() or {}
check("dao dien tra rong -> van lap duoc ke hoach", r3.status_code == 200 and d3.get("ok"), d3.get("error"))
check("... khong chi_dao, khong DD-duyet, B7 khong thay bo the gioi",
      not (d3.get("plan") or {}).get("chi_dao") and "DD-duyet" not in THU_TU
      and "kw-" not in SYS.get("B7-audio", "") and "chi_dao" not in (NHAN.get("R4-design", {}).get("cau_chuyen") or {}),
      THU_TU)
check("... canh bao ro", any("Đạo diễn" in w for w in d3.get("warnings") or []), d3.get("warnings"))

print()
if FAILED:
    print("CO %d TEST FAIL: %s" % (len(FAILED), FAILED))
    sys.exit(1)
print("TAT CA PASS")
