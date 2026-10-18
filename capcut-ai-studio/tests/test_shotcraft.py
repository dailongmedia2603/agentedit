#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO SHOT & MOTION (video-shotcraft, 2026-10-18) — sidecar/shot_lib.py + danh muc + registry.

- Danh muc references/shotcraft_catalog.json: DU 150 mau cua styles.json, moi mau du truong, id khop registry.ts.
- prompt_block: R4 thay TOAN BO kho (moi id co mat), luat dung (rules_text) noi vao prompt R4.
- audit: id sai / thieu o chu / chu qua dai / thieu anh / dung 2 lan / vuot tran -> loi cho vong tu sua R4.
- spec_shot: chu dat -> canh graphic + toc do phat; chu qua dai / thieu anh / thuong hieu khong co trong loi noi -> bo.
- enforce_spacing / drop_layers / clear_spec / sfx / theme.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_shotcraft.py      (khong goi AI)
"""
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import shot_lib     # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


print("[1] danh muc + registry")
cat = shot_lib.load()
styles = json.load(open(os.path.join(ROOT, "remotion-src", "shotcraft", "styles.json"), encoding="utf-8"))["styles"]
ids = [m["id"] for m in cat]
check("du %d mau cua kho goc" % len(styles), sorted(ids) == sorted(s["id"] for s in styles),
      sorted(set(s["id"] for s in styles) - set(ids)))
check("id khong trung", len(ids) == len(set(ids)))
reg = open(os.path.join(ROOT, "remotion-src", "shotcraft", "registry.ts"), encoding="utf-8").read()
reg_ids = re.findall(r'^\s+"([^"]+)": \{ C:', reg, re.M)
check("registry.ts khop danh muc", sorted(reg_ids) == sorted(ids), sorted(set(ids) ^ set(reg_ids)))
bad = [m["id"] for m in cat if not (m.get("vi") or {}).get("mo_ta") or not (m.get("vi") or {}).get("hop_khi")
       or not (m.get("vi") or {}).get("mo_rong")
       or m.get("duration", 0) <= 0 or m.get("portrait", {}).get("mode") not in ("native", "band")]
check("moi mau du mo ta / do dai / bo cuc doc", not bad, bad)
viet = [m["id"] for m in cat if not re.search(r"[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]", (m.get("vi") or {}).get("mo_ta", "").lower())]
check("mo ta tieng Viet co dau", not viet, viet)
block = shot_lib.prompt_block()
miss = [m["id"] for m in cat if not m.get("hidden") and ("- %s [" % m["id"]) not in block]
check("mau an khong vao danh muc R4", all(("- %s [" % m["id"]) not in block for m in cat if m.get("hidden")))
check("prompt_block co MOI mau", not miss, miss)
check("luat dung noi vao R4", "KHO SHOT" in shot_lib.rules_text() and "FULL-SCREEN" in shot_lib.rules_text())
check("fingerprint on dinh", shot_lib.fingerprint() == shot_lib.fingerprint())
check("khong con 'tranh khi' (user 2026-10-18)", not [m["id"] for m in cat if "tranh_khi" in (m.get("vi") or {})]
      and "tranh:" not in block)
check("moi mau co video xem truoc", not [m["id"] for m in cat if not shot_lib.preview_path(m["id"])],
      [m["id"] for m in cat if not shot_lib.preview_path(m["id"])])
fp0 = shot_lib.fingerprint()
first = next(m["id"] for m in cat if not m.get("hidden"))
shot_lib.set_disabled(first, True)
check("tat mau -> khong vao danh muc R4 / by_id, khoa cache doi",
      ("- %s [" % first) not in shot_lib.prompt_block() and first not in shot_lib.by_id() and shot_lib.fingerprint() != fp0)
shot_lib.set_disabled(first, False)
check("bat lai -> nhu cu", ("- %s [" % first) in shot_lib.prompt_block() and shot_lib.fingerprint() == fp0)
lv = shot_lib.list_view()["shots"]
check("list_view du mau + preview", len(lv) == len(cat) and all(x["preview"] for x in lv))
lb = shot_lib.clean_label({"ten": " A ", "mo_ta": "x", "hop_khi": "y", "mo_rong": "z", "nang_luong": "??", "chu_de": ["a", "a", "b"],
                           "chat_luong": 9, "tranh_khi": "bo"})
check("clean_label: bo tranh_khi, chuan hoa", "tranh_khi" not in lb and lb["nang_luong"] == "vua" and lb["chu_de"] == ["a", "b"]
      and lb["chat_luong"] == 5 and lb["ten"] == "A")
print("     (danh muc R4: %d ky tu ~ %d token)" % (len(block), len(block) // 3))

# mau thu: mau chu (khong anh) va mau co o anh bat buoc
txt = next((m for m in cat if m.get("kind") == "insert" and not m.get("images") and m.get("brand") != "required"
            and any(not s.get("optional") and not s.get("list") and s.get("role") != "number" for s in m.get("slots") or [])), None)
img = next((m for m in cat if m.get("kind") == "insert" and any(not i.get("optional") for i in m.get("images") or [])
            and m.get("brand") != "required"), None)
check("co mau chu + mau co anh de thu", txt is not None and img is not None)


def fill(m, long=False):
    out = {}
    for s in m.get("slots") or []:
        if s.get("optional"):
            continue
        n = int(s.get("max") or 20)
        base = "1234" if s.get("role") == "number" else "Chữ thử"
        v = (base * 40)[: int(n * 1.6)] if long else base[:n]
        if s.get("list"):
            out[s["id"]] = [v] * int(s["list"].get("min") or 1)
        else:
            out[s["id"]] = v
    return out


print("[2] audit (vong tu sua R4)")
D = 60.0
need_s = shot_lib.dur_range(txt)[0]
design = {"assets": [{"id": "a1", "kind": "ai_image"}], "scenes": [
    {"layout": "graphic", "source_id": "s", "src_start": 5, "src_end": 5 + need_s + 0.5, "shot": {"id": txt["id"], "texts": fill(txt)}},
    {"layout": "graphic", "source_id": "s", "src_start": 20, "src_end": 24, "shot": {"id": "khong-co-mau-nay"}},
    {"layout": "graphic", "source_id": "s", "src_start": 30, "src_end": 30 + need_s + 0.5, "shot": {"id": txt["id"], "texts": fill(txt, long=True)}},
]}
iss = shot_lib.audit(design, D)
check("mau hop le khong bi bao", not any("scene0" in x for x in iss), iss)
check("id khong co -> loi", any("scene1" in x and "khong co" in x for x in iss), iss)
check("chu qua dai -> loi", any("scene2" in x and "qua dai" in x for x in iss), iss)
check("dung 2 lan -> loi", any("dung 2 lan" in x for x in iss), iss)
iss2 = shot_lib.audit({"assets": [], "scenes": [{"layout": "graphic", "src_start": 1, "src_end": 4,
                                                  "shot": {"id": img["id"], "texts": fill(img), "images": {}}}]}, D)
check("thieu anh bat buoc -> loi", any("thieu o anh" in x for x in iss2), iss2)

print("[3] spec_shot (kiem bang code luc dung spec)")
tmp = tempfile.mkdtemp()
png = os.path.join(tmp, "a.png")
open(png, "wb").write(b"\x89PNG\r\n\x1a\n" + b"0" * 2000)
assets = {"a1": {"id": "a1", "kind": "ai_image", "path": png}}
p = {"asr_words": [["Chúng", 0, 0.3], ["tôi", 0.3, 0.5], ["dùng", 0.5, 0.8], ["Agent", 0.8, 1.0], ["Edit", 1.0, 1.3]],
     "source_videos": []}


def scene(st, en):
    return {"id": "scene0", "start": st, "end": en, "layout": "graphic", "morph": 0.25, "bg": {"kind": "gradient"}}


ch = []
sc = scene(10.0, 10.0 + need_s + 0.4)
ok = shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt)}}, sc, p, assets, ch, {})
check("mau chu hop le -> canh shot", ok and sc.get("shot", {}).get("id") == txt["id"], ch)
check("canh graphic, cat thang, bo nen", ok and sc["layout"] == "graphic" and sc["morph"] == 0 and "bg" not in sc)
lo, hi = shot_lib._rate(txt)
check("toc do phat trong khoang mau cho phep", ok and lo - 1e-6 <= sc["shot"]["rate"] <= hi + 1e-6, sc.get("shot"))
check("an phu de khi mau co chu", ok and sc["shot"]["hideSubs"] is True)
ch = []
sc = scene(10.0, 10.0 + need_s + 0.4)
check("chu qua dai -> bo", not shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt, long=True)}}, sc, p, assets, ch, {}), ch)
ch = []
uses = {txt["id"]: 1}
check("mau da dung -> bo", not shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt)}}, scene(10, 10 + need_s + 0.4), p, assets, ch, uses))
ch = []
sc = scene(10.0, 10.0 + 0.3)
sc["_room"] = 0.3
check("canh qua ngan, khong con cho -> bo", not shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt)}}, sc, p, assets, ch, {}), ch)
ch = []
sc = scene(10.0, 10.0 + 0.3)
sc["_room"] = 30.0
ok = shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt)}}, sc, p, assets, ch, {})
check("canh qua ngan, con cho -> keo dai du hien", ok and sc["end"] - sc["start"] >= need_s - 0.11, (sc, ch))
ch = []
sc = scene(10.0, 40.0)
ok = shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt)}}, sc, p, assets, ch, {})
check("canh dai hon chuyen dong -> cat bot", ok and sc["end"] < 40.0, sc)
img_need = shot_lib.dur_range(img)[0]
images_ok = {i["id"]: "a1" for i in img.get("images") or [] if not i.get("optional") and i.get("role") != "video"}
if all(i.get("role") != "video" for i in img.get("images") or [] if not i.get("optional")):
    ch = []
    sc = scene(10.0, 10.0 + img_need + 0.4)
    ok = shot_lib.spec_shot({"shot": {"id": img["id"], "texts": fill(img), "images": images_ok}}, sc, p, assets, ch, {})
    check("mau co anh: anh giai ra duong dan", ok and set(sc["shot"]["images"].values()) == {png}, (ch, sc.get("shot")))
ch = []
check("thieu anh bat buoc -> bo", not shot_lib.spec_shot({"shot": {"id": img["id"], "texts": fill(img), "images": {}}},
                                                        scene(10, 10 + img_need + 0.4), p, assets, ch, {}), ch)
ch = []
sc = scene(10.0, 10.0 + need_s + 0.4)
shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt), "brand_name": "Agent Edit"}}, sc, p, assets, ch, {})
check("ten thuong hieu CO trong loi noi -> giu", (sc.get("shot") or {}).get("brand") == {"name": "Agent Edit"}, sc.get("shot"))
ch = []
sc = scene(10.0, 10.0 + need_s + 0.4)
shot_lib.spec_shot({"shot": {"id": txt["id"], "texts": fill(txt), "brand_name": "Coca Cola"}}, sc, p, assets, ch, {})
check("ten thuong hieu KHONG co trong loi noi -> bo ten", (sc.get("shot") or {}).get("brand") is None and any("khong co trong loi noi" in c for c in ch), ch)
req = next((m for m in cat if m.get("brand") == "required"), None)
if req:
    ch = []
    check("mau can thuong hieu ma khong co -> bo", not shot_lib.spec_shot({"shot": {"id": req["id"], "texts": fill(req)}},
                                                                         scene(10, 10 + shot_lib.dur_range(req)[1] - 1), p, assets, ch, {}), ch)

print("[4] lieu luong / lop / hieu ung / tieng / mau")


def ins(i, st, en):
    return {"id": "scene%d" % i, "start": st, "end": en, "layout": "graphic", "shot": {"id": "x%d" % i, "kind": "insert"}}


ch = []
kept = shot_lib.enforce_spacing([ins(0, 2, 5), ins(1, 6, 9), ins(2, 20, 24), {"id": "scene9", "start": 30, "end": 32, "layout": "split"}], 100, ch)
check("canh shot sat nhau (< %.1fs) -> bo canh sau" % shot_lib.MIN_GAP, [s["id"] for s in kept] == ["scene0", "scene2", "scene9"], [s["id"] for s in kept])
ch = []
kept = shot_lib.enforce_spacing([ins(0, 0, 10), ins(1, 20, 30), ins(2, 40, 50)], 60, ch)
check("vuot tran %d%% -> bo" % int(shot_lib.MAX_SHARE * 100), len(kept) == 1, [s["id"] for s in kept])
ch = []
layers = [{"id": "l1", "start": 2.5, "end": 4.0}, {"id": "l2", "start": 0.5, "end": 3.0}, {"id": "l3", "start": 1.9, "end": 2.1},
          {"id": "l4", "start": 6.0, "end": 7.0}]
out = shot_lib.drop_layers([ins(0, 2, 5)], layers, ch)
check("lop trong canh shot bo, lop chay vao bi cat duoi, lop ngoai giu",
      [L["id"] for L in out] == ["l2", "l4"] and out[0]["end"] == 2, out)
spec = {"scenes": [ins(0, 2, 5), ins(1, 20, 24)], "layers": [{"id": "h", "start": 3, "end": 4}, {"id": "k", "start": 10, "end": 11}],
        "fx": [{"id": "f", "start": 2.2, "end": 4.5}], "overlays": [{"id": "m", "start": 21, "end": 23}]}
ch = []
shot_lib.clear_spec(spec, ch)
check("clear_spec: bo lop + hieu ung de len canh shot", [L["id"] for L in spec["layers"]] == ["k"] and not spec["fx"], spec)
check("clear_spec: canh shot trung meme -> bo canh", [s["id"] for s in spec["scenes"]] == ["scene0"], spec["scenes"])
real = {"id": "scene0", "start": 10.0, "end": 14.0, "shot": {"id": next(m["id"] for m in cat if m.get("sfx")), "rate": 1.0}}
try:
    au = shot_lib.sfx([real], [])
    check("sfx: tieng theo nhip mau, trong canh", au and all(10.0 <= a["start"] < 14.0 and a.get("_shot") for a in au), au)
except Exception as ex:      # may khong co engine SFX (test HOME tam) -> bo qua phan nay
    print("     (bo qua sfx: %s)" % str(ex)[:80])
check("theme: mau nhan tu style", shot_lib.theme({"style_kit": {"palette": {"accent": "#22D3EE", "highlight": "#FACC15"}}})
      == {"accent": "#22D3EE", "accent2": "#FACC15"})
check("theme: khong co mau -> None", shot_lib.theme({}) is None)

print()
if FAILED:
    print("FAIL %d: %s" % (len(FAILED), ", ".join(FAILED)))
    sys.exit(1)
print("OK — kho shot")
