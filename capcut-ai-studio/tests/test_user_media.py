#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test TU LIEU CUA NGUOI DUNG (sidecar/user_media.py) — anh / video nguoi dung dua vao de HIEN THI LEN video.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_user_media.py      (can flask + ffmpeg + PIL, macOS co sips)

Yeu cau user 2026-09-28: upload anh / video muon chen, dat MUC DICH su dung, Gemini doc hieu tu lieu, roi khi lap
ke hoach AI thay DU thong tin de chen dung luc noi toi, vi tri + do lon phu hop; anh AI co the lay anh san pham
that lam mau. Test kiem tung lien ket: UI -> sidecar -> Gemini -> R4 (payload + prompt + khoa cache) -> kiem +
du phong -> tai nguyen (anh mau gui Codex) -> FX / B6 biet tu lieu dang hien -> build_spec (co, vi tri, video) ->
bao cao cho UI. Gia lap AI o tang providers._chat / providers.gemini_files / asset_gen._run_codex.
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
import motion_design   # noqa: E402
import prompt_store    # noqa: E402
import asset_gen       # noqa: E402
import cli_providers   # noqa: E402
import text_art        # noqa: E402
import user_media      # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


TMP = tempfile.mkdtemp(prefix="user-media-")
FF = remotion_plan._ffbin("ffmpeg")


def P(name):
    return os.path.join(TMP, name)


# ---------------------------------------------------------------------------
# Tu lieu gia
# ---------------------------------------------------------------------------
im = Image.new("RGB", (800, 1000), (245, 245, 245))
ImageDraw.Draw(im).ellipse((200, 250, 600, 850), fill=(200, 40, 40))
im.save(P("product.png"))                                        # san pham tren nen tron
lg = Image.new("RGBA", (600, 300), (0, 0, 0, 0))
ImageDraw.Draw(lg).rectangle((50, 50, 550, 250), fill=(20, 90, 200, 255))
lg.save(P("logo.png"))                                           # logo nen TRONG SUOT
Image.new("RGBA", (400, 400), (10, 200, 10, 255)).save(P("opaque_rgba.png"))   # RGBA nhung dac het
Image.new("RGB", (1080, 1920), (250, 250, 240)).save(P("menu.jpg"))            # menu DOC, co chu can doc
Image.new("RGB", (3000, 2000), (90, 120, 150)).save(P("big.jpg"))
rot = Image.new("RGB", (400, 200), (0, 0, 0))
ex = rot.getexif()
ex[0x0112] = 6                                                   # EXIF: xoay 90 do -> hien la 200x400
rot.save(P("rotated.jpg"), exif=ex)
subprocess.run(["/usr/bin/sips", "-s", "format", "heic", P("product.png"), "--out", P("photo.heic")],
               capture_output=True)
subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                "testsrc=size=720x1280:rate=30:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", P("demo.mp4")],
               check=True)
SRC = P("a.mp4")
subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                "testsrc=size=360x640:rate=30:duration=20", "-f", "lavfi", "-i", "sine=frequency=440:duration=20",
                "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", SRC], check=True)

# ---------------------------------------------------------------------------
print("\n[1] Chuan hoa dau vao tu UI")
open(P("notes.txt"), "w").write("x")
items, missing = user_media.normalize([
    {"id": "media_1", "path": P("product.png"), "name": "product.png", "use": "both", "placement": "cutout", "note": "  ly   tra sua  "},
    {"id": "media_1", "path": P("logo.png"), "use": "xxx", "placement": "yyy"},                 # id trung, gia tri la
    {"id": "v!d", "path": P("demo.mp4"), "use": "ai_ref", "placement": "cutout"},              # video: chi 'show'
    {"id": "mat", "path": P("khong-co.png"), "name": "mat.png"},
    {"path": P("notes.txt")},
])
check("bo file mat + bao ten", missing == ["mat.png"], missing)
check("giu 3 tu lieu hop le (bo file khong phai anh / video)", [i["kind"] for i in items] == ["image", "image", "video"], items)
check("id trung duoc doi", len({i["id"] for i in items}) == 3, [i["id"] for i in items])
check("gia tri la -> mac dinh (show / auto)", items[1]["use"] == "show" and items[1]["placement"] == "auto", items[1])
check("video: luon 'show', khong 'cutout'", items[2]["use"] == "show" and items[2]["placement"] == "auto", items[2])
check("id loc ky tu la", items[2]["id"] == "vd", items[2]["id"])
check("ghi chu gon khoang trang", items[0]["note"] == "ly tra sua", items[0]["note"])

