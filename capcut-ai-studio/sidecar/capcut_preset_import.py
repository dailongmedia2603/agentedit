"""Chuyen preset CapCut (My presets -> Combination) thanh mau chu dong cho Kho Text.

Chay o may tac gia (can CapCut + goi hieu ung da tai):
    python sidecar/capcut_preset_import.py "<thu muc preset>" <thu muc mau ra> [--id ID] [--name TEN]

Doc draft_content.json cua preset (clip ghep long nhau), goi hieu ung Lumi (LumiExportData.lua) va sinh
template.json (xem remotion-src/textTemplate/spec.ts) + chep font / am thanh / anh matte vao thu muc mau.
Chu trong preset chi la CHU MAU (slot) — khi dung that, slot nhan chu tu loi noi.
Hieu ung chua ho tro -> bao loi ro rang (khong ve gan dung trong im lang).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import sys

US = 1_000_000.0  # CapCut luu thoi gian bang micro giay
PROJECT_CANVAS = (1080, 1920)  # khung mau (project doc 9:16)
LINE_PER_SIZE = 6.21  # KHOP TextTemplate DEFAULT_TUNE.linePerSize (chieu cao dong px / 1 don vi size @1080)


# ---------------------------------------------------------------- Lua table (LumiExportData.lua)

class _LuaParser:
    """Doc bang Lua kieu du lieu (so, chuoi, true/false, bang, Amaz.Vector*/Color(...))."""

    def __init__(self, s: str):
        self.s = s
        self.i = 0

    def ws(self):
        s = self.s
        while self.i < len(s):
            if s[self.i].isspace():
                self.i += 1
            elif s.startswith("--", self.i):
                j = s.find("\n", self.i)
                self.i = len(s) if j < 0 else j + 1
            else:
                break

    def value(self):
        self.ws()
        s = self.s
        c = s[self.i]
        if c == "{":
            return self.table()
        if c in "\"'":
            j = s.index(c, self.i + 1)
            v = s[self.i + 1:j]
            self.i = j + 1
            return v
        m = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?").match(s, self.i)
        if m:
            self.i = m.end()
            return float(m.group(0))
        m = re.compile(r"[A-Za-z_][\w.]*").match(s, self.i)
        if m:
            word = m.group(0)
            self.i = m.end()
            if word == "true":
                return True
            if word == "false":
                return False
            if word == "nil":
                return None
            self.ws()
            if self.i < len(s) and s[self.i] == "(":  # Amaz.Vector3f(1, 2, 3)
                self.i += 1
                args = []
                while True:
                    self.ws()
                    if s[self.i] == ")":
                        self.i += 1
                        break
                    args.append(self.value())
                    self.ws()
                    if s[self.i] == ",":
                        self.i += 1
                return args
            return word
        raise ValueError(f"Lua: khong doc duoc tai {self.i}: {s[self.i:self.i + 40]!r}")

    def table(self):
        s = self.s
        self.i += 1
        arr, d = [], {}
        while True:
            self.ws()
            if s[self.i] == "}":
                self.i += 1
                break
            if s[self.i] == "[":
                self.i += 1
                k = self.value()
                self.ws()
                self.i += 1  # ]
                self.ws()
                self.i += 1  # =
                d[k] = self.value()
            else:
                m = re.compile(r"([A-Za-z_]\w*)\s*=(?!=)").match(s, self.i)
                if m:
                    self.i = m.end()
                    d[m.group(1)] = self.value()
                else:
                    arr.append(self.value())
            self.ws()
            if self.i < len(s) and s[self.i] in ",;":
                self.i += 1
        return d if d and not arr else (arr if not d else {**{i + 1: v for i, v in enumerate(arr)}, **d})


def read_lumi_export(effect_dir: str) -> dict:
    """Doc cac bang `local ae_xxx = {...}` trong LumiExportData.lua cua goi hieu ung."""
    path = None
    for root, _dirs, files in os.walk(effect_dir):
        if "LumiExportData.lua" in files:
            path = os.path.join(root, "LumiExportData.lua")
            break
    if not path:
        raise ValueError(f"Goi hieu ung khong co LumiExportData.lua: {effect_dir}")
    src = open(path, encoding="utf-8").read()
    out = {"_dir": os.path.dirname(os.path.dirname(os.path.dirname(path)))}
    for m in re.finditer(r"local\s+(ae_\w+)\s*=\s*", src):
        p = _LuaParser(src)
        p.i = m.end()
        try:
            out[m.group(1)] = p.value()
        except Exception:
            pass
    return out


def _slider_apply(lumi: dict, sliders: dict[str, float]) -> dict:
    """LumiParamsSetter:updateSlider — tra ve {(entity, key): gia tri sau thanh truot} cho gia tri tinh (khong keyframe)."""
    attrs = lumi.get("ae_attribute", {})
    out: dict = {}
    for skey, infos in (lumi.get("ae_sliderInfos") or {}).items():
        if skey not in sliders:
            continue
        for info in infos:
            ent, key, typ, flags, calc, mx, mn, _default, va, vb = info[:10]
            s = sliders[skey] * (mx - mn) + mn
            cur = out.get((ent, key), attrs.get(ent, {}).get(key))
            if cur is None:
                continue

            def f(v, a, b):
                if calc == 0:
                    return (v - s) * a + b
                if calc == 1:
                    return (v - a) * s + b
                return (v - a) * b + s

            if typ == "number":
                new = f(cur, va[0], vb[0]) if flags[0] else cur
            else:
                new = list(cur)
                for d in range(len(new)):
                    if d < len(flags) and flags[d]:
                        new[d] = f(cur[d], va[d], vb[d])
            out[(ent, key)] = new
    return out


def _param(lumi: dict, after: dict, ent: str, key: str):
    return after.get((ent, key), lumi.get("ae_attribute", {}).get(ent, {}).get(key))


def _sliders_of(mat: dict) -> dict[str, float]:
    return {p["name"]: float(p.get("value", 0)) for p in mat.get("adjust_params") or []}


def _keys(lumi: dict, name: str):
    k = (lumi.get("ae_keyframes") or {}).get(name)
    if not k:
        return None
    return [[list(map(float, e[0])), [float(e[1][0]), float(e[1][1])], [list(map(float, v)) for v in e[2]],
             [int(x) for x in e[3]], [int(x) for x in e[4]]] for e in k]


# ---------------------------------------------------------------- hieu ung CapCut -> spec

def _effect_to_spec(mat: dict, start: float, duration: float, assets: dict, warn: list, seg: dict | None = None) -> list[dict]:
    """Mot vat lieu video_effects -> danh sach hieu ung spec (rong neu khong anh huong hinh)."""
    path = mat.get("path") or ""
    sliders = _sliders_of(mat)
    seek = os.path.join(path, "amazingfeature", "lua", "SeekModeScript.lua")
    seek_src = open(seek, encoding="utf-8").read().replace(" ", "") if os.path.exists(seek) else ""
    # CapCut "Mo chrome": nhoe huong tam (blurSize = effects_adjust_blur) + tach mau (offset = 0.32*x - 0.16)
    if "0.32*intensity-0.16" in seek_src and "VerticalAberration" in "".join(_walk_files(path)):
        if seg and seg.get("common_keyframes"):
            raise ValueError("Keyframe tren 'Mo chrome' chua ho tro")
        return [{"type": "chrome_blur", "blur": float(sliders.get("effects_adjust_blur", 0.25)),
                 "offset": 0.32 * float(sliders.get("effects_adjust_horizontal_chromatic", 0.55)) - 0.16}]
    # CapCut "Mo" (mo-hu): SeekModeScript dat blurSize = 4 * effects_adjust_blur cho 2 luot nhoe
    if os.path.exists(seek) and "4*intensity" in open(seek, encoding="utf-8").read().replace(" ", ""):
        frag = [f for f in _walk_files(path) if f.endswith(".frag") and "shaderGLES" in f]
        if len(frag) != 2 or not all("blurSize" in open(f, encoding="utf-8").read() for f in frag):
            raise ValueError(f"Hieu ung '{mat.get('name')}' giong 'Mo' nhung shader khac (chua ho tro)")
        eff = {"type": "blur", "start": start, "duration": duration, "value": float(sliders.get("effects_adjust_blur", 0))}
        for kf in (seg or {}).get("common_keyframes") or []:
            if kf.get("property_type") != "effects_adjust_blur":
                raise ValueError(f"Keyframe hieu ung {kf.get('property_type')} chua ho tro")
            eff["keyframes"] = _cc_keys({"common_keyframes": [dict(kf, property_type="KFTypeAlpha")]})["alpha"]
        return [eff]
    sprite = _sprite_effect(path, sliders, start, duration, assets) or _lut_seq_effect(path, sliders, start, duration, assets)
    if sprite:
        if seg and seg.get("common_keyframes"):
            raise ValueError(f"Keyframe tren hieu ung '{mat.get('name')}' chua ho tro")
        return [sprite]
    lumi = read_lumi_export(path)
    after = _slider_apply(lumi, sliders)
    attrs = lumi.get("ae_attribute", {})
    ents = set(attrs)
    glows = [e for e in ents if e.startswith("LumiDeepGlow_")]
    name = mat.get("name") or mat.get("resource_id")

    def glow_spec(ent: str) -> dict:
        g = lambda k, d=None: _param(lumi, after, ent, k) if _param(lumi, after, ent, k) is not None else d  # noqa: E731
        # ban moi (goi co GlowIter.lua): thuat toan khac -> deepGlow2. tint / tach mau chua ho tro
        v2 = g("glowIter") is not None
        if v2 and (g("tint") or g("ca")):
            raise ValueError(f"Hieu ung {name}: glow tint / tach mau chua ho tro")
        return {
            "type": "deep_glow",
            "radius": float(g("radius", 0)),
            "exposure": float(g("exposure", 0)),
            "glowIntensity": float(g("glowIntensity", 1)),
            "threshold": float(g("threshold", 0)),
            "thresholdSmooth": float(g("thresholdSmooth", 0)),
            "gammaValue": float(g("gammaValue", 2.2)),
            "gammaCorrect": bool(g("gammaCorrect", True)),
            "quality": float(g("quality", 0.5)),
            "unmult": bool(g("unmult", False)),
            "blendMode": "screen" if int(g("blendMode", 1)) == 1 else "add",
            "sourceOpacity": float(g("sourceOpacity", 1)),
            **({"glowIter": float(g("glowIter")), "stepsMult": float(g("stepsMult", 1)), "downSample": float(g("downSample", 1)),
                "ratio": float(g("ratio", 1)), "rotate": float(g("rotate", 0))} if v2 else {}),
        }

    # (1) Goi chi gom DeepGlow + lop blend (CapCut "Phat sang 2" / "Glow 2")
    if glows and all(e.startswith(("LumiDeepGlow_", "LumiLayer_")) for e in ents):
        return [glow_spec(glows[0])]

    # (2) Goi "trs + luma matte" (CapCut "May phat nhac 3"): chi ho tro khi cac nhanh phu da TAT boi thanh truot
    trs = [e for e in ents if e.startswith("LumiLayer_") and "-trs-matte" in e]
    if trs:
        ent = trs[0]
        info = attrs[ent]
        # cac nhanh phu phai khong anh huong hinh voi thanh truot hien tai
        post: list[dict] = []  # lop dieu chinh (Adjustment) TREN lop matte, theo thu tu lop trong goi
        for e in attrs:
            if e.startswith("LumiMotionBlur3D_"):
                for k in ("rotation_x", "rotation_z", "direction_x", "direction_y", "direction_z"):
                    if abs(float(_param(lumi, after, e, k) or 0)) > 1e-6:
                        raise ValueError(f"Hieu ung {name}: MotionBlur3D {k}≠0 chua ho tro")
                ry = float(_param(lumi, after, e, "rotation_y") or 0)
                piv = _param(lumi, after, e, "pivot") or [0.5, 0.5, 0]
                if abs(piv[0] - 0.5) > 1e-6 or abs(piv[1] - 0.5) > 1e-6:
                    raise ValueError(f"Hieu ung {name}: MotionBlur3D pivot lech tam chua ho tro")
                # keyframe thanh truot xoay (LE VIP2-20): moi moc -> goc rotation_y qua cong thuc thanh truot
                rkeys = None
                for kf in (seg or {}).get("common_keyframes") or []:
                    if kf.get("property_type") == "effects_adjust_rotate":
                        rows = _cc_keys({"common_keyframes": [dict(kf, property_type="KFTypeAlpha")]})["alpha"]
                        for r in rows:
                            val = _slider_apply(lumi, {**sliders, "effects_adjust_rotate": r[1]}).get((e, "rotation_y"))
                            r[1] = float(val if val is not None else ry)
                        rkeys = rows
                if abs(ry) > 1e-6 or rkeys:
                    # LE VIP2-03 "Player 3": thanh truot xoay -> xoay mat phang quanh truc doc, camera phoi canh fovx
                    # lop dieu chinh xoay quanh tam KHUNG (do tren LE VIP2-03: canh hop lech dung 0.07 nhu tam khung)
                    r3 = {"type": "rotate3d", "rotY": ry, "fovx": float(_param(lumi, after, e, "active_cam_fovx") or 39.6), "space": "canvas"}
                    if rkeys:
                        r3["keyframes"] = rkeys
                        r3["start"] = start
                    post.append(r3)
            if e.startswith("LumiDeepGlow_") and float(_param(lumi, after, e, "exposure") or 0) > 1e-6:
                post.append({**glow_spec(e), "space": "canvas"})
            if e.startswith("LumiLayer_") and "-trs-blend" in e:
                op_keys = _keys(lumi, f"{e}#opacity#number")
                op_after = after.get((e, "opacity"))
                if op_after is None or float(op_after) > 1e-6:
                    raise ValueError(f"Hieu ung {name}: lop texture {e} dang bat (chua ho tro)")
                _ = op_keys
            if e.startswith("LumiMotionBlur2D_") and not e.split("_")[1].startswith(ent.split("_")[1].split("-")[0]):
                pass
        # MotionBlur2D cua chinh lop (vd _27): vi tri/scale phai giu nguyen sau thanh truot
        layer_no = ent.split("_")[1].split("-")[0]
        mb_self = f"LumiMotionBlur2D_{layer_no}-effect0"
        if mb_self in attrs:
            pos = _param(lumi, after, mb_self, "position")
            sx = float(_param(lumi, after, mb_self, "scale_x") or 1)
            if pos and (abs(pos[0] - 0.5) > 1e-3 or abs(pos[1] - 0.5) > 1e-3) or abs(sx - 1) > 5e-3:
                raise ValueError(f"Hieu ung {name}: dich/phong lop chinh chua ho tro (pos={pos}, scale={sx})")
        eff = {
            "type": "ae_trs_matte",
            "start": start,
            "duration": duration,
            "speed": 1.0,
            "compSize": [float(v) for v in info.get("compositeSize", [1080, 1920])],
            "anchor": [float(info["anchorPoint"][0]), float(info["anchorPoint"][1])],
        }
        anim = lumi.get("ae_animationInfos") or {}
        if "effects_adjust_speed" in sliders and anim.get("speedInfo"):
            si = anim["speedInfo"]
            v = min(1.0, max(0.0, sliders["effects_adjust_speed"]))
            eff["speed"] = float(si[1]) + v * (float(si[2]) - float(si[1]))
        if int(anim.get("animationMode", 0)) not in (0, 1):
            raise ValueError(f"Hieu ung {name}: animationMode {anim.get('animationMode')} chua ho tro")
        p = _keys(lumi, f"{ent}#position#vector")
        if p:
            eff["position"] = p
        o = _keys(lumi, f"{ent}#opacity#number")
        if o:
            eff["opacity"] = o
        if info.get("hasMatte"):
            if info.get("matteMode") != "Luma":
                raise ValueError(f"Hieu ung {name}: matte {info.get('matteMode')} chua ho tro")
            # nguon matte: AnimSeq (anh) -> MotionBlur2D (phong to); doc ten anh tu main.scene
            seq = next((e for e in ents if e.startswith("LumiAnimSeqLoadAndCrop_") and e.split("_")[1].split("-")[0] != layer_no
                        and f"LumiMotionBlur2D_{e.split('_')[1].split('-')[0]}-effect1" in attrs), None)
            if not seq:
                raise ValueError(f"Hieu ung {name}: khong tim thay nguon matte")
            seq_no = seq.split("_")[1].split("-")[0]
            mb = f"LumiMotionBlur2D_{seq_no}-effect1"
            scene = open(os.path.join(lumi["_dir"], "main.scene"), "rb").read()
            imgs = re.findall(rb"resource/images/([\w\-. ]+\.png)", scene)
            mask_img = next((i.decode() for i in imgs if not i.startswith(b"LumiSolidColor")
                             and i.decode() in _scene_images_near(scene, seq)), None)
            if not mask_img:
                raise ValueError(f"Hieu ung {name}: khong doc duoc anh matte")
            seq_attr = attrs.get(seq, {})
            if int(seq_attr.get("cropType_9_16", 0)) != 0:
                raise ValueError(f"Hieu ung {name}: matte cropType khac Stretch chua ho tro")
            dur = (lumi.get("ae_durations") or {}).get(ent, {}).get("texDuration", {}).get("maskTex", [[0, 1e9]])
            src = os.path.join(lumi["_dir"], "resource", "images", mask_img)
            rel = f"assets/{mask_img}"
            assets[rel] = src
            eff["matte"] = {
                "image": rel,
                "scale": [float(_param(lumi, after, mb, "scale_x") or 1), float(_param(lumi, after, mb, "scale_y") or 1)],
                "active": [float(dur[0][0]), float(dur[0][1])],
            }
        return [eff] + post

    raise ValueError(f"Hieu ung CapCut '{name}' ({mat.get('effect_id') or mat.get('resource_id')}) chua ho tro")


def _sprite_effect(path: str, sliders: dict, start: float, duration: float, assets: dict) -> dict | None:
    """Hieu ung kieu CHUOI ANH (vd CapCut "Shockwave"): moi luot = AnimSeq (seq*/<ten>/*.png) tron len lop theo BLEND_MODE cua
    CenterCrop.frag (phu kieu cover giua khung), cuoi cung alphaOutput giu ALPHA cua lop (chi doi mau noi dung).
    Toc do: seekToTime(t * (0.5 + 1.5 * effects_adjust_speed)) (SeekModeScript.lua)."""
    af = os.path.join(path, "AmazingFeature")
    passes = []
    for xs, sq in (("xshader", "seq"), ("xshader_render1", "seq_render1")):
        frag = os.path.join(af, xs, "CenterCrop.frag")
        sdir = os.path.join(af, sq)
        if not (os.path.exists(frag) and os.path.isdir(sdir)):
            continue
        m = re.search(r"#define\s+BLEND_MODE\s+blend(\w+)", open(frag, encoding="utf-8").read())
        subs = [d for d in os.listdir(sdir) if os.path.isdir(os.path.join(sdir, d))]
        if not m or len(subs) != 1:
            raise ValueError(f"Hieu ung chuoi anh {path} khong doc duoc")
        mode = m.group(1).lower()
        if mode not in ("screen", "overlay", "add", "multiply", "normal"):
            raise ValueError(f"Hieu ung chuoi anh: blend {mode} chua ho tro")
        files = sorted(f for f in os.listdir(os.path.join(sdir, subs[0])) if f.endswith(".png"))
        key = os.path.basename(path.rstrip("/"))
        rel = f"assets/sprite-{key}-{sq}"
        for f in files:
            assets[f"{rel}/{f}"] = os.path.join(sdir, subs[0], f)
        passes.append({"dir": rel, "files": files, "blend": mode})
    if not passes:
        return None
    if not os.path.exists(os.path.join(af, "alphaOutput", "alphaOutput.frag")):
        raise ValueError(f"Hieu ung chuoi anh {path}: khong co alphaOutput (chua ho tro)")
    lua = open(os.path.join(af, "lua", "SeekModeScript.lua"), encoding="utf-8").read().replace(" ", "")
    if "time*(0.5+1.5*self.speedIntensity)" not in lua:
        raise ValueError(f"Hieu ung chuoi anh {path}: toc do khac (chua ho tro)")
    speed = float(sliders.get("effects_adjust_speed", 0.33))
    return {"type": "sprite_blend", "start": start, "duration": duration, "rate": 0.5 + 1.5 * speed, "fps": 30.0, "passes": passes}


def _lut_seq_effect(path: str, sliders: dict, start: float, duration: float, assets: dict) -> dict | None:
    """Hieu ung kieu "Flipped" (face_effect E/15): pass0 = LUT 8x8 (image/filter.png) x effects_adjust_filter; pass1 = chuoi
    anh seq/<ten> tron SCREEN (blend_1021) kieu cover, do mo 1; pass2 = mask NGUOI (tt_matting) — tren chu khong co nguoi
    -> bo qua. Giu alpha cua lop. Toc do: t * mix(0.25, 3.2, effects_adjust_speed), chuoi LAP."""
    af = os.path.join(path, "AmazingFeature")
    f0 = os.path.join(af, "xshader", "pass0.frag")
    f1 = os.path.join(af, "xshader", "pass1.frag")
    if not (os.path.exists(f0) and os.path.exists(f1)):
        return None
    if "lut8x8" not in open(f0, encoding="utf-8").read() or "C1 - (C1 - dst) * (C1 - src)" not in open(f1, encoding="utf-8").read():
        return None
    lua = open(os.path.join(af, "lua", "SeekModeScript.lua"), encoding="utf-8").read()
    if "MIN_SPEED = 0.25" not in lua or "MAX_SPEED = 3.2" not in lua:
        raise ValueError(f"Hieu ung {path}: toc do khac (chua ho tro)")
    sdir = os.path.join(af, "seq")
    subs = [d for d in os.listdir(sdir) if os.path.isdir(os.path.join(sdir, d))]
    if len(subs) != 1:
        raise ValueError(f"Hieu ung {path}: chuoi anh khong doc duoc")
    key = os.path.basename(path.rstrip("/"))
    files = sorted(f for f in os.listdir(os.path.join(sdir, subs[0])) if f.endswith(".png"))
    rel = f"assets/sprite-{key}-seq"
    for f in files:
        assets[f"{rel}/{f}"] = os.path.join(sdir, subs[0], f)
    lut = f"assets/lut-{key}.png"
    assets[lut] = os.path.join(af, "image", "filter.png")
    sp = float(sliders.get("effects_adjust_speed", 0.2))
    return {"type": "sprite_blend", "start": start, "duration": duration, "rate": 0.25 + (3.2 - 0.25) * sp, "fps": 30.0, "loop": True,
            "lut": {"image": lut, "intensity": float(sliders.get("effects_adjust_filter", 0))},
            "passes": [{"dir": rel, "files": files, "blend": "screen"}]}


def _walk_files(root: str) -> list[str]:
    return [os.path.join(r, f) for r, _d, fs in os.walk(root) for f in fs]


def _scene_images_near(scene: bytes, entity: str) -> list[str]:
    """Ten anh xuat hien trong khoi cua entity (main.scene nhi phan, doc theo thu tu chuoi)."""
    i = scene.find(entity.encode())
    if i < 0:
        return []
    nxt = re.compile(rb"Lumi[A-Za-z0-9]+_\d+-(?:effect\d|blend|trs)").search(scene, i + len(entity))
    chunk = scene[i: nxt.start() if nxt else len(scene)]
    return [m.decode() for m in re.findall(rb"resource/images/([\w\-. ]+\.png)", chunk)]


# Hoat anh chu CapCut co script MA HOA (.jsdat) -> khong doc duoc logic. Tham so DO bang cach khop voi video
# CapCut xuat that (xem PROJECT_OVERVIEW 13h). Khoa = resource_id.
KNOWN_CHAR_ANIMS = {
    # "Kich ban xuat hien": tung ky tu trai -> phai, truot tu duoi-phai vao + xoay, hien dan
    # do 2026-10-04 tren LE VIP5-04 (khong kerning): sai khac vung chu 10 khung dang chay 6.19 -> 3.27 / 255
    "7646372683759848724": {"type": "stagger_in", "overlap": 0.2375, "gap": 0.0535, "dx": -0.05, "dy": 0.8, "rotation": 0.0,
                            "scale": 0.925, "ease": [0.3125, 0.5, 0.3, 1.0], "alphaEnd": 0.625},
    # "Chu bat vao": hien lan luot tung ky tu trai -> phai (~2 ky tu / khung), moi ky tu mo vao ~2 khung
    # do 2026-10-06 tren LE VIP2-09 (mep hien 386 -> 744 px tu khung 3 -> 12, 19 ky tu / 0.5s)
    # "Mo dan nhu bong ma": tung ky tu theo thu tu "ngau nhien", nhoe -> ro + hien dan trong ~3 khung (0.2 duration)
    # do 2026-10-06 tren LE VIP2-18 "750 TỶ" (T khung 3, 7/5 khung 5, 0 khung 6, Ỷ khung 9 / 15 khung)
    "7642255434476309780": {"type": "stagger_in", "overlap": 0.2, "dx": 0.2, "dy": 0.0, "rotation": 0.0, "scale": 1.0,
                            "ease": [0.25, 0.1, 0.25, 1.0], "alphaEnd": 0.8, "blur": 0.12,
                            "starts": [0.33, 0.33, 0.4, 0.0, 0.2, 0.6], "startsMax": 0.6},
    # "Truot len" (ban studio, 7510...): tung ky tu troi len tu duoi, ky tu CUOI di truoc ~1.5 khung, tre 3 khung,
    # moi ky tu 14 khung ease (0.2, 0.5, 0.3, 1), hien dan 4 khung dau — do 2026-10-06 tren LE VIP2-15 "Có" / "gì"
    "7510071484618935568": {"type": "stagger_in", "overlap": 0.93, "gap": 0.1, "delay": 0.1, "reverse": True, "dx": 0.0, "dy": 1.75,
                            "rotation": 0.0, "scale": 1.0, "ease": [0.2, 0.5, 0.3, 1.0], "alphaEnd": 0.3},
    # "Truot vao": ca ky tu truot tu phai vao (~300 px o co mau), ky tu sau tre 0.2 khung, moi ky tu 7 khung ease (0.4, 0, 0.6, 1)
    # do 2026-10-06 tren LE VIP2-15 "VinHomes" (sai so vi tri ~7 px)
    "7646371686568250645": {"type": "stagger_in", "overlap": 0.467, "gap": 0.0133, "delay": -0.067, "dx": 3.2, "dy": 0.0,
                            "rotation": 0.0, "scale": 1.0, "ease": [0.4, 0.0, 0.6, 1.0], "alphaEnd": 0.3},
    # "Ha ngau nhien" (AnimScript.lua doc duoc): xao thu tu, buoc 1 - 0.905, roi tu tren xuong (150 don vi Amaz) ease
    # (0.0069, 0.0069, 0.42, 1), hien dan 13/30 dau. Do roi (em) do tren LE VIP2-11.
    "7231443875406025275": {"type": "stagger_in", "overlap": 1.0, "autoStep": 0.095, "shuffle": True, "dx": 0.0, "dy": -2.5,
                            "rotation": 0.0, "scale": 1.0, "ease": [0.0069, 0.0069, 0.42, 1.0], "alphaEnd": 0.433},
    # "School Trip": ky tu hien trai -> phai ~1.2 khung / ky tu, moi ky tu truot tu trai vao ~5 khung, tre 3 khung
    # do 2026-10-06 tren LE VIP2-08 "Khởi công" (0.867s)
    "7597009340931034375": {"type": "stagger_in", "overlap": 0.19, "gap": 0.046, "delay": 0.08, "dx": -0.6, "dy": 0.0,
                            "rotation": 0.0, "scale": 1.0, "ease": [0.2, 0.6, 0.3, 1.0], "alphaEnd": 0.3},
    # "Awkward Reunion": nua trai chu tu trai, nua phai tu phai cung luc chay vao giua, vuot ~14% roi dao dong ve (con lac)
    # do 2026-10-06 tren LE VIP2-10 "Bất Động Sản" (mep 2 nua theo tung khung, doi xung)
    "7613030850057260306": {"type": "stagger_in", "overlap": 1.0, "gap": 0.0, "dx": -2.05, "dy": 0.0, "rotation": 0.0, "scale": 1.0,
                            "ease": [0.0, 0.0, 1.0, 1.0], "alphaEnd": 0.0, "halves": True,
                            "curve": [1, 1, 0.72, 0.43, 0.22, 0.07, -0.035, -0.1, -0.135, -0.14, -0.135, -0.09, -0.065, -0.03, 0, 0]},
    "7648939575590538516": {"type": "stagger_in", "overlap": 0.13, "gap": 0.033, "dx": 0.0, "dy": 0.0, "rotation": 0.0,
                            "scale": 1.0, "ease": [0.0, 0.0, 1.0, 1.0], "alphaEnd": 1.0},
}


# Word-art (text_effect) — chi kieu "anh to + bong do": bong DO tren video LE VIP2-14 (dau "?" kim loai)
KNOWN_WORDART = {
    "7331667849066368262": {"shadow": {"color": [0.05, 0.05, 0.05], "alpha": 0.85, "distance": 3.2, "angle": -50.0, "smoothing": 0.004}},
}


# Chinh mau CapCut (brightness/contrast/highlight + color_curves): thuat toan khong cong khai -> mau RA DO tren video
# CapCut xuat that. Khoa = (chu ky thong so, mau vao RGB 0..255).
KNOWN_COLOR_ADJUST = {
    ('{"brightness": 1.0, "contrast": 1.0, "curves": {"blue": [], "green": [], "luma": [[0.0, 0.413], [1.0, 1.0]], "red": []}, "highlight": 1.0}',
     (0, 157, 0)): [0.80, 0.82, 0.76],  # do tren LE VIP5-09 (vung chu 18 -> 6.2 / 255 sau khi bo kerning)
}


def _color_sig(adj: dict, curves: dict | None) -> str:
    cv = None
    if curves:
        cv = {ch: [[round(p["anchor"]["x"], 3), round(p["anchor"]["y"], 3)] for p in curves.get(ch) or []]
              for ch in ("luma", "red", "green", "blue")}
    return json.dumps({**{k: round(v, 3) for k, v in sorted(adj.items())}, **({"curves": cv} if cv else {})}, sort_keys=True)


# Chinh mau CapCut: cong thuc chep tu shader goc (remotion-src/textTemplate/colorAdjust.ts). Loai can anh LUT / chua chep -> bao loi.
COLOR_ADJUST_TYPES = ("brightness", "contrast", "highlight", "saturation", "shadow", "temperature", "tone", "sharpen",
                      "light_sensation", "vignetting", "fade", "particle", "white", "black")
COLOR_ADJUST_OK = ("brightness", "contrast", "highlight", "saturation", "shadow", "white", "black", "light_sensation")
_ADJ_KEY = {"light_sensation": "light"}


def _curve_ctl(pts: list) -> list:
    """Diem duong cong draft {anchor, left_control, right_control} -> day diem bezier a0, r0, l1, a1, ... (curveLut.frag)."""
    out = []
    for i, p in enumerate(pts):
        if i > 0:
            out.append(p.get("left_control") or p["anchor"])
        out.append(p["anchor"])
        if i < len(pts) - 1:
            out.append(p.get("right_control") or p["anchor"])
    return [{"x": float(q["x"]), "y": float(q["y"])} for q in out]


def _wheel_uniforms(w: dict) -> dict:
    """primary_color_wheels (draft) -> uniform shader: kep [-1, 1] roi adjustLift / adjustGamma / adjustGain (SeekModeScript.lua)."""
    cl = lambda v: max(-1.0, min(1.0, float(v or 0)))  # noqa: E731
    lift = lambda v: v * 0.5 if v > 0 else v  # noqa: E731
    gamma = lambda v: 1 - v * 4 if v < 0 else 1 / (1 + v * 4)  # noqa: E731
    gamma_s = lambda v: 1 - v * 4 if v < 0 else 1 / (1 + v * v * 4)  # noqa: E731
    gain = lambda v: 1 + v * 0.999 if v < 0 else 1 + v * v * 4  # noqa: E731
    gain_s = lambda v: 1 + v * 0.999 if v < 0 else 1 + v * v * 2  # noqa: E731
    keys = ("luma", "red", "green", "blue")
    L, G, A, O = (w.get(n) or {} for n in ("lift", "gamma", "gain", "offset"))
    return {"op": "wheel", "intensity": cl(w.get("intensity", 1)),
            "lift": [lift(cl(L.get(c))) for c in keys] + [cl(L.get("saturation")) * 0.5],
            "gamma": [gamma(cl(G.get(c))) for c in keys] + [gamma_s(cl(G.get("saturation")))],
            "gain": [gain(cl(A.get(c))) for c in keys] + [gain_s(cl(A.get("saturation")))],
            # LumaMix = 0 (do: vet do LE VIP2-18 thanh vang (1, .76, 0); chu 06 trung vi (53, 159, 255) vs CapCut (52, 168, 252);
            # LumaMix 1 cho ra do / xanh nhat sai)
            "offset": [cl(O.get(c)) for c in ("red", "green", "blue", "saturation")], "lumaMix": 0.0}


def _color_ops(adjust: dict, curves: dict | None, wheel: dict | None, logw: dict | None = None) -> list:
    """Thu tu nhu zorder goi CapCut: curves (5017) -> primaryWheel (5018) -> logWheel (5019) -> adjustColor (8004)."""
    ops = []
    if curves:
        c = {"op": "curves"}
        for ch in ("luma", "red", "green", "blue"):
            if curves.get(ch):
                c[ch] = _curve_ctl(curves[ch])
        ops.append(c)
    if wheel:
        ops.append(_wheel_uniforms(wheel))
    if logw:
        o = logw.get("offset") or {}
        ops.append({"op": "logOffset", "offset": [max(-1.0, min(1.0, float(o.get(c) or 0))) for c in ("red", "green", "blue", "saturation")]})
    if adjust:
        op = {"op": "adjust", **{_ADJ_KEY.get(k, k): v for k, v in adjust.items()}}
        if abs(op.get("light", 0)) > 1e-5:
            op["lightLut"] = _light_lut(op["light"] > 0)
        ops.append(op)
    return ops


def _light_lut(positive: bool) -> list:
    """Anh LUT 289x17 cua goi adjustColor (lightSensation_max / _min): x = luoi b * 17 + r, y = g -> [b][g][r] rgb 0..1."""
    import glob as _g
    from PIL import Image
    hits = _g.glob(os.path.expanduser("~/Movies/CapCut/User Data/Presets/Combination/Resources/*/NativeEffects/*/AmazingFeature_adjustColor/image/"
                                      + ("lightSensation_max.png" if positive else "lightSensation_min.png")))
    if not hits:
        raise ValueError("Thieu anh LUT light_sensation cua goi chinh mau CapCut")
    px = Image.open(hits[0]).convert("RGB").load()
    out = []
    for b in range(17):
        for g in range(17):
            for r in range(17):
                out += [round(v / 255, 4) for v in px[b * 17 + r, g]]
    return out


def _collect_fills(node: dict) -> set:
    out = set()
    if node.get("type") == "text":
        for r in node.get("runs") or [{"fill": node["fill"]}]:
            out.add(tuple(int(round(c * 255)) for c in r["fill"]))
    for c in node.get("children") or []:
        out |= _collect_fills(c)
    return out


def _bez_ease(c, x: float) -> float:
    """getBezierTfromX + getBezierValue (Transform.lua): controls {x1, y1, x2, y2}."""
    bz = lambda a, b, t: 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3  # noqa: E731
    ts, te = 0.0, 1.0
    while te - ts >= 0.0001:
        tm = (ts + te) / 2
        if bz(c[0], c[2], tm) > x:
            te = tm
        else:
            ts = tm
    return bz(c[1], c[3], (ts + te) / 2)


def _quad_out(x: float) -> float:
    return x * (2 - x)


ANIM_SAMPLES = 41


def _steps(vals: list, n: int | None = None) -> tuple[list, list]:
    """Gia tri theo TUNG KHUNG (30 fps tren duration chuan 0.5s) -> bang mau bac thang (t, v)."""
    n = n or len(vals)
    t, v = [], []
    for i, x in enumerate(vals):
        t += [i / n, (i + 1) / n - 1e-4]
        v += [x, x]
    return [round(x, 5) for x in t], v


# Hoat anh chu co script MA HOA (.jsdat / studioAnim) — DO tren video CapCut xuat that (1005.mov), khoa = resource_id.
# Gia tri theo thoi gian CHUAN HOA (0..1 cua duration). Dang 'block' = ca khoi chu (SampledAnim).
KNOWN_TEXT_ANIMS = {
    # "Chu nhap nhay": nhap nhay do hien tung khung (do ti le do sang so '7' LE VIP2-12, 15 khung / 0.5s)
    "7596793498809011457": {"kind": "block", "alpha_steps": [0.71, 0.71, 0.96, 1.0, 0.03, 0.96, 0.20, 0.87, 0.43, 0.73, 0.64, 0.70, 0.87, 0.97, 1.0]},
    # "Fisheye Distort": chu phong tu 0 tu tam (meo thau kinh — chua ve), vuot 14% roi ve 1; ti le be ngang tung khung
    # do tren LE VIP2-10 "$1,000,000" (15 khung / 0.5s)
    "7668693154199096584": {"kind": "block", "scale_frames": [0, 0.034, 0.33, 0.63, 1.06, 1.12, 1.14, 1.08, 1.03, 1.013, 1.011, 1.009,
                                                              1.006, 1.004, 1.002, 1.0]},
}


def _known_text_anim(a: dict) -> dict | None:
    k = KNOWN_TEXT_ANIMS.get(str(a.get("resource_id")))
    if not k or a.get("type") != "in":
        return None
    st, du = a.get("start", 0) / US, a.get("duration", 0) / US
    if k["kind"] == "block" and "alpha_steps" in k:
        t, al = _steps(k["alpha_steps"])
        return {"start": st, "duration": du, "t": t, "alpha": al}
    if k["kind"] == "block" and "scale_frames" in k:
        n = len(k["scale_frames"]) - 1
        return {"start": st, "duration": du, "t": [round(i / n, 5) for i in range(n + 1)], "scale": list(k["scale_frames"])}
    return None


def _lua_text_anim(a: dict) -> dict | None:
    """Hoat anh chu CapCut co script Lua DOC DUOC -> SampledAnim (bang mau). Ma hoa (.jsdat) -> None.
    Tween `a * textureW / screenW` -> dich a lan be ngang chu (don vi textW; do tren LE VIP2-13 "Money": quang truot = 2.66 be
    ngang chu, khong phai 1.33), truc y LEN. Tween quadOut (Amaz.Ease.quadOut)."""
    path = a.get("path") or ""
    st, du = a.get("start", 0) / US, a.get("duration", 0) / US
    if a.get("type") != "in":
        return None
    T = [i / (ANIM_SAMPLES - 1) for i in range(ANIM_SAMPLES)]
    base = {"start": st, "duration": du, "t": T}
    for fn in ("Transform.lua", "LeftIn.lua"):
        f = os.path.join(path, fn)
        if not os.path.exists(f):
            continue
        src = open(f, encoding="utf-8").read()
        m = re.search(r'fromTo\(transform,\s*\{\["localPosition"\]\s*=\s*Amaz\.Vector3f\(([^,]+),\s*([^,]+),\s*[^)]+\)\s*\}', src)
        if m and "Amaz.Ease.quadOut" in src and '["alpha"] = 0.0' in src:
            # "Truot len / xuong / sang phai" kieu tween: dich tu (a * texture / screen) ve 0 + hien dan, quadOut, ca khoang
            def coef(expr: str, dim: str):
                e = expr.replace(" ", "")
                if re.fullmatch(r"-?[\d.]+", e):
                    return float(e), None
                mm = re.fullmatch(r"(-?[\d.]+)\*texture([WH])/screen([WH])", e)
                if not mm or mm.group(2) != mm.group(3):
                    raise ValueError(f"Hoat anh '{a.get('name')}': vi tri {expr} chua ho tro")
                return float(mm.group(1)), mm.group(2)
            cx, ux = coef(m.group(1), "W")
            cy, uy = coef(m.group(2), "H")
            if (cx and cy) or (cx and ux != "W") or (cy and uy != "H"):
                raise ValueError(f"Hoat anh '{a.get('name')}': dich cheo chua ho tro")
            e = [_quad_out(x) for x in T]
            out = {**base, "alpha": [round(v, 5) for v in e]}
            if cx:
                out["unit"] = "textW"
                out["dx"] = [round(cx * (1 - v), 5) for v in e]
            if cy:
                out["unit"] = "textH"
                out["dy"] = [round(-cy * (1 - v), 5) for v in e]
            return out
        if "self.actions" in src:
            # "Truot sang trai / phai" kieu actions: lop chu (canvas Root) dich startPositionX * ratio (don vi nua chieu cao)
            # -> px = startPositionX * be ngang khung / 2; ease bezier rieng tung action, khoang [startTime, endTime]
            vals = {mm.group(1): float(mm.group(2)) for mm in re.finditer(r"self\.(\w+)\s*=\s*(-?[\d.]+)\s*$", src, re.M)}
            ctrl = {}
            for mm in re.finditer(r"local function (funcEaseAction\d+)\(t, b, c, d\).*?local controls = (\{[^}]*\})", src, re.S):
                ctrl[mm.group(1)] = [float(v) for v in _LuaParser(mm.group(2)).value()]
            body = re.search(r"self\.actions\s*=\s*", src)
            txt = src[body.end():]
            txt = re.sub(r"self\.(\w+)", lambda mm: str(vals.get(mm.group(1), 0.0)), txt)
            acts = _LuaParser(txt).value()
            out = {**base, "unit": "canvas"}
            for act in acts:
                t0, t1 = float(act.get("startTime", 0)), float(act.get("endTime", 1))
                c = ctrl.get(act.get("actionFunction"), [0, 0, 1, 1])
                prog = [_bez_ease(c, min(1, max(0, (x - t0) / max(1e-6, t1 - t0)))) for x in T]
                if "startAlpha" in act:
                    a0, a1 = float(act["startAlpha"]), float(act["endAlpha"])
                    out["alpha"] = [round(a0 + (a1 - a0) * v, 5) for v in prog]
                elif "startPosition" in act:
                    p0, p1 = act["startPosition"], act["endPosition"]
                    if abs(float(p0[1])) > 1e-6 or abs(float(p1[1])) > 1e-6 or abs(float(p1[0])) > 1e-6:
                        raise ValueError(f"Hoat anh '{a.get('name')}': dich doc chua ho tro")
                    out["dx"] = [round(float(p0[0]) * 540 * (1 - v), 3) for v in prog]
                elif "startScale" in act:
                    if any(abs(float(v) - 1) > 1e-6 for v in list(act["startScale"]) + list(act["endScale"])):
                        raise ValueError(f"Hoat anh '{a.get('name')}': phong to chua ho tro")
                elif "startRotate" in act:
                    if any(abs(float(v)) > 1e-6 for v in list(act["startRotate"]) + list(act["endRotate"])):
                        raise ValueError(f"Hoat anh '{a.get('name')}': xoay chua ho tro")
                elif "blurIntensity" in act:
                    if abs(float(act["blurIntensity"])) > 1e-6:
                        raise ValueError(f"Hoat anh '{a.get('name')}': lam nhoe chua ho tro")
            return out
    f = os.path.join(path, "TextAnim.lua")
    if os.path.exists(f):
        src = open(f, encoding="utf-8").read().replace(" ", "")
        if "bezier({0.7,0.2,1,0.2})(1-value,0,1,1)" in src and "remap01(0.01,0.15,duration)" in src:
            # "Cham dan vao phai": x = (-1.4 -> -0.4) trong 5% dau, roi -0.4 * bezier(1 - v); hien dan 1% -> 15%
            rm = lambda a0, b0, x: 0.0 if x < a0 else 1.0 if x > b0 else (x - a0) / (b0 - a0)  # noqa: E731
            dx = []
            for x in T:
                if x < 0.05:
                    v = rm(0, 0.05, x)
                    dx.append(((1 - v) * -1 - 0.4) * 540)
                else:
                    v = rm(0.05, 0.99, x)
                    dx.append(-0.4 * _bez_ease([0.7, 0.2, 1, 0.2], 1 - v) * 540)
            dx[0] = dx[1] if T[0] == 0 else dx[0]
            return {**base, "unit": "px", "dx": [round(v, 3) for v in dx], "alpha": [round(rm(0.01, 0.15, x), 5) for x in T]}
    return None


def _transform_anim(a: dict, seg_dur: float) -> dict:
    """Hoat anh clip kieu Transform.lua (CapCut "Mo dan"/"Hien dan"/zoom...) -> ClipAnim."""
    path = os.path.join(a.get("path") or "", "Transform.lua")
    if not os.path.exists(path):
        raise ValueError(f"Hoat anh clip '{a.get('name')}' khong phai kieu Transform.lua (chua ho tro)")
    src = open(path, encoding="utf-8").read()
    ctrl = {}
    for m in re.finditer(r"local function (funcEaseAction\d+)\(t, b, c, d\).*?local controls = (\{[^}]*\})", src, re.S):
        p = _LuaParser(m.group(2))
        ctrl[m.group(1)] = [float(v) for v in p.value()]
    m = re.search(r"self\.actions\s*=\s*", src)
    p = _LuaParser(src)
    p.i = m.end()
    acts = p.value()
    out = {"start": a.get("start", 0) / US, "duration": a.get("duration", 0) / US,
           "alpha": [1.0, 1.0], "scale": [1.0, 1.0], "easeAlpha": [0, 0, 1, 1], "easeScale": [0, 0, 1, 1]}
    for act in acts:
        if float(act.get("startTime", 0)) != 0 or float(act.get("endTime", 1)) != 1:
            raise ValueError(f"Hoat anh '{a.get('name')}': nhieu pha chua ho tro")
        ease = ctrl.get(act.get("actionFunction"), [0, 0, 1, 1])
        if "startAlpha" in act:
            out["alpha"] = [float(act["startAlpha"]), float(act["endAlpha"])]
            out["easeAlpha"] = ease
        elif "startScale" in act:
            s0, s1 = act["startScale"], act["endScale"]
            if abs(s0[0] - s0[1]) > 1e-6 or abs(s1[0] - s1[1]) > 1e-6:
                raise ValueError(f"Hoat anh '{a.get('name')}': scale khong deu chua ho tro")
            out["scale"] = [float(s0[0]), float(s1[0])]
            out["easeScale"] = ease
        elif "startPosition" in act or "startRotate" in act:
            v0 = act.get("startPosition") or act.get("startRotate")
            v1 = act.get("endPosition") or act.get("endRotate")
            if any(abs(float(x)) > 1e-6 for x in list(v0) + list(v1)):
                raise ValueError(f"Hoat anh '{a.get('name')}': dich/xoay chua ho tro")
        elif "blurIntensity" in act:
            if abs(float(act["blurIntensity"])) > 1e-6:
                raise ValueError(f"Hoat anh '{a.get('name')}': lam nhoe chua ho tro")
    return out


# ---------------------------------------------------------------- draft -> node

def _index(draft: dict, glob: dict):
    for k, v in (draft.get("materials") or {}).items():
        if isinstance(v, list):
            for x in v:
                if isinstance(x, dict) and "id" in x:
                    glob.setdefault(x["id"], (k, x))
                    if k == "drafts" and x.get("draft"):
                        _index(x["draft"], glob)


def _transform(seg: dict) -> dict:
    clip = seg.get("clip") or {}
    tr = clip.get("transform") or {}
    sc = clip.get("scale") or {}
    if abs(sc.get("x", 1) - sc.get("y", 1)) > 1e-6:
        raise ValueError("Scale X≠Y chua ho tro")
    return {"x": float(tr.get("x", 0)), "y": float(tr.get("y", 0)), "scale": float(sc.get("x", 1)), "rotation": float(clip.get("rotation", 0))}


MASK_KF = {"KFTypeCommonMaskPositionX": "centerX", "KFTypeCommonMaskPositionY": "centerY", "KFTypeCommonMaskRotation": "rotation",
           "KFTypeCommonMaskFeather": "feather", "KFTypeCommonMaskSizeWidth": "width", "KFTypeCommonMaskSizeHeight": "height"}


def _mask_keys(seg: dict) -> dict:
    """Keyframe cua mask (KFTypeCommonMask*) -> {truong mask: CcKey[]}; chi lay khi co >= 2 moc khac nhau."""
    out = {}
    for k in seg.get("common_keyframes") or []:
        f = MASK_KF.get(k.get("property_type"))
        if f:
            out[f] = _cc_keys({"source_timerange": seg.get("source_timerange"), "common_keyframes": [dict(k, property_type="KFTypeAlpha")]})["alpha"]
    return {f: v for f, v in out.items() if len({round(r[1], 9) for r in v}) > 1}


def _cc_keys(seg: dict) -> dict:
    """Keyframe CapCut -> CcKey (gio tu dau SEGMENT). time_offset tinh theo thoi gian NGUON cua clip (LE VIP2-14: clip ghep
    bat dau 1.0s, nguon 1.0s, keyframe ghi 1.0 -> 3.0) -> tru source_timerange.start."""
    src0 = ((seg.get("source_timerange") or {}).get("start") or 0) / US
    seg = {**seg, "common_keyframes": [k for k in seg.get("common_keyframes") or [] if k.get("property_type") not in MASK_KF]}
    names = {"KFTypeGlobalAlpha": "alpha", "KFTypeAlpha": "alpha", "KFTypeShapeGlobalAlpha": "alpha", "KFTypePositionX": "x", "KFTypePositionY": "y",
             "KFTypeScaleX": "scale", "KFTypeRotation": "rotation"}
    out = {}
    for k in seg.get("common_keyframes") or []:
        name = names.get(k.get("property_type"))
        if not name:
            raise ValueError(f"Keyframe {k.get('property_type')} chua ho tro")
        lst = []
        for kf in k.get("keyframe_list") or []:
            ct = kf.get("curveType", "Line")
            if ct not in ("Line", "FreeCurveIn", "FreeCurveOut", "FreeCurveInOut"):
                raise ValueError(f"Keyframe cong {ct} chua ho tro")
            row = [kf["time_offset"] / US - src0, float(kf["values"][0])]
            lc = kf.get("left_control") or {}
            rc = kf.get("right_control") or {}
            hand = [lc.get("x", 0) / US, float(lc.get("y", 0)), rc.get("x", 0) / US, float(rc.get("y", 0))]
            if ct != "Line" and any(abs(v) > 1e-12 for v in hand):
                row += hand  # bezier (thoi gian, gia tri) — tay nam tuong doi
            lst.append(row)
        out[name] = lst
    return out


def _rgb(hexstr: str):
    h = (hexstr or "#000000").lstrip("#")
    if len(h) == 8:
        h = h[2:]
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


class Builder:
    def __init__(self):
        self.glob: dict = {}
        self.fonts: dict[str, str] = {}  # path -> font id
        self.slots: list[dict] = []
        self.slot_of_text: dict[str, str] = {}
        self.assets: dict[str, str] = {}  # rel -> src
        self.audio: list[dict] = []
        self.warnings: list[str] = []
        self.limit = 1e9  # do dai mau (giay, thoi gian goc) — clip video chi trich khung trong khoang nay
        self.parent_audio = True  # clip ghep dang mo co tieng khong (has_audio cua vat lieu clip ghep)
        self.canvas = (1080, 1920)

    def font_id(self, path: str) -> str:
        if path not in self.fonts:
            if not os.path.exists(path):
                raise ValueError(f"Thieu font {path}")
            fid = f"f{len(self.fonts) + 1}"
            self.fonts[path] = fid
            self.assets[f"fonts/{os.path.basename(path)}"] = path
        return self.fonts[path]

    def slot(self, text: str) -> str:
        # cung mot cau chu (vd ban sao lam lop mau) -> cung mot slot
        if text not in self.slot_of_text:
            sid = f"s{len(self.slots) + 1}"
            self.slot_of_text[text] = sid
            self.slots.append({"id": sid, "role": "", "sample": text})
        return self.slot_of_text[text]

    def text_node(self, seg: dict, mat: dict) -> dict:
        c = json.loads(mat["content"])
        styles = sorted(c.get("styles") or [], key=lambda st: (st.get("range") or [0])[0])
        if not styles:
            raise ValueError("Chu khong co style")
        text = c["text"]
        runs = []
        pos = 0
        for st in styles:
            fill = (st.get("fill") or {}).get("content", {})
            if fill.get("render_type", "solid") != "solid":
                raise ValueError("To mau chu khong phai solid chua ho tro")
            extra = set(st) - {"fill", "font", "size", "range", "useLetterColor", "shadows", "italic", "bold", "effectStyle"}
            if extra:
                raise ValueError(f"Kieu chu {sorted(extra)} chua ho tro")
            r0, r1 = (st.get("range") or [0, len(text)])[:2]
            if r0 != pos:
                raise ValueError("Doan chu (range) khong lien tuc")
            pos = r1
            font_path = (st.get("font") or {}).get("path") or mat.get("font_path")
            run = {"len": r1 - r0, "font": self.font_id(font_path), "size": float(st.get("size", mat.get("font_size", 15))),
                   "fill": [float(v) for v in fill.get("solid", {}).get("color", [1, 1, 1])]}
            if st.get("italic"):
                run["italic"] = True
            runs.append(run)
        if pos != len(text):
            raise ValueError("Doan chu (range) khong phu het chu")
        st = styles[0]
        node = {
            "type": "text",
            "id": seg["id"],
            "slot": self.slot(text),
            "start": seg["target_timerange"]["start"] / US,
            "duration": seg["target_timerange"]["duration"] / US,
            "font": runs[0]["font"],
            "size": runs[0]["size"],
            "fill": runs[0]["fill"],
            "transform": _transform(seg),
        }
        if abs(float(mat.get("letter_spacing", 0) or 0)) > 1e-9:
            node["letterSpacing"] = float(mat["letter_spacing"])
        fx = [st.get("effectStyle") for st in styles if st.get("effectStyle")]
        if fx:
            # Word-art CapCut (text_effect, vd "125" LE VIP2-14): SDF nhieu vien, tham so trong file nhi phan -> chi ho tro kieu
            # "1 anh to + bong do" — anh image/*.png gian theo khung NET chu, bong toi lech duoi-phai (DO tren video)
            if len(fx) != len(styles) or len({f.get("id") for f in fx}) != 1:
                raise ValueError("Word-art mot phan chu chua ho tro")
            spec_fx = KNOWN_WORDART.get(str(fx[0].get("id")))
            if not spec_fx:
                raise ValueError(f"Word-art (text_effect {fx[0].get('id')}) chua ho tro")
            img = [f for f in os.listdir(os.path.join(fx[0]["path"], "image")) if f.endswith(".png")]
            if len(img) != 1:
                raise ValueError("Word-art: khong tim thay anh to")
            rel = f"assets/wordart-{fx[0].get('id')}.png"
            self.assets[rel] = os.path.join(fx[0]["path"], "image", img[0])
            node["fillImage"] = rel
            node["shadow"] = dict(spec_fx["shadow"])
            node.pop("border", None)
        if any(st.get("bold") for st in styles):
            if not all(st.get("bold") for st in styles):
                raise ValueError("Chu dam mot phan chua ho tro")
            # dam gia lap = vien cung mau; bold_width mac dinh 0.008 ~ do day cua mask chu bold 1 (TEXT_MASK_BOLD, do tren LE VIP2-01)
            node["bold"] = TEXT_MASK_BOLD * float(mat.get("bold_width") or 0.008) / 0.008
        if len(runs) > 1 or runs[0].get("italic"):
            node["runs"] = runs
            node["italicDegree"] = float(mat.get("italic_degree", 10) or 10)
        # border_color rong = KHONG co vien (LE VIP2: width 0.08 mac dinh, CapCut khong ve — do: bo vien sai khac 18 -> 7.6)
        if mat.get("border_color") and mat.get("border_width", 0) > 0 and mat.get("border_alpha", 1) > 0 and not node.get("fillImage"):
            # word-art thay ca vien cua chu (LE VIP2-14: vien den 0.08 KHONG hien)
            node["border"] = {"color": _rgb(mat.get("border_color")), "width": float(mat["border_width"]), "alpha": float(mat.get("border_alpha", 1))}
        sh = (st.get("shadows") or [None])[0]
        if sh:
            node["shadow"] = {"color": [float(v) for v in sh["content"]["solid"]["color"]], "alpha": float(sh.get("alpha", 1)),
                              "distance": float(sh.get("distance", 0)), "angle": float(sh.get("angle", -45)),
                              # do mo bong = diffuse cua style (LE VIP2: shadow_smoothing 0.45 cua vat lieu lam bong loang ~1 em,
                              # CapCut that bo sat chu — vung chinh mau / Shockwave quanh chu cho thay)
                              "smoothing": float(sh.get("diffuse", mat.get("shadow_smoothing", 0)))}
        kf = _cc_keys(seg)
        if kf:
            node["keyframes"] = kf
        # chu: CapCut lay do hien tu global_alpha cua vat lieu (clip.alpha cua lop chu bi bo qua — do tren 05)
        ga = float(mat.get("global_alpha", 1) if mat.get("global_alpha") is not None else 1)
        if not kf.get("alpha") and abs(ga - 1) > 1e-6:
            node["alpha"] = ga
        for r in seg.get("extra_material_refs") or []:
            k, m = self.glob.get(r, (None, None))
            if k == "material_animations":
                for a in m.get("animations") or []:
                    known = KNOWN_CHAR_ANIMS.get(str(a.get("resource_id")))
                    if known and a.get("type") == "in" and "charAnim" not in node:
                        node["charAnim"] = {**known, "start": a.get("start", 0) / US, "duration": a.get("duration", 0) / US}
                        continue
                    sampled = _known_text_anim(a) or _lua_text_anim(a)
                    if not sampled:
                        raise ValueError(f"Hoat anh chu '{a.get('name')}' ({a.get('resource_id')}) chua ho tro")
                    node.setdefault("anims", []).append(sampled)
        return node

    def group_from_draft(self, draft: dict, abs_offset: float, vol: float = 1.0) -> list[dict]:
        """Cac track (duoi -> tren) thanh danh sach con; track hieu ung boc cac lop duoi no.
        vol: am luong cua cac clip ghep boc ngoai (CapCut nhan don: LE VIP2-01 boc ngoai 2.14 — do khop tieng 0.988)."""
        children: list[dict] = []
        for tr in draft.get("tracks") or []:
            typ = tr.get("type")
            if typ == "text":
                cnt = self.counter_node(tr.get("segments") or [])
                if cnt:
                    children.append(cnt)
                    continue
            for seg in tr.get("segments") or []:
                k, mat = self.glob.get(seg["material_id"], (None, {}))
                if typ == "text":
                    children.append(self.text_node(seg, mat))
                elif typ == "video":
                    children.append(self.video_node(seg, mat, abs_offset, vol))
                elif typ == "audio":
                    st = seg["target_timerange"]["start"] / US
                    inner = next((self.glob[r][1] for r in seg.get("extra_material_refs") or [] if self.glob.get(r, ("",))[0] == "drafts"), None)
                    if not mat.get("path") and inner and inner.get("draft"):
                        # am thanh la clip ghep (vd LE VIP2-03 "Clip ghep52": 3 tieng trong nhau) -> mo ra, cat theo do dai doan
                        n0 = len(self.audio)
                        src0 = (seg.get("source_timerange") or {}).get("start", 0) / US
                        if self.group_from_draft(inner["draft"], abs_offset + st - src0, vol * float(seg.get("volume", 1))):
                            raise ValueError("Clip ghep am thanh co hinh chua ho tro")
                        end = abs_offset + st + seg["target_timerange"]["duration"] / US
                        for a in self.audio[n0:]:
                            a["duration"] = min(a["duration"], end - a["start"])
                        self.audio[n0:] = [a for a in self.audio[n0:] if a["duration"] > 1e-4 and a["start"] >= abs_offset + st - 1e-6]
                        continue
                    if not mat.get("path"):
                        # am thanh tach tu clip ghep da mat file (CapCut cung khong phat) — vd "Clip ghep47" cua LE VIP2-01
                        self.warnings.append(f"Bo am thanh khong co file: {mat.get('name')}")
                        continue
                    fade = next((self.glob[r][1] for r in seg.get("extra_material_refs") or [] if self.glob.get(r, ("",))[0] == "audio_fades"), {})
                    rel = f"audio/{os.path.basename(mat['path'])}"
                    self.assets[rel] = mat["path"]
                    self.audio.append({"file": rel, "start": abs_offset + st, "duration": seg["target_timerange"]["duration"] / US,
                                       "sourceStart": (seg.get("source_timerange") or {}).get("start", 0) / US,
                                       "volume": float(seg.get("volume", 1)) * vol,
                                       "fadeIn": fade.get("fade_in_duration", 0) / US, "fadeOut": fade.get("fade_out_duration", 0) / US})
                elif typ == "effect":
                    st = seg["target_timerange"]["start"] / US
                    du = seg["target_timerange"]["duration"] / US
                    effs = _effect_to_spec(mat, st, du, self.assets, self.warnings, seg)
                    if effs:
                        children = [{"type": "group", "id": seg["id"], "start": 0, "duration": 1e9, "sourceStart": 0,
                                     "effects": effs, "children": children}]
                    if seg.get("common_keyframes") and not (effs and (effs[0]["type"] == "blur" or any(e["type"] == "rotate3d" and e.get("keyframes") for e in effs))):
                        raise ValueError("Keyframe tren hieu ung (khong phai 'Mo') chua ho tro")
                elif typ == "sticker" and k == "shapes":
                    children.append(self.shape_node(seg, mat))
                else:
                    raise ValueError(f"Track {typ} ({k}) chua ho tro")
        return children

    def counter_node(self, segs: list) -> dict | None:
        """Track chu gom >= 4 doan noi tiep la CON SO cung dinh dang (vd LE VIP2-10 "$0" ... "$1,000,000") = BO DEM SO:
        gop thanh 1 o chu (chu = so cuoi) + counter {t, frac} — chu that la so khac thi dem toi so do, giu dinh dang."""
        if len(segs) < 4:
            return None
        vals = []
        for sg in segs:
            k, m = self.glob.get(sg["material_id"], (None, {}))
            if k != "texts":
                return None
            txt = json.loads(m["content"])["text"]
            mm = re.fullmatch(r"(\D*?)([\d][\d.,]*)(\D*)", txt)
            if not mm:
                return None
            vals.append((sg, mm.group(1), mm.group(3), float(re.sub(r"[.,]", "", mm.group(2)))))
        if len({(v[1], v[2]) for v in vals}) != 1 or vals[-1][3] <= 0:
            return None
        t0 = vals[0][0]["target_timerange"]["start"] / US
        last_seg = vals[-1][0]
        node = self.text_node(last_seg, self.glob[last_seg["material_id"]][1])
        off = node["start"] - t0
        node["start"] = t0
        node["duration"] = node["duration"] + off
        for a in node.get("anims") or []:
            a["start"] += off
            a["pre"] = "none"  # cac doan so truoc khong co hoat anh nay
        if node.get("charAnim"):
            node["charAnim"]["start"] += off
        if node.get("keyframes"):
            raise ValueError("Bo dem so co keyframe chua ho tro")
        node["counter"] = {"t": [round(v[0]["target_timerange"]["start"] / US - t0, 5) for v in vals],
                           "frac": [round(v[3] / vals[-1][3], 6) for v in vals]}
        return node

    def shape_node(self, seg: dict, mat: dict) -> dict:
        """Hinh CapCut (Shape: rect_item / polycon_item) -> VectorNode. custom_points = px quanh tam, truc y LEN.
        check_flag: 16 = co to, 32 = co vien, 64 = bo goc (doc tu cac preset LE VIP2: hinh co vien trang co bit 32)."""
        if any(abs(float(v)) > 1e-9 for v in (mat.get("custom_points_in") or []) + (mat.get("custom_points_out") or [])):
            raise ValueError("Hinh co canh cong (bezier) chua ho tro")
        pts = [float(v) for v in mat.get("custom_points") or []]
        flag = int(mat.get("check_flag", 0))
        fs = mat.get("fill_render_style") or {}
        col = fs.get("color") or {}
        rt = col.get("render_type", "solid")
        if rt == "solid":
            fill = {"type": "solid", "color": _rgb(col["solid"]["color"]), "alpha": float(col["solid"].get("alpha", 1))}
        elif rt == "gradient":
            g = col["gradient"]
            if g.get("style") != "linear":
                raise ValueError(f"To hinh gradient {g.get('style')} chua ho tro")
            fill = {"type": "linear", "colors": [_rgb(c) for c in g["color"]], "alphas": [float(a) for a in g["alpha"]],
                    "stops": [float(p) for p in g["percent"]], "angle": float(g.get("angle", 0))}
        else:
            raise ValueError(f"To hinh {rt} chua ho tro")
        node = {"type": "vector", "id": seg["id"], "start": seg["target_timerange"]["start"] / US,
                "duration": seg["target_timerange"]["duration"] / US, "transform": _transform(seg),
                "points": [[pts[i], pts[i + 1]] for i in range(0, len(pts), 2)],
                "fill": fill if flag & 16 else None, "fillAlpha": float(fs.get("alpha", 1))}
        if flag & 64 and mat.get("roundness"):
            node["radius"] = [float(r) for r in mat["roundness"]]
        if flag & 32:
            node["border"] = {"color": _rgb(mat.get("border_color")), "width": float(mat.get("border_width", 0)), "alpha": float(mat.get("border_alpha", 1))}
        if flag & ~(1 | 16 | 32 | 64):
            raise ValueError(f"Hinh co check_flag {flag} (bong / kieu khac?) chua ho tro")
        kf = _cc_keys(seg)
        if kf:
            node["keyframes"] = kf
        ga = float(mat.get("global_alpha", 1) if mat.get("global_alpha") is not None else 1)
        if not kf.get("alpha") and abs(ga - 1) > 1e-6:
            node["alpha"] = ga
        for r in seg.get("extra_material_refs") or []:
            kk, m = self.glob.get(r, (None, None))
            if kk == "material_animations" and m.get("animations"):
                raise ValueError("Hoat anh tren hinh chua ho tro")
        return node

    def media_children(self, seg: dict, mat: dict, refs: list, abs_start: float, vol: float) -> list[dict]:
        """Clip video thuong -> chuoi khung anh (FramesNode); co mask "Van ban" -> o chu to bang khung video
        (TextNode + fillFrames: chu that thay chu mau van mang nen video). Chi trich doan khung mau thuc su hien."""
        import subprocess
        import tempfile
        from PIL import Image, ImageFont
        path = mat.get("path") or ""
        photo = mat.get("type") == "photo"
        if mat.get("type") not in ("video", "photo") or not os.path.exists(path):
            raise ValueError(f"Clip '{mat.get('material_name')}' ({mat.get('type')}) chua ho tro hoac thieu file")
        crop = mat.get("crop") or {}
        if any(abs(float(crop.get(k, d)) - d) > 1e-6 for k, d in (("upper_left_x", 0), ("upper_left_y", 0), ("lower_right_x", 1), ("lower_right_y", 1))):
            raise ValueError("Clip video bi cat (crop) chua ho tro")
        sp = next((m for k, m in refs if k == "speeds"), {}) or {}
        if sp.get("curve_speed"):
            raise ValueError("Toc do cong chua ho tro")
        speed = float(sp.get("speed", 1) or 1)
        dur = seg["target_timerange"]["duration"] / US
        shown = min(dur, self.limit - abs_start)
        if shown <= 0:
            return []
        info = _ffprobe(path)
        fps = info["fps"]
        alpha = "a" in (info.get("pix_fmt") or "").replace("yuv", "").replace("gray", "") or (info.get("pix_fmt") or "").startswith(("argb", "rgba", "bgra", "yuva"))
        W, H = self.canvas
        vw, vh = int(info["width"]), int(info["height"])
        fit = min(W / vw, H / vh)  # CapCut dat media "vua khung" (contain) o scale 1
        pw, ph = int(round(vw * fit)), int(round(vh * fit))
        rx, ry = (W - pw) / 2, (H - ph) / 2
        src0 = (seg.get("source_timerange") or {}).get("start", 0) / US
        first = int(math.floor(src0 * fps + 1e-6))
        count = int(math.ceil((src0 + shown * speed) * fps + 1e-6)) - first + 1
        if photo:  # anh tinh (LE VIP2-08): 1 khung
            src0, first, count, speed = 0.0, 0, 1, 1.0
        tid = f"v{len({a.split('/')[1] for a in self.assets if a.startswith('frames/')}) + 1}"
        tmp = tempfile.mkdtemp(prefix="ccframes_")
        mask = next((m for k, m in refs if k == "common_mask"), None)
        node_text = None
        band = None
        if mask:
            cfg = mask.get("config") or {}
            tc = mask.get("text_config") or {}
            if mask.get("resource_type") != "text":
                raise ValueError(f"Mask {mask.get('name')} tren clip video chua ho tro")
            if cfg.get("feather", 0) or cfg.get("invert") or cfg.get("rotation", 0) or cfg.get("expansion", 0) or cfg.get("roundCorner", 0):
                raise ValueError("Mask chu co vien mem / dao / xoay chua ho tro")
            if tc.get("char_spacing", 0) or tc.get("italic_degree", 0) or tc.get("has_underline") or "\n" in (tc.get("content") or ""):
                raise ValueError("Mask chu co gian chu / nghieng / gach chan / nhieu dong chua ho tro")
            fid = self.font_id(tc["font_path"])
            tm = font_typo_metrics(tc["font_path"])
            line_em = tm["ascent"] + tm["descent"] if tm else (lambda m: (m[0] + m[1]) / 100.0)(ImageFont.truetype(tc["font_path"], 100).getmetrics())
            # co ti le voi font_size (mac dinh 40 — LE VIP2-09 font_size 20 -> chu nho dung 0.494 lan, do)
            em = TEXT_MASK_LINE * float(tc.get("scale", 100)) * float(tc.get("font_size", 40) or 40) / 40.0 * (W / 1080.0) / line_em
            line = em * line_em
            cx = W / 2 + float(cfg.get("centerX", 0)) * pw / 2
            cy = H / 2 - float(cfg.get("centerY", 0)) * ph / 2 + TEXT_MASK_DY * em
            node_text = {"type": "text", "id": mask["id"], "slot": self.slot(tc.get("content") or ""), "start": 0.0, "duration": dur,
                         "font": fid, "size": line / LINE_PER_SIZE / (W / 1080.0), "emPx": em / (W / 1080.0), "fill": [1.0, 1.0, 1.0],
                         "transform": {"x": (cx - W / 2) / (W / 2), "y": (H / 2 - cy) / (H / 2), "scale": 1.0, "rotation": 0.0}}
            content = tc.get("content") or ""
            if any(ch.isalpha() for ch in content) and content == content.upper():
                node_text["textCase"] = "upper"  # chu mau IN HOA -> chu that cung in hoa (giu phong cach mau)
            if float(tc.get("bold_width", 0) or 0) > 0:
                node_text["bold"] = TEXT_MASK_BOLD * float(tc["bold_width"])
            # chi giu dai nen quanh dong chu (chu that co the rong hon chu mau toi FIT_GROW_MAX, dau tieng Viet cao)
            y0 = max(0, int(cy - 0.95 * line - ry))
            y1 = min(ph, int(math.ceil(cy + 0.75 * line - ry)))
            band = (0, y0, pw, y1 - y0)
        files = extract_frames(path, tmp, first, count, (pw, ph), alpha, band, photo)
        if not files:
            raise ValueError(f"Khong trich duoc khung video {path}")
        cx0, cy0 = band[:2] if band else (0, 0)
        cw, chh = (band[2], band[3]) if band else (pw, ph)
        if alpha and not band:
            bb = _alpha_bbox(tmp, files)
            if not bb:
                return []
            bb = (max(0, bb[0] - 2), max(0, bb[1] - 2), min(pw, bb[2] + 2), min(ph, bb[3] + 2))
            for f in files:
                Image.open(os.path.join(tmp, f)).crop(bb).save(os.path.join(tmp, f), optimize=True)
            cx0, cy0, cw, chh = bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]
        ext = files[0].rsplit(".", 1)[1]
        for f in files:
            self.assets[f"frames/{tid}/{f}"] = os.path.join(tmp, f)
        # CapCut lay khung GAN NHAT (lam tron) — do tren net quet toc do 1.1 cua LE VIP2-01 (sai so 2.09 -> 1.78 so voi lay san)
        seq = {"dir": f"frames/{tid}", "ext": ext, "count": len(files), "fps": fps, "speed": speed,
               "offset": src0 * fps - first + 0.5, "rect": [rx + cx0, ry + cy0, cw, chh]}
        # tieng cua clip video: bo neu im lang (LE VIP2-01: nen tia sang co track tieng rong, -inf dB)
        if mat.get("has_audio") and float(seg.get("volume", 1)) * vol > 0:
            r = subprocess.run(["ffmpeg", "-v", "info", "-ss", f"{src0:.3f}", "-t", f"{shown * speed:.3f}", "-i", path, "-vn",
                                "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
            mx = re.search(r"max_volume: (-?[\d.]+|-inf) dB", r.stderr)
            if mx and mx.group(1) != "-inf" and float(mx.group(1)) > -60:
                if not self.parent_audio:
                    # clip ghep boc ngoai khong co tieng (has_audio false) -> CapCut khong phat tieng clip con (LE VIP2-08)
                    self.warnings.append(f"Bo tieng clip video trong clip ghep tat tieng: {mat.get('material_name')}")
                else:
                    raise ValueError("Tieng cua clip video (khong im lang) chua ho tro")
        if node_text:
            node_text["fillFrames"] = seq
            return [node_text]
        return [{"type": "frames", "id": seg["id"] + "-frames", "start": 0.0, "duration": dur, "seq": seq}]

    def video_node(self, seg: dict, mat: dict, abs_offset: float, vol: float = 1.0) -> dict:
        refs = [self.glob.get(r, (None, {})) for r in seg.get("extra_material_refs") or []]
        drafts = [m for k, m in refs if k == "drafts"]
        st = seg["target_timerange"]["start"] / US
        src = (seg.get("source_timerange") or {}).get("start", 0) / US
        if not drafts:
            # clip video / anh dong thuong (LE VIP2-01: nen tia sang trong mask chu, net quet .mov co alpha)
            children = self.media_children(seg, mat, refs, abs_offset + st, vol)
        else:
            if abs(float(seg.get("speed", 1)) - 1) > 1e-6:
                raise ValueError("Clip ghep doi toc do chua ho tro")
            pa = self.parent_audio
            self.parent_audio = pa and mat.get("has_audio", True) is not False
            cc = drafts[0]["draft"].get("canvas_config") or {}
            inner_canvas = (int(cc.get("width") or self.canvas[0]), int(cc.get("height") or self.canvas[1]))
            outer_canvas = self.canvas
            self.canvas = inner_canvas
            children = self.group_from_draft(drafts[0]["draft"], abs_offset + st - src, vol * float(seg.get("volume", 1)))
            self.canvas = outer_canvas
            self.parent_audio = pa
        node = {"type": "group", "id": seg["id"], "start": st, "duration": seg["target_timerange"]["duration"] / US,
                "sourceStart": src if drafts else 0.0, "transform": _transform(seg), "children": children}
        if drafts and inner_canvas != outer_canvas:
            # clip ghep canvas khac cha (vd 1920x1080 trong khung doc — LE VIP2-12/14/15/20): ve theo canvas rieng roi "vua khung"
            node["canvas"] = list(inner_canvas)
        alpha = float((seg.get("clip") or {}).get("alpha", 1))
        if abs(alpha - 1) > 1e-6:
            node["alpha"] = alpha
        kf = _cc_keys(seg)
        if kf:
            node["keyframes"] = kf
        effects = []
        adjust = {}
        curves = None
        wheel = None
        logw = None
        mask_cat = None
        for k, m in refs:
            if k == "effects" and m.get("type") in COLOR_ADJUST_TYPES:
                if abs(float(m.get("value", 0) or 0)) < 1e-6:
                    continue  # thanh truot = 0 -> khong doi mau
                if m.get("type") not in COLOR_ADJUST_OK:
                    raise ValueError(f"Chinh mau '{m.get('type')}' chua ho tro")
                adjust[m["type"]] = float(m.get("value", 0))
            elif k == "primary_color_wheels":
                wheel = m
            elif k == "color_curves":
                # duong cong DONG NHAT (rong / chi 2 diem (0,0)-(1,1)) = khong doi mau (LE VIP2-03)
                ident = all(not (m.get(ch) or []) or [[round(p["anchor"]["x"], 4), round(p["anchor"]["y"], 4)] for p in m[ch]] == [[0, 0], [1, 1]]
                            for ch in ("luma", "red", "green", "blue"))
                curves = None if ident else m
            elif k in ("video_effects", "effects"):
                effects += _effect_to_spec(m, 0, 1e9, self.assets, self.warnings)
            elif k == "common_mask" and m.get("resource_type") == "text" and not drafts:
                pass  # mask chu: da thanh o chu (TextNode + fillFrames) trong media_children
            elif k == "common_mask":
                cfg = m.get("config") or {}
                rtype = m.get("resource_type")
                mask_cat = m.get("category")
                if cfg.get("expansion", 0) or cfg.get("roundCorner", 0):
                    raise ValueError("Mask expansion/roundCorner chua ho tro")
                if rtype == "circle" or (m.get("name") or "") in ("Hình tròn", "Circle"):
                    node["mask"] = {"type": "ellipse", "centerX": float(cfg["centerX"]), "centerY": float(cfg["centerY"]),
                                    "width": float(cfg["width"]), "height": float(cfg["height"]), "feather": float(cfg.get("feather", 0)),
                                    "rotation": float(cfg.get("rotation", 0)), "invert": bool(cfg.get("invert"))}
                elif rtype in ("line", "mirror"):
                    node["mask"] = {"type": "linear" if rtype == "line" else "mirror", "centerX": float(cfg["centerX"]),
                                    "centerY": float(cfg["centerY"]), "rotation": float(cfg.get("rotation", 0)),
                                    "feather": float(cfg.get("feather", 0)), "height": float(cfg.get("height", 0)),
                                    "invert": bool(cfg.get("invert"))}
                else:
                    raise ValueError(f"Mask {m.get('name')} ({rtype}) chua ho tro")
                mk = _mask_keys(seg)
                if mk:
                    node["maskKeyframes"] = mk  # LE VIP2-02 (dai sang chay cheo), 20 (xoay)
            elif k == "log_color_wheels":
                if any(abs(float(v or 0)) > 1e-6 for kk, grp in m.items() if isinstance(grp, dict) and kk in ("highlight", "midtone", "midtones", "shadow")
                       for v in grp.values() if isinstance(v, (int, float))):
                    raise ValueError("Chinh mau log_color_wheels (shadow / midtone / highlight) chua ho tro")
                if any(abs(float(v or 0)) > 1e-6 for v in (m.get("offset") or {}).values()):
                    logw = m
            elif k == "hsl":
                if any(abs(float(m.get(x, 0))) > 1e-6 for x in ("hue", "saturation", "lightness")):
                    raise ValueError("Chinh mau HSL chua ho tro")
            elif k == "material_animations":
                for a in m.get("animations") or []:
                    try:
                        node.setdefault("anims", []).append(_transform_anim(a, node["duration"]))
                    except ValueError:
                        sa = _lua_text_anim(a)  # Transform.lua kieu actions (vd "Truot sang trai" tren clip ghep LE VIP2-13)
                        if not sa or sa.get("unit", "px") not in ("px", "canvas"):
                            raise
                        node.setdefault("sanims", []).append(sa)
                if not node.get("anims"):
                    node.pop("anims", None)
            elif k in ("beats", "time_marks", "color_curves", "drafts", "speeds", "canvases", "loudnesses", "sound_channel_mappings", "placeholder_infos", "vocal_separations", "material_colors", None):
                pass
            else:
                raise ValueError(f"Thanh phan clip '{k}' chua ho tro")
        if adjust or curves or wheel or logw:
            sig = _color_sig(adjust, curves)
            known = [(fill, KNOWN_COLOR_ADJUST.get((sig, fill))) for fill in sorted(_collect_fills(node))]
            if known and all(to is not None for _f, to in known) and not wheel and not logw:
                # mau da DO tren video (LE VIP5-09) — giu nguyen ket qua cu
                effects.insert(0, {"type": "color_set", "map": [{"from": [c / 255 for c in f], "to": to} for f, to in known]})
            else:
                effects.insert(0, {"type": "color_adjust", "ops": _color_ops(adjust, curves, wheel, logw)})
        if effects:
            node["effects"] = effects
        if node.get("mask") and mask_cat == "adjust":
            # mask loai "adjust" (category cua common_mask): chi chon VUNG chinh mau, khong cat clip (LE VIP2-05);
            # loai "video" (04, 14): cat clip nhu thuong
            if not any(e["type"] in ("color_adjust", "color_set") for e in effects):
                node.pop("mask")
                node.pop("maskKeyframes", None)
            else:
                node["maskTarget"] = "adjust"  # mask chon vung chinh mau, khong cat clip (do tren LE VIP2-05)
        return node


# Mask "Van ban" (chu lam mask cho clip video): DO tren LE VIP2-01 xuat that (khop hinh chu, sai so 1%):
# co chu theo CHIEU CAO DONG font (nhu chu thuong): dong (px @ khung rong 1080) = TEXT_MASK_LINE x text_config.scale
# (01 Montserrat dong 1.23 em -> em 0.8655 x scale; 03 Anton dong 1.51 em -> em nho hon 0.815 lan — do khop);
# bold_width 1 = vien day TEXT_MASK_BOLD em moi ben. Chu dat thap hon tam dong font TEXT_MASK_DY em (do: 5px o em 143).
TEXT_MASK_LINE = 0.8655 * (968 + 251) / 1000.0  # Montserrat (LE VIP2-01) typo 1.219 em
TEXT_MASK_BOLD = 0.0105
TEXT_MASK_DY = 0.035


def font_typo_metrics(path: str) -> dict | None:
    """OS/2 sTypoAscender / sTypoDescender (ti le em, descent duong). CapCut tinh CHIEU CAO DONG theo bang nay, KHONG theo
    hhea nhu trinh duyet (do tren LE VIP2-05: font viet tay hhea 2.26 em / typo 1.28 em -> chu CapCut to gap 1.77 lan)."""
    import struct
    try:
        data = open(path, "rb").read()
        n = struct.unpack(">H", data[4:6])[0]
        tables = {}
        for i in range(n):
            tag, _cs, off, ln = struct.unpack(">4sIII", data[12 + 16 * i: 28 + 16 * i])
            tables[tag] = (off, ln)
        upm = struct.unpack(">H", data[tables[b"head"][0] + 18: tables[b"head"][0] + 20])[0]
        o = tables[b"OS/2"][0]
        asc, desc = struct.unpack(">hh", data[o + 68: o + 72])
        return {"ascent": asc / upm, "descent": -desc / upm}
    except Exception:
        return None


def _ffprobe(path: str) -> dict:
    import subprocess
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate,pix_fmt,color_space", "-of", "json", path],
                       capture_output=True, text=True)
    st = (json.loads(r.stdout or "{}").get("streams") or [{}])[0]
    if not st:
        raise ValueError(f"Khong doc duoc video {path}")
    num, den = (st.get("r_frame_rate") or "30/1").split("/")
    st["fps"] = float(num) / float(den or 1)
    return st


def extract_frames(path: str, out_dir: str, first: int, count: int, size: tuple[int, int], alpha: bool,
                   crop: tuple[int, int, int, int] | None = None, photo: bool = False) -> list[str]:
    """Trich khung [first, first+count) cua video nguon (dung chi so khung, khong tua theo giay), doi co ve `size`
    (kich thuoc dat tren khung mau), cat `crop` (x, y, w, h sau khi doi co). Mau video: BT.709 (video HD CapCut)."""
    import subprocess
    os.makedirs(out_dir, exist_ok=True)
    vf = f"select=between(n\\,{first}\\,{first + count - 1}),scale={size[0]}:{size[1]}:flags=lanczos"
    if not alpha and not photo:  # anh JPEG: ma tran mac dinh (BT.601 cua JPEG)
        vf = vf.replace("scale=", "scale=in_color_matrix=bt709:out_range=full:", 1)
    if crop:
        vf += f",crop={crop[2]}:{crop[3]}:{crop[0]}:{crop[1]}"
    ext = "png" if alpha else "jpg"
    vf += ",format=rgba" if alpha else ",format=yuvj444p"
    args = ["ffmpeg", "-v", "error", "-y", "-i", path, "-vf", vf, "-vsync", "0", "-start_number", "0"]
    args += ([] if alpha else ["-q:v", "3"]) + [os.path.join(out_dir, f"%04d.{ext}")]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise ValueError(f"Trich khung video loi: {r.stderr[-300:]}")
    return sorted(f for f in os.listdir(out_dir) if f.endswith("." + ext))


def _alpha_bbox(dirp: str, files: list[str]) -> tuple[int, int, int, int] | None:
    from PIL import Image
    box = None
    for f in files:
        b = Image.open(os.path.join(dirp, f)).getchannel("A").point(lambda v: 255 if v > 2 else 0).getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def import_preset(preset_dir: str, out_dir: str, tpl_id: str | None = None, name: str | None = None) -> dict:
    draft_path = os.path.join(preset_dir, "preset_draft", "draft_content.json")
    draft = json.load(open(draft_path, encoding="utf-8"))
    meta_name = os.path.basename(preset_dir.rstrip("/"))
    b = Builder()
    _index(draft, b.glob)
    tracks = [t for t in draft.get("tracks") or [] if t.get("segments")]
    if len(tracks) == 1 and len(tracks[0]["segments"]) == 1:
        seg = tracks[0]["segments"][0]
        k, mat = b.glob[seg["material_id"]]
        b.limit = seg["target_timerange"]["duration"] / US
        b.canvas = PROJECT_CANVAS  # preset dat vao project doc 1080x1920 (nhu draft "1005"); clip ghep goc tu "vua khung"
        root = b.video_node(seg, mat, 0.0)
        duration = root["duration"]
        root["start"] = 0
        inner = next(m for kk, m in (b.glob.get(r, (None, {})) for r in seg["extra_material_refs"]) if kk == "drafts")["draft"]
    elif not tracks:
        # Kieu luu thu 2 (vd LE VIP5 01/03): khong co lop boc ngoai — goc la clip ghep KHONG bi clip nao tham chieu
        referenced = set()
        for _k, (kind, m) in b.glob.items():
            if kind == "drafts":
                for t in (m.get("draft") or {}).get("tracks") or []:
                    for sg in t.get("segments") or []:
                        referenced.update(sg.get("extra_material_refs") or [])
        tops = [m for m in (draft.get("materials") or {}).get("drafts") or [] if m.get("id") not in referenced and m.get("draft")]
        if len(tops) != 1:
            raise ValueError(f"Preset khong co lop boc va co {len(tops)} clip ghep goc (chua ho tro)")
        inner = tops[0]["draft"]
        duration = inner.get("duration", 0) / US
        b.limit = duration
        cc0 = inner.get("canvas_config") or {}
        b.canvas = (int(cc0.get("width") or 1080), int(cc0.get("height") or 1920))
        root = {"type": "group", "id": tops[0]["id"], "start": 0, "duration": duration, "sourceStart": 0,
                "transform": {"x": 0.0, "y": 0.0, "scale": 1.0, "rotation": 0.0},
                "children": b.group_from_draft(inner, 0.0)}
        if b.canvas != PROJECT_CANVAS:
            root["canvas"] = list(b.canvas)
    else:
        raise ValueError("Preset phai la 1 clip ghep duy nhat")
    b.audio = [a for a in b.audio if a["start"] < duration]
    for a in b.audio:
        a["duration"] = min(a["duration"], duration - a["start"])
    spec = {
        "id": tpl_id or re.sub(r"[^a-z0-9]+", "-", meta_name.lower()).strip("-"),
        "name": name or meta_name,
        "version": 1,
        "width": PROJECT_CANVAS[0],
        "height": PROJECT_CANVAS[1],
        "fps": 30,
        "duration": duration,
        "source": {"kind": "capcut_preset", "name": meta_name},
        # renderer Kho Text 1.2.0 (hinh vector, canvas clip ghep, chinh mau, metric typo...) — app cu khong nhan mau nay
        "minApp": "1.2.0",
        "slots": b.slots,
        "fonts": [{"id": fid, "file": f"fonts/{os.path.basename(p)}", **({"metrics": m} if (m := font_typo_metrics(p)) else {})}
                  for p, fid in b.fonts.items()],
        "audio": b.audio,
        "root": root,
    }
    os.makedirs(out_dir, exist_ok=True)
    if os.path.isdir(os.path.join(out_dir, "frames")):
        shutil.rmtree(os.path.join(out_dir, "frames"))  # khung cu cua lan chuyen truoc
    for rel, src in b.assets.items():
        dst = os.path.join(out_dir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)  # khong chep co he thong (font macOS bi khoa chflags)
    with open(os.path.join(out_dir, "template.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    spec["_warnings"] = b.warnings
    return spec


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("preset_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--id")
    ap.add_argument("--name")
    a = ap.parse_args()
    try:
        s = import_preset(a.preset_dir, a.out_dir, a.id, a.name)
    except ValueError as e:
        print("LOI:", e, file=sys.stderr)
        sys.exit(2)
    print(json.dumps({"id": s["id"], "slots": s["slots"], "fonts": s["fonts"], "audio": s["audio"], "warnings": s.get("_warnings", [])},
                     ensure_ascii=False, indent=1))
