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
    lumi = read_lumi_export(path)
    after = _slider_apply(lumi, sliders)
    attrs = lumi.get("ae_attribute", {})
    ents = set(attrs)
    glows = [e for e in ents if e.startswith("LumiDeepGlow_")]
    name = mat.get("name") or mat.get("resource_id")

    def glow_spec(ent: str) -> dict:
        g = lambda k, d=None: _param(lumi, after, ent, k) if _param(lumi, after, ent, k) is not None else d  # noqa: E731
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
        for e in ents:
            if e.startswith("LumiMotionBlur3D_"):
                for k in ("rotation_x", "rotation_y", "rotation_z", "direction_x", "direction_y", "direction_z"):
                    if abs(float(_param(lumi, after, e, k) or 0)) > 1e-6:
                        raise ValueError(f"Hieu ung {name}: MotionBlur3D {k}≠0 chua ho tro")
            if e.startswith("LumiDeepGlow_") and float(_param(lumi, after, e, "exposure") or 0) > 1e-6:
                raise ValueError(f"Hieu ung {name}: glow phu (exposure>0) chua ho tro")
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
        return [eff]

    raise ValueError(f"Hieu ung CapCut '{name}' ({mat.get('effect_id') or mat.get('resource_id')}) chua ho tro")


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


def _collect_fills(node: dict) -> set:
    out = set()
    if node.get("type") == "text":
        for r in node.get("runs") or [{"fill": node["fill"]}]:
            out.add(tuple(int(round(c * 255)) for c in r["fill"]))
    for c in node.get("children") or []:
        out |= _collect_fills(c)
    return out


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