# ---------------------------------------------------------------------------
print("\n[2] Ban lam viec + so do cua may")
check("PNG chuan: dung nguyen file", user_media.working_image(P("product.png")) == P("product.png"))
wh = user_media.working_image(P("photo.heic")) if os.path.isfile(P("photo.heic")) else None
if wh:
    check("HEIC -> PNG/JPG trinh duyet doc duoc", wh != P("photo.heic") and os.path.splitext(wh)[1] in (".png", ".jpg"), wh)
    with Image.open(wh) as x:
        check("HEIC doi xong dung kich thuoc", x.size == (800, 1000), x.size)
else:
    print("  (may khong tao duoc HEIC bang sips — bo qua)")
wr = user_media.working_image(P("rotated.jpg"))
with Image.open(wr) as x:
    check("EXIF xoay -> anh lam viec DUNG chieu (200x400)", x.size == (200, 400), x.size)
wb = user_media.working_image(P("big.jpg"))
with Image.open(wb) as x:
    check("anh lon -> canh dai <= 2400", max(x.size) <= 2400 and wb != P("big.jpg"), x.size)
m_prod = user_media.measure({"kind": "image", "path": P("product.png")})
check("so do anh: kich thuoc + cao_khi_rong_1", m_prod["width"] == 800 and m_prod["height"] == 1000
      and abs(m_prod["cao_khi_rong_1"] - 1080 / 1920 * 1000 / 800) < 1e-3, m_prod)
check("anh RGB -> khong trong suot", m_prod["alpha"] is False)
check("logo PNG nen trong suot -> alpha", user_media.measure({"kind": "image", "path": P("logo.png")})["alpha"] is True)
check("RGBA dac het -> KHONG tinh la trong suot", user_media.measure({"kind": "image", "path": P("opaque_rgba.png")})["alpha"] is False)
m_vid = user_media.measure({"kind": "video", "path": P("demo.mp4")})
check("so do video: do dai + kich thuoc", abs((m_vid["duration"] or 0) - 6.0) < 0.2 and m_vid["width"] == 720, m_vid)

# ---------------------------------------------------------------------------
print("\n[3] Gemini doc hieu tu lieu (+ luu theo noi dung file, route)")
GEM = []


def fake_gemini(items_, prompt, step_label, log=None):
    lab = items_[0]["label"]
    GEM.append({"label": lab, "path": items_[0]["path"], "prompt": prompt, "step": step_label})
    if "product" in lab or "photo" in lab:
        return {"loai": "san_pham", "mo_ta": "Ly tra sua tran chau tren nen trang", "chu_the": "ly tra sua tran chau",
                "dac_diem_nhan_dien": "ly nhua trong, tran chau den, nap vom", "tu_khoa": ["tra sua", "ly tra sua", "tran chau"],
                "nen": "tron_mot_mau", "tach_nen_duoc": True, "can_doc_chu": False, "mau_chu_dao": ["#C82828", "xx"],
                "goi_y_hien_thi": {"cach": "cutout", "ly_do": "nen tron"}, "canh": [{"start": 0, "end": 1}], "_source": "fake"}
    if "logo" in lab:
        return {"loai": "logo", "mo_ta": "Logo quan", "chu_the": "logo quan Mê Trà", "tu_khoa": ["quan", "ghe quan"],
                "nen": "trong_suot", "_source": "fake"}
    if "menu" in lab:
        return {"loai": "bang_gia_menu", "mo_ta": "Menu gia", "chu_the": "menu", "can_doc_chu": True,
                "tu_khoa": ["menu", "bang gia"], "_source": "fake"}
    return {"loai": "video_demo", "mo_ta": "Canh pha che tra sua", "chu_the": "pha che", "tu_khoa": ["pha che"],
            "doan_dep": [{"start": 1.0, "end": 4.0, "ly_do": "dep"}, {"start": 5, "end": 99}], "co_loi_noi": False,
            "_source": "fake"}


providers.gemini_files = fake_gemini
it_prod = {"id": "media_1", "kind": "image", "path": P("product.png"), "name": "product.png"}
r1 = user_media.analyze_one(it_prod)
check("Gemini nhan DUNG file + nhan", GEM and GEM[-1]["path"] == P("product.png") and "product.png" in GEM[-1]["label"], GEM[-1:])
check("prompt Gemini kem so do cua may", '"cao_khi_rong_1"' in GEM[-1]["prompt"] and "DU LIEU DO" in GEM[-1]["prompt"])
check("ket qua da loc: mau sai bo, truong video bo voi anh", r1["analysis"].get("mau_chu_dao") == ["#C82828"]
      and "canh" not in r1["analysis"], r1["analysis"])
