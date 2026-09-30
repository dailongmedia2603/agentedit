#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HIEU UNG TU VIET (2026-09-27; luong duy nhat tu 2026-09-28): hieu ung tu de xuat theo BOI CANH + tu viet code, chay trong hop cach ly.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_fx_flow.py      (can ffmpeg + node)
AI gia lap o providers._chat theo step_label; hop cach ly (fx_runtime.mjs) chay THAT bang node.
"""
import os
import sys
import json
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(ROOT)
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import fx_flow          # noqa: E402
import providers        # noqa: E402
import prompt_store     # noqa: E402
import remotion_plan    # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


GOOD = ("function render(ctx){ const k = env(ctx.t, ctx.d, 0.15, 0.3); const f = ctx.face || {x: 540, y: 800, w: 300, h: 380};"
        " return h('svg', {width: ctx.W, height: ctx.H, viewBox: `0 0 ${ctx.W} ${ctx.H}`}, ...range(10).map(i => {"
        " const [x1, y1] = polar(f.x, f.y, f.w, i / 10 * Math.PI * 2); const [x2, y2] = polar(f.x, f.y, f.w * 1.5, i / 10 * Math.PI * 2);"
        " return h('line', {x1, y1, x2, y2, stroke: alpha('#FF6FA3', 0.8 * k), 'stroke-width': 4}) })) }")
SHAKE = "function transform(ctx){ const k = env(ctx.t, ctx.d, 0.05, 0.2); return {x: noise(ctx.t * 30, 1) * 14 * k, scale: 1 + 0.05 * k}; }"

exe, _env = fx_flow.node_bin()
check("co Node / Electron de chay hop cach ly", bool(exe), exe)

print("[1] Hop cach ly: kiem + chan code nguy hiem")
res = fx_flow.run_runtime("check", [
    {"id": "g", "kind": "overlay", "code": GOOD, "duration": 1.2, "fps": 30, "W": 1080, "H": 1920},
    {"id": "s", "kind": "transform", "code": SHAKE, "duration": 0.8, "fps": 30, "W": 1080, "H": 1920},
    {"id": "txt", "kind": "overlay", "code": "function render(ctx){ return h('svg', {}, 'CHỮ') }", "duration": 1, "fps": 30},
    {"id": "rnd", "kind": "overlay", "code": "function render(ctx){ return h('rect', {width: Math.random()}) }", "duration": 1, "fps": 30},
    {"id": "esc", "kind": "overlay", "code": "function render(ctx){ var k='constr'+'uctor'; ({})[k][k]('return 1')(); return null }",
     "duration": 1, "fps": 30},
    {"id": "loop", "kind": "overlay", "code": "function render(ctx){ for(;;){} }", "duration": 1, "fps": 30},
    {"id": "img", "kind": "overlay", "code": "function render(ctx){ return h('svg', {}, h('image', {href: 'file:///etc/passwd'})) }",
     "duration": 1, "fps": 30},
    {"id": "url", "kind": "overlay", "code": "function render(ctx){ return h('rect', {fill: 'url(http://x/y)'}) }", "duration": 1, "fps": 30},
])
check("hieu ung dung -> dat", res["g"]["ok"] and res["s"]["ok"], (res["g"], res["s"]))
for k, why in (("txt", "chu"), ("rnd", "random"), ("esc", "code generation"), ("loop", "timed out"), ("img", "image"), ("url", "url")):
    check("chan %s" % k, not res[k]["ok"] and why.lower() in " ".join(res[k]["errors"]).lower(), res[k])

res_av = fx_flow.run_runtime("check", [{"id": "av", "kind": "overlay", "duration": 1, "fps": 30, "W": 1080, "H": 1920,
    "avoid": [{"x": 100, "y": 200, "w": 400, "h": 120, "text": "KHONG PHAI"}],
    "code": "function render(ctx){ const a = ctx.avoid[0]; return h('svg', {width: ctx.W, height: ctx.H}, h('rect', {x: a.x + a.w + 20, y: a.y, width: 50, height: 50, fill: '#fff'})) }"}])
check("code doc duoc ctx.avoid (vung chu that) de ne chu", res_av["av"]["ok"], res_av["av"])

print("\n[2] FX-plan: chi giu hieu ung CO boi canh + muc tieu + ly do + mo ta, neo dung khoanh khac")
moments = [{"id": "m1", "source_id": "source_1", "src_start": 0.0, "src_end": 5.8},
           {"id": "m2", "source_id": "source_1", "src_start": 8.0, "src_end": 13.9}]
full = {"context": "co ay dang chat van 'lay cai gi cam ket' voi giong buc xuc", "goal": "nguoi xem cam nhan cu soc",
        "why_fit": "vet toa tu mat nhan manh cam xuc buc xuc dung luc chat van", "visual": "12 vet hong mo toa tu tam mat, bung ra roi tat"}
ch = []
out = fx_flow.sanitize_plan({"effects": [
    dict(full, id="a", kind="overlay", layer="behind", source_id="source_1", src_start=1.0, src_end=2.2, colors=["#FF6FA3"], sfx="boom"),
    dict(id="thieu", kind="overlay", source_id="source_1", src_start=1.0, src_end=2.0, visual="vet sang dep"),
    dict(full, id="ngoai", kind="overlay", source_id="source_1", src_start=6.2, src_end=7.5),
    dict(full, id="t1", kind="transform", source_id="source_1", src_start=9.0, src_end=9.8),
    dict(full, id="t2", kind="transform", source_id="source_1", src_start=9.5, src_end=10.2),
    dict(full, id="dai", kind="overlay", source_id="source_1", src_start=8.0, src_end=20.0),
    dict(full, id="t_hook", kind="transform", source_id="source_1", src_start=9.2, src_end=9.9, anchor="hook"),
]}, moments, ch)
ids = [e["id"] for e in out]
check("giu hieu ung du ly do", "a" in ids and out[0]["layer"] == "behind" and out[0]["sfx"] == "boom", out[:1])
check("thieu boi canh / muc tieu -> bo", "thieu" not in ids and any("thieu" in c for c in ch), ch)
check("ngoai khoanh khac con tren timeline -> bo", "ngoai" not in ids, ids)
check("2 transform chong nhau -> bo cai sau", "t1" in ids and "t2" not in ids, ids)
check("transform o BAN SAO hook khong tinh chong voi doan goc trong than video", "t_hook" in ids, ids)
check("qua dai -> cat con toi da", next(e for e in out if e["id"] == "dai")["src_end"] - 8.0 <= fx_flow.MAX_FX_SEC + 1e-6, out)

print("\n[3] FX-code + tu kiem lan 2 + sua loi 1 luot (AI gia lap)")
GOI = []


def fake_plan_chat(messages, **k):
    lab = k.get("step_label")
    user = json.loads(messages[-1]["content"])
    GOI.append((lab, user))
    if lab == "FX-code":
        rows = []
        for e in user["effects"]:
            if e["id"] == "a":
                rows.append({"id": "a", "fit_check": {"ok": True, "reason": "hop"}, "code": "function render(ctx){ return h('text', {}, 'X') }"})
            elif e["id"] == "t1":
                rows.append({"id": "t1", "fit_check": {"ok": True, "reason": "hop"}, "code": SHAKE})
            else:
                rows.append({"id": e["id"], "fit_check": {"ok": False, "reason": "khong hop loi noi"}})
        return json.dumps({"effects": rows})
    if lab == "FX-fix":
        return json.dumps({"effects": [{"id": e["id"], "fit_check": {"ok": True}, "code": GOOD} for e in user["effects"]]})
    return "{}"


providers.plan_chat = fake_plan_chat
steps = []


def step(name, payload, fn):
    steps.append(name)
    return fn()


ch = []
done = fx_flow.build_effects({"effects": [dict(full, id="a", kind="overlay", source_id="source_1", src_start=1.0, src_end=2.2),
                                          dict(full, id="t1", kind="transform", source_id="source_1", src_start=9.0, src_end=9.8),
                                          dict(full, id="lac", kind="overlay", source_id="source_1", src_start=10.0, src_end=11.0)]},
                             moments, {"source_1": {"cx": 0.5, "cy": 0.4, "w": 0.35, "h": 0.25}}, {}, step, ch)
got = {e["id"]: e for e in done}
check("AI tu kiem lan 2 thay khong hop -> bo", "lac" not in got and any("KHONG hop" in c for c in ch), ch)
check("code loi (ve chu) -> gui AI sua -> dat", "a" in got and got["a"]["code"] == GOOD and "FX-fix" in steps, (steps, got.get("a")))
check("FX-fix nhan dung loi can sua", any(lab == "FX-fix" and user["effects"][0].get("loi_can_sua") for lab, user in GOI))
check("transform dat ngay", "t1" in got and got["t1"]["code"] == SHAKE)
check("hieu ung giu boi canh / muc tieu / ly do", all(got[k].get("context") and got[k].get("goal") and got[k].get("why_fit") for k in got))

print("\n[4] Dung: ve khung tung hieu ung vao spec (cache theo code + do dai + vi tri mat)")
TMP = tempfile.mkdtemp(prefix="fx-")
SRC = os.path.join(TMP, "a.mp4")
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                "testsrc=size=360x640:rate=30:duration=14", "-f", "lavfi", "-i", "sine=frequency=440:duration=14", "-shortest",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", SRC], check=True)
plan = {"engine": "remotion", "source_videos": [{"id": "source_1", "path": SRC, "duration": 14.0}],
        "segments": [{"source_id": "source_1", "start": 0.0, "end": 5.8, "target_start": 0.0},
                     {"source_id": "source_1", "start": 8.0, "end": 13.9, "target_start": 5.8}],
        "faces": {"source_1": {"cx": 0.5, "cy": 0.4, "w": 0.35, "h": 0.25}},
        "captions": [], "audio": [], "speech": [], "fx": done}
spec, rep = remotion_plan.build_spec(plan)
fx = spec.get("fx") or []
check("lop phu vao spec.fx voi file khung", len(fx) == 1 and os.path.isfile(fx[0]["file"]) and fx[0]["layer"] in ("front", "behind"), fx)
if fx:
    data = json.load(open(fx[0]["file"]))
    check("file khung: moi khung co SVG da loc", data["n"] == round((fx[0]["end"] - fx[0]["start"]) * 30)
          and data["frames"] and data["frames"][0].startswith("<svg") and "<script" not in "".join(data["frames"]), data.get("n"))
    check("gio timeline dung (1.0-2.2 nguon -> 1.0-2.2)", abs(fx[0]["start"] - 1.0) < 0.05, fx[0])
tr = spec.get("fxTransforms") or []
check("transform vao spec.fxTransforms (so tung khung)", len(tr) == 1 and "x" in tr[0]["values"] and "scale" in tr[0]["values"], tr)
check("transform: gio nguon 9.0 -> timeline 6.8", tr and abs(tr[0]["start"] - 6.8) < 0.05, tr)
spec_av = {"width": 1080, "height": 1920, "captions": [], "layers": [
    {"id": "L1", "type": "text", "start": 0.5, "end": 3.0, "x": 0.5, "y": 0.2, "spans": [{"text": "KHÔNG PHẢI", "size": 120}]},
    {"id": "L2", "type": "text", "start": 5.0, "end": 6.0, "x": 0.5, "y": 0.7, "spans": [{"text": "khác giờ", "size": 80}]}]}
av = fx_flow._avoid_in_spec(spec_av, 1.0, 2.2, 1080, 1920)
check("vung tranh = chu THAT dang hien dung luc hieu ung (px)", len(av) == 1 and av[0]["text"].startswith("KH") and av[0]["w"] > 100, av)
spec2, _ = remotion_plan.build_spec(plan)
check("dung lai -> dung cache, cung ket qua", (spec2.get("fx") or [{}])[0].get("file") == (fx or [{}])[0].get("file"))
plan_old = dict(plan, fx=[])
spec_old, _ = remotion_plan.build_spec(plan_old)
check("plan cu / khong co fx -> spec khong co fx", not spec_old.get("fx") and not spec_old.get("fxTransforms"))

print("\n[5] Prompt dang ky + nhan manh boi canh")
ids_ps = {x["id"] for x in prompt_store.PROMPTS}
check("_FX_PLAN_SYSTEM / _FX_CODE_SYSTEM dang ky", {"_FX_PLAN_SYSTEM", "_FX_CODE_SYSTEM"} <= ids_ps)
check("FX-plan bat buoc context -> goal -> why_fit -> visual", all(k in fx_flow._FX_PLAN_SYSTEM for k in ("context", "goal", "why_fit", "visual", "DUNG NGU CANH")))
check("FX-code co tu kiem lan 2", "fit_check" in fx_flow._FX_CODE_SYSTEM)

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
