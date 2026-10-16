#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test BO ANH THAM CHIEU video mau (sidecar/ref_pack.py, 2026-10-15) + truyen ANH THAT cho Claude.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_ref_pack.py      (macOS: OCR Vision; can ffmpeg)

[1] dung bo anh: OCR tim dung hop chu (vung Gemini lech van cat dung), gop kieu chu trung (alias), anh chu dang vao,
    anh hieu ung, anh tong the, files_ok
[2] moi buoc CHI nhan anh cua no (DD tong the; R4 kieu chu + vao + tong the; R5 phu de; FX-plan hieu ung; FX-code chi
    hieu ung duoc goi ten)
[3] ensure: phan tich cu khong co bo anh -> dung (1 luot Gemini gia) + luu thu vien; lan sau doc tu dia (khong Gemini)
[4] Claude CLI: chep anh vao thu muc lam viec, chi bat Read, du luot, prompt liet ke anh; khong mo anh -> goi lai 1 lan
[5] Claude API key: anh -> content block base64
[6] CA LUONG /remotion/autoplan (AI gia): moi buoc Claude nhan dung anh; chu anh AI nhan anh chu that dung kieu cua cum
"""
import os
import sys
import json
import shutil
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))
os.environ["STUDIO_LICENSE_OFF"] = "1"

import ref_pack           # noqa: E402
import remotion_plan      # noqa: E402
import analysis_library   # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


TMP = tempfile.mkdtemp(prefix="refpack-test-")
VID = os.path.join(TMP, "mau.mp4")
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if not os.path.isfile(FONT):
    FONT = "/System/Library/Fonts/Helvetica.ttc"
ff = remotion_plan._ffbin("ffmpeg")
dt = ("drawtext=fontfile='%s':text='%s':fontsize=%d:fontcolor=%s:borderw=%d:bordercolor=black:x=(w-tw)/2:y=%d:"
      "enable='between(t,%s,%s)'")
subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x334455:size=1080x1920:rate=30:duration=8",
                "-vf", ",".join([dt % (FONT, "READY TO POST", 130, "white", 8, 500, 1, 3),
                                 dt % (FONT, "ONE PROMPT", 130, "white", 8, 500, 4, 5),
                                 dt % (FONT, "the easiest way", 52, "yellow", 0, 1300, 0, 8)]),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", VID], check=True)
ANCH = {"kieu_chu": [
    {"id": "Chu1", "vai": "chu_nhan", "mo_ta": "chu trang dam vien den day", "font_gan_nhat": "anton",
     "chu_mau": "READY TO POST", "giay": 2.0, "vung": [0.05, 0.18, 0.55, 0.32], "vao": {"tu_giay": 0.9, "den_giay": 1.3},
     "dung_cho": ["Hook 2 tang"], "so_lan": 3},
    {"id": "chu2", "vai": "chu_nhan", "mo_ta": "trang vien den (lap kieu)", "font_gan_nhat": "anton",
     "chu_mau": "ONE PROMPT", "giay": 4.5, "vung": [0.1, 0.25, 0.9, 0.32], "dung_cho": ["Tu khoa chot"], "so_lan": 1,
     "de_doc": False},
    {"id": "phude", "vai": "phu_de", "mo_ta": "vang nho khong vien", "font_gan_nhat": "montserrat",
     "chu_mau": "the easiest way", "giay": 6.0, "vung": [0.3, 0.64, 0.7, 0.71], "vao": None}],
    "hieu_ung": [{"id": "hu1", "loai": "camera", "mo_ta": "zoom dap", "tu_giay": 1.0, "den_giay": 2.0},
                 {"id": "hu2", "loai": "lop_phu", "mo_ta": "mui ten giay", "tu_giay": 5.0, "den_giay": 6.2}],
    "tong_the": [1, 4, 7]}

print("[1] Dung bo anh tham chieu")
pk = ref_pack.build(VID, 8.0, [], {"fonts": {"hero": "anton"}}, {}, "fp_test", anchors=ANCH)
ks = {s["id"]: s for s in pk["kieu_chu"]}
check("gop kieu chu trung (chu2 -> alias cua chu1), con 2 kieu", sorted(ks) == ["chu1", "phude"]
      and ks["chu1"]["alias"] == ["chu2"], {k: v["alias"] for k, v in ks.items()})
check("OCR tim DUNG hop chu du vung Gemini lech (READY TO POST nam y ~0.26-0.34)", ks["chu1"]["xac_minh"]
      and "READY" in ks["chu1"]["ocr"] and ks["chu1"]["vung"][1] < 0.27 < ks["chu1"]["vung"][3], ks["chu1"])
check("phu de xac minh bang OCR", ks["phude"]["xac_minh"] and "way" in ks["phude"]["ocr"], ks["phude"])
d = ref_pack.pack_dir("fp_test")
check("anh chu + anh chu dang vao + anh hieu ung + tong the co file", all(os.path.isfile(os.path.join(d, f)) for f in (
    "chu_chu1.jpg", "chu_chu1_vao.jpg", "chu_phude.jpg", "hu_hu1.jpg", "hu_hu2.jpg", "tong_the.jpg", "pack.json")),
      os.listdir(d))
check("anh trung (chu2) khong luu", not os.path.isfile(os.path.join(d, "chu_chu2.jpg")))
check("files_ok + resolve alias", ref_pack.files_ok(pk) and ref_pack.resolve_style(pk, "chu2")["id"] == "chu1")
check("kieu chu nhan chinh = chu1 (khong phai phu de)", ref_pack.main_style(pk)["id"] == "chu1")

check("tan suat gop (3 + 1) + de_doc lay theo ban giu (chu1)", ks["chu1"]["so_lan"] == 4 and ks["chu1"]["de_doc"] is True,
      ks["chu1"])
pk_lim = dict(pk, kieu_chu=[dict(ks["chu1"], so_lan=1, de_doc=False), ks["phude"]])
check("gioi han tan suat: kieu xuat hien 1 lan trong mau 8s -> video 16s toi da 3 cum; phu de khong gioi han",
      ref_pack.usage_limits(pk_lim, 16.0) == {"chu1": 3}, ref_pack.usage_limits(pk_lim, 16.0))
with ref_pack.use(pk_lim):
    _d = {"layers": [{"id": "l%d" % i, "type": "text", "kieu_chu": "chu2"} for i in range(5)]
          + [{"id": "g%d" % i, "type": "text", "group": "G", "kieu_chu": "chu1"} for i in range(3)]}
    _a = ref_pack.audit_usage(_d, 16.0)
check("dem theo CUM (to hop = 1), alias tinh vao kieu chuan; vuot -> muc thieu + nhac khong de doc",
      len(_a) == 1 and "dung 6 cum" in _a[0] and "KHONG de doc" in _a[0], _a)

import motion_design as _MD  # noqa: E402
_f1, _f2 = os.path.join(TMP, "a1.png"), os.path.join(TMP, "a2.png")
for _f in (_f1, _f2):
    open(_f, "wb").write(b"x")
_lk = _MD.art_index({"text_art": {"items": {
    "k1": {"kieu_chu": "chu5", "tiers": [{"text": "1-6 TIENG", "file": _f2}, {"text": "FPIES", "file": _f2}]},
    "k2": {"kieu_chu": "chu2", "tiers": [{"text": "FPIES", "file": _f1}]}}}})
check("CUNG chu 2 kieu: lop ghi kieu_chu lay dung anh kieu do (khong lay anh dau tien gap)",
      _lk.pick("fpies", "chu2")["file"] == _f1 and _lk.pick("fpies", "chu5")["file"] == _f2
      and _lk.pick("fpies")["file"] in (_f1, _f2))

print("\n[2] Moi buoc chi nhan anh cua no")
names = lambda b, ids=None: [os.path.basename(x["path"]) for x in ref_pack.images_for(pk, b, ids)]  # noqa: E731
check("DD: chi tong the", names("DD") == ["tong_the.jpg"], names("DD"))
check("R4: kieu chu (tinh + dang vao) + tong the, khong hieu ung", names("R4") == ["chu_chu1.jpg", "chu_chu1_vao.jpg",
                                                                                 "chu_phude.jpg", "tong_the.jpg"], names("R4"))
check("R5: chi phu de", names("R5") == ["chu_phude.jpg"], names("R5"))
check("FX-plan: chi anh hieu ung", names("FX-plan") == ["hu_hu1.jpg", "hu_hu2.jpg"], names("FX-plan"))
check("FX-code: chi hieu ung duoc goi ten", names("FX-code", ["hu2"]) == ["hu_hu2.jpg"] and names("FX-code", []) == [])
check("ngoai ngu canh use -> buoc khong nhan anh nao", ref_pack.step_images("R4") == [] and ref_pack.rule("R4") == "")
with ref_pack.use(pk):
    check("trong use -> step_images + luat", len(ref_pack.step_images("R4")) == 4 and "kieu_chu" in ref_pack.rule("R4"))

print("\n[3] ensure: phan tich cu -> dung bo anh + luu thu vien, lan sau doc dia")
shutil.rmtree(ref_pack.pack_dir(analysis_library.fingerprint(VID)), ignore_errors=True)
analysis_library.save_reference(VID, "ref_video", {"summary": "x", "style_kit": {"fonts": {}}, "duration": 8.0},
                                name="mau.mp4", duration=8.0)
CALLS = []
_orig_anch = ref_pack.gpt_anchors
ref_pack.gpt_anchors = lambda strips, kit, fp_, log=None: (CALLS.append(len(strips)), ANCH)[1]
ra = {"summary": "x", "style_kit": {"fonts": {}}, "reference_video": {"path": VID, "name": "mau.mp4", "duration": 8.0}}
p1 = ref_pack.ensure(ra)
check("phan tich cu -> dung bo anh (1 luot Gemini) + gan vao phan tich", p1 and len(CALLS) == 1 and ra.get("ref_pack") == p1,
      CALLS)
check("luu vao thu vien phan tich", (analysis_library.get_reference(VID, "ref_video") or {}).get("ref_pack"))
ra2 = {"summary": "x", "style_kit": {"fonts": {}}, "reference_video": {"path": VID}}
p2 = ref_pack.ensure(ra2)
check("lan sau: doc tu dia, KHONG goi Gemini", p2 and len(CALLS) == 1 and p2["fp"] == p1["fp"], CALLS)
check("khong co video mau / khong style_kit -> None", ref_pack.ensure({}) is None
      and ref_pack.ensure({"reference_video": {"path": "/khong/co.mp4"}}) is None)
ref_pack.gpt_anchors = _orig_anch

print("\n[4] Claude CLI xem anh")
import cli_providers  # noqa: E402
RUNS = []
_orig_run = cli_providers._run


def fake_run(argv, stdin_text=None, timeout=None, cwd=None, env=None):
    files = sorted(os.listdir(os.path.join(cwd, cli_providers.CLAUDE_REF_DIR))) if cwd and os.path.isdir(
        os.path.join(cwd, cli_providers.CLAUDE_REF_DIR)) else []
    RUNS.append({"argv": list(argv), "stdin": stdin_text, "files": files})
    turns = 1 if len(RUNS) == 1 else 3
    return 0, json.dumps({"type": "result", "is_error": False, "result": '{"ok": 1}', "num_turns": turns,
                          "duration_ms": 10, "usage": {"output_tokens": 5}}), ""


cli_providers._run = fake_run
imgs = ref_pack.images_for(pk, "R4")
out = cli_providers._claude_chat("/fake/claude", "claude-sonnet-5", "SYS", "USER", 60, "R4-design", images=[dict(x) for x in imgs])
a0 = RUNS[0]["argv"]
check("chep %d anh vao thu muc lam viec (anh_tham_chieu/)" % len(imgs), len(RUNS[0]["files"]) == len(imgs), RUNS[0]["files"])
check("chi bat Read + allowedTools Read + du luot", a0[a0.index("--tools") + 1] == "Read"
      and a0[a0.index("--allowedTools") + 1] == "Read" and int(a0[a0.index("--max-turns") + 1]) >= len(imgs) + 2, a0)
check("prompt liet ke tung anh kem nhan", RUNS[0]["stdin"].startswith("# ANH THAM CHIEU") and all(
    f in RUNS[0]["stdin"] for f in RUNS[0]["files"]) and "kieu chu 'chu1'" in RUNS[0]["stdin"], RUNS[0]["stdin"][:400])
check("model khong mo anh (num_turns 1) -> goi lai 1 lan, nhac ro", len(RUNS) == 2 and RUNS[1]["stdin"].startswith(
    "BAN CHUA MO ANH") and out == '{"ok": 1}', [r["stdin"][:40] for r in RUNS])
RUNS.clear()
cli_providers._claude_chat("/fake/claude", "claude-sonnet-5", "SYS", "USER", 60, "B1-select")
a1 = RUNS[0]["argv"]
check("khong anh -> nhu cu (tat cong cu, 1 luot)", a1[a1.index("--tools") + 1] == "" and a1[a1.index("--max-turns") + 1] == "1"
      and "--allowedTools" not in a1)
# JSON bi cat giua chung -> goi lai 1 lan (yeu cau viet gon); thoi gian cho tang theo so anh
RUNS.clear()
_ret = iter(['{"effects":[{"id":"fx1","src_star', '{"effects": []}'])


def fake_run2(argv, stdin_text=None, timeout=None, cwd=None, env=None):
    RUNS.append({"stdin": stdin_text, "timeout": timeout, "env": env or {}})
    return 0, json.dumps({"type": "result", "is_error": False, "result": next(_ret), "num_turns": 3,
                          "duration_ms": 5, "usage": {}}), ""


cli_providers._run = fake_run2
_fb = cli_providers.find_bin
cli_providers.find_bin = lambda name: "/fake/claude"
out2 = cli_providers.cli_chat("claude", "claude-sonnet-5", [{"role": "system", "content": "S"}, {"role": "user", "content": "U"}],
                              json_mode=True, req_timeout=300, step_label="FX-plan", images=[dict(x) for x in imgs[:4]])
check("JSON cut -> goi lai 1 lan, nhac viet gon, tra JSON du", out2 == '{"effects": []}' and len(RUNS) == 2
      and "BI CAT GIUA CHUNG" in RUNS[1]["stdin"], [r["stdin"][:60] for r in RUNS])
check("co 4 anh -> thoi gian cho x1.6 (300 -> 480 truoc he so khac)", RUNS[0]["timeout"] >= int(300 * 1.6),
      RUNS[0]["timeout"])
check("Claude Code duoc nang gioi han do dai cau tra loi", RUNS[0]["env"].get("CLAUDE_CODE_MAX_OUTPUT_TOKENS") == "32000")
cli_providers.find_bin = _fb
cli_providers._run = _orig_run

print("\n[5] Claude API key: anh -> content block")
import providers  # noqa: E402
bl = providers._image_blocks(imgs[:2])
check("2 anh -> 2 nhan + 2 block image base64", [b["type"] for b in bl] == ["text", "image", "text", "image"]
      and bl[1]["source"]["media_type"] == "image/jpeg" and len(bl[1]["source"]["data"]) > 1000)

print("\n[6] CA LUONG /remotion/autoplan voi video mau + bo anh")
import server         # noqa: E402
import meme_lib       # noqa: E402
import media_vision   # noqa: E402
import text_art       # noqa: E402
import engine         # noqa: E402
import sfx_kit        # noqa: E402
SRC = os.path.join(TMP, "a.mp4")
subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=16",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=16", "-shortest", "-c:v", "libx264", "-pix_fmt",
                "yuv420p", SRC], check=True)
TR = [{"start": 0.0, "end": 2.0, "text": "Toi mat ba ty trong mot dem", "is_punchline": True},
      {"start": 2.3, "end": 5.8, "text": "vi tin mot loi quang cao"},
      {"start": 8.0, "end": 10.5, "text": "Dung bao gio lam nhu toi"},
      {"start": 10.8, "end": 13.9, "text": "hay kiem tra truoc khi chuyen tien"}]
BRIEF = {"source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 16.0}],
         "sources": [{"id": "source_1", "summary": "bai hoc", "transcript": TR, "emotion_map": [], "key_moments": []}]}
REF = {"summary": "nhanh", "style_kit": {"fonts": {"hero": "anton"}, "palette": {"accent": "#FFD600"},
                                         "recipes": [{"name": "Hook 2 tang", "layers": [{"type": "text"}]}]},
       "reference_video": {"path": VID, "name": "mau.mp4", "duration": 8.0}, "ref_pack": pk}
TRA = {
    "B1-select": {"story_arc": "a", "tone": "nghiem", "selections": [{"source_id": "source_1", "start": 0.0, "end": 5.8},
                                                                     {"source_id": "source_1", "start": 8.0, "end": 13.9}]},
    "B2-timeline": {"segments": [{"source_id": "source_1", "start": 0.0, "end": 5.8, "target_start": 0.0},
                                 {"source_id": "source_1", "start": 8.0, "end": 13.9, "target_start": 5.8}]},
    "DD-chi-dao": {"y_tuong_lon": "con dau do", "chu_de_that": "x", "cuong_do": 4,
                   "nhip": [{"tu_segment": 0, "den_segment": 1, "nang_luong": 4}], "am_thanh": {"the_gioi": "dien_anh"}},
    "B3-hook": {"hook": None},
    "R4-design": {"concept": "c", "scenes": [], "assets": [], "effects": [], "transitions": [], "layers": [
        {"id": "a1", "type": "text", "kieu_chu": "chu2", "source_id": "source_1", "src_start": 0.5, "src_end": 2.0,
         "x": 0.5, "y": 0.3, "spans": [{"text": "3 TỶ", "font": "anton", "size": 110}]},
        {"id": "a2", "type": "text", "source_id": "source_1", "src_start": 9.0, "src_end": 10.4, "x": 0.5, "y": 0.3,
         "spans": [{"text": "ĐỪNG", "font": "anton", "size": 110}]}]},
    "R5-captions": {"captions": [], "caption_theme": {}},
    "FX-plan": {"effects": [
        {"id": "fx1", "kind": "overlay", "layer": "front", "source_id": "source_1", "src_start": 3.0, "src_end": 4.2,
         "theo_mau": "hu2", "context": "dang ke chuyen tin quang cao", "goal": "nguoi xem thay mui ten chi vao",
         "y_nghia": "lam ro y dang noi luc do (du lieu test)", "why_fit": "tai hien mui ten giay cua video mau", "visual": "mui ten giay kraft truot vao tu phai"},
        {"id": "fx2", "kind": "overlay", "layer": "front", "source_id": "source_1", "src_start": 9.0, "src_end": 10.0,
         "theo_mau": "khong_co", "context": "canh bao dung lam nhu toi", "goal": "nhan manh loi khuyen",
         "y_nghia": "lam ro y dang noi luc do (du lieu test)", "why_fit": "vong tron nho nhan manh chu dung", "visual": "vong tron mong quanh chu"}]},
    "FX-code": {"effects": [
        {"id": "fx1", "fit_check": {"ok": True}, "code": "function render(ctx){ return h('svg', {width: ctx.W, height: ctx.H}, h('rect', {x: 10, y: 10, width: 100 * env(ctx.t, ctx.d), height: 20, fill: '#ffffff'})) }"},
        {"id": "fx2", "fit_check": {"ok": True}, "code": "function render(ctx){ return h('svg', {width: ctx.W, height: ctx.H}, h('circle', {cx: 100, cy: 100, r: 30 * env(ctx.t, ctx.d) + 1, fill: 'none', stroke: '#fff'})) }"}]},
    "B6-inserts": {"inserts": []}, "B7-audio": {"audio": []}, "DD-duyet": {"nhan_xet": "ok", "bo": []},
}
GOT = {}


def fake_chat(name, messages, **k):
    lab = k.get("step_label")
    GOT.setdefault(lab, []).append({"images": [os.path.basename(x["path"]) for x in (k.get("images") or [])],
                                    "sys": next((m["content"] for m in messages if m["role"] == "system"), ""),
                                    "user": json.loads(next((m["content"] for m in messages if m["role"] == "user"), "{}"))})
    return json.dumps(TRA.get(lab, {}), ensure_ascii=False)


providers._chat = fake_chat
SHEETS = []
text_art.gen_sheet = lambda lk, *a, **kw: (SHEETS.append({"keys": [x["key"] for x in lk],
                                                           "style_ref": os.path.basename(kw.get("style_ref") or "")}), None)[1]
server._can_gio_loi_noi = lambda brief: brief
media_vision.face_box = lambda *a, **k: None
meme_lib.meme_catalog_for_plan = lambda *a, **k: []
sfx_kit.ensure_kit()
with server.app.test_client() as c:
    r = c.post("/remotion/autoplan", json={"brief": BRIEF, "reference_analysis": REF, "fresh": True, "project": "p-ref"})
dd = r.get_json() or {}
check("autoplan chay xong", r.status_code == 200 and dd.get("ok"), dd.get("error"))
im = lambda lab: (GOT.get(lab) or [{}])[0].get("images")  # noqa: E731
check("DD nhan CHI anh tong the + bo phong cach video mau", im("DD-chi-dao") == ["tong_the.jpg"]
      and (GOT["DD-chi-dao"][0]["user"].get("video_mau") or {}).get("bo_phong_cach"), im("DD-chi-dao"))
check("DD: luat uu tien video mau trong prompt", "NGUOI DUNG DA CHON PHONG CACH NAY" in GOT["DD-chi-dao"][0]["sys"])
check("R4 nhan anh kieu chu (tinh + vao) + tong the + id trong payload + luat", im("R4-design") == [
    "chu_chu1.jpg", "chu_chu1_vao.jpg", "chu_phude.jpg", "tong_the.jpg"]
      and (GOT["R4-design"][0]["user"].get("anh_tham_chieu") or {}).get("kieu_chu")
      and '"kieu_chu": "<id>"' in GOT["R4-design"][0]["sys"], im("R4-design"))
check("R5 nhan CHI anh phu de", im("R5-captions") == ["chu_phude.jpg"], im("R5-captions"))
check("FX-plan nhan CHI anh hieu ung", im("FX-plan") == ["hu_hu1.jpg", "hu_hu2.jpg"], im("FX-plan"))
check("FX-code nhan CHI anh hieu ung duoc goi ten (hu2; 'khong_co' bi bo)", im("FX-code") == ["hu_hu2.jpg"], im("FX-code"))
fxs = {e["id"]: e for e in (dd.get("plan") or {}).get("fx") or []}
check("theo_mau hop le giu, id la bo", fxs.get("fx1", {}).get("theo_mau") == "hu2" and "theo_mau" not in fxs.get("fx2", {}),
      fxs)
check("B1/B2/B3/B6/B7 KHONG nhan anh", all(not im(l) for l in ("B1-select", "B2-timeline", "B3-hook", "B7-audio")))
by_style = {}
for sh in SHEETS:
    by_style.setdefault(sh["style_ref"], []).extend(sh["keys"])
check("chu anh AI: cum ghi kieu_chu 'chu2' (alias) + cum khong ghi deu dung anh chu that chu1",
      set(by_style) == {"chu_chu1.jpg"} and len(by_style["chu_chu1.jpg"]) >= 2, SHEETS)

# khong video mau -> khong buoc nao nhan anh
GOT.clear()
SHEETS.clear()
with server.app.test_client() as c:
    r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "project": "p-noref"})
check("khong video mau: khong buoc nao nhan anh, chu anh AI khong anh chu that",
      (r.get_json() or {}).get("ok") and not any(x.get("images") for v in GOT.values() for x in v)
      and all(not s["style_ref"] for s in SHEETS), {k: [x["images"] for x in v] for k, v in GOT.items()})

print()
if FAILED:
    print("CO %d TEST FAIL: %s" % (len(FAILED), FAILED))
    sys.exit(1)
print("TAT CA PASS")