n0 = len(GEM)
r2 = user_media.analyze_one(it_prod)
check("lan 2 cung file: dung ban luu, KHONG goi Gemini", r2["cached"] and len(GEM) == n0, (r2.get("cached"), len(GEM)))
shutil.copy2(P("product.png"), P("product-copy.png"))
r3 = user_media.analyze_one(dict(it_prod, path=P("product-copy.png"), name="product-copy.png"))
check("cung NOI DUNG khac ten: van dung ban luu", r3["cached"] and len(GEM) == n0)
user_media.analyze_one(it_prod, fresh=True)
check("fresh: goi lai Gemini", len(GEM) == n0 + 1)
rv = user_media.analyze_one({"id": "v", "kind": "video", "path": P("demo.mp4"), "name": "demo.mp4"})
check("video: doan_dep kep trong do dai video", all(d["end"] <= 6.0 for d in rv["analysis"]["doan_dep"])
      and len(rv["analysis"]["doan_dep"]) == 2, rv["analysis"].get("doan_dep"))
with server.app.test_client() as c:
    rr = c.post("/remotion/understand_media", json={"items": [
        {"id": "a", "kind": "image", "path": P("logo.png"), "name": "logo.png"},
        {"id": "b", "kind": "image", "path": P("khong-co.png"), "name": "mat.png"}]})
    dd = rr.get_json() or {}
check("route /remotion/understand_media: ket qua theo id + bao file mat",
      rr.status_code == 200 and dd.get("ok") and (dd["results"]["a"].get("analysis") or {}).get("loai") == "logo"
      and dd.get("missing") == ["mat.png"], dd)
check("route tra ban lam viec (UI hien anh thu nho)", dd["results"]["a"].get("work") == P("logo.png"), dd["results"]["a"])

# ---------------------------------------------------------------------------
print("\n[4] Lap ke hoach: thong tin tu lieu toi DUNG buoc AI")
TRANSCRIPT = [
    {"start": 0.0, "end": 2.5, "text": "Hom nay minh review mot mon moi"},
    {"start": 3.0, "end": 6.0, "text": "ly tra sua tran chau nay gia chi ba muoi nghin"},
    {"start": 7.0, "end": 10.0, "text": "minh quay canh pha che cho cac ban xem"},
    {"start": 11.0, "end": 14.0, "text": "nho ghe ung ho minh nhe"},
]
BRIEF = {"source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 20.0}],
         "sources": [{"id": "source_1", "summary": "review tra sua", "transcript": TRANSCRIPT,
                      "emotion_map": [], "key_moments": [], "faces_region": "giua-tren"}]}
AI_PROMPT = ("A clear plastic cup of bubble milk tea with black tapioca pearls and a dome lid, held on a cafe counter in "
             "Vietnam, eye-level medium close-up, soft warm window light, photoreal cinematic, warm palette, one subject "
             "centered with empty space in the upper third for text, shallow depth of field, clean background")
DESIGN = {
    "concept": "review tra sua",
    "style": {"mood": "tuoi", "palette": {"primary": "#C82828"}},
    "assets": [
        {"id": "tra_ai", "kind": "ai_image", "illustrates": "ly tra sua", "prompt": AI_PROMPT, "aspect": "3:4",
         "ref_media": ["media_3", "bogus"]},
        {"id": "media_1", "kind": "ai_image", "prompt": AI_PROMPT},                 # khai trung id tu lieu -> bo
    ],
    "scenes": [{"layout": "split", "source_id": "source_1", "src_start": 7.0, "src_end": 10.0,
                "panel": {"asset": "media_4", "media_start": 1.0}, "why": "noi ve pha che"}],
    "layers": [
        {"id": "sp", "type": "image", "asset": "media_1", "source_id": "source_1", "src_start": 3.0, "src_end": 6.0,
         "x": 0.5, "y": 0.6, "w": 0.2, "cutout": True, "why": "dang noi ve ly tra sua"},
        {"id": "ref_show", "type": "image", "asset": "media_3", "source_id": "source_1", "src_start": 0.5,
         "src_end": 2.0, "x": 0.5, "y": 0.3, "w": 0.5},                             # tu lieu CHI lam mau -> bo
        {"id": "ai", "type": "image", "asset": "tra_ai", "source_id": "source_1", "src_start": 0.5, "src_end": 2.5,
         "x": 0.5, "y": 0.25, "w": 0.5},
    ],
    "tu_lieu_dung": [{"media": "media_1", "src_start": 3.0, "cach": "sticker", "ly_do": "dang noi gia ly tra sua"}],
    "transitions": [], "effects": [], "grade": {"preset": "none", "intensity": 0},
}
TRA_LOI = {
    "B1-select": {"story_arc": "review", "tone": "vui", "selections": [
        {"source_id": "source_1", "start": 0.0, "end": 14.0, "beat": "body", "purpose": "review"}]},
    "B2-timeline": {"segments": [{"source_id": "source_1", "start": 0.0, "end": 14.0, "target_start": 0.0}], "duration": 14.0},
    "B3-hook": {},
    "R4-design": DESIGN,
    "R4-design-fix": DESIGN,         # van khong dung logo -> code dat du phong (ghi chu 'cuoi video')
    "R5-captions": {"captions": [], "caption_theme": {}},
    "B6-inserts": {"inserts": [
        {"meme_id": "wow-1", "source_id": "source_1", "src_time": 4.0, "placement": "cutaway", "duration": 1.0, "why": "x"},
        {"meme_id": "wow-1", "source_id": "source_1", "src_time": 6.5, "placement": "cutaway", "duration": 1.0, "why": "y"}]},
    "B7-audio": {"audio": []},
}
NHAN, SYS, THU_TU = {}, {}, []