def _cc_keys(seg: dict) -> dict:
    names = {"KFTypeGlobalAlpha": "alpha", "KFTypeAlpha": "alpha", "KFTypePositionX": "x", "KFTypePositionY": "y",
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
            row = [kf["time_offset"] / US, float(kf["values"][0])]
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
            extra = set(st) - {"fill", "font", "size", "range", "useLetterColor", "shadows", "italic"}
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
        if len(runs) > 1 or runs[0].get("italic"):
            node["runs"] = runs
            node["italicDegree"] = float(mat.get("italic_degree", 10) or 10)
        # border_color rong = KHONG co vien (LE VIP2: width 0.08 mac dinh, CapCut khong ve — do: bo vien sai khac 18 -> 7.6)
        if mat.get("border_color") and mat.get("border_width", 0) > 0 and mat.get("border_alpha", 1) > 0:
            node["border"] = {"color": _rgb(mat.get("border_color")), "width": float(mat["border_width"]), "alpha": float(mat.get("border_alpha", 1))}
        sh = (st.get("shadows") or [None])[0]
        if sh:
            node["shadow"] = {"color": [float(v) for v in sh["content"]["solid"]["color"]], "alpha": float(sh.get("alpha", 1)),
                              "distance": float(sh.get("distance", 0)), "angle": float(sh.get("angle", -45)),
                              "smoothing": float(mat.get("shadow_smoothing", sh.get("diffuse", 0)))}
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
                    if not known or a.get("type") != "in" or "charAnim" in node:
                        raise ValueError(f"Hoat anh chu '{a.get('name')}' ({a.get('resource_id')}) chua ho tro")
                    node["charAnim"] = {**known, "start": a.get("start", 0) / US, "duration": a.get("duration", 0) / US}
        return node

    def group_from_draft(self, draft: dict, abs_offset: float, vol: float = 1.0) -> list[dict]:
        """Cac track (duoi -> tren) thanh danh sach con; track hieu ung boc cac lop duoi no.
        vol: am luong cua cac clip ghep boc ngoai (CapCut nhan don: LE VIP2-01 boc ngoai 2.14 — do khop tieng 0.988)."""
        children: list[dict] = []
        for tr in draft.get("tracks") or []:
            typ = tr.get("type")
            for seg in tr.get("segments") or []:
                k, mat = self.glob.get(seg["material_id"], (None, {}))
                if typ == "text":
                    children.append(self.text_node(seg, mat))
                elif typ == "video":
                    children.append(self.video_node(seg, mat, abs_offset, vol))
                elif typ == "audio":
                    st = seg["target_timerange"]["start"] / US
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
                    if seg.get("common_keyframes") and not (effs and effs[0]["type"] == "blur"):
                        raise ValueError("Keyframe tren hieu ung (khong phai 'Mo') chua ho tro")
                else:
                    raise ValueError(f"Track {typ} chua ho tro")
        return children

    def media_children(self, seg: dict, mat: dict, refs: list, abs_start: float, vol: float) -> list[dict]:
        """Clip video thuong -> chuoi khung anh (FramesNode); co mask "Van ban" -> o chu to bang khung video
        (TextNode + fillFrames: chu that thay chu mau van mang nen video). Chi trich doan khung mau thuc su hien."""
        import subprocess
        import tempfile
        from PIL import Image, ImageFont
        path = mat.get("path") or ""
        if mat.get("type") != "video" or not os.path.exists(path):
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
            line_em = (lambda m: (m[0] + m[1]) / 100.0)(ImageFont.truetype(tc["font_path"], 100).getmetrics())
            em = TEXT_MASK_EM * float(tc.get("scale", 100)) * (W / 1080.0)
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
        files = extract_frames(path, tmp, first, count, (pw, ph), alpha, band)
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
            children = self.group_from_draft(drafts[0]["draft"], abs_offset + st - src, vol * float(seg.get("volume", 1)))
        node = {"type": "group", "id": seg["id"], "start": st, "duration": seg["target_timerange"]["duration"] / US,
                "sourceStart": src if drafts else 0.0, "transform": _transform(seg), "children": children}
        alpha = float((seg.get("clip") or {}).get("alpha", 1))
        if abs(alpha - 1) > 1e-6:
            node["alpha"] = alpha
        kf = _cc_keys(seg)
        if kf:
            node["keyframes"] = kf
        effects = []
        adjust = {}
        curves = None
        for k, m in refs:
            if k == "effects" and m.get("type") in ("brightness", "contrast", "highlight", "saturation", "shadow", "temperature", "tone", "sharpen", "light_sensation", "vignetting", "fade", "particle"):
                if m.get("type") not in ("brightness", "contrast", "highlight"):
                    raise ValueError(f"Chinh mau '{m.get('type')}' chua ho tro")
                adjust[m["type"]] = float(m.get("value", 0))
            elif k == "color_curves":
                curves = m
            elif k in ("video_effects", "effects"):
                effects += _effect_to_spec(m, 0, 1e9, self.assets, self.warnings)
            elif k == "common_mask" and m.get("resource_type") == "text" and not drafts:
                pass  # mask chu: da thanh o chu (TextNode + fillFrames) trong media_children
            elif k == "common_mask":
                cfg = m.get("config") or {}
                rtype = m.get("resource_type")
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
            elif k == "hsl":
                if any(abs(float(m.get(x, 0))) > 1e-6 for x in ("hue", "saturation", "lightness")):
                    raise ValueError("Chinh mau HSL chua ho tro")
            elif k == "material_animations":
                for a in m.get("animations") or []:
                    node.setdefault("anims", []).append(_transform_anim(a, node["duration"]))
            elif k in ("beats", "time_marks", "color_curves", "drafts", "speeds", "canvases", "sound_channel_mappings", "placeholder_infos", "vocal_separations", "material_colors", None):
                pass
            else:
                raise ValueError(f"Thanh phan clip '{k}' chua ho tro")
        if adjust or curves:
            sig = _color_sig(adjust, curves)
            cmap = []
            for fill in sorted(_collect_fills(node)):
                to = KNOWN_COLOR_ADJUST.get((sig, fill))
                if to is None:
                    raise ValueError(f"Chinh mau {sig} cho mau {fill} chua do (can video CapCut de do)")
                cmap.append({"from": [c / 255 for c in fill], "to": to})
            effects.insert(0, {"type": "color_set", "map": cmap})
        if effects:
            node["effects"] = effects
        return node


# Mask "Van ban" (chu lam mask cho clip video): DO tren LE VIP2-01 xuat that (khop hinh chu, sai so 1%):
# co chu (em, px @ khung rong 1080) = TEXT_MASK_EM x text_config.scale; bold_width 1 = vien day TEXT_MASK_BOLD em moi ben.
# Chu dat thap hon tam dong font TEXT_MASK_DY em (do: 5px o em 143).
TEXT_MASK_EM = 0.8655
TEXT_MASK_BOLD = 0.0105
TEXT_MASK_DY = 0.035


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
                   crop: tuple[int, int, int, int] | None = None) -> list[str]:
    """Trich khung [first, first+count) cua video nguon (dung chi so khung, khong tua theo giay), doi co ve `size`
    (kich thuoc dat tren khung mau), cat `crop` (x, y, w, h sau khi doi co). Mau video: BT.709 (video HD CapCut)."""
    import subprocess
    os.makedirs(out_dir, exist_ok=True)
    vf = f"select=between(n\\,{first}\\,{first + count - 1}),scale={size[0]}:{size[1]}:flags=lanczos"
    if not alpha:
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
        inner0 = next((m for kk, m in (b.glob.get(r, (None, {})) for r in seg.get("extra_material_refs") or []) if kk == "drafts"), {}).get("draft") or {}
        cc0 = inner0.get("canvas_config") or {}
        b.canvas = (int(cc0.get("width") or 1080), int(cc0.get("height") or 1920))
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
    else:
        raise ValueError("Preset phai la 1 clip ghep duy nhat")
    cc = inner.get("canvas_config") or {}
    b.audio = [a for a in b.audio if a["start"] < duration]
    for a in b.audio:
        a["duration"] = min(a["duration"], duration - a["start"])
    spec = {
        "id": tpl_id or re.sub(r"[^a-z0-9]+", "-", meta_name.lower()).strip("-"),
        "name": name or meta_name,
        "version": 1,
        "width": int(cc.get("width") or 1080),
        "height": int(cc.get("height") or 1920),
        "fps": 30,
        "duration": duration,
        "source": {"kind": "capcut_preset", "name": meta_name},
        "slots": b.slots,
        "fonts": [{"id": fid, "file": f"fonts/{os.path.basename(p)}"} for p, fid in b.fonts.items()],
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
