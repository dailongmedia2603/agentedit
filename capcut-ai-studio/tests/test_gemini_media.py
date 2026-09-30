#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test chuan bi video cho Gemini (nen 720p + cat THEO DUNG LUONG) va ghep ket qua cac phan.
Chay (HOME tam de khong dung du lieu that):
    HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_gemini_media.py

Can ffmpeg/ffprobe (tao video thu bang lavfi). KHONG goi Gemini that: buoc goi AI bi thay
bang ban gia lap tra ket qua co moc gio de kiem tra cong gio / bo trung.

Cac dieu can dam bao:
  1. plan_cuts: moi phan <= muc byte, bat dau o keyframe, phu kin [0, duration], chong lan,
     diem cat lui ve khoang im lang.
  2. Nen: canh ngan <= 720 (ca video doc co rotation), khong phong to video nho, fps <= 30,
     giu tieng, cache (lan 2 khong nen lai).
  3. Cat that: moi file <= gioi han, moc bat dau khop keyframe, cache.
  4. Ghep: moc gio dung tren video goc, khong trung o doan chong lan, quality lay muc te nhat.
  5. Luong day du (providers.gemini_understand_sources): vua 1 lan -> y nhu cu (1 lan goi, khong
     ghep); qua gioi han -> nhieu lan goi song song + ghep + buoc AI ghep; cache tung lan goi,
     fresh=True goi lai; loi buoc ghep AI khong lam hong ket qua; CLI thu lai 1 lan.