def fake_chat(name, messages, **k):
    lab = k.get("step_label")
    THU_TU.append(lab)
    NHAN[lab] = json.loads(next((m["content"] for m in messages if m["role"] == "user"), "{}"))
    SYS[lab] = next((m["content"] for m in messages if m["role"] == "system"), "")
    return json.dumps(TRA_LOI.get(lab, {}), ensure_ascii=False)


CODEX = []


def fake_codex(argv, text, work, target, timeout):
    CODEX.append({"argv": list(argv), "text": text})
    Image.new("RGB", (600, 800), (120, 80, 60)).save(target)
    return target, 0, ""


providers._chat = fake_chat
asset_gen._run_codex = fake_codex
cli_providers.find_bin = lambda name: "/usr/bin/true"
text_art.gen_sheet = lambda *a, **k: None
server._can_gio_loi_noi = lambda brief: brief
media_vision.face_box = lambda *a, **k: None
import sfx_kit  # noqa: E402
sfx_kit.ensure_kit()
engine.sfx_catalog_for_plan = lambda *a, **k: [{"id": "kit-boom", "name": "Boom", "emotion": "punch", "use_when": "chot"}]
meme_lib.meme_catalog_for_plan = lambda *a, **k: [{"id": "wow-1", "name": "Wow", "emotion": "positive", "use_when": "x", "tags": []}]

UM = [
    {"id": "media_1", "kind": "image", "path": P("product.png"), "name": "product.png", "use": "show",
     "placement": "auto", "note": "anh ly tra sua cua quan, hien khi noi ve tra sua"},
    {"id": "media_2", "kind": "image", "path": P("logo.png"), "name": "logo.png", "use": "show",
     "placement": "overlay", "note": "logo quan - hien o cuoi video"},
    {"id": "media_3", "kind": "image", "path": P("product-copy.png"), "name": "ly-mau.png", "use": "ai_ref",
     "placement": "auto", "note": "tao anh AI co dung ly nay"},
    {"id": "media_4", "kind": "video", "path": P("demo.mp4"), "name": "demo.mp4", "use": "show",
     "placement": "split", "note": "clip pha che"},
]
UM[1]["analysis"] = fake_gemini([{"label": "logo", "path": P("logo.png")}], "", "")   # UI gui kem phan tich
UM[1]["analysis"].pop("_source", None)
n_gem = len(GEM)
_drop0, DROP = user_media.drop_conflicting_inserts, {}


def _spy_drop(inserts, design, items_):
    notes = _drop0(inserts, design, items_)
    DROP["giu"] = [i.get("src_time") for i in inserts.get("inserts") or []]
    DROP["notes"] = notes
    return notes


