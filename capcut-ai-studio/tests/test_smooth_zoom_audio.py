#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Yeu cau user 2026-10-01:
  1. ZOOM MUOT: zoom in / zoom out khong duoc "cat roi thay khung zoom" — moi thay doi muc zoom la chuyen dong.
     (clip.scale -> zoomFrom/zoomDur, hieu ung tu viet -> gioi han toc do doi scale)
  2. SFX khi chu / hinh hien KHONG to hon giong noi cua video — can theo muc to giong (video thu am nho -> SFX nho).
  3. Chu anh AI: cat ngang khong con du manh duoi chu 'g' cua hang tren.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_smooth_zoom_audio.py
"""
import math
import os
import sys

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

import numpy as np  # noqa: E402

import fx_flow  # noqa: E402
import hook_rule  # noqa: E402
import plan_guard  # noqa: E402
import remotion_plan as RP  # noqa: E402
import speech_cut as SC  # noqa: E402
import text_art  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:600]))
    if not cond:
        FAILED.append(name)


def clip(i, st, en, scale, kind="body"):
    return {"id": "clip%d" % i, "kind": kind, "start": st, "end": en, "scale": scale}


def track(clips, fps=30):
    """Muc zoom moi khung tren CA timeline (nhu renderer: clip dang phat tai khung do)."""
    out = []
    n = int(round(clips[-1]["end"] * fps))
    for f in range(n):
        t = f / float(fps)
        c = next(c for c in clips if c["start"] - 1e-9 <= t < c["end"])
        out.append((t, c, RP.clip_zoom_at(c, t)))
    return out


# ---------------------------------------------------------------------------
print("[1] Zoom cua tung doan: chuyen dong muot, khong nhay o diem cat")
cl = [clip(0, 0.0, 3.2, 1.0), clip(1, 3.2, 6.9, 1.3), clip(2, 6.9, 7.4, 1.0), clip(3, 7.4, 9.0, 1.08),
      clip(4, 9.0, 10.5, 1.0, "insert"), clip(5, 10.5, 13.0, 1.25), clip(6, 13.0, 15.0, 1.25)]
ch = []
RP._smooth_zoom(cl, ch)
tr = track(cl)
jumps = [(round(t, 2), round(abs(z - tr[i - 1][2]), 3)) for i, (t, c, z) in enumerate(tr) if i
         and c["kind"] != "insert" and tr[i - 1][1]["kind"] != "insert" and abs(z - tr[i - 1][2]) > RP.ZOOM_MAX_STEP + 1e-3]
check("moi khung doi zoom <= %.2f (khong co buoc nhay zoom nao)" % RP.ZOOM_MAX_STEP, not jumps, jumps)
cut = [(c0["id"], c1["id"]) for c0, c1 in zip(cl, cl[1:]) if c0["kind"] != "insert" and c1["kind"] != "insert"
       and abs(RP.clip_zoom_at(c1, c1["start"]) - RP.clip_zoom_at(c0, c0["end"])) > 1e-3]
check("o diem cat: clip sau BAT DAU dung muc zoom clip truoc dang giu", not cut, cut)
check("van zoom toi muc AI dat (1.3) khi clip du dai", abs(RP.clip_zoom_at(cl[1], cl[1]["end"] - 0.01) - 1.3) < 1e-3)
check("clip qua ngan (0.5s, 1.3 -> 1.0) -> chi zoom ra toi 1.15 trong 0.5s (van muot, khong ep nhay)",
      abs(cl[2]["scale"] - 1.15) < 1e-3 and abs(cl[2]["zoomDur"] - 0.5) < 1e-3, cl[2])
check("meme cat vao (insert) khong gan zoomFrom", "zoomFrom" not in cl[4] and "zoomFrom" not in cl[5], (cl[4], cl[5]))
check("doan cung muc zoom -> khong co chuyen dong thua", "zoomFrom" not in cl[6], cl[6])
check("nhat ky ghi so cho zoom muot", any("zoom muot" in c for c in ch), ch)
RP._smooth_zoom(cl, [])
check("chay lai on dinh (khong doi them)", "zoomFrom" in cl[1] and abs(RP.clip_zoom_at(cl[1], cl[1]["start"]) - 1.0) < 1e-6)

# ---------------------------------------------------------------------------
print("\n[2] Hieu ung bien doi khung TU VIET: scale khong nhay trong 1 khung")
step = {"scale": [1.25] * 20 + [1.0] * 10, "x": [5.0] * 30}
sm, n = fx_flow.smooth_scale(step, 30)
arr = [1.0] + sm["scale"] + [1.0]
check("code AI nhay 1 -> 1.25 ngay khung dau -> da cham lai (moi khung <= 0.03, ke ca vao / ra)",
      n > 0 and max(abs(a - b) for a, b in zip(arr, arr[1:])) <= fx_flow.ZOOM_MAX_STEP + 1e-6, sm["scale"][:12])
check("x / y (rung) khong bi dung toi", sm["x"] == step["x"])
ok_vals = {"scale": [1 + 0.15 * min(1, i / 10.0) for i in range(20)] + [1.15 - 0.15 * min(1, i / 10.0) for i in range(11)]}
sm2, n2 = fx_flow.smooth_scale(ok_vals, 30)
check("zoom da muot san -> giu nguyen", n2 == 0 and sm2 is ok_vals, n2)
check("dong bo nguong voi renderer / remotion_plan", fx_flow.ZOOM_MAX_STEP == RP.ZOOM_MAX_STEP)

# ---------------------------------------------------------------------------
print("\n[3] SFX can theo GIONG NOI cua chinh video")


def mixed(voice, items, hook_len=0.0):
    p = {"_voice_lufs": voice, "segments": [], "audio": items}
    if hook_len:
        p["segments"] = [{"kind": "hook", "start": 0, "end": hook_len, "target_start": 0}]
    plan_guard.mix_sfx(p, [])
    return p["audio"]


def that(a):
    return a["_play_lufs"] + 20 * math.log10(min(1.0, a["volume"]))


quiet = mixed(-32.0, [{"sfx_id": "pop", "start": 5.0, "_play_lufs": -8.0, "_from_layer": "L1"},
                      {"sfx_id": "vine boom", "start": 12.0, "_play_lufs": -6.0},
                      {"sfx_id": "whoosh", "start": 20.0, "_play_lufs": -12.0}])
check("video thu am NHO (giong -32): SFX khi chu hien <= giong - 3 dB",
      that(quiet[0]) <= -32.0 + plan_guard.SFX_ACCENT_REL + 0.31, (that(quiet[0]), quiet[0]["volume"]))
check("tieng dam (impact) <= giong + 2 dB, whoosh <= giong - 2 dB",
      that(quiet[1]) <= -32.0 + 2.0 + 0.31 and that(quiet[2]) <= -32.0 - 2.0 + 0.31, [(that(a), a["volume"]) for a in quiet])
check("khong con san volume 0.2 (san cu lam SFX to hon giong 15-20 dB)", quiet[0]["volume"] < 0.2, quiet[0]["volume"])
check("ghi do lech so voi giong (rel) cho luat hook / nhat ky", all(a.get("_rel_db") is not None for a in quiet), quiet)
loud = mixed(-10.0, [{"sfx_id": "vine boom", "start": 12.0, "_play_lufs": -6.0}])
check("video thu am TO (giong -10): khong vuot muc tuyet doi cu cua loai (impact -9)",
      that(loud[0]) <= plan_guard.SFX_MIX["impact"]["lufs"] + 0.31, that(loud[0]))
old = mixed(None, [{"sfx_id": "vine boom", "start": 12.0, "_play_lufs": None, "_lufs": -6.0, "file": None}])
check("khong do duoc giong -> giu cach can cu (muc tuyet doi)",
      abs(old[0]["volume"] - plan_guard.sfx_base_volume("impact", -6.0)) < 0.02, old[0])
hk = mixed(-30.0, [{"sfx_id": "vine boom", "start": 0.2, "_play_lufs": -6.0}], hook_len=3.0)
check("SFX trong hook duoc noi hon mot chut nhung van theo giong", that(hk[0]) <= -30.0 + 2.0 + 0.83 + 0.31, that(hk[0]))
check("luat hook: SFX da can theo giong (rel >= -8 dB) la NGHE RO du volume nho",
      hook_rule._audible({"volume": 0.05, "rel": -1.0}) and not hook_rule._audible({"volume": 0.9, "rel": -15.0})
      and hook_rule._audible({"volume": 0.5}) and not hook_rule._audible({"volume": 0.1}))

# do to that bang ffmpeg: 2 file sine cung bien do -> cung LUFS; file nho hon 20 dB -> thap hon ~20
import subprocess  # noqa: E402
import tempfile  # noqa: E402
WORK = tempfile.mkdtemp(prefix="loud-")
FF = RP._ffbin("ffmpeg")
for name, vol, dur in (("a.wav", 0.5, 3), ("b.wav", 0.05, 3)):
    subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=%d" % dur, "-af",
                    "volume=%s" % vol, os.path.join(WORK, name)], check=True)
la, lb = SC.playback_lufs(os.path.join(WORK, "a.wav")), SC.playback_lufs(os.path.join(WORK, "b.wav"))
check("playback_lufs do duoc va dung ti le (20 dB)", la is not None and lb is not None and abs((la - lb) - 20.0) < 1.0, (la, lb))
pv = {"source_videos": [{"id": "s", "path": os.path.join(WORK, "b.wav")}],
      "segments": [{"source_id": "s", "start": 0.0, "end": 3.0}]}
vl = SC.voice_level(pv)
check("voice_level cua file nho ~ muc do cua chinh no", vl is not None and abs(vl - lb) < 1.5, (vl, lb))

# ---------------------------------------------------------------------------
print("\n[4] Chu anh AI: cat ngang khong con manh duoi chu 'g' cua hang tren")
H, W = 200, 120
soft = np.zeros((H, W), dtype=bool)
soft[20:70, 10:110] = True            # hang 1: than chu
soft[70:118, 80:90] = True            # duoi chu 'g' cua hang 1 thong xuong qua duong cat (y ~ 105)
soft[140:190, 10:110] = True          # hang 2: than chu
soft[126:134, 30:40] = True           # dau / mu cua hang 2 (tach roi, nam tren than chu)
rows = [(20, 69), (140, 189)]
bounds = [(0, 104), (104, H - 1)]
own = text_art.row_masks(soft, rows, bounds)
check("ca duoi 'g' (ke ca phan qua duong cat) thuoc hang 1", (own[70:118, 80:90] == 0).all())
check("hang 2 khong con pixel nao cua chu hang 1", not ((own == 1) & (np.arange(H)[:, None] < 140) & soft)[:, 80:90].any())
check("dau thanh cua hang 2 van thuoc hang 2", (own[126:134, 30:40] == 1).all())
merged = np.zeros((H, W), dtype=bool)
merged[20:190, 50:55] = True           # vet bong dai noi lien 2 hang -> chia theo duong cat
own2 = text_art.row_masks(merged, rows, bounds)
check("net dinh lien hai hang -> chia theo duong cat (khong mat hang)", (own2[20:104, 50:55] == 0).all()
      and (own2[105:190, 50:55] == 1).all())
lab = text_art._components(soft)
check("gan nhan thanh phan lien thong: 3 net rieng", len(set(lab[soft].tolist())) == 3, set(lab[soft].tolist()))
pr = text_art.sheet_prompt([{"key": "k", "tiers": [{"text": "tặng voucher", "role": "phu"}, {"text": "HỜI", "role": "chinh"}]}],
                           {}, {}, False, "/tmp/x.png")
check("prompt tao chu anh luon co LUAT CAT NGANG (khoang dong rong, tinh ca duoi chu g / dau thanh)",
      "LUAT CAT NGANG" in pr and "g, y, p" in pr and pr.index("LUAT CAT NGANG") < pr.index("Tao xong"), pr[-700:])

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
