#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO NHAC NEN (2026-10-05): kho + Gemini nghe gan nhan + B7 chon bai + dung nhac SAU hook, can theo giong noi.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_music_lib.py      (can flask + ffmpeg + numpy)
Khong goi AI that: gia lap o tang providers._gemini_analyze_videos (nhan) va providers._chat (lap ke hoach).
"""
import os
import sys
import json
import math
import shutil
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))
os.environ["STUDIO_LICENSE_OFF"] = "1"

import music_lib       # noqa: E402
import providers       # noqa: E402
import prompt_store    # noqa: E402
import remotion_plan   # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:400]))
    if not cond:
        FAILED.append(name)


FF = remotion_plan._ffbin("ffmpeg")
TMP = tempfile.mkdtemp(prefix="music-lib-")


def tone(path, dur, freq=220, vol=0.3):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "sine=frequency=%d:duration=%s" % (freq, dur), "-af", "volume=%s" % vol, "-ac", "2", path],
                   check=True)
    return path


print("[1] Kho: nhap file, do do dai + do to, id theo noi dung")
A = music_lib.import_local(tone(os.path.join(TMP, "Chill Lofi.mp3"), 60, 1000, 0.5), meta={
    "license": "CC0 1.0", "source": "freesound", "artist": "x", "source_url": "https://freesound.org/s/1/"})
B = music_lib.import_local(tone(os.path.join(TMP, "Upbeat_Fun.mp3"), 25, 440, 0.6))
C = music_lib.import_local(tone(os.path.join(TMP, "short.mp3"), 8))
check("do duoc do dai", abs((A.get("duration") or 0) - 60) < 0.5 and abs((B.get("duration") or 0) - 25) < 0.5,
      (A.get("duration"), B.get("duration")))
check("do duoc do to (LUFS I)", isinstance(A.get("lufs_i"), float) and isinstance(B.get("lufs_i"), float)
      and A["lufs_i"] > -30, (A.get("lufs_i"), B.get("lufs_i")))
check("file chep vao kho", A["file"].startswith(music_lib.MUSIC_DIR) and os.path.isfile(A["file"]))
again = music_lib.import_local(os.path.join(TMP, "Chill Lofi.mp3"))
check("nhap lai cung file -> cung id, khong trung muc", again["id"] == A["id"] and len(music_lib.list_tracks()) == 3)
check("nhap lai giu giay phep CC0 cu", again.get("license") == "CC0 1.0", again.get("license"))
check("nhac tu nhap mac dinh 'nhac cua ban'", B.get("license", "").startswith("Nhạc của bạn"), B.get("license"))
check("cai dat kho chi con bat / tat (khong chinh do to o kho)", music_lib.settings() == {"auto": True}, music_lib.settings())
check("quy tac mac dinh: nhac nen = 20% tieng nguoi = -14 dB", music_lib.voice_pct() == 20
      and abs(music_lib.rel_db() + 13.98) < 0.01, (music_lib.voice_pct(), music_lib.rel_db()))
try:
    music_lib.import_local(os.path.join(TMP, "khong-co.mp3"))
    check("file khong ton tai -> loi", False)
except RuntimeError:
    check("file khong ton tai -> loi", True)

print("\n[2] Gemini nghe (ban nen mono) -> nhan chuan hoa; model tra sai id -> khop theo thu tu")
GOI = []


def fake_analyze(videos, prompt, label, log=None, step_label=""):
    GOI.append({"files": [v["path"] for v in videos], "prompt": prompt, "step": step_label})
    out = []
    for i, v in enumerate(videos):
        out.append({"id": v["id"] if i != 1 else "sai-id", "summary": "piano nhe %d" % i, "genre": "lofi",
                    "moods": ["thu gian", "am ap"] if i == 0 else ["vui tuoi", "nang dong"],
                    "energy": "thấp" if i == 0 else "cao", "tempo": "cham", "bpm": "84",
                    "has_vocals": i == 2, "speech_friendly": "tot" if i == 0 else "vua",
                    "use_when": "chia se nhe nhang" if i == 0 else "video hai huoc nang dong",
                    "avoid_when": ["tin buon"], "best_start": 12 if i == 0 else 999, "tags": ["lofi"]})
    return {"tracks": out}


providers._gemini_analyze_videos = fake_analyze
res = music_lib.label_with_ai([A["id"], B["id"], C["id"], "khong-co"])
check("1 luot cho 3 bai (LABEL_BATCH)", len(GOI) == 1 and len(GOI[0]["files"]) == 3, GOI)
check("gui ban NEN (cache music-gemini), khong gui file goc",
      all(f.startswith(music_lib.GEMINI_CACHE) for f in GOI[0]["files"]), GOI[0]["files"])
check("prompt Gemini + danh sach file", "MUSIC SUPERVISOR" in GOI[0]["prompt"] and A["id"] in GOI[0]["prompt"])
check("step Gemini-music", GOI[0]["step"] == "Gemini-music")
check("3 bai cap nhat + 1 loi id la", len(res["updated"]) == 3 and [f["id"] for f in res["failed"]] == ["khong-co"], res)
a = music_lib.get(A["id"])
b = music_lib.get(B["id"])
check("chuan hoa 'thấp' -> thap", a.get("energy") == "thap", a.get("energy"))
check("bpm chuoi -> so", a.get("bpm") == 84, a.get("bpm"))
check("best_start giu khi hop le", a.get("best_start") == 12.0, a.get("best_start"))
check("best_start kep <= do dai - 30s", b.get("best_start") == 0.0, b.get("best_start"))
check("sai id -> khop theo thu tu (bai 2 co nhan)", b.get("labeled_by") == "gemini" and b.get("summary") == "piano nhe 1")
check("ten user dat giu nguyen", a.get("name") == "Chill Lofi", a.get("name"))

print("\n[3] Danh muc cho AI lap ke hoach")
cat = music_lib.catalog_for_plan()
ids = [r["id"] for r in cat]
check("bai qua ngan (8s) khong vao danh muc", C["id"] not in ids and A["id"] in ids and B["id"] in ids, ids)
check("khong co duong dan file", all("file" not in r for r in cat))
check("co nhan Gemini", next(r for r in cat if r["id"] == A["id"]).get("speech_friendly") == "tot")
music_lib.update(B["id"], disabled=True)
check("bai tat khong vao danh muc", B["id"] not in [r["id"] for r in music_lib.catalog_for_plan()])
music_lib.update(B["id"], disabled=False)
music_lib.set_settings(auto=False)
check("tat 'tu them nhac nen' -> danh muc rong", music_lib.catalog_for_plan() == [])
music_lib.set_settings(auto=True)
check("prompt rieng (own_key) -> khong doi van tay chung", all(
    p.get("own_key") for p in prompt_store.PROMPTS if p["id"] in ("_MUSIC_RULE", "_GEMINI_MUSIC_PROMPT")))

print("\n[4] B7: kho nhac rong -> prompt + payload Y HET truoc; co kho -> them luat + danh muc + nhac goc")
SEEN = []


def fake_chat(name, messages, **k):
    SEEN.append({"sys": messages[0]["content"], "user": json.loads(messages[1]["content"])})
    return json.dumps({"audio": [], "music": {"track_id": A["id"], "ly_do": "nhe nhang"}})


providers._chat = fake_chat
SFX = [{"id": "kit-boom", "name": "Boom", "emotion": "punch", "use_when": "chot"}]
kw = dict(key_moments_data={}, emotion_map_data={}, sfx_catalog=SFX, segments=[], transcript_data={},
          story={"tone": "nhe nhang"})
providers.gpt_audio(**kw)
providers.gpt_audio(**kw, music_catalog=[], music_ctx={"nhac_nen_video_goc": []})
check("music_catalog rong -> system prompt y het", SEEN[0]["sys"] == SEEN[1]["sys"])
check("music_catalog rong -> payload y het", SEEN[0]["user"] == SEEN[1]["user"])
check("khong co chu NHAC NEN khi kho rong", "NHAC NEN" not in SEEN[0]["sys"])
out = providers.gpt_audio(**kw, music_catalog=cat, music_ctx={"nhac_nen_video_goc": [{"source_id": "s", "co": False}]})
check("luat B7 noi ro quy tac 20% tieng nguoi", "20% tieng nguoi" in SEEN[2]["sys"], SEEN[2]["sys"][-900:-500])
check("co kho -> luat nhac nen + danh muc trong system prompt",
      "NHAC NEN" in SEEN[2]["sys"] and A["id"] in SEEN[2]["sys"], SEEN[2]["sys"][-300:])
check("co kho -> payload co nhac nen video goc", SEEN[2]["user"].get("nhac_nen") == {"nhac_nen_video_goc": [{"source_id": "s", "co": False}]})
check("B7 tra khoa music", (out or {}).get("music", {}).get("track_id") == A["id"])
n0 = len(SEEN)
out = providers.gpt_audio(**dict(kw, sfx_catalog=[]), music_catalog=cat)
check("kho SFX rong nhung co nhac -> B7 van chay", len(SEEN) == n0 + 1 and out.get("music"))
check("ca hai rong -> bo qua B7", providers.gpt_audio(**dict(kw, sfx_catalog=[])) == {"audio": []} and len(SEEN) == n0 + 1)

print("\n[5] Chon bai: AI dung / AI noi khong dung / AI bo qua / id sai -> code chon")
EM = []
emit = lambda m, lvl: EM.append((lvl, m))      # noqa: E731
r = music_lib.choose({"track_id": B["id"], "ly_do": "hai"}, cat, emit=emit)
check("AI chon dung id", r["track_id"] == B["id"] and r["by"] == "ai" and "muc" not in r, r)
r = music_lib.choose({"track_id": None, "ly_do": "video goc da co nhac"}, cat, emit=emit)
check("AI noi khong dung (co ly do) -> ton trong", r["track_id"] is None and "da co nhac" in r["ly_do"], r)
r = music_lib.choose(None, cat, story={"tone": "tam su nhe nhang chia se"}, emit=emit)
check("AI bo qua khoa music -> code chon bai hop giong noi (A)", r["track_id"] == A["id"] and r["by"] == "code", r)
r = music_lib.choose({"track_id": "bia"}, cat, emit=emit)
check("id sai -> code chon", r["by"] == "code" and r["track_id"], r)
check("kho rong -> None", music_lib.choose({"track_id": A["id"]}, []) is None)
check("ghi nhat ky moi lan chon", len(EM) == 4, EM)

print("\n[6] Dung nhac: SAU hook, duoi giong noi, giam khi meme cat vao, fade 2 dau, noi bai khi bai ngan")


def env_at(env, t):
    if t <= env[0][0]:
        return env[0][1]
    for (t0, v0), (t1, v1) in zip(env, env[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * (t - t0) / max(1e-9, t1 - t0)
    return env[-1][1]


def db(v):
    return 20 * math.log10(max(1e-6, v))


def mk(track, dur=40.0, hook_end=3.0, voice=-18.0):
    p = {"music": {"track_id": track["id"], "name": track["name"]}, "_voice_lufs": voice,
         "segments": [{"source_id": "s", "start": 10, "end": 13, "target_start": 0, "kind": "hook"},
                      {"source_id": "s", "start": 0, "end": 20, "target_start": 3},
                      {"source_id": "m", "start": 0, "end": 2, "target_start": 23, "kind": "insert"},
                      {"source_id": "s", "start": 20, "end": 35, "target_start": 25}],
         "speech": [{"source_id": "s", "start": 0, "end": 8}, {"source_id": "s", "start": 12, "end": 35}]}
    spec = {"duration": dur, "clips": [{"kind": "hook", "start": 0, "end": hook_end},
                                       {"kind": "body", "start": hook_end, "end": 23},
                                       {"kind": "insert", "start": 23, "end": 25},
                                       {"kind": "body", "start": 25, "end": dur}], "overlays": []}
    ch = []
    return music_lib.plan_rows(p, spec, ch), ch


rows, ch = mk(a)
r0 = rows[0] if rows else {}
check("1 dong bgm", len(rows) == 1 and r0.get("role") == "bgm", rows)
check("bat dau DUNG luc het hook (khong co nhac o hook)", r0.get("start") == 3.0, r0.get("start"))
check("bat dau bai tu best_start", r0.get("srcStart") == 12.0, r0.get("srcStart"))
envr = r0.get("env") or [[0, 0]]
check("fade in tu 0", envr[0][1] == 0.0, envr[:2])
check("fade out ve 0 o cuoi video", abs(envr[-1][0] - 37.0) < 0.06 and envr[-1][1] == 0.0, envr[-2:])
check("nhac = 20% tieng nguoi (-14 dB, bao cao rel)", r0.get("rel") is not None and abs(r0["rel"] - (-14.0)) < 0.6, r0.get("rel"))
lvl = music_lib._track_level(a["file"], 12, 49, a.get("lufs_i"))
speech_v = env_at(envr, 5.0 - 3.0)         # timeline 5s: dang noi
check("do thuc te = giong - 14 dB", abs(lvl + db(speech_v) - (-18.0 - 13.98)) < 0.6, (lvl, db(speech_v)))
gap_v = env_at(envr, 13.8 - 3.0)           # timeline 11..15: nguon 8..12 KHONG loi
check("khoang khong loi GIU dung 20% (khong nhich len)", abs(db(gap_v) - db(speech_v)) < 0.3, (db(gap_v), db(speech_v)))
check("khong luc nao vuot 20% tieng nguoi", max(lvl + db(v) for _, v in envr if v > 0) <= -18.0 - 13.98 + 0.3,
      max(v for _, v in envr))
ins_v = env_at(envr, 24.5 - 3.0)
check("meme cat vao -> nhac giam sau (~-12 dB)", db(ins_v) - db(speech_v) < -10, (db(ins_v), db(speech_v)))
check("ghi nhat ky dung", any("nhac nen" in c and "sau hook" in c for c in ch), ch)
rows2, _ = mk(a, voice=-30.0)
check("giong nho (-30) -> nhac nho theo (van 20% tieng nguoi)", abs(rows2[0].get("rel", 0) - (-14.0)) < 0.6
      and rows2[0]["volume"] < rows[0]["volume"], (rows2[0].get("rel"), rows2[0]["volume"], rows[0]["volume"]))
import plan_guard  # noqa: E402
os.makedirs(os.path.dirname(plan_guard.OVERRIDES_PATH), exist_ok=True)
with open(plan_guard.OVERRIDES_PATH, "w", encoding="utf-8") as f:
    json.dump({"version": 1, "rules": {"MUSIC_VOICE_PCT": 10}}, f)
rows3, _ = mk(a)
check("sua quy tac (Prompt & quy tac) 10% -> nho hon 20% dung 6 dB",
      music_lib.voice_pct() == 10 and abs(db(rows3[0]["volume"]) - db(rows[0]["volume"]) + 6.02) < 0.3,
      (music_lib.voice_pct(), rows3[0]["volume"], rows[0]["volume"]))
os.remove(plan_guard.OVERRIDES_PATH)
check("bo sua -> ve 20%", music_lib.voice_pct() == 20)
rows6, ch6 = mk(b, dur=60.0)
check("bai 25s, video 60s -> noi bai (nhieu dong, cross-fade)", len(rows6) >= 3, [(r["start"], r["srcStart"], r["srcEnd"]) for r in rows6])
check("dong sau bat dau truoc khi dong truoc het (cross-fade)",
      all(rows6[i + 1]["start"] < rows6[i]["start"] + rows6[i]["srcEnd"] - rows6[i]["srcStart"] for i in range(len(rows6) - 1)))
check("dong cuoi ket thuc dung het video", abs(rows6[-1]["start"] + rows6[-1]["srcEnd"] - rows6[-1]["srcStart"] - 60.0) < 0.01)
rows7, ch7 = mk(a, dur=6.0, hook_end=3.0)
check("phan sau hook < 4s -> khong dat nhac", rows7 == [] and any("khong dat nhac" in c for c in ch7), ch7)
print("\n[6b] Tron san 1 file WAV (Remotion lam tron volume 0.01 -> nhac nho lech ~2 dB neu de no tu chinh)")
import numpy as np  # noqa: E402


def mk_spec(track, dur=40.0):
    rows_, _ = mk(track, dur=dur)
    p = {"music": {"track_id": track["id"], "name": track["name"]}, "_voice_lufs": -18.0,
         "segments": [{"source_id": "s", "start": 10, "end": 13, "target_start": 0, "kind": "hook"},
                      {"source_id": "s", "start": 0, "end": 20, "target_start": 3},
                      {"source_id": "m", "start": 0, "end": 2, "target_start": 23, "kind": "insert"},
                      {"source_id": "s", "start": 20, "end": 35, "target_start": 25}],
         "speech": [{"source_id": "s", "start": 0, "end": 8}, {"source_id": "s", "start": 12, "end": 35}]}
    spec = {"duration": dur, "clips": [{"kind": "hook", "start": 0, "end": 3.0}, {"kind": "body", "start": 3.0, "end": 23},
                                       {"kind": "insert", "start": 23, "end": 25}, {"kind": "body", "start": 25, "end": dur}],
            "overlays": []}
    return music_lib.to_spec(p, spec, []), rows_


sp_rows, raw_rows = mk_spec(a)
r1 = sp_rows[0] if sp_rows else {}
check("1 dong, file WAV tron san, volume 1.0, khong env", len(sp_rows) == 1 and r1["path"].endswith(".wav")
      and r1["volume"] == 1.0 and "env" not in r1 and os.path.isfile(r1["path"]), sp_rows)
check("bat dau sau hook, dai toi het video", r1.get("start") == 3.0 and abs(r1["srcEnd"] - 37.0) < 0.01, r1)
sp_rows2, _ = mk_spec(a)
check("dung lai cung file (cache theo noi dung) -> spec on dinh", sp_rows2 == sp_rows)
pcm = music_lib._decode(r1["path"], 0, 37).mean(axis=1)


def rms_db(t0_, t1_):
    seg = pcm[int(t0_ * music_lib.MIX_SR):int(t1_ * music_lib.MIX_SR)]
    return 20 * math.log10(max(1e-9, float(np.sqrt(np.mean(seg ** 2)))))


src_db = 20 * math.log10(float(np.sqrt(np.mean(music_lib._decode(a["file"], 14, 20).mean(axis=1) ** 2))))
want = db(env_at(raw_rows[0]["env"], 4.0))
check("muc trong file tron = duong am luong (+-0.3 dB)", abs(rms_db(3.0, 5.0) - src_db - want) < 0.3,
      (rms_db(3.0, 5.0), src_db, want))
check("khoang khong loi = luc noi (20% co dinh)", abs(rms_db(9.0, 11.0) - rms_db(3.0, 5.0)) < 0.5, (rms_db(9.0, 11.0), rms_db(3.0, 5.0)))
check("meme cat vao nho hon >= 10 dB", rms_db(20.6, 21.4) - rms_db(3.0, 5.0) < -10, rms_db(20.6, 21.4))
check("dau file (fade in) gan nhu im", rms_db(0, 0.1) < rms_db(3.0, 5.0) - 15, rms_db(0, 0.1))
sp_loop, raw_loop = mk_spec(b, dur=60.0)
check("bai ngan -> van 1 file tron (noi bai ben trong)", len(sp_loop) == 1 and len(raw_loop) >= 3
      and abs(sp_loop[0]["srcEnd"] - 57.0) < 0.01, (sp_loop, len(raw_loop)))

p_bad = {"music": {"track_id": "da-xoa", "name": "X"}}
check("bai khong con trong kho -> bo nhac", music_lib.to_spec(p_bad, {"duration": 30, "clips": [{"kind": "body", "end": 30}]}, []) == [])
check("plan khong co music -> []", music_lib.to_spec({}, {"duration": 30, "clips": []}, []) == [])
check("nghe thu o muc nen: volume < 1", 0 < (music_lib.mix_preview(a["id"]) or 0) < 1, music_lib.mix_preview(a["id"]))

print("\n[7] Dong bo kho: nhac CC0 tu manifest; giu chinh rieng cua may nay")
import library_sync  # noqa: E402
music_lib.update(a["id"], disabled=True)
srv = tempfile.mkdtemp(prefix="music-srv-")
moi = tone(os.path.join(srv, "m-new.mp3"), 30, 330)


def fake_download(url, dest, sha=None, tries=3):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(url.replace("file://", ""), dest)


library_sync._download = fake_download
src_a = os.path.join(srv, os.path.basename(a["file"]))
shutil.copyfile(a["file"], src_a)
man = {"music": [
    {"id": a["id"], "name": "Chill Lofi", "file": os.path.basename(a["file"]), "url": "file://" + src_a,
     "license": "CC0 1.0", "summary": "nhan moi tu R2", "labeled_by": "gemini", "use_when": "x", "duration": 60},
    {"id": "m-new-123456", "name": "New", "file": "m-new.mp3", "url": "file://" + moi, "license": "CC0 1.0",
     "labeled_by": "gemini", "use_when": "y", "duration": 30}]}
res = library_sync.pull(man)
mu = res.get("music") or {}
check("pull: +1 moi, 1 cap nhat", mu.get("added") == 1 and mu.get("updated") == 1, mu)
a2 = music_lib.get(a["id"])
check("nhan cap nhat tu R2", a2.get("summary") == "nhan moi tu R2")
check("giu chinh rieng may nay (bai da tat)", a2.get("disabled") is True, a2)
check("file viet lai theo may", music_lib.get("m-new-123456")["file"] == os.path.join(music_lib.MUSIC_DIR, "m-new.mp3"))
check("muc nguoi dung tu nhap van con", music_lib.get(B["id"]) is not None)
res = library_sync.pull({"sfx": []})
check("manifest cu khong co 'music' -> khong dong gi", len(music_lib.list_tracks()) == 4, len(music_lib.list_tracks()))
music_lib.update(a["id"], disabled=False)

print("\n[8] publish-library: CHI nhac CC0 duoc dua len kho chung (dry-run)")
node = shutil.which("node")
if node:
    r = subprocess.run([node, os.path.join(ROOT, "scripts", "publish-library.mjs"), "--dry-run"],
                       capture_output=True, text=True, cwd=ROOT, env=dict(os.environ))
    outp = r.stdout + r.stderr
    n_cc0 = sum(1 for t in music_lib.list_tracks() if (t.get("license") or "").startswith("CC0"))
    check("dry-run chay", r.returncode == 0, outp[-400:])
    check("chi %d bai CC0 vao manifest" % n_cc0, ("Nhac nen %d" % n_cc0) in outp, outp[-300:])
    check("bai 'nhac cua ban' bi bo qua", "khong phai CC0" in outp and B["id"] in outp, outp[-500:])
else:
    print("  (khong co node — bo qua)")

print("\n[9] Autoplan: kho rong -> plan khong co nhac + B7 y nhu cu; co kho -> plan.music + spec co bgm sau hook")
import server          # noqa: E402
import engine          # noqa: E402
import meme_lib        # noqa: E402
import media_vision    # noqa: E402
import text_art        # noqa: E402
import sfx_kit         # noqa: E402

SRC = os.path.join(TMP, "a.mp4")
subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=30",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=30", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                SRC], check=True)
TR = [{"start": 0.0, "end": 2.0, "text": "Toi mat ba ty trong mot dem"},
      {"start": 2.3, "end": 5.8, "text": "vi tin mot loi quang cao"},
      {"start": 8.0, "end": 10.5, "text": "Dung bao gio lam nhu toi"},
      {"start": 10.8, "end": 13.9, "text": "hay kiem tra truoc khi chuyen tien"}]
BRIEF = {"source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 30.0}],
         "sources": [{"id": "source_1", "summary": "bai hoc", "transcript": TR, "emotion_map": [], "key_moments": [],
                      "faces_region": "giua-tren", "nhac_nen": {"co": False}}]}
TRA = {
    "B1-select": {"story_arc": "x", "tone": "chia se nhe nhang", "selections": [
        {"source_id": "source_1", "start": 0.0, "end": 13.9, "beat": "hook"}]},
    "B2-timeline": {"segments": [{"source_id": "source_1", "start": 0.0, "end": 13.9, "target_start": 0.0}], "duration": 13.9},
    "B3-hook": {"hook": {"source_id": "source_1", "src_start": 8.0, "src_end": 10.5, "caption": "DUNG", "reason": "x"}},
    "R4-design": {"scenes": [], "layers": [], "assets": [], "transitions": [], "effects": [], "grade": {"preset": "none"}},
    "R5-captions": {"captions": [], "caption_theme": {}},
    "B7-audio": {"audio": [], "music": {"track_id": A["id"], "ly_do": "nhe nhang hop tam su"}},
}
SYS7 = []


def fake_chat2(name, messages, **k):
    lab = k.get("step_label")
    if lab == "B7-audio":
        SYS7.append((messages[0]["content"], json.loads(messages[1]["content"])))
    return json.dumps(TRA.get(lab, {}), ensure_ascii=False)


providers._chat = fake_chat2
text_art.gen_sheet = lambda *a, **k: None
server._can_gio_loi_noi = lambda brief: brief
media_vision.face_box = lambda *a, **k: None
sfx_kit.ensure_kit()
engine.sfx_catalog_for_plan = lambda *a, **k: [{"id": "kit-boom", "name": "Boom", "emotion": "punch", "use_when": "chot"}]
meme_lib.meme_catalog_for_plan = lambda *a, **k: []


def autoplan():
    with server.app.test_client() as c:
        return c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True, "title": "t"}).get_json() or {}


music_lib.set_settings(auto=False)
d0 = autoplan()
check("tat nhac nen: autoplan xong", d0.get("ok"), d0.get("error"))
check("tat nhac nen: plan.music = None", (d0.get("plan") or {}).get("music") is None)
check("tat nhac nen: B7 khong co luat nhac", SYS7 and "NHAC NEN" not in SYS7[-1][0] and "nhac_nen" not in SYS7[-1][1])
check("tat nhac nen: spec khong co bgm", not any(x.get("role") == "bgm" for x in (d0.get("spec") or {}).get("audio") or []))
music_lib.set_settings(auto=True)
d1 = autoplan()
pl, sp = d1.get("plan") or {}, d1.get("spec") or {}
check("bat nhac nen: autoplan xong", d1.get("ok"), d1.get("error"))
check("B7 nhan danh muc + nhac goc", "NHAC NEN" in SYS7[-1][0] and SYS7[-1][1].get("nhac_nen", {}).get(
    "nhac_nen_video_goc") == [{"source_id": "source_1", "co": False, "muc": None, "mo_ta": None}], SYS7[-1][1].get("nhac_nen"))
check("plan.music = bai AI chon", (pl.get("music") or {}).get("track_id") == A["id"] and pl["music"]["by"] == "ai", pl.get("music"))
bgm = [x for x in sp.get("audio") or [] if x.get("role") == "bgm"]
hk = max([c["end"] for c in sp.get("clips") or [] if c.get("kind") == "hook"] or [0])
check("spec co nhac nen", len(bgm) == 1, sp.get("audio"))
check("nhac bat dau dung het hook", bgm and hk > 0 and abs(bgm[0]["start"] - hk) < 0.01, (bgm[:1], hk))
check("tom tat: sfx khong dem nhac nen, co ten nhac nen",
      (d1.get("summary") or {}).get("nhac_nen") == "Chill Lofi"
      and (d1.get("summary") or {}).get("sfx") == len(sp.get("audio") or []) - 1, d1.get("summary"))
sp2, _ = remotion_plan.build_spec(pl)
check("spec nhac nen = file tron san volume 1.0", bgm and bgm[0]["path"].startswith(music_lib.MIX_DIR) and bgm[0]["volume"] == 1.0, bgm)
check("dung lai spec tu plan -> nhac y nhu cu (on dinh)",
      [x for x in sp2["audio"] if x.get("role") == "bgm"] == bgm)

shutil.rmtree(TMP, ignore_errors=True)
shutil.rmtree(srv, ignore_errors=True)
print("\n%s" % ("TAT CA PASS" if not FAILED else "FAIL %d: %s" % (len(FAILED), FAILED)))
sys.exit(1 if FAILED else 0)