user_media.drop_conflicting_inserts = _spy_drop     # meme gia khong co file -> resolve_plan_inserts bo sau do
try:
    with server.app.test_client() as c:
        r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "title": "t", "user_media": UM,
                                               "edit_request": {"purpose": "ban tra sua"}})
        d = r.get_json() or {}
    check("autoplan chay xong", r.status_code == 200 and d.get("ok"), (r.status_code, d.get("error")))
    check("tu lieu chua co phan tich -> sidecar tu goi Gemini (tu lieu UI gui kem phan tich thi khong)",
          len(GEM) - n_gem <= 3 and not any("logo" in g["label"] for g in GEM[n_gem:]), [g["label"] for g in GEM[n_gem:]])
    r4 = NHAN.get("R4-design", {})
    tl = {x["id"]: x for x in r4.get("tu_lieu_nguoi_dung") or []}
    check("R4 nhan DU 4 tu lieu", set(tl) == {"media_1", "media_2", "media_3", "media_4"}, list(tl))
    x1 = tl.get("media_1", {})
    check("R4 thay MUC DICH nguoi dung (ghi chu + cach dung + cach hien thi)",
          x1.get("ghi_chu_nguoi_dung") == UM[0]["note"] and x1.get("cach_dung") == "chen_truc_tiep"
          and x1.get("cach_hien_thi_nguoi_dung_chon") == "AI tu chon", x1)
    check("R4 thay phan tich Gemini", (x1.get("gemini") or {}).get("chu_the") == "ly tra sua tran chau"
          and "tra sua" in (x1.get("gemini") or {}).get("tu_khoa", []), x1.get("gemini"))
    check("R4 thay so do (ti le that de tinh co)", abs(((x1.get("do_dac") or {}).get("cao_khi_rong_1") or 0) - 0.703) < 0.01,
          x1.get("do_dac"))
    check("R4: logo nen trong suot, video co do dai",
          (tl.get("media_2", {}).get("do_dac") or {}).get("nen_trong_suot") is True
          and abs(((tl.get("media_4", {}).get("do_dac") or {}).get("do_dai_giay") or 0) - 6.0) < 0.2, (tl.get("media_2"), tl.get("media_4")))
    check("R4: tu lieu 'lam mau' + 'nua tren' dung nhan", tl["media_3"]["cach_dung"] == "lam_mau_anh_ai"
          and tl["media_4"]["cach_hien_thi_nguoi_dung_chon"] == "nua tren man hinh", (tl["media_3"], tl["media_4"]))
    check("R4 system prompt co LUAT tu lieu", "TU LIEU CUA NGUOI DUNG" in SYS.get("R4-design", ""))
    fix = NHAN.get("R4-design-fix", {})
    check("R4 chua dung logo -> vong tu sua nhan dung muc thieu",
          any("media_2" in t and "CHEN" in t for t in fix.get("thieu_can_bo_sung") or []), fix.get("thieu_can_bo_sung"))
    fxp = NHAN.get("FX-plan", {})
    mom = [m for m in fxp.get("khoanh_khac") or fxp.get("moments") or [] if m.get("tu_lieu_dang_hien")]
    if not mom:   # ten truong payload FX-plan co the khac -> tim trong ca payload
        mom = [m for v in fxp.values() if isinstance(v, list) for m in v if isinstance(m, dict) and m.get("tu_lieu_dang_hien")]
    check("FX-plan biet tu lieu dang hien (khong ve de len)",
          any(t["id"] == "media_1" for m in mom for t in m["tu_lieu_dang_hien"]), fxp.keys())
    plan, spec = d.get("plan") or {}, d.get("spec") or {}
    check("B6: meme trung luc tu lieu dang hien bi bo, meme khac giu",
          DROP.get("giu") == [6.5] and any("4.0" in n for n in DROP.get("notes") or []), DROP)
    check("plan luu tu lieu (UI so sanh / hien thi)", [u["id"] for u in plan.get("user_media") or []]
          == ["media_1", "media_2", "media_3", "media_4"], plan.get("user_media"))
    assets = {a["id"]: a for a in plan.get("assets") or []}
    check("tai nguyen: tu lieu dang ky san, R4 khai trung id bi bo",
          assets.get("media_1", {}).get("kind") == "user_image" and assets["media_1"].get("user_media"), assets.get("media_1"))
    check("ai_image: ref_media chi giu anh cua nguoi dung", assets.get("tra_ai", {}).get("ref_media") == ["media_3"],
          assets.get("tra_ai"))
    cx = CODEX[-1] if CODEX else {"argv": [], "text": ""}
    av = cx["argv"]
    check("Codex nhan anh mau qua -i SAU '-'", "-i" in av and av.index("-i") > av.index("-")
          and av[av.index("-i") + 1] == assets["media_3"]["path"], av)
    check("prompt tao anh noi ro phai ve DUNG san pham trong anh mau",
          "ANH MAU DINH KEM" in cx["text"] and "ly tra sua tran chau" in cx["text"], cx["text"][:600])
    L = [x for x in spec.get("layers") or [] if x.get("um")]
    lp = next((x for x in L if x["um"] == "media_1"), None)
    check("spec: lop anh san pham co danh dau tu lieu", lp is not None, L)
    if lp:
        check("co toi thieu: w 0.2 -> >= 0.30", lp["w"] >= 0.3 - 1e-6, lp)
        ratio = (lp["h"] / lp["w"])
        check("h theo DUNG ti le anh that (khong meo)", abs(ratio - 1080 / 1920 * 1000 / 800) < 0.01, lp)
        check("trong vung an toan", lp["y"] - lp["h"] / 2 >= 0.06 - 1e-6 and lp["y"] + lp["h"] / 2 <= 0.82 + 1e-6, lp)
    check("tu lieu CHI lam mau -> khong hien anh goc", not any(x["um"] == "media_3" for x in L), L)
    lg_ = next((x for x in L if x["um"] == "media_2"), None)
    check("logo R4 bo sot -> du phong theo ghi chu 'cuoi video' (cau cuoi)", lg_ is not None and lg_["start"] >= 10.5, (lg_, L))
    sc = next((s for s in spec.get("scenes") or [] if (s.get("panel") or {}).get("um") == "media_4"), None)
    check("video tu lieu: panel split, chay tu media_start", sc is not None and sc["layout"] == "split"
          and sc["panel"]["kind"] == "video" and abs(sc["panel"]["srcStart"] - 1.0) < 1e-6, sc)
    rep = {x["id"]: x for x in (plan.get("_pipeline") or {}).get("tu_lieu") or []}
    check("bao cao: san pham da chen + ly do cua AI", rep.get("media_1", {}).get("dung") and "gia" in rep["media_1"].get("ly_do", ""),
          rep.get("media_1"))
    check("bao cao: logo du phong", rep.get("media_2", {}).get("du_phong") is True and rep["media_2"]["dung"], rep.get("media_2"))
    check("bao cao: anh mau dung cho 1 anh AI", rep.get("media_3", {}).get("anh_ai_dung_mau") == 1, rep.get("media_3"))
    check("summary dem tu lieu dang hien", (d.get("summary") or {}).get("tu_lieu") == 3, d.get("summary"))

    # Dung lai spec tu plan (mo lai du an / cache ban lam viec bi xoa)
    wimg = user_media.working_image(P("big.jpg"))
    plan2 = json.loads(json.dumps(plan))
    plan2["assets"].append({"id": "media_9", "kind": "user_image", "path": wimg, "orig_path": P("big.jpg"),
                            "user_media": True, "mw": 2400, "mh": 1600, "name": "big.jpg"})
    os.remove(wimg)
    import copy as _copy
    pa = _copy.deepcopy(plan2["assets"])
    user_media.refresh_assets(pa)
    check("ban lam viec bi xoa -> tao lai tu file trong du an", os.path.isfile(next(a for a in pa if a["id"] == "media_9")["path"]))
    with server.app.test_client() as c:
        rs = c.post("/remotion/spec", json={"plan": plan}).get_json() or {}
    check("/remotion/spec dung lai tu plan: van co lop tu lieu", any(x.get("um") == "media_1" for x in (rs.get("spec") or {}).get("layers") or []),
          rs.get("error"))