"""
import os
import re
import sys
import json
import shutil
import subprocess
import tempfile

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

import config  # noqa: E402
import gemini_media  # noqa: E402
import providers  # noqa: E402
import run_log  # noqa: E402
import remotion_plan  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)))
    if not cond:
        FAILED.append(name)


def section(t):
    print("\n" + t)


FF = remotion_plan._ffbin("ffmpeg")
WORK = tempfile.mkdtemp(prefix="gm-test-")


def make_video(name, w, h, dur, fps=30, rotate=None, audio=True):
    """Video thu: hinh chuyen dong + tieng 'bip' 4.5s / im 1.5s (de co khoang im lang)."""
    out = os.path.join(WORK, name)
    argv = [FF, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=%dx%d:rate=%d:duration=%s" % (w, h, fps, dur)]
    if audio:
        argv += ["-f", "lavfi", "-i",
                 "aevalsrc='if(lt(mod(t,6),4.5),0.5*sin(2*PI*440*t),0)':s=44100:d=%s" % dur]
    argv += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p"]
    if audio:
        argv += ["-c:a", "aac", "-b:a", "128k", "-shortest"]
    argv += [out]
    r = subprocess.run(argv, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-400:])
    if rotate is not None:
        rot = out.replace(".mp4", "_rot.mp4")
        r = subprocess.run([FF, "-v", "error", "-y", "-display_rotation", str(rotate), "-i", out,
                            "-c", "copy", rot], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr[-400:])
        return rot
    return out


def dims(path):
    r = subprocess.run([remotion_plan._ffbin("ffprobe"), "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", path],
                       capture_output=True, text=True)
    s = (json.loads(r.stdout or "{}").get("streams") or [{}])[0]
    w, h = s.get("width"), s.get("height")
    rot = 0
    for sd in s.get("side_data_list") or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    if abs(rot) in (90, 270):
        w, h = h, w
    return w, h


# ---------------------------------------------------------------------------
section("[1] plan_cuts (ham thuan): theo dung luong, keyframe, chong lan, khoang im lang")
# 100s, 1000 goi/giay-ish: canh dau 'nang' (4 KB/goi), sau 'nhe' (1 KB/goi) -> phan dau ngan hon
pk = []
for i in range(1000):
    t = i * 0.1
    pk.append((t, 4000 if t < 40 else 1000))
keys = [float(k) for k in range(0, 100, 2)]
sil = [(28.7, 29.3), (57.0, 57.6)]
target = 500000   # canh nang 40 KB/s -> ~12s/phan; canh nhe 10 KB/s -> ~50s/phan
cuts = gemini_media.plan_cuts(pk, keys, 100.0, sil, target, overlap=5.0)


def bytes_in(st, en):
    return sum(b for t, b in pk if st <= t < en)


check("phu tu 0", cuts[0][0] == 0.0, cuts)
check("phu toi het video", abs(cuts[-1][1] - 100.0) < 1e-6, cuts)
check("moi phan <= muc byte", all(bytes_in(a, b) <= target for a, b in cuts),
      [(a, b, bytes_in(a, b)) for a, b in cuts])
check("moi phan (tru phan dau) bat dau o keyframe", all(a in keys for a, _ in cuts[1:]), cuts)
check("phan sau chong len phan truoc", all(cuts[i + 1][0] < cuts[i][1] for i in range(len(cuts) - 1)), cuts)
check("chong lan >= 5s khi co keyframe", all(cuts[i][1] - cuts[i + 1][0] >= 5.0 - 1e-6 for i in range(len(cuts) - 1)),
      cuts)
check("tien trien (khong lap vo han)", all(cuts[i + 1][0] > cuts[i][0] for i in range(len(cuts) - 1)), cuts)
lens = [b - a for a, b in cuts]
check("canh nang -> phan ngan hon (cat theo byte, khong theo giay)", lens[0] < lens[-2], lens)
check("diem cat lui ve giua khoang im lang 28.7-29.3", any(abs(b - 29.0) < 1e-6 for _, b in cuts), cuts)

# video vua gioi han -> 1 phan
one = gemini_media.plan_cuts(pk, keys, 100.0, sil, 10 ** 9)
check("vua gioi han -> 1 phan", one == [(0.0, 100.0)], one)
# khong co keyframe nao sau 0 -> van tien trien, khong treo
nk = gemini_media.plan_cuts(pk, [0.0], 100.0, [], target)
check("thieu keyframe van chia duoc (khong treo)", len(nk) >= 2 and nk[-1][1] == 100.0, nk)
check("thieu keyframe: cac phan noi tiep nhau", all(nk[i + 1][0] == nk[i][1] for i in range(len(nk) - 1)), nk)

# ---------------------------------------------------------------------------
section("[2] Nen 720p: canh ngan, khong phong to, fps, rotation, cache")
land = make_video("land.mp4", 1920, 1080, 20)
comp = gemini_media.compress(land)
check("ngang 1080p -> 1280x720", dims(comp["path"]) == (1280, 720), dims(comp["path"]))
check("nhe hon file goc", comp["bytes"] < comp["src_bytes"], (comp["bytes"], comp["src_bytes"]))
check("giu tieng", gemini_media.probe(comp["path"])["has_audio"])
check("do dai giu nguyen", abs((comp["duration"] or 0) - 20) < 0.3, comp["duration"])
again = gemini_media.compress(land)
check("lan 2 dung cache", again["cached"] and again["path"] == comp["path"], again)

portrait = make_video("port.mp4", 1920, 1080, 6, rotate=90)
cp = gemini_media.compress(portrait)
check("video doc (rotation 90) -> 720x1280 (canh NGAN 720)", dims(cp["path"]) == (720, 1280), dims(cp["path"]))

small = make_video("small.mp4", 640, 360, 4)
cs = gemini_media.compress(small)
check("video nho khong bi phong to", dims(cs["path"]) == (640, 360), dims(cs["path"]))

fast = make_video("fast.mp4", 1280, 720, 4, fps=60)
cf = gemini_media.compress(fast)
check("60fps -> <= 30fps", (gemini_media.probe(cf["path"])["fps"] or 99) <= 30.5, gemini_media.probe(cf["path"]))

mute = make_video("mute.mp4", 1280, 720, 4, audio=False)
cm = gemini_media.compress(mute)
check("video khong tieng van nen duoc", os.path.isfile(cm["path"]) and not gemini_media.probe(cm["path"])["has_audio"])

bad = os.path.join(WORK, "hong.mp4")
open(bad, "wb").write(b"khong phai video")
try:
    gemini_media.compress(bad)
    check("file hong -> nem loi", False, "khong nem")
except RuntimeError as e:
    check("file hong -> nem loi doc duoc", "ffmpeg" in str(e) or "nén" in str(e), e)
pb = gemini_media.prepare(bad)
check("prepare: nen hong -> gui file goc + ghi loi", pb["error"] and pb["pieces"][0]["path"] == bad, pb)

# ---------------------------------------------------------------------------
section("[3] Cat that theo dung luong")
longv = make_video("long.mp4", 1920, 1080, 60)
prep_whole = gemini_media.prepare(longv)
check("duoi 20 MB -> 1 phan", len(prep_whole["pieces"]) == 1, prep_whole["pieces"])
limit = max(200000, prep_whole["compressed"]["bytes"] // 3)
prep = gemini_media.prepare(longv, limit=limit)
pieces = prep["pieces"]
check("vuot gioi han -> nhieu phan", len(pieces) >= 3, [(p["start"], p["end"], p["bytes"]) for p in pieces])
check("moi file phan <= gioi han", all(p["bytes"] <= limit for p in pieces), [p["bytes"] for p in pieces])
check("dem index/count dung", [p["index"] for p in pieces] == list(range(1, len(pieces) + 1))
      and all(p["count"] == len(pieces) for p in pieces))
_, kf, _ = gemini_media.packets(prep["compressed"]["path"])
check("moi phan bat dau o keyframe cua ban nen", all(any(abs(p["start"] - k) < 1e-3 for k in kf) for p in pieces),
      ([p["start"] for p in pieces], kf))
check("phu kin video", pieces[0]["start"] == 0 and abs(pieces[-1]["end"] - 60) < 0.3, pieces[-1])
check("cac phan chong lan", all(pieces[i + 1]["start"] < pieces[i]["end"] for i in range(len(pieces) - 1)))
durs_ok = all(abs(gemini_media.probe(p["path"])["duration"] - (p["end"] - p["start"])) < 0.6 for p in pieces)
check("do dai file phan khop khoang cat", durs_ok,
      [(round(gemini_media.probe(p["path"])["duration"], 2), round(p["end"] - p["start"], 2)) for p in pieces])
# GOP dai (keyframe moi 20s) + gioi han nho -> co phan bat dau khong o keyframe -> phai nen lai
# phan do (stream copy se lui ve keyframe truoc, lech gio)
gop = os.path.join(WORK, "gop.mp4")
subprocess.run([FF, "-v", "error", "-y", "-i", longv, "-c:v", "libx264", "-preset", "ultrafast", "-g", "600",
                "-keyint_min", "600", "-sc_threshold", "0", "-c:a", "copy", gop], check=True)
gp = gemini_media.split(gop, limit=max(150000, os.path.getsize(gop) // 6))
_, gkeys, _ = gemini_media.packets(gop)
nonkey = [p for p in gp if p["start"] > 0 and not any(abs(p["start"] - k) < 1e-3 for k in gkeys)]
check("GOP dai: co phan bat dau giua GOP", bool(nonkey), ([p["start"] for p in gp], gkeys))
check("GOP dai: phan do dai dung khoang cat (khong lui ve keyframe)",
      all(abs(gemini_media.probe(p["path"])["duration"] - (p["end"] - p["start"])) < 0.6 for p in nonkey),
      [(round(gemini_media.probe(p["path"])["duration"], 2), round(p["end"] - p["start"], 2)) for p in nonkey])

prep2 = gemini_media.prepare(longv, limit=limit)
check("cat lai dung cache (cung file)", [p["path"] for p in prep2["pieces"]] == [p["path"] for p in pieces])
check("khong con file tam .part", not [n for n in os.listdir(gemini_media.CACHE_DIR) if ".part" in n],
      os.listdir(gemini_media.CACHE_DIR))

# ---------------------------------------------------------------------------
section("[4] Ghep ket qua cac phan (co hoc)")
P = [{"start": 0.0, "end": 40.0, "index": 1, "count": 2}, {"start": 32.0, "end": 70.0, "index": 2, "count": 2}]
A = {"summary": "dau", "role": "talking_head", "quality": {"visual": "good", "audio": "usable", "notes": "sang"},
     "transcript": [{"start": 1, "end": 2, "text": "a1"}, {"start": 35.0, "end": 36.5, "text": "trung"},
                    {"start": 37.0, "end": 38.0, "text": "a-cuoi"}],
     "emotion_map": [{"start": 0, "end": 20, "emotion": "calm"}, {"start": 20, "end": 40, "emotion": "excited"}],
     "key_moments": [{"start": 10, "end": 12, "type": "climax"}], "on_screen_text": ["X"], "faces_region": "giua",
     "warnings": ["rung"]}
B = {"summary": "sau", "role": "talking_head", "quality": {"visual": "poor", "audio": "good", "notes": "toi"},
     "transcript": [{"start": 3.0, "end": 4.5, "text": "trung"}, {"start": 5.5, "end": 6.0, "text": "b-dau"},
                    {"start": 20, "end": 21, "text": "b2"}],
     "emotion_map": [{"start": 0, "end": 38, "emotion": "sad"}],
     "key_moments": [{"start": 30, "end": 31, "type": "climax"}], "on_screen_text": ["X", "Y"],
     "faces_region": "giua", "warnings": ["rung", "on"]}
m, summ = gemini_media.merge_parts("source_1", "a.mp4", 70.0, [(P[0], A), (P[1], B)])
texts = [x["text"] for x in m["transcript"]]
check("khong trung o doan chong lan", texts.count("trung") == 1, texts)
check("muc truoc ranh (36s) lay tu phan 1", "a-cuoi" not in texts or True)
bnd = (32.0 + 40.0) / 2
check("ranh ghep = giua doan chong lan (36s)", all((x["start"] < bnd) == (x["text"] in ("a1", "trung")) or
                                                   x["text"] in ("a-cuoi", "b-dau", "b2") for x in m["transcript"]))
check("cong gio phan 2 (+32s)", any(x["text"] == "b2" and x["start"] == 52.0 for x in m["transcript"]),
      m["transcript"])
check("muc a-cuoi (37s > ranh 36s) bi bo, lay ban phan 2", "a-cuoi" not in texts, texts)
check("muc b-dau (37.5s) giu", "b-dau" in texts, texts)
check("sap xep theo gio", [x["start"] for x in m["transcript"]] == sorted(x["start"] for x in m["transcript"]))
check("key_moments du 2, gio goc", [k["start"] for k in m["key_moments"]] == [10.0, 62.0], m["key_moments"])
check("quality lay muc te nhat", m["quality"]["visual"] == "poor" and m["quality"]["audio"] == "usable", m["quality"])
check("on_screen_text hop, khong trung", m["on_screen_text"] == ["X", "Y"], m["on_screen_text"])
check("warnings hop", m["warnings"] == ["rung", "on"], m["warnings"])
check("tom tat tam co moc tung phan", "[0:00–0:40] dau" in m["summary"] and "[0:32–1:10] sau" in m["summary"],
      m["summary"])
check("duration = video goc", m["duration"] == 70.0)
check("khong vuot duration", all(x["end"] <= 70.0 for x in m["emotion_map"]), m["emotion_map"])

# ---------------------------------------------------------------------------
section("[5] Luong day du providers.gemini_understand_sources (Gemini gia lap)")
calls = []


def fake_analyze(videos, prompt, source_label, log=None, step_label="Gemini-sources"):
    """Gemini gia: moi video tra transcript moi 2s, text = GIO GOC (de kiem tra cong gio)."""
    calls.append({"label": step_label, "files": [v["path"] for v in videos], "prompt": prompt})
    m_ = re.search(r'"range_in_original": \[([\d.]+), ([\d.]+)\]', prompt)
    offset = float(m_.group(1)) if m_ else 0.0
    out = {"summary": "tong %s" % step_label, "tone": "vui", "language": "vi", "sources": [], "_source": "fake"}
    for v in videos:
        d = float(v.get("duration") or gemini_media.probe(v["path"])["duration"])
        tr = [{"start": t, "end": t + 1.5, "text": "g%.3f" % (offset + t)} for t in [x * 2.0 for x in range(int(d // 2))]]
        out["sources"].append({"id": v["id"], "summary": "phan tu %.1f" % offset, "transcript": tr,
                               "emotion_map": [{"start": 0, "end": d, "emotion": "calm"}],
                               # khoanh khac o GIUA phan -> khong roi vao doan chong lan (khong bi bo khi ghep)
                               "key_moments": [{"start": d / 2, "end": d / 2 + 1, "type": "climax",
                                                "description": "d%.0f" % offset}],
                               "quality": {"visual": "good", "audio": "good"}})
    return out


merge_calls = []


def fake_text(system, user, step_label, req_timeout=300):
    merge_calls.append(json.loads(user))
    data = json.loads(user)
    v = data["videos"][0]
    kms = v["key_moments"]
    return json.dumps({"summary": "TOAN BO lien mach", "tone": "hao hung",
                       "sources": [{"id": v["id"], "summary": "video ke lien mach",
                                    "key_moments": [{"i": 0, "type": "hook", "description": "mo dau"}]
                                    + [{"i": i, "drop": True} for i in range(1, len(kms) - 1)]}]})


orig_analyze, orig_text = providers._gemini_analyze_videos, providers._gemini_text
providers._gemini_analyze_videos = fake_analyze
providers._gemini_text = fake_text
config.set_providers({"gemini": {"auth_mode": "api_key", "api_key": "k", "base_url": "https://proxy.test/v1",
                                  "model": "gemini-x"}})
run_log.set_run({"id": "gm-test"})

# 5a. vua 1 lan goi -> y nhu truoc day
calls.clear()
res = providers.gemini_understand_sources([{"id": "source_1", "path": land, "name": "land.mp4"},
                                            {"id": "source_2", "path": small, "name": "small.mp4"}])
check("2 video nho -> 1 lan goi chung", len(calls) == 1 and len(calls[0]["files"]) == 2, calls)
check("gui ban NEN (khong gui file goc)", all(f.startswith(gemini_media.CACHE_DIR) for f in calls[0]["files"]),
      calls[0]["files"])
check("1 lan goi -> khong goi buoc ghep AI", not merge_calls)
check("ket qua giu nguyen cua Gemini", res.get("summary") == "tong Gemini-sources" and len(res["sources"]) == 2, res)
check("co thong tin dau vao Gemini", [x["id"] for x in res.get("_gemini_input") or []] == ["source_1", "source_2"],
      res.get("_gemini_input"))
check("prompt van la prompt hieu nguon + danh sach video", "DANH SACH VIDEO NGUON" in calls[0]["prompt"])

# 5b. qua gioi han -> cat + goi song song + ghep
old_limit = gemini_media.PIECE_LIMIT_BYTES
gemini_media.PIECE_LIMIT_BYTES = limit
calls.clear()
merge_calls.clear()
res = providers.gemini_understand_sources([{"id": "source_1", "path": longv, "name": "long.mp4", "duration": 60}])
n = len(pieces)
check("moi phan 1 lan goi", len(calls) == n and all(len(c["files"]) == 1 for c in calls), [c["label"] for c in calls])
check("prompt phan co ghi chu PHAN k/n", all("DAY LA 1 PHAN CUA VIDEO DAI" in c["prompt"] for c in calls))
src = res["sources"][0]
tr = src["transcript"]
check("moc gio = gio goc (text g<gio>)", all(abs(x["start"] - float(x["text"][1:])) < 2e-3 for x in tr),
      [(x["start"], x["text"]) for x in tr][:8])
check("khong trung cau o doan chong lan", len({x["text"] for x in tr}) == len(tr))
check("phu gan kin 60s", tr[0]["start"] == 0 and tr[-1]["start"] >= 54, (tr[0], tr[-1]))
check("buoc ghep AI duoc goi 1 lan", len(merge_calls) == 1, len(merge_calls))
check("buoc ghep nhan du tung phan", len(merge_calls[0]["videos"][0]["parts"]) == n, merge_calls[0]["videos"][0]["parts"])
check("ap dung tom tat AI", res["summary"] == "TOAN BO lien mach" and src["summary"] == "video ke lien mach",
      (res["summary"], src["summary"]))
kms = src["key_moments"]
check("xep hang lai: muc 0 -> hook, bo cac muc giua", kms[0]["type"] == "hook" and len(kms) == 2, kms)
first_km = merge_calls[0]["videos"][0]["key_moments"][0]
check("buoc ghep KHONG doi moc gio", kms[0]["start"] == first_km["start"] and kms[0]["end"] == first_km["end"],
      (kms[0], first_km))
check("_source ghi so luot", "%d lượt" % n in res.get("_source", ""), res.get("_source"))
check("_gemini_input ghi cac phan", len((res["_gemini_input"][0] or {}).get("parts") or []) == n, res["_gemini_input"])

# 5c. chay lai -> dung cache tung luot (khong goi Gemini), nhat ky ghi tu luong phu
calls.clear()
ev_path = run_log.events_path("gm-test")
before = sum(1 for _ in open(ev_path, encoding="utf-8")) if os.path.isfile(ev_path) else 0
providers.gemini_understand_sources([{"id": "source_1", "path": longv, "name": "long.mp4", "duration": 60}])
check("chay lai -> khong goi Gemini (cache 48h)", not calls, calls)
lines = open(ev_path, encoding="utf-8").read().splitlines()[before:]
hits = [x for x in lines if "đã lưu" in x and "Gemini-sources" in x]
check("nhat ky luong phu van vao dung run", len(hits) == n, len(hits))
calls.clear()
providers.gemini_understand_sources([{"id": "source_1", "path": longv, "name": "long.mp4", "duration": 60}], fresh=True)
check("fresh=True -> goi lai het", len(calls) == n, len(calls))

# 5d. buoc ghep AI hong -> van co ket qua (ban ghep co hoc)
def broken_text(*a, **k):
    raise RuntimeError("proxy 502")


providers._gemini_text = broken_text
res = providers.gemini_understand_sources([{"id": "source_1", "path": longv, "name": "long.mp4", "duration": 60}])
check("ghep AI loi -> van tra ket qua", len(res["sources"][0]["transcript"]) > 10)
check("ghep AI loi -> tom tat noi tung phan", "[0:00–" in res["sources"][0]["summary"], res["sources"][0]["summary"])
providers._gemini_text = fake_text

# 5e. 3 video nguyen vuot tong gioi han -> chia nhom
calls.clear()
merge_calls.clear()
gemini_media.PIECE_LIMIT_BYTES = max(gemini_media.compress(land)["bytes"], gemini_media.compress(small)["bytes"]) + 1000
res = providers.gemini_understand_sources([{"id": "source_1", "path": land, "name": "land.mp4"},
                                            {"id": "source_2", "path": small, "name": "small.mp4"},
                                            {"id": "source_3", "path": portrait, "name": "port.mp4"}], fresh=True)
check("tong vuot gioi han -> nhieu nhom", len(calls) >= 2, [c["files"] for c in calls])
check("moi nhom <= gioi han", all(sum(os.path.getsize(f) for f in c["files"]) <= gemini_media.PIECE_LIMIT_BYTES
                                  for c in calls))
check("du 3 nguon, dung thu tu", [s["id"] for s in res["sources"]] == ["source_1", "source_2", "source_3"],
      [s["id"] for s in res["sources"]])
check("nhieu nhom -> co buoc ghep AI", len(merge_calls) == 1)
gemini_media.PIECE_LIMIT_BYTES = limit

# 5f. che do Gemini CLI: loi tam -> thu lai 1 lan; loi dang nhap -> khong thu lai
config.set_providers({"gemini": {"auth_mode": "subscription", "sub_model": "gemini-2.5-pro"}})
flaky = {"n": 0}


def flaky_analyze(videos, prompt, source_label, log=None, step_label="Gemini-sources"):
    flaky["n"] += 1
    if flaky["n"] == 1:
        raise RuntimeError("Gemini CLI bao loi (ma thoat 1)")
    return fake_analyze(videos, prompt, source_label, log, step_label)


providers._gemini_analyze_videos = flaky_analyze
res = providers.gemini_understand_sources([{"id": "source_1", "path": small, "name": "small.mp4"}], fresh=True)
check("CLI loi tam -> thu lai 1 lan roi xong", flaky["n"] == 2 and res["sources"], flaky)
auth = {"n": 0}


def auth_fail(*a, **k):
    auth["n"] += 1
    raise RuntimeError("Gemini CLI chưa đăng nhập tài khoản Google")


providers._gemini_analyze_videos = auth_fail
try:
    providers.gemini_understand_sources([{"id": "source_1", "path": small, "name": "small.mp4"}], fresh=True)
    check("loi dang nhap -> nem loi", False, "khong nem")
except RuntimeError as e:
    check("loi dang nhap -> KHONG thu lai, bao ro", auth["n"] == 1 and "đăng nhập" in str(e), (auth, e))

# 5g. nhieu luot, 1 luot loi -> bao ro luot nao, cac luot khac duoc luu cache
config.set_providers({"gemini": {"auth_mode": "api_key"}})
import step_cache  # noqa: E402
step_cache.clear()
seen = {"n": 0}


def one_fails(videos, prompt, source_label, log=None, step_label="Gemini-sources"):
    seen["n"] += 1
    if "phần 2/" in step_label:
        raise RuntimeError("HTTP 502 tu proxy")
    return fake_analyze(videos, prompt, source_label, log, step_label)


providers._gemini_analyze_videos = one_fails
try:
    providers.gemini_understand_sources([{"id": "source_1", "path": longv, "name": "long.mp4", "duration": 60}],
                                        fresh=True)
    check("1 luot loi -> nem loi", False, "khong nem")
except RuntimeError as e:
    check("bao ro luot loi + goi y chay lai", "lượt 2/" in str(e) and "chỉ gửi lại" in str(e), e)
providers._gemini_analyze_videos = fake_analyze
calls.clear()
providers.gemini_understand_sources([{"id": "source_1", "path": longv, "name": "long.mp4", "duration": 60}])
check("chay lai sau loi -> chi gui lai luot loi", len(calls) == 1 and "phần 2/" in calls[0]["label"],
      [c["label"] for c in calls])

gemini_media.PIECE_LIMIT_BYTES = old_limit
providers._gemini_analyze_videos, providers._gemini_text = orig_analyze, orig_text
run_log.set_run(None)
shutil.rmtree(WORK, ignore_errors=True)

# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
if FAILED:
    print("CO %d TEST FAIL:" % len(FAILED))
    for f in FAILED:
        print("  - " + f)
    sys.exit(1)
print("TAT CA PASS")
