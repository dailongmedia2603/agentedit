#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO TEXT KHI LAP KE HOACH (2026-10-04): cum chu noi bat kiem Kho Text TRUOC — mau hop thi dung nguyen mau, chi
thay chu (text_tpl.py); cum dung mau khong tao chu anh AI; build_spec thay cum bang lop 'tpl' + tieng tron san.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_text_tpl.py      (can ffmpeg; khong goi AI — AI gia lap)
Mau gia lap: template.json tu viet + font he thong (Arial Bold, co dau tieng Viet, khong co chu Han).
"""
import os
import sys
import json
import shutil
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import text_lib             # noqa: E402
import text_tpl             # noqa: E402
import text_art             # noqa: E402
import motion_design as MD  # noqa: E402
import prompt_store         # noqa: E402
import providers            # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


FONT = next((f for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Unicode.ttf")
             if os.path.isfile(f)), None)
assert not os.path.isfile(text_lib.TEXT_LIB), "chay voi HOME=$(mktemp -d) — khong dung kho that"


def node(slot, x, y, scale, start=0.0, dur=3.0, **kw):
    n = {"type": "text", "id": "n_" + slot + str(x), "slot": slot, "start": start, "duration": dur, "font": "f1",
         "size": 15, "fill": [1, 1, 1], "transform": {"x": x, "y": y, "scale": scale, "rotation": 0}}
    n.update(kw)
    return n


def make_template(tid, slots, nodes, audio=None, labels=True):
    d = os.path.join(text_lib.TEXT_DIR, tid)
    os.makedirs(os.path.join(d, "fonts"), exist_ok=True)
    shutil.copy(FONT, os.path.join(d, "fonts", "a.ttf"))
    spec = {"id": tid, "name": tid, "version": 1, "width": 1080, "height": 1920, "fps": 30, "duration": 3.0,
            "slots": [{"id": s, "role": "", "sample": t} for s, t in slots], "fonts": [{"id": "f1", "file": "fonts/a.ttf"}],
            "audio": audio or [],
            "root": {"type": "group", "id": "root", "start": 0, "duration": 3.0, "sourceStart": 0, "children": nodes}}
    with open(os.path.join(d, "template.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False)
    text_lib.register_from_dir(d)
    if labels:
        text_lib.text_update(tid, summary="mau thu %s" % tid, use_when="nhan tu khoa", energy="vua",
                             slot_roles=[{"id": s, "role": "o %s" % s, "max_len": "<= 3 tu"} for s, _ in slots])
    return text_lib.get_template(tid), spec


# ---------------------------------------------------------------------------
print("[1] thu tu doc tu hinh hoc mau (tren -> duoi, trai -> phai; drop cap doc cung tu ben phai; bac thang = 2 dong)")
boxes = {"hay": [569, 751, 703, 862], "L": [140, 610, 612, 1310], "uu": [491, 765, 869, 1072],
         "v": [454, 993, 651, 1103], "n": [662, 993, 795, 1103], "nhe": [809, 1012, 948, 1122]}
o = text_tpl.reading_order(boxes, {"hay": "hãy", "L": "L", "uu": "ưu lại", "v": "video", "n": "này", "nhe": "nhé"})
check("drop cap 'L' doc truoc 'ưu lại', sau 'hãy'", o == ["hay", "L", "uu", "v", "n", "nhe"], o)
o = text_tpl.reading_order({"a": [307, 642, 503, 759], "b": [468, 683, 689, 832], "c": [553, 746, 916, 946],
                            "d": [165, 829, 722, 1045]}, {})
check("bo cuc bac thang: 'tư duy' (cao hon) truoc 'kỹ năng' du 'kỹ năng' nam ben trai", o == ["a", "b", "c", "d"], o)
o = text_tpl.reading_order({"s1": [507, 855, 702, 921], "s2": [774, 855, 988, 921], "s3": [144, 872, 936, 1048]},
                           {"s1": "nếu bạn", "s2": "đang tìm", "s3": "không gian"})
check("chu to KHONG phai drop cap (> 2 ky tu) -> xep theo dong", o == ["s1", "s2", "s3"], o)

# ---------------------------------------------------------------------------
print("[2] mau gia lap: hinh hoc + kiem lua chon (chu dung, thu tu loi noi, o trong, qua dai, font thieu ky tu)")
rowA, specA = make_template("tA", [("s1", "bí"), ("s2", "quyết"), ("s3", "làm chữ")], [
    node("s1", -0.14, 0.1, 1.0), node("s2", 0.12, 0.1, 1.0), node("s3", 0.0, 0.0, 2.0, start=0.4, dur=2.6)])
geo = text_tpl.geometry(rowA, specA)
check("thu tu doc s1 -> s2 -> s3", geo["order"] == ["s1", "s2", "s3"], geo["order"])
check("s1 + s2 cung dong", ["s1", "s2"] in geo["lines"], geo["lines"])
check("khoi chu cua mau co (bao ca 3 o)", geo["box"] and geo["box"][0] < geo["boxes"]["s3"][0], geo["box"])
lk = {"tiers": [{"text": "thấy kết quả", "role": "phu"}, {"text": "NHANH", "role": "chinh"}],
      "dang_noi": "coi như là mình thấy kết quả nhanh liền luôn"}
e, fit = text_tpl.check_choice(rowA, specA, lk, {"s1": "thấy", "s2": "kết quả", "s3": "nhanh"})
check("dien dung chu + doi hoa/thuong -> dat", e == [], e)
check("o cung dong chia chung co chu (cung ti le)", fit.get("s1") == fit.get("s2"), fit)
e, _ = text_tpl.check_choice(rowA, specA, lk, {"s1": "thấy", "s2": "kết quả", "s3": "nhanh lắm"})
check("them chu khong co trong cum -> loai", e and "khong dung nguyen chu" in e[0], e)
e, _ = text_tpl.check_choice(rowA, specA, lk, {"s1": "thay", "s2": "ket qua", "s3": "nhanh"})
check("mat dau tieng Viet -> loai", bool(e), e)
e, _ = text_tpl.check_choice(rowA, specA, lk, {"s1": "nhanh", "s2": "thấy", "s3": "kết quả"})
check("thu tu doc khac thu tu loi noi -> loai", e and "thu tu loi noi" in e[0], e)
e, _ = text_tpl.check_choice(rowA, specA, lk, {"s1": "thấy kết quả", "s2": "", "s3": "nhanh"})
check("o trong -> loai", e and "de trong" in e[0], e)
lk2 = {"tiers": [{"text": "a", "role": "phu"}, {"text": "b", "role": "phu"},
                 {"text": "nhanh khủng khiếp luôn luôn luôn", "role": "chinh"}], "dang_noi": ""}
e, fit = text_tpl.check_choice(rowA, specA, lk2, {"s1": "a", "s2": "b", "s3": "nhanh khủng khiếp luôn luôn luôn"})
check("chu qua dai so voi o (thu < 60%) -> loai", any("qua dai" in x for x in e) and fit["s3"] < text_tpl.MIN_FIT, (e, fit))
lk3 = {"tiers": [{"text": "你好 abc", "role": "chinh"}], "dang_noi": ""}
e, _ = text_tpl.check_choice(rowA, specA, lk3, {"s1": "你", "s2": "好", "s3": "abc"})
check("font khong co ky tu (chu Han) -> loai", any("thieu ky tu" in x for x in e), e)

# ---------------------------------------------------------------------------
print("[3] lockups_from: meta=False giu dung dang cu (khoa cache TXT-art), meta=True them nguon cum")
layers = [{"type": "text", "group": "g1", "y": 0.2, "spans": [{"text": "thấy kết quả", "size": 60}], "source_id": "s",
           "src_start": 1.0, "src_end": 3.0, "why": "nhan ket qua"},
          {"type": "text", "group": "g1", "y": 0.3, "spans": [{"text": "NHANH", "size": 140}], "source_id": "s",
           "src_start": 1.2, "src_end": 3.0},
          {"type": "box", "group": "g1", "x": 0.5, "y": 0.25, "w": 0.6, "h": 0.12, "fill": "#000"},
          {"type": "text", "y": 0.5, "spans": [{"text": "Hay!", "size": 120}], "source_id": "s", "src_start": 5, "src_end": 6}]
caps = [{"role": "hero", "text": "SẸO RỖ ĐẦY LẠI", "source_id": "s", "src_start": 0.2, "src_end": 1.0, "anchor": "hook"}]
old = text_art.lockups_from(layers, caps, None)
meta = text_art.lockups_from(layers, caps, None, meta=True)
check("meta=False khong doi", [{"key": x["key"], "tiers": x["tiers"]} for x in meta] == old and "src" not in old[0], old)
check("nguon cum: lop 0+1 (cung group), caption 0",
      meta[0]["src"] == [{"kind": "layers", "idx": [0, 1]}] and meta[2]["src"] == [{"kind": "caption", "idx": 0}], meta)
ctx = text_tpl.contexts(meta, layers, caps, {"source_id": "s", "src_start": 0.0, "src_end": 1.5},
                        {"s": [{"start": 0.9, "end": 3.2, "text": "coi như là mình thấy kết quả nhanh liền luôn"}]})
check("boi canh cum: cau dang noi + gio nguon + trong hook + y do",
      "thấy kết quả nhanh" in ctx[0]["dang_noi"] and ctx[0]["luc_nguon"] == [1.0, 3.0] and ctx[0]["trong_hook"]
      and ctx[0]["y_do"] == "nhan ket qua" and ctx[2]["loai"] == "caption hook", ctx)

# ---------------------------------------------------------------------------
print("[4] buoc TXT-lib voi AI gia: luot 1 sai -> code loai -> AI sua 1 luot; mau dung toi da MAX_USES lan")
calls = []


def fake_chat(messages, **kw):
    calls.append(json.loads(messages[1]["content"]))
    k0, k1, k2 = ctx[0]["key"], ctx[1]["key"], ctx[2]["key"]
    if len(calls) == 1:
        return json.dumps({"chon": [{"key": k0, "mau": "tA", "o_chu": {"s1": "kết quả", "s2": "thấy", "s3": "nhanh"},
                                     "ly_do": "nhan ket qua"}],
                           "khong_dung": [{"key": k1, "ly_do": "chu cam than ngan"}, {"key": k2, "ly_do": "x"}]})
    return json.dumps({"chon": [{"key": k0, "mau": "tA", "o_chu": {"s1": "thấy", "s2": "kết quả", "s3": "NHANH"},
                                 "ly_do": "nhan ket qua"}]})


providers.plan_chat = fake_chat
rows = text_tpl.usable()
res = text_tpl.choose(ctx, rows, story={"story_arc": "review", "tone": "vui"})
check("luot 1: kho gui cho AI KHONG co duong dan file, co thu tu doc + so ky tu mau",
      "dir" not in json.dumps(calls[0]["kho_text"]) and calls[0]["kho_text"][0]["o_chu"][0]["thu_tu_doc"] == 1
      and calls[0]["kho_text"][0]["o_chu"][0]["so_ky_tu_mau"] == 2, calls[0]["kho_text"])
check("luot sua chi gui cum bi loai + loi", len(calls) == 2 and [c["key"] for c in calls[1]["cum_chu"]] == [ctx[0]["key"]]
      and "thu tu" in json.dumps(calls[1]["lua_chon_bi_loai"], ensure_ascii=False), calls[1:] )
it = res["items"].get(ctx[0]["key"])
check("sau luot sua: cum 0 dung mau tA", it and it["template"] == "tA" and it["texts"]["s3"] == "NHANH", res)
check("cum khong hop -> bo_qua (di chu anh AI)", {x["key"] for x in res["bo_qua"]} == {ctx[1]["key"], ctx[2]["key"]}, res)

calls.clear()


def fake_many(messages, **kw):
    calls.append(1)
    return json.dumps({"chon": [{"key": c["key"], "mau": "tA", "o_chu": {"s1": "a", "s2": "b", "s3": "c"}}
                                for c in many]})


many = [{"key": "k%d" % i, "cac_tang": [{"text": "a b c", "vai": "chinh"}], "dang_noi": "", "loai": "lop chu (R4)",
         "luc_nguon": None, "trong_hook": False, "y_do": ""} for i in range(4)]
providers.plan_chat = fake_many
res = text_tpl.choose(many, rows)
check("moi mau toi da %d lan / video" % text_tpl.MAX_USES, len(res["items"]) == text_tpl.MAX_USES, res)

# ---------------------------------------------------------------------------
print("[5] build: cum -> lop 'tpl' (bo lop chu + nen chu cua cum), caption hero -> 'tpl', tieng mau tron san")
wav = os.path.join(text_lib.TEXT_DIR, "tA", "click.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=900:d=0.3", "-ar", "48000", wav], check=True)
spec = json.load(open(os.path.join(text_lib.TEXT_DIR, "tA", "template.json"), encoding="utf-8"))
spec["audio"] = [{"file": "click.wav", "start": 0.0, "duration": 0.3, "sourceStart": 0, "volume": 3.0},
                 {"file": "click.wav", "start": 0.5, "duration": 0.3, "sourceStart": 0, "volume": 1.0, "fadeOut": 0.1},
                 {"file": "click.wav", "start": -0.1, "duration": 0.3, "sourceStart": 0, "volume": 1.0}]
json.dump(spec, open(os.path.join(text_lib.TEXT_DIR, "tA", "template.json"), "w", encoding="utf-8"), ensure_ascii=False)
rowA = text_lib.get_template("tA")
mix = text_tpl.premix(rowA, text_tpl.load_spec(rowA))
det = subprocess.run(["ffmpeg", "-i", mix, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
import re  # noqa: E402
peak = float(re.search(r"max_volume:\s*(-?[\d.]+) dB", det).group(1))
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mix],
                           capture_output=True, text=True).stdout)
check("tieng mau tron 1 file, dinh -1 dBFS, dai toi clip cuoi (0.5 + 0.3s)", abs(peak + 1) < 0.6 and 0.75 < dur < 0.9,
      (peak, dur))
check("tron lai = dung file cache", text_tpl.premix(rowA, text_tpl.load_spec(rowA)) == mix)

item = {"template": "tA", "texts": {"s1": "thấy", "s2": "kết quả", "s3": "NHANH"}, "tiers": ["thấy kết quả", "NHANH"],
        "src": [{"kind": "layers", "idx": [0, 1]}]}
out = [{"id": "a_0", "_i": 0, "type": "text", "group": "g1", "start": 2.0, "end": 4.0, "track": 30, "x": 0.5, "y": 0.2,
        "spans": [{"text": "thấy kết quả", "size": 60}]},
       {"id": "b_1", "_i": 1, "type": "text", "group": "g1", "start": 2.2, "end": 4.0, "track": 32, "x": 0.5, "y": 0.3,
        "spans": [{"text": "NHANH", "size": 140}]},
       {"id": "c_2", "_i": 2, "type": "box", "group": "g1", "start": 2.0, "end": 4.0, "track": 28, "x": 0.5, "y": 0.25,
        "w": 0.6, "h": 0.12},
       {"id": "d_3", "_i": 3, "type": "text", "start": 5.0, "end": 6.0, "track": 30, "x": 0.5, "y": 0.5,
        "spans": [{"text": "Hay!", "size": 120}]}]
changes = []
res_layers = MD.text_lib_layers({"text_lib": {"items": {"kA": item}}}, out, 30.0, changes)
tl = [L for L in res_layers if L["type"] == "tpl"]
check("cum -> 1 lop tpl, bo 2 lop chu + nen chu, giu lop khac",
      len(tl) == 1 and [L["id"] for L in res_layers if L["type"] != "tpl"] == ["d_3"], [L["id"] for L in res_layers])
L = tl[0] if tl else {}
check("lop tpl: vao luc lop dau cua cum, dai = do dai mau, tam = tam cum, chu that, co tieng",
      L.get("start") == 2.0 and L.get("end") == 5.0 and abs(L.get("x", 0) - 0.5) < 0.01 and 0.15 < L.get("y", 0) < 0.4
      and L.get("texts", {}).get("s2") == "kết quả" and L.get("_tpl_audio") == mix and L.get("tpl", {}).get("id") == "tA", L)
bx = MD._guard_box(L)
check("protect_face thay khoi mau (w / h)", bx and abs((bx[2] - bx[0]) - L["w"]) < 1e-6, bx)
w0, s0 = L["w"], L["scale"]
MD._scale_layer(L, 0.5)
check("thu nho lop tpl: w + scale cung ti le", abs(L["w"] - w0 * 0.5) < 1e-3 and abs(L["scale"] - s0 * 0.5) < 1e-3, L)
check("phu de ne khoi mau (dai doc)", MD._layer_band(L) is not None)
sfx = MD.layer_sfx(res_layers, [])
check("tieng mau = 1 muc SFX chu (khong bi bo vi gian cach), khong con khoa tam tren lop",
      len(sfx) == 1 and sfx[0]["file"] == mix and sfx[0]["_tpl"] and sfx[0]["_text"] and "_tpl_audio" not in L, sfx)
bad = dict(item, tiers=["thấy kết quả", "CHẬM"])
out2 = [dict(x) for x in out]
r2 = MD.text_lib_layers({"text_lib": {"items": {"kB": bad}}}, out2, 30.0, [])
check("cum da doi chu so voi luc chon -> giu chu code", not [x for x in r2 if x["type"] == "tpl"], r2)

p = {"text_lib": {"items": {"kC": {"template": "tA", "texts": {"s1": "Sẹo", "s2": "rỗ", "s3": "ĐẦY LẠI"},
                                   "tiers": ["SẸO RỖ ĐẦY LẠI"], "src": [{"kind": "hook"}]}}},
     "captions": [{"role": "hero", "text": "SẸO RỖ ĐẦY LẠI", "start": 0.2, "end": 1.4, "position": "upper"},
                  {"role": "support", "text": "sẹo rỗ", "start": 0.2, "end": 1.0}]}
lay = []
MD.text_lib_captions(p, lay, 30.0, [])
check("caption hook -> lop tpl o vi tri caption, bo caption hero, giu phu de",
      len(lay) == 1 and lay[0]["start"] == 0.2 and lay[0]["y"] < 0.5 and [c["role"] for c in p["captions"]] == ["support"],
      (lay, p["captions"]))

T = dict(L, start=10.0, end=12.5, x=0.5, y=0.3, w=0.6, h=0.15, scale=1.0)
dup = {"id": "dup", "type": "text", "group": "gx", "start": 10.0, "end": 12.0, "x": 0.5, "y": 0.3,
       "spans": [{"text": "thấy kết quả", "size": 60}]}
oth = {"id": "oth", "type": "text", "group": "gy", "start": 10.1, "end": 12.0, "x": 0.5, "y": 0.32,
       "spans": [{"text": "chỗ khác", "size": 60}]}
late = {"id": "late", "type": "text", "start": 11.5, "end": 13.0, "x": 0.5, "y": 0.3, "spans": [{"text": "sau nay", "size": 60}]}
sp = {"layers": [T, dup, oth]}
MD.separate_tpl_overlaps(sp, [])
ids = [x["id"] for x in sp["layers"]]
check("cum TRUNG chu voi mau hien cung luc -> bo; cum khac chu -> dich ra ngoai khoi mau",
      "dup" not in ids and "oth" in ids and abs(oth["y"] - 0.32) > 0.05, (ids, oth["y"]))
far = {"id": "far", "type": "text", "group": "gz", "start": 10.2, "end": 11.0, "x": 0.5, "y": 0.75,
       "spans": [{"text": "kết quả", "size": 60}]}
sp = {"layers": [dict(T), far]}
MD.separate_tpl_overlaps(sp, [])
check("cum TRUNG chu hien cung luc o CHO KHAC tren khung -> van bo (cung cau hien 2 lan)",
      [x["id"] for x in sp["layers"]] == [T["id"]], [x["id"] for x in sp["layers"]])
T2 = dict(T)
sp = {"layers": [T2, late]}
MD.separate_tpl_overlaps(sp, [])
check("cum vao sau >= 0.3s -> mau tat luc cum do vao", abs(T2["end"] - 11.55) < 1e-6, T2["end"])

# ---------------------------------------------------------------------------
print("[6] prompt TXT-lib sua duoc trong menu nhung KHONG doi van tay chung (cache B1..R5 du an cu giu nguyen)")
fp0, own0 = prompt_store.fingerprint(), text_tpl.prompt_fp()
prompt_store.save("prompt", "_TEXT_LIB_SYSTEM", text_tpl._TEXT_LIB_SYSTEM + "\n- them luat")
check("own_key: van tay chung khong doi", prompt_store.fingerprint() == fp0)
check("khoa rieng cua buoc TXT-lib doi theo prompt", text_tpl.prompt_fp() != own0)
prompt_store.reset("prompt", "_TEXT_LIB_SYSTEM")

# ---------------------------------------------------------------------------
print("[7] mau TU THIET KE (text-designs/): hinh bam chu, thu tu doc khai bao, o chi nhan so + room, chu in hoa")
big = node("s1", -0.5, 0.05, 3.0)
small = [node("s2", 0.0, 0.1, 1.0), node("s3", 0.0, 0.0, 1.0, textCase="upper"), node("s4", 0.0, -0.1, 1.0)]
box_shape = {"type": "shape", "id": "hop", "kind": "rect", "start": 0.0, "duration": 3.0, "fill": [1, 1, 1],
             "box": {"l": {"slot": "s4", "edge": "l", "off": -30}, "r": {"slot": "s4", "edge": "r", "off": 30},
                     "t": {"slot": "s4", "edge": "t", "off": -10}, "b": {"slot": "s4", "edge": "b", "off": 10}}}
rowD, specD = make_template("tD", [("s1", "3"), ("s2", "bước"), ("s3", "TẮM"), ("s4", "an toàn")], [big] + small + [box_shape])
specD["slots"][0].update(accept="number", room=1.7)
specD["readingOrder"] = ["s1", "s2", "s3", "s4"]
with open(os.path.join(rowD["dir"], "template.json"), "w", encoding="utf-8") as f:
    json.dump(specD, f, ensure_ascii=False)
specD = text_tpl.load_spec(rowD)
geo = text_tpl.geometry(rowD, specD)
check("node hinh khong lam vo hinh hoc (chi o chu vao boxes)", sorted(geo["boxes"]) == ["s1", "s2", "s3", "s4"], geo["boxes"])
check("thu tu doc KHAI BAO duoc dung (so to canh 2 dong doc truoc dong tren)", geo["order"] == ["s1", "s2", "s3", "s4"], geo["order"])
check("khoi chu gom ca HOP (rong hon chu 30px moi ben)", geo["box"][2] >= geo["boxes"]["s4"][2] + 30 - 1, (geo["box"], geo["boxes"]["s4"]))
lkD = {"tiers": [{"text": "5 bước", "role": "a"}, {"text": "tắm", "role": "b"}, {"text": "an toàn", "role": "c"}], "dang_noi": ""}
e, fit = text_tpl.check_choice(rowD, specD, lkD, {"s1": "5", "s2": "bước", "s3": "tắm", "s4": "an toàn"})
check("o so nhan con so -> dat", e == [], e)
lkN = dict(lkD, tiers=[{"text": "năm bước", "role": "a"}] + lkD["tiers"][1:])
e, _ = text_tpl.check_choice(rowD, specD, lkN, {"s1": "năm", "s2": "bước", "s3": "tắm", "s4": "an toàn"})
check("o so nhan chu -> loai", any("CON SO" in x for x in e), e)
lk10 = dict(lkD, tiers=[{"text": "10 bước", "role": "a"}] + lkD["tiers"][1:])
e, fit = text_tpl.check_choice(rowD, specD, lk10, {"s1": "10", "s2": "bước", "s3": "tắm", "s4": "an toàn"})
check("room 1.7: so '10' thay '3' khong bi co qua 60%", e == [] and fit["s1"] >= 0.85, (e, fit))
w_up = text_tpl.text_size(specD, rowD["dir"], small[1], "tắm")[0]
w_raw = text_tpl.text_size(specD, rowD["dir"], small[0], "TẮM")[0]
check("o textCase upper do chu IN HOA (chu thuong dien vao van do nhu in hoa)", abs(w_up - w_raw) < 0.5, (w_up, w_raw))
ink_short = text_tpl.ink_box(rowD, specD, {"s4": "an"})
check("hop bam chu that: chu ngan hon -> hop (va khoi chu) hep lai", ink_short[2] < geo["box"][2] - 20, (ink_short, geo["box"]))

print("\n%s" % ("TAT CA DAT" if not FAILED else "THAT BAI: %s" % ", ".join(FAILED)))
sys.exit(1 if FAILED else 0)