finally:
    pass

# ---------------------------------------------------------------------------
print("\n[5] Lop bao ve khi dung spec (co / vi tri / mat / video / panel)")
A = user_media.as_assets(user_media.ensure_analyzed([
    {"id": "p", "kind": "image", "path": P("product.png"), "name": "p", "use": "show", "placement": "auto", "note": ""},
    {"id": "v", "kind": "video", "path": P("demo.mp4"), "name": "v", "use": "show", "placement": "auto", "note": ""},
    {"id": "m", "kind": "image", "path": P("menu.jpg"), "name": "menu.jpg", "use": "show", "placement": "auto", "note": ""}]))
BASE = {"engine": "remotion", "source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 20.0}],
        "segments": [{"source_id": "source_1", "start": 0.0, "end": 14.0, "target_start": 0.0}],
        "duration": 14.0, "captions": [], "assets": A,
        "faces": {"source_1": {"cx": 0.5, "cy": 0.38, "w": 0.3, "h": 0.16}}}
pl = json.loads(json.dumps(BASE))
pl["layers"] = [
    {"id": "mat", "type": "image", "asset": "p", "source_id": "source_1", "src_start": 1.0, "src_end": 3.0,
     "x": 0.5, "y": 0.38, "w": 0.4},                                                  # de len mat
    {"id": "vid", "type": "image", "asset": "v", "source_id": "source_1", "src_start": 4.0, "src_end": 9.0,
     "x": 0.5, "y": 0.7, "w": 0.6, "media_start": 4.0},                               # loai sai + dai hon video
    {"id": "sat_day", "type": "image", "asset": "p", "source_id": "source_1", "src_start": 10.0, "src_end": 12.0,
     "x": 0.95, "y": 0.95, "w": 0.5, "anchor": "bottom"},                              # tran khoi khung
]
pl["scenes"] = [{"layout": "broll", "source_id": "source_1", "src_start": 12.0, "src_end": 13.5, "panel": {"asset": "m"}}]
sp, rp = remotion_plan.build_spec(pl)
LL = {x["id"].rsplit("_", 1)[0]: x for x in sp.get("layers") or []}
fc = BASE["faces"]["source_1"]
face = (fc["cx"] - fc["w"] * 0.55, fc["cy"] - fc["h"] * 0.75, fc["cx"] + fc["w"] * 0.55, fc["cy"] + fc["h"] * 0.65)
b = user_media._box(LL["mat"])
ov = user_media._inter(b, face) / ((face[2] - face[0]) * (face[3] - face[1]))
check("tu lieu de len mat -> doi cho (che <= 15%)", ov <= 0.15 + 1e-6, (LL.get("mat"), ov, rp.get("fixed")))
check("khai 'image' cho video -> doi dung loai 'video'", LL["vid"]["type"] == "video" and LL["vid"]["mediaStart"] == 4.0, LL.get("vid"))
check("video chi con 2s tu giay 4 -> lop cat con 2s", abs((LL["vid"]["end"] - LL["vid"]["start"]) - 2.0) < 0.05, LL.get("vid"))
sd = LL["sat_day"]
check("tran khoi khung -> keo vao vung an toan (ca khung anh)", sd["x"] + sd["w"] / 2 <= 0.98 + 1e-6
      and sd["y"] + sd["h"] / 2 <= 0.82 + 1e-6 and "anchor" not in sd, sd)
