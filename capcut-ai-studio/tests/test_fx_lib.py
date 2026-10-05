#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO HIEU UNG TU VIET (2026-10-05): dong goi sau render -> dung lai o FX-code -> preview / Gemini nhan -> kho chung.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_fx_lib.py      (can node; AI + Gemini gia lap)
Hop cach ly (fx_runtime.mjs) chay THAT bang node.
"""
import os
import sys
import json
import shutil
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))
if not os.environ.get("HOME", "").startswith(("/tmp", "/var/folders", "/private")):
    sys.exit("Chay voi HOME tam: HOME=$(mktemp -d) ... (test ghi ~/.capcut-studio/fx_library.json)")

import fx_flow          # noqa: E402
import fx_lib           # noqa: E402
import providers        # noqa: E402
import prompt_store     # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


RAYS = """function render(ctx) {
  const k = env(ctx.t, ctx.d, 0.15, 0.3) * (ctx.params.intensity || 1);
  const c = (ctx.params.colors || [])[0] || '#ffffff';
  const f = ctx.face || { x: ctx.W / 2, y: ctx.H * 0.42, w: 300, h: 380 };
  return h('svg', { width: ctx.W, height: ctx.H, viewBox: `0 0 ${ctx.W} ${ctx.H}` },
    ...range(12).map((i) => {
      const a = (i / 12) * Math.PI * 2;
      const [x1, y1] = polar(f.x, f.y, f.w * 0.9, a);
      const [x2, y2] = polar(f.x, f.y, f.w * 1.4, a);
      return h('line', { x1, y1, x2, y2, stroke: alpha(c, 0.8 * k), 'stroke-width': 5 });
    }));
}"""
FACE_ONLY = ("function render(ctx){ const f = ctx.face; return h('svg', {width: ctx.W, height: ctx.H},"
             " h('circle', {cx: f.x, cy: f.y, r: f.w, fill: 'none', stroke: '#fff', 'stroke-width': 6})) }")
FIXED = ("function render(ctx){ if (ctx.W !== 1080) throw new Error('chi khung doc'); return h('svg', {width: ctx.W, height: ctx.H},"
         " h('rect', {x: 100, y: 100, width: 50, height: 50, fill: '#fff'})) }")
SHAKE = "function transform(ctx){ const k = env(ctx.t, ctx.d, 0.05, 0.2); return {x: noise(ctx.t * 30, 1) * 14 * k}; }"
BROKEN = "function render(ctx){ return h('svg', {}, ctx.nope.x) }"


def fx(fid, code, kind="overlay", a=1.0, b=2.5, visual="", goal="", **kw):
    return dict({"id": fid, "kind": kind, "layer": "front", "source_id": "source_1", "src_start": a, "src_end": b,
                 "code": code, "params": {"colors": ["#ffcc00"], "intensity": 0.8}, "visual": visual, "goal": goal,
                 "sync": "", "context": "dang noi ve kem chong nang ABC (rieng tu)", "why_fit": "trich loi rieng tu"}, **kw)


exe, _env = fx_flow.node_bin()
check("co Node de chay hop cach ly", bool(exe), exe)

print("[1] Dong goi sau render: chong trung, dem lan dung theo du an, kiem di dong")
items = [fx("fx1", RAYS, visual="tia sang vang toa ra quanh mat nguoi noi", goal="nhan manh cau chot bat ngo"),
         fx("fx2", FACE_ONLY, visual="vong tron trang bao quanh mat", goal="dan mat vao nguoi noi"),
         fx("fx3", FIXED, visual="o vuong goc tren", goal="x"),
         fx("fx4", SHAKE, kind="transform", a=3, b=3.6, visual="rung khung manh ngan", goal="soc")]
r1 = fx_lib.harvest(items, project="p1", orientation="portrait")
check("them 4 hieu ung (khung doc)", len(r1["added"]) == 4 and not r1["skipped"], r1)
lib = {e["id"]: e for e in fx_lib.load_lib()["effects"]}
id_rays = fx_lib.code_id("overlay", RAYS)
id_face = fx_lib.code_id("overlay", FACE_ONLY)
id_fixed = fx_lib.code_id("overlay", FIXED)
check("hieu ung doc ctx.face khong kiem null -> needs_face, van dung duoc", lib[id_face]["needs_face"] and lib[id_face]["works"]["portrait"])
check("code chi chay khung doc -> works ngang = False", lib[id_fixed]["works"] == {"portrait": True, "landscape": False}, lib[id_fixed]["works"])
check("code luu file rieng", fx_lib.load_code(id_rays) == RAYS)
check("design (rieng tu) chi o may nay", "kem chong nang" in lib[id_rays]["design"]["context"])
r2 = fx_lib.harvest(items, project="p1", orientation="portrait")
check("render lai cung du an -> khong them, khong tang lan dung", not r2["added"] and fx_lib.get(id_rays)["uses"] == 1, (r2, fx_lib.get(id_rays)))
fx_lib.harvest(items[:1], project="p2", orientation="portrait")
check("du an khac dung cung code -> uses 2", fx_lib.get(id_rays)["uses"] == 2 and fx_lib.get(id_rays)["projects"] == ["p1", "p2"])
r3 = fx_lib.harvest([fx("fxb", BROKEN)], project="p3", orientation="portrait")
check("code hong o chinh khung cua video -> khong dong goi", not r3["added"] and r3["skipped"], r3)
r4 = fx_lib.harvest([fx("fxl", FIXED.replace("width: 50", "width: 60"))], project="p4", orientation="landscape")
check("khung ngang: code chi chay khung doc -> bo", not r4["added"] and r4["skipped"], r4)
check("khoang trang cuoi khong doi id", fx_lib.code_id("overlay", FIXED + "  \n\n") == id_fixed)

print("[2] Loc ung vien (code, khong AI)")
new = [{"id": "a", "kind": "overlay", "src_start": 0, "src_end": 1.4, "visual": "nhung tia sang mau vang toa quanh khuon mat",
        "goal": "nhan manh khoanh khac bat ngo", "sync": ""},
       {"id": "b", "kind": "transform", "src_start": 0, "src_end": 0.6, "visual": "rung khung that manh", "goal": "soc", "sync": ""},
       {"id": "c", "kind": "overlay", "src_start": 0, "src_end": 1.2, "visual": "hat bui lap lanh roi tu tren xuong", "goal": "lang man", "sync": ""},
       {"id": "d", "kind": "overlay", "src_start": 0, "src_end": 5.9, "visual": "tia sang vang toa quanh mat", "goal": "nhan manh", "sync": ""}]
c = fx_lib.candidates_for(new, orientation="portrait")
check("mo ta giong -> co ung vien dung", [x["id"] for x in c.get("a", [])][:1] == [id_rays], c.get("a"))
check("transform chi so voi transform", all(x["kind"] == "transform" for x in c.get("b", [])) and c.get("b"), c.get("b"))
check("mo ta khac han -> khong ung vien", "c" not in c, c.get("c"))
check("do dai lech qua xa (5.9s vs 1.5s) -> khong ung vien", "d" not in c, c.get("d"))
check("bo ung vien sinh tu chinh du an", id_rays not in [x["id"] for x in fx_lib.candidates_for(new, "portrait", exclude_project="p2").get("a", [])])
cf = fx_lib.candidates_for([{"id": "e", "kind": "overlay", "src_start": 0, "src_end": 1.4, "visual": "vong tron trang bao quanh mat",
                             "goal": "dan mat", "sync": ""}], orientation="portrait", has_face=False)
check("video khong co mat -> bo hieu ung needs_face", id_face not in [x["id"] for x in cf.get("e", [])], cf)
check("khung ngang: bo hieu ung chi chay khung doc",
      id_fixed not in [x["id"] for v in fx_lib.candidates_for(new + [dict(new[0], id="f", visual="o vuong goc tren")], "landscape").values() for x in v])
fx_lib._update(id_rays, lambda e: e.update(disabled=True))
check("hieu ung bi tat -> khong goi y", "a" not in fx_lib.candidates_for(new[:1], orientation="portrait") or
      id_rays not in [x["id"] for x in fx_lib.candidates_for(new[:1], orientation="portrait")["a"]])
fx_lib._update(id_rays, lambda e: e.update(disabled=False))
view = fx_lib.prompt_view(fx_lib.get(id_rays))
check("ung vien gui AI: co code, khong duong dan / du an", view["code"] == RAYS and "projects" not in view and "context" not in json.dumps(view))

print("[3] FX-code: kho trong -> payload + khoa cache y nhu truoc; co ung vien -> dung lai / sua nhe")
CALLS = []
REPLY = {}


def fake_plan_chat(messages, **k):
    CALLS.append({"step": k.get("step_label"), "system": messages[0]["content"], "user": json.loads(messages[1]["content"])})
    return json.dumps(REPLY.get(k.get("step_label")) or {"effects": []})


providers.plan_chat = fake_plan_chat
KEYS = []


def step(name, payload, fn):
    KEYS.append((name, json.loads(json.dumps(payload))))
    return fn()


moments = [{"id": "m1", "source_id": "source_1", "src_start": 0, "src_end": 10}]
plan_res = {"effects": [{"id": "fx1", "moment": "m1", "kind": "overlay", "source_id": "source_1", "src_start": 1, "src_end": 2.4,
                         "context": "nguoi noi tiet lo ket qua sau 7 ngay", "goal": "nhan manh khoanh khac bat ngo cua ket qua",
                         "why_fit": "tia sang toa ra dung luc noi 'that su' lam ket qua noi bat",
                         "visual": "nhung tia sang mau vang toa quanh khuon mat nguoi noi, hien dan roi tat",
                         "colors": ["#00ffcc"], "intensity": 0.6}]}
faces = {"source_1": {"cx": 0.5, "cy": 0.4, "w": 0.3, "h": 0.2}}

# kho trong -> so voi luot goi khi KHONG co kho
home_lib = fx_lib.FX_LIB
shutil.move(home_lib, home_lib + ".off")
REPLY["FX-code"] = {"effects": [{"id": "fx1", "fit_check": {"ok": True, "reason": "hop"}, "code": RAYS}]}
CALLS.clear(); KEYS.clear()
out0 = fx_flow.build_effects(plan_res, moments, faces, {}, step=step, changes=[], project="pX")
sys0, user0, key0 = CALLS[0]["system"], CALLS[0]["user"], KEYS[0][1]
check("kho trong: khong gui kho_ung_vien", "kho_ung_vien" not in json.dumps(user0))
check("kho trong: system prompt khong co phan dung lai", "KHO HIEU UNG DA CO" not in sys0)
check("kho trong: khoa cache khong co 'kho'", "kho" not in key0 and set(key0) == {"fx", "v"}, list(key0))
check("kho trong: hieu ung viet moi binh thuong", len(out0) == 1 and out0[0]["code"] == RAYS and "lib" not in out0[0])
shutil.move(home_lib + ".off", home_lib)

# co ung vien -> AI dung nguyen
REPLY["FX-code"] = {"effects": [{"id": "fx1", "fit_check": {"ok": True, "reason": "ung vien ve dung tia sang quanh mat"},
                                 "reuse": id_rays, "params": {"colors": ["#ff00aa"], "intensity": 0.9}}]}
CALLS.clear(); KEYS.clear()
ch = []
emitted = []
out1 = fx_flow.build_effects(plan_res, moments, faces, {}, step=step, changes=ch, project="pX",
                             emit=lambda m, lvl, o: emitted.append(m))
u1 = CALLS[0]["user"]["effects"][0]
check("co ung vien: gui kho_ung_vien kem code", u1.get("kho_ung_vien") and u1["kho_ung_vien"][0]["lib_id"] == id_rays
      and u1["kho_ung_vien"][0]["code"] == RAYS, u1.get("kho_ung_vien"))
check("co ung vien: system prompt them phan dung lai", "KHO HIEU UNG DA CO" in CALLS[0]["system"])
check("co ung vien: khoa cache them ung vien + van tay prompt", "kho" in KEYS[0][1] and KEYS[0][1]["kho"]["p"] == fx_lib.prompt_fp())
check("dung nguyen: code lay tu kho", len(out1) == 1 and out1[0]["code"] == RAYS and out1[0]["lib"]["mode"] == "reuse", out1)
check("dung nguyen: mau / cuong do theo video moi", out1[0]["params"] == {"colors": ["#ff00aa"], "intensity": 0.9}, out1[0].get("params"))
check("nhat ky bao dung lai", emitted and "dùng lại nguyên" in emitted[0], emitted)

# AI tra id khong nam trong ung vien -> bo (khong lay code bay)
REPLY["FX-code"] = {"effects": [{"id": "fx1", "fit_check": {"ok": True}, "reuse": "fx-000000000000"}]}
ch = []
out2 = fx_flow.build_effects(plan_res, moments, faces, {}, step=step, changes=ch, project="pX")
check("reuse id la -> bo hieu ung + ghi ly do", not out2 and any("khong nam trong ung vien" in x for x in ch), ch)

# sua nhe
ADAPT = RAYS.replace("range(12)", "range(16)")
REPLY["FX-code"] = {"effects": [{"id": "fx1", "fit_check": {"ok": True}, "from": id_rays, "code": ADAPT}]}
out3 = fx_flow.build_effects(plan_res, moments, faces, {}, step=step, changes=[], project="pX")
check("sua nhe: code moi + lib adapt", out3 and out3[0]["code"] == ADAPT and out3[0]["lib"] == {"id": id_rays, "mode": "adapt",
                                                                                                    "name": ""}, out3)
r5 = fx_lib.harvest(out3, project="pY", orientation="portrait")
check("dong goi ban sua -> muc moi co parent", r5["added"] and fx_lib.get(r5["added"][0])["parent"] == id_rays, r5)
r6 = fx_lib.harvest(out1, project="pZ", orientation="portrait")
check("dong goi ban dung nguyen -> chi tang lan dung muc goc", not r6["added"] and r6["reused"] == [id_rays]
      and fx_lib.get(id_rays)["uses"] == 3, (r6, fx_lib.get(id_rays)["uses"]))

# FX-fix sua code kho -> thanh bien the
REPLY["FX-code"] = {"effects": [{"id": "fx1", "fit_check": {"ok": True}, "reuse": id_rays}]}
fx_lib.load_code  # noqa
orig_load = fx_lib.load_code
fx_lib.load_code = lambda fid: BROKEN if fid == id_rays else orig_load(fid)
REPLY["FX-fix"] = {"effects": [{"id": "fx1", "code": RAYS.replace("range(12)", "range(9)")}]}
out4 = fx_flow.build_effects(plan_res, moments, faces, {}, step=step, changes=[], project="pX")
fx_lib.load_code = orig_load
check("code kho loi o video moi -> FX-fix sua -> lib thanh adapt", out4 and out4[0]["lib"]["mode"] == "adapt", out4)

print("[4] Preview + Gemini nhan + viec nen")
pend = fx_lib.pending_work()
check("muc moi cho preview", id_rays in pend["preview"] and not pend["label"])
job = fx_lib.preview_job(id_rays)
check("preview_job: khung ve san + spec FxPreview", job["ok"] and job["spec"]["fx"] and os.path.isfile(job["spec"]["fx"][0]["file"])
      and job["out"].endswith("preview.mp4"), job)
jt = fx_lib.preview_job(fx_lib.code_id("transform", SHAKE))
check("preview transform: so tung khung", jt["ok"] and jt["spec"]["fxTransforms"] and jt["spec"]["fxTransforms"][0]["values"].get("x"), jt)
with open(job["out"], "wb") as fh:
    fh.write(b"\x00\x00\x00\x18ftypmp42fake")
fx_lib.set_preview(id_rays, True)
check("co preview -> cho Gemini", id_rays in fx_lib.pending_work()["label"])
SENT = []


def fake_gemini(items, prompt, step_label, log=None):
    SENT.append((items, prompt, step_label))
    return {"effects": [{"id": items[0]["label"].split("|")[0].split("=")[1].strip(), "name": "Tia sang toa quanh mat",
                         "summary": "12 tia sang vang toa quanh mat", "use_when": "khi tiet lo ket qua", "tags": ["tia sang", "mat"],
                         "energy": "vua", "quality": 4}]}


def gemini_down(items, prompt, step_label, log=None):
    raise RuntimeError("Antigravity CLI chua dang nhap")


providers.gemini_files = gemini_down
ld = fx_lib.label([id_rays])
check("Gemini loi chung -> stop, KHONG danh dau loi tung muc (lan sau tu thu lai)",
      ld["stop"] and not ld["labeled"] and (fx_lib.get(id_rays)["state"] or {}).get("label") is None
      and id_rays in fx_lib.pending_work()["label"], (ld, fx_lib.get(id_rays)["state"]))
providers.gemini_files = fake_gemini
lr = fx_lib.label([id_rays])
check("Gemini nhan -> luu nhan", lr["labeled"] == [id_rays] and fx_lib.get(id_rays)["label"]["name"] == "Tia sang toa quanh mat", lr)
check("gui Gemini: preview + thiet ke, step Gemini-fx", SENT and SENT[0][2] == "Gemini-fx" and SENT[0][0][0]["path"].endswith("preview.mp4"))
check("co nhan + chat luong >= 3 -> cho gui kho chung", id_rays in fx_lib.pending_work()["share"])
pl = fx_lib.share_payload(id_rays)
check("goi kho chung: khong design / du an / loi noi", pl and "design" not in pl["meta"] and "projects" not in pl["meta"]
      and "chong nang" not in json.dumps(pl["meta"]), pl and pl["meta"])
fx_lib.set_share(id_rays, "pending")
check("da gui -> het viec", id_rays not in fx_lib.pending_work()["share"])
c2 = fx_lib.candidates_for([{"id": "g", "kind": "overlay", "src_start": 0, "src_end": 1.5, "visual": "tia sang mat", "goal": "tiet lo ket qua",
                             "sync": ""}], orientation="portrait")
check("nhan Gemini giup tim ung vien", id_rays in [x["id"] for x in c2.get("g", [])], c2)
fx_lib._update(id_rays, lambda e: e["label"].update(quality=1))
check("chat luong 1 -> khong goi y dung lai", id_rays not in [x["id"] for v in fx_lib.candidates_for(new[:1], "portrait").values() for x in v])
fx_lib._update(id_rays, lambda e: e["label"].update(quality=4))

print("[5] Dong bo kho chung")
src = tempfile.mkdtemp()
SHARED = RAYS.replace("0.9", "0.7")
sid = fx_lib.code_id("overlay", SHARED)
open(os.path.join(src, "code.js"), "w").write(SHARED)
open(os.path.join(src, "preview.mp4"), "wb").write(b"fakevideo")


def sha(p):
    import hashlib
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def dl(url, dest, s=None):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy(url, dest)
    if s and sha(dest) != s:
        os.remove(dest)
        raise RuntimeError("SHA-256 khong khop")


def entry(fid, code_path, kind="overlay"):
    return {"id": fid, "kind": kind, "duration": 1.5, "works": {"portrait": True, "landscape": True},
            "label": {"name": "Tia chung", "summary": "tia sang", "quality": 4},
            "files": [{"path": "code.js", "sha256": sha(code_path), "url": code_path},
                      {"path": "preview.mp4", "sha256": sha(os.path.join(src, "preview.mp4")), "url": os.path.join(src, "preview.mp4")}]}


m = fx_lib.merge_shared([entry(sid, os.path.join(src, "code.js")), entry(id_rays, os.path.join(src, "code.js"))], dl)
check("muc chung moi -> them", m["added"] == 1 and fx_lib.get(sid)["origin"] == "shared" and fx_lib.load_code(sid) == SHARED, m)
check("muc cua chinh may nay -> chi danh dau da duyet, khong ghi de",
      fx_lib.get(id_rays)["origin"] == "local" and fx_lib.get(id_rays)["state"]["share"] == "approved" and fx_lib.load_code(id_rays) == RAYS)
bad = tempfile.mkdtemp()
open(os.path.join(bad, "code.js"), "w").write("function render(ctx){ return null }")
fake_id = "fx-" + "1" * 12
m2 = fx_lib.merge_shared([entry(sid, os.path.join(src, "code.js")), entry(fake_id, os.path.join(bad, "code.js"))], dl)
check("code khong khop id -> tu choi, khong luu", fx_lib.get(fake_id) is None and any(fake_id in e for e in m2["errors"]), m2)
m3 = fx_lib.merge_shared([], dl)
check("quan tri go khoi kho chung -> xoa o may nay (muc local giu nguyen)", m3["removed"] == 1 and fx_lib.get(sid) is None
      and fx_lib.get(id_rays) is not None, m3)

print("[6] Prompt moi KHONG doi van tay chung (khong lam moi du an chay lai)")
ids = {p["id"]: p for p in prompt_store.PROMPTS}
check("_FX_REUSE_NOTE + _GEMINI_FX_PROMPT co own_key", ids["_FX_REUSE_NOTE"].get("own_key") and ids["_GEMINI_FX_PROMPT"].get("own_key"))
fp1 = prompt_store.fingerprint()
prompt_store.save("prompt", "_FX_REUSE_NOTE", fx_lib._FX_REUSE_NOTE + "\n(sua thu)")
prompt_store.save("prompt", "_GEMINI_FX_PROMPT", fx_lib._GEMINI_FX_PROMPT + "\n(sua thu)")
check("sua prompt kho -> van tay chung giu nguyen", prompt_store.fingerprint() == fp1)
check("sua prompt dung lai -> doi khoa rieng FX-code", fx_lib.prompt_fp() != fx_lib.hashlib.sha1(fx_lib._FX_REUSE_NOTE.encode()).hexdigest()[:12])
prompt_store.reset("prompt", "_FX_REUSE_NOTE")
prompt_store.reset("prompt", "_GEMINI_FX_PROMPT")

print()
if FAILED:
    print("FAILED %d: %s" % (len(FAILED), ", ".join(FAILED)))
    sys.exit(1)
print("ALL OK")