pm = (sp.get("scenes") or [{}])[0].get("panel") or {}
check("anh co chu can doc (menu) toan man hinh -> fit contain, khong ken burns",
      pm.get("fit") == "contain" and pm.get("kenburns") == "none" and pm.get("um") == "m", pm)
check("_layer_band: phu de ne khung tu lieu", motion_design._layer_band(LL["mat"]) is not None)
# mat do: tu lieu khong bi bo vi qua nhieu nhip
pl3 = json.loads(json.dumps(BASE))
pl3["faces"] = {}
pl3["layers"] = [{"id": "t%d" % i, "type": "box", "source_id": "source_1", "src_start": 0.2 + i * 0.7, "src_end": 0.5 + i * 0.7 + 0.5,
                  "x": 0.5, "y": 0.2, "w": 0.1, "h": 0.05} for i in range(12)]
pl3["layers"].append({"id": "um", "type": "image", "asset": "p", "source_id": "source_1", "src_start": 6.5, "src_end": 8.5,
                      "x": 0.5, "y": 0.5, "w": 0.5})
sp3, _ = remotion_plan.build_spec(pl3)
check("mat do > 8 nhip / 10s: KHONG bo tu lieu nguoi dung", any(x.get("um") == "p" for x in sp3.get("layers") or []),
      [x["id"] for x in sp3.get("layers") or []])

# ---------------------------------------------------------------------------
print("\n[6] Du phong + meme + finalize")
items6 = user_media.ensure_analyzed([
    {"id": "p", "kind": "image", "path": P("product.png"), "name": "product.png", "use": "show", "placement": "auto",
     "note": ""},
    {"id": "q", "kind": "image", "path": P("opaque_rgba.png"), "name": "xanh.png", "use": "show", "placement": "auto",
     "note": "hinh khong lien quan gi"}])
items6[1]["analysis"] = {"loai": "khac", "mo_ta": "o vuong xanh", "chu_the": "o vuong xanh la", "tu_khoa": ["hinh vuong"]}
des = {"layers": [], "scenes": [], "assets": [],
       "tu_lieu_bo_qua": [{"media": "q", "ly_do": "khong co cau nao noi ve hinh vuong xanh"}]}
notes, warns = user_media.finalize_design(des, items6, [{"source_id": "source_1", "start": 0, "end": 14, "target_start": 0}],
                                          {"source_1": TRANSCRIPT})
fb = [x for x in des["layers"] if x.get("asset") == "p"]
check("du phong: dat vao cau khop tu khoa Gemini ('ly tra sua...')", fb and abs(fb[0]["src_start"] - 3.0) < 1e-6, des["layers"])
check("du phong: san pham nen tron -> sticker tach nen", fb and fb[0].get("cutout") is True, fb)
check("khong cau nao khop -> KHONG doan bua, bao nguoi dung kem ly do AI",
      not [x for x in des["layers"] if x.get("asset") == "q"]
      and any("xanh.png" in w and "AI giải thích" in w and "hinh vuong xanh" in w for w in warns), warns)
des2 = {"layers": [], "scenes": [], "assets": []}
itm = user_media.ensure_analyzed([{"id": "m", "kind": "image", "path": P("menu.jpg"), "name": "menu.jpg", "use": "show",
                                   "placement": "auto", "note": "menu gia, hien khi noi ve gia"}])
itm[0]["analysis"] = {"loai": "bang_gia_menu", "mo_ta": "menu", "can_doc_chu": True, "tu_khoa": ["gia"]}
user_media.finalize_design(des2, itm, [{"source_id": "source_1", "start": 0, "end": 14, "target_start": 0}], {"source_1": TRANSCRIPT})
check("ghi chu 'hien khi noi ve gia' -> khop cau co 'gia' (tu 1 am tiet cua nguoi dung van tinh)",
      des2["scenes"] and abs(des2["scenes"][0]["src_start"] - 3.0) < 1e-6, des2)
check("du phong menu DOC co chu can doc -> scene toan man hinh contain (khong thu nho khung noi)",
      des2["scenes"] and des2["scenes"][0]["layout"] == "broll" and des2["scenes"][0]["panel"]["fit"] == "contain", des2)
ins = {"inserts": [{"meme_id": "a", "source_id": "source_1", "src_time": 3.2}, {"meme_id": "b", "source_id": "source_1", "src_time": 9.0}]}
dn = user_media.drop_conflicting_inserts(ins, {"layers": [{"type": "image", "asset": "p", "source_id": "source_1",
                                                           "src_start": 3.0, "src_end": 5.0}]}, items6)
check("meme trung khoang tu lieu -> bo", [i["meme_id"] for i in ins["inserts"]] == ["b"] and dn, ins)

# ---------------------------------------------------------------------------
ph = dict(user_media._phrases({"note": "anh ly tra sua cua quan, hien o cuoi video",
                                  "analysis": {"tu_khoa": ["gia", "tra sua"]}}))
check("cum ghi chu cat tai tu dem (khong ghep 'ly tra sua quan')", "ly tra sua" in ph and "quan" in ph
      and "ly tra sua quan" not in ph and ph.get("gia") == 0.6, ph)

e_ = user_media._err_text(RuntimeError("403 Client Error: Forbidden for url: https://x.googleapis.com/upload/v1beta/files?key=AIzaSyA1234567890abcdefghijk&alt=json\n{\n \"error\": 1}"))
check("loi Gemini: che khoa API, gon 1 dong", "AIza" not in e_ and "key=***" in e_ and "\n" not in e_ and '"error"' in e_, e_)

cap = Image.new("RGBA", (120, 90), (40, 110, 200, 255))
cap.save(P("cap_cut.png"))
check("ban tach nen chi la 1 manh nho (nap chai) -> bo, dung khung anh", not user_media._cutout_ok(P("product.png"), P("cap_cut.png")))
Image.new("RGBA", (400, 700), (200, 40, 40, 255)).save(P("body_cut.png"))
check("ban tach nen du lon -> dung sticker", user_media._cutout_ok(P("product.png"), P("body_cut.png")))

print("\n[7] Khong co tu lieu -> R4 y nhu cu; khoa cache")
SYS.clear()
NHAN.clear()
motion_design.gpt_rm_design(segments=[{"source_id": "source_1", "start": 0, "end": 14, "target_start": 0}],
                            transcript_data={"source_1": TRANSCRIPT}, emotion_map_data={}, key_moments_data={})
check("khong tu lieu: prompt R4 khong co luat tu lieu, payload khong co truong tu lieu",
      "TU LIEU CUA NGUOI DUNG" not in SYS.get("R4-design", "") and "tu_lieu_nguoi_dung" not in NHAN.get("R4-design", {}))
fp0 = prompt_store.fingerprint()
kv0 = user_media.key_view(items6)
prompt_store.save("prompt", "_USER_MEDIA_NOTE", user_media._USER_MEDIA_NOTE + "\n8. Them luat thu.")
check("sua luat tu lieu: KHONG lam cache B1..B7 moi du an chay lai", prompt_store.fingerprint() == fp0)
check("... nhung R4 cua du an CO tu lieu chay lai (khoa rieng doi)", user_media.key_view(items6) != kv0)
prompt_store.reset("prompt", "_USER_MEDIA_NOTE")
it_note = [dict(items6[0], note="doi muc dich")]
check("doi muc dich tu lieu -> khoa R4 doi", user_media.key_view(it_note) != user_media.key_view(items6[:1]))
k_old = asset_gen._key(AI_PROMPT, "3:4", "s", False, {"loi_noi": "x"})
check("anh AI khong anh mau: khoa y nhu cu (anh da tao dung lai)",
      k_old == asset_gen._key(AI_PROMPT, "3:4", "s", False, {"loi_noi": "x"}, None))
check("anh AI co anh mau: khoa khac", k_old != asset_gen._key(AI_PROMPT, "3:4", "s", False, {"loi_noi": "x"}, [P("product.png")]))
lst = {p["id"]: p for p in prompt_store.listing()["prompts"]}
check("2 prompt moi hien trong menu Prompt & quy tac", "_USER_MEDIA_PROMPT" in lst and "_USER_MEDIA_NOTE" in lst
      and lst["_USER_MEDIA_NOTE"]["default"].strip().startswith("# TU LIEU"))

shutil.rmtree(TMP, ignore_errors=True)
print("\n" + ("TAT CA PASS" if not FAILED else "CO %d MUC FAIL: %s" % (len(FAILED), FAILED)))
sys.exit(1 if FAILED else 0)
