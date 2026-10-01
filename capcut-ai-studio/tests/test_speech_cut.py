#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test cat an toan theo tieng noi + lop chu khop loi (speech_cut.py).
Chay (HOME tam de khong dung du lieu that):
    HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_speech_cut.py

Su co that 2026-09-26 (IMG_3839): video xuat "cat canh khi tieng chua noi het" va "chu / anh nhay ra
kem am thanh di truoc vai giay". Cac dieu can dam bao:
  1. Nhan ra cho ngat cau: dau cau, khoang lang, dau phay + lang nho, lang THAT trong am thanh du
     Whisper nuot mat.
  2. Cuoi doan: khong cat giua chu / giua cau (noi cho het cau, noi lien sang doan ke tiep, lui ve
     cho ngat truoc, noi toi 2.5s), duoi am theo do to that; da o cho ngat thi giu nguyen.
  3. Dau doan: lui ve dau cau, bo chu bi cat do; khong tu cat bot khoang lang AI chon.
  4. Cho noi tiep (hai doan lien nhau trong nguon) khong dung toi; khong de len doan nguon khac.
  5. Hook (fix_range) vao/ra o cho ngat cau.
  6. Lop chu hien ngay truoc tu cua no (ca khi Whisper nghe sai -> dung chu phu de), hinh cung nhom
     + SFX dat dung luc lop hien doi theo; tu da bi cat khoi video / chu khong noi -> giu nguyen.
  7. Moi ham chay lai KHONG doi gi them (on dinh); meme / SFX neo o mep doan vua chinh di theo mep moi.
  8. build_spec: video that (tieng tu tao) -> clip, lop chu, SFX tren timeline dung; plan khong bi sua.
"""
import copy
import json
import os
import subprocess
import sys
import tempfile
import wave

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

import numpy as np  # noqa: E402

import remotion_plan  # noqa: E402
import speech_cut as SC  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)))
    if not cond:
        FAILED.append(name)


def section(t):
    print("\n" + t)


# 4 cau (gio nguon, giay). Whisper: [chu, bat dau, het]
W = [
    ["Hôm", 0.00, 0.30], ["nay", 0.32, 0.60], ["mình", 0.62, 0.90], ["chia", 0.92, 1.20], ["sẻ.", 1.22, 1.60],
    ["Công", 2.00, 2.30], ["cụ", 2.32, 2.60], ["này", 2.62, 2.90], ["rất", 2.92, 3.20], ["hay", 3.22, 3.50],
    ["và", 3.52, 3.80], ["miễn", 3.82, 4.10], ["phí.", 4.12, 4.50],
    ["Bạn", 5.00, 5.30], ["chỉ", 5.32, 5.60], ["cần", 5.62, 5.90], ["tải", 5.92, 6.20], ["về", 6.22, 6.50],
    ["là", 6.52, 6.80], ["dùng", 6.82, 7.10], ["được.", 7.12, 7.50],
    ["Cảm", 8.00, 8.30], ["ơn.", 8.32, 8.70],
    ["rất", 9.00, 9.20], ["dễ", 9.22, 9.40], ["bị", 9.42, 9.60], ["chronic.", 9.62, 10.20],
]
WS = [tuple(w) for w in W]
NONE = SC.Audio(None)            # khong co am thanh -> chi dung moc chu Whisper


def db_for(words, dur=12.0, tails=None, gaps=None):
    """Do to gia (dB moi 10ms): chu = -20 dB, lang = -60 dB. tails {chu_idx: gio het tieng that}."""
    db = np.full(int(dur / SC.HOP) + 1, -60.0, dtype=np.float32)
    for k, w in enumerate(words):
        e = (tails or {}).get(k, w[2])
        db[int(round(w[1] / SC.HOP)):int(round(e / SC.HOP))] = -20.0
    for a, b in gaps or []:
        db[int(round(a / SC.HOP)):int(round(b / SC.HOP))] = -60.0
    return db


def inside_word(t, words=WS):
    return any(w[1] + 0.03 < t < w[2] - 0.03 for w in words)


def seg(st, en, ts, sid="source_1"):
    return {"source_id": sid, "start": st, "end": en, "target_start": ts}


def plan_of(segs, **kw):
    p = {"asr_words": {"source_1": copy.deepcopy(W)}, "segments": segs,
         "source_videos": [{"id": "source_1", "path": "/khong/co.mp4", "duration": 12.0}]}
    p.update(kw)
    return p


# ---------------------------------------------------------------------------
section("[1] Cho ngat cau")
check("dau cham -> 2", SC.break_after(WS, 4) == 2)
check("noi lien -> 0", SC.break_after(WS, 6) == 0)
check("chu cuoi -> 2", SC.break_after(WS, len(WS) - 1) == 2)
wc = [("Hôm", 0.0, 0.3), ("nay,", 0.32, 0.6), ("mình", 0.75, 1.0), ("nói", 1.02, 1.3)]
check("dau phay + lang 0.15s -> 1", SC.break_after(wc, 1) == 1, SC.break_after(wc, 1))
check("khoang lang 0.3s -> 2", SC.break_after([("a", 0, 0.3), ("b", 0.6, 0.9)], 0) == 2)
# Whisper nuot khoang lang: hai chu dinh sat nhau nhung am thanh im 0.3s o giua
wsw = [("một", 0.0, 0.5), ("hai", 0.5, 1.2)]
au_sw = SC.Audio(db_for([("một", 0.0, 0.3), ("hai", 0.8, 1.2)], dur=3.0))
check("Whisper nuot lang: khong co am thanh -> 0", SC.break_after(wsw, 0) == 0)
check("Whisper nuot lang: am thanh im that -> 2", SC.break_after(wsw, 0, au_sw) == 2)

# ---------------------------------------------------------------------------
section("[2] Cuoi doan (khong co am thanh)")
t, why = SC.safe_end(WS, NONE, 3.6, 99, 0.0)
check("cat giua chu 'và' -> noi cho het cau 'phí.'", 4.5 <= t < 5.0 and "het cau" in (why or ""), (t, why))
t, why = SC.safe_end(WS, NONE, 5.65, 99, 0.0)
check("xa het cau (1.85s) -> lui ve cho ngat 'phí.'", 4.5 <= t < 5.0 and "lui ve" in (why or ""), (t, why))
t, why = SC.safe_end(WS, NONE, 5.65, 99, 4.94)
check("khong lui duoc (doan qua ngan) -> noi toi 2.5s", 7.5 <= t < 8.0 and "het cau" in (why or ""), (t, why))
t, why = SC.safe_end(WS, NONE, 3.6, 4.0, 0.0, bridge=4.0)
check("het cau de len doan khac -> noi lien sang doan ke tiep", t == 4.0 and "noi lien" in (why or ""), (t, why))
t, why = SC.safe_end(WS, NONE, 4.7, 99, 0.0)
check("dang o khoang lang sau dau cham -> giu nguyen", t == 4.7 and why is None, (t, why))
far = [("a%d" % k, k * 0.3, k * 0.3 + 0.28) for k in range(40)]
t, why = SC.safe_end(far, NONE, 6.05, 99, 0.0)
check("khong co cho ngat cau gan -> KHONG cat giua chu: ve ranh gioi chu gan nhat + bao ly do",
      abs(t - 6.05) <= 0.4 and not inside_word(t, far) and "ranh gioi chu" in (why or ""), (t, why))
t, why = SC.safe_end(far, NONE, 6.29, 99, 0.0)
check("dang o ranh gioi chu (khong co cho ngat cau) -> giu nguyen", t == 6.29 and "giu nguyen" in (why or ""), (t, why))
t, why = SC.safe_end(WS, NONE, 0.0, 99, 0.0)
check("truoc do chua ai noi -> giu nguyen", t == 0.0 and why is None, (t, why))

# ---------------------------------------------------------------------------
section("[3] Cuoi doan theo do to THAT")
au = SC.Audio(db_for(WS, tails={4: 1.85}))           # 'sẻ.' con vang toi 1.85s (Whisper bao het 1.60)
t, _ = SC.safe_end(WS, au, 1.60, 99, 0.0)
check("cat dung moc Whisper -> doi toi het tieng that + 30ms", 1.85 <= t <= 1.92, t)
check("khong cham chu ke tiep", t < 2.0, t)
t2, why2 = SC.safe_end(WS, au, t, 99, 0.0)
check("chay lai: giu nguyen", t2 == t and why2 is None, (t2, why2))
# hai cau noi lien (khong co lang): cat o cho nho tieng nhat, khong vuot qua dau chu sau
wl = [("luôn.", 1.0, 1.4), ("Cái", 1.4, 1.7), ("này", 1.72, 2.0)]
dbl = db_for(wl, dur=3.0)
dbl[132:135] = -32.0                                  # thung nho tieng (van tren nguong lang)
t, _ = SC.safe_end(wl, SC.Audio(dbl), 1.4, 99, 0.0)
check("noi lien -> cat o thung nho tieng, truoc chu sau", 1.3 <= t <= 1.4, t)

# Whisper bao chu sau bat dau SOM hon am that: duoi am chu truoc vuot moc Whisper <= 0.1s van phai giu
wo = [("luôn.", 1.0, 1.4), ("Cái", 1.4, 1.9), ("này", 1.92, 2.1)]
dbo = db_for([("luôn.", 1.0, 1.43), ("Cái", 1.65, 1.9), ("này", 1.92, 2.1)], dur=3.0)
auo = SC.Audio(dbo)
t, _ = SC.safe_end(wo, auo, 1.4, 99, 0.0)
check("duoi am vuot moc Whisper chu sau (1.43) -> cat trong lang ngay sau", 1.43 <= t <= 1.5, t)
t2, _ = SC.safe_end(wo, auo, t, 99, 0.0)
check("chay lai: giu nguyen", abs(t2 - t) < 0.011, (t, t2))
# lang ngan 40ms + tieng lach tach roi moi vao chu sau: van cat o khoang lang dau
# (ca that 89.22 'nhom, | hoac': Whisper bao 'hoac' 1.22, duoi am toi 1.23, lang, lach tach 1.29, 'hoac' that 1.41)
dbb = db_for([("nhóm,", 0.5, 1.23), ("hoặc", 1.41, 1.9)], dur=3.0)
dbb[129:131] = -30.0
t, _ = SC.safe_end([("nhóm,", 0.5, 1.0), ("hoặc", 1.22, 1.9)], SC.Audio(dbb), 1.22, 99, 0.0)
check("lang ngan sau duoi am -> cat o do (khong lay tieng lach tach)", 1.23 <= t <= 1.28, t)

# ---------------------------------------------------------------------------
section("[4] Dau doan")
t, why = SC.safe_start(WS, NONE, 5.6, 0.0, 7.5)
check("bat dau giua cau -> lui ve dau cau 'Bạn'", 4.9 <= t < 5.0 and "dau cau" in (why or ""), (t, why))
t, why = SC.safe_start(WS, NONE, 6.9, 0.0, 8.7)
check("giua chu, dau cau qua xa -> bo chu bi cat do", 7.0 <= t <= 7.12 and "bo chu" in (why or ""), (t, why))
t, why = SC.safe_start(WS, NONE, 4.98, 0.0, 7.5)
check("sat chu dau -> chi lui som hon (khong xen am dau)", 4.9 <= t <= 4.98, (t, why))
t, why = SC.safe_start(WS, NONE, 4.6, 0.0, 7.5)
check("lang ngan truoc chu dau -> khong tu cat bot", t == 4.6, (t, why))
au = SC.Audio(db_for(WS))
t, _ = SC.safe_start(WS, au, 5.6, 0.0, 7.5)
check("co am thanh: vao truoc tieng dau cau 30ms", 4.95 <= t < 5.0, t)

# ---------------------------------------------------------------------------
section("[5] Ap vao cac doan (fix_segment_cuts)")
segs = [seg(0.0, 3.6, 0.0), seg(5.6, 7.5, 3.6)]
ch = []
SC.fix_segment_cuts(plan_of(segs), segs, ch)
a, b = segs
check("doan 1 het cau (khong cat giua chu 'và')", 4.5 <= a["end"] < 5.0 and not inside_word(a["end"]), a)
check("doan 2 vao tu dau cau", 4.9 <= b["start"] <= 5.0, b)
check("khong chong nhau trong nguon", a["end"] <= b["start"], (a, b))
check("co ghi nhat ky", any("cat an toan" in c for c in ch), ch)
ch2 = []
SC.fix_segment_cuts(plan_of(segs), segs, ch2)
check("chay lai: khong doi", not ch2, ch2)

segs = [seg(0.0, 3.6, 0.0), seg(3.6, 7.5, 3.6)]
SC.fix_segment_cuts(plan_of(segs), segs, [])
check("hai doan noi tiep trong nguon -> khong dung toi", segs[0]["end"] == 3.6 and segs[1]["start"] == 3.6, segs)

segs = [seg(0.0, 3.6, 0.0), seg(4.0, 7.5, 3.6)]
SC.fix_segment_cuts(plan_of(segs), segs, [])
check("het cau de len doan sau -> noi lien (thanh lien mach)", segs[0]["end"] == 4.0 == segs[1]["start"], segs)

segs = [seg(5.0, 7.5, 0.0), seg(0.0, 3.6, 2.5)]    # doan sau tren timeline nam TRUOC trong nguon
SC.fix_segment_cuts(plan_of(segs), segs, [])
check("dau doan khong lui vao doan nguon da dung", segs[0]["start"] >= segs[1]["end"] - 1e-6, segs)

segs = [seg(0.0, 3.6, 0.0), {"kind": "insert", "start": 0, "end": 2, "target_start": 3.6}, seg(5.6, 7.5, 3.6)]
SC.fix_segment_cuts(plan_of(segs), segs, [])
check("bo qua doan chen (meme)", segs[1] == {"kind": "insert", "start": 0, "end": 2, "target_start": 3.6}, segs[1])

segs = [seg(0.0, 3.6, 0.0)]
SC.fix_segment_cuts({"segments": segs}, segs, [])
check("khong co chu Whisper -> giu nguyen", segs[0]["end"] == 3.6)

# co am thanh: duoi am that
orig_energy = SC.energy
SC.energy = lambda path: db_for(WS, tails={12: 4.62})
segs = [seg(0.0, 3.6, 0.0), seg(5.6, 7.5, 3.6)]
SC.fix_segment_cuts(plan_of(segs), segs, [])
check("co am thanh: het tieng that 'phí.' (4.62) + 30ms", 4.62 <= segs[0]["end"] <= 4.7, segs[0])
ch2 = []
SC.fix_segment_cuts(plan_of(segs), segs, ch2)
check("co am thanh: chay lai khong doi", not ch2, ch2)
SC.energy = orig_energy

# moc diem (meme, SFX) o mep doan vua bi cat bot -> theo mep moi
pa = plan_of([seg(0.0, 3.9, 0.0), seg(5.2, 8.0, 3.9)],
             inserts=[{"meme_id": "wow", "source_id": "source_1", "src_time": 4.0}],
             audio=[{"sfx_id": "a", "source_id": "source_1", "src_time": 3.95},
                    {"sfx_id": "b", "source_id": "source_1", "src_time": 2.0},
                    {"sfx_id": "c", "source_id": "source_1", "src_time": 5.0},
                    {"sfx_id": "nhac", "role": "bgm", "source_id": "source_1", "src_time": 4.0},
                    {"sfx_id": "d", "source_id": "source_1", "src_time": 4.6}])
ch = []
SC.follow_anchors(pa, [("source_1", 0.0, 4.0, 0.0, 3.9), ("source_1", 5.0, 8.0, 5.2, 8.0)], ch)
check("meme neo cuoi doan cu -> cuoi doan moi", pa["inserts"][0]["src_time"] == 3.9, pa["inserts"][0])
check("SFX trong phan vua cat -> mep moi", pa["audio"][0]["src_time"] == 3.9, pa["audio"][0])
check("SFX con trong doan -> giu nguyen", pa["audio"][1]["src_time"] == 2.0)
check("SFX o dau doan vua lui vao -> dau moi", pa["audio"][2]["src_time"] == 5.2, pa["audio"][2])
check("nhac nen khong dung toi", pa["audio"][3]["src_time"] == 4.0)
check("SFX xa mep (da bi cat tu truoc) -> giu nguyen", pa["audio"][4]["src_time"] == 4.6)
check("co ghi nhat ky", len(ch) == 3, ch)
segs = [seg(0.0, 3.6, 0.0), seg(5.6, 7.5, 3.6)]
mv = []
SC.fix_segment_cuts(plan_of(segs), segs, [], moves=mv)
check("fix_segment_cuts bao lai doan da sua", [m[:3] for m in mv] == [("source_1", 0.0, 3.6), ("source_1", 5.6, 7.5)], mv)

# ---------------------------------------------------------------------------
section("[6] Hook (fix_range)")
st, en = SC.fix_range(plan_of([]), "source_1", 2.3, 3.6, min_len=2.0, max_len=7.0)
check("hook vao dau cau, ra het cau", 1.9 <= st <= 2.0 and 4.5 <= en < 5.0, (st, en))
st, en = SC.fix_range(plan_of([]), "source_1", 2.3, 3.6, min_len=2.0, max_len=1.5)
check("gioi han do dai -> khong noi qua max_len", en <= st + 1.5 + 1e-6 or (st, en) == (2.3, 3.6), (st, en))
st, en = SC.fix_range({}, "source_1", 2.3, 3.6)
check("khong co chu -> giu nguyen", (st, en) == (2.3, 3.6))

# ---------------------------------------------------------------------------
section("[7] Lop chu khop loi noi")


def lp():
    return plan_of(
        [seg(0.0, 4.7, 0.0), seg(4.94, 7.5, 4.7), seg(8.9, 10.4, 7.26)],
        captions=[{"text": "rất dễ bị khóa nick", "source_id": "source_1", "src_start": 9.0, "src_end": 10.2}],
        layers=[
            {"type": "text", "source_id": "source_1", "src_start": 2.0, "src_end": 4.0, "group": "g1",
             "spans": [{"text": "MIỄN PHÍ"}, {"text": "cho mọi người"}], "sfx": "pop"},
            {"type": "ring", "source_id": "source_1", "src_start": 2.1, "src_end": 4.0, "group": "g1"},
            {"type": "text", "source_id": "source_1", "src_start": 5.80, "src_end": 6.8, "text": "TẢI VỀ"},
            {"type": "text", "source_id": "source_1", "src_start": 9.0, "src_end": 10.2, "text": "KHÓA NICK"},
            {"type": "text", "source_id": "source_1", "src_start": 5.0, "src_end": 6.0, "text": "KHÔNG CÓ TRONG LỜI"},
            {"type": "text", "source_id": "source_1", "src_start": 7.3, "src_end": 8.0, "text": "CẢM ƠN"},
        ],
        audio=[{"sfx_id": "ding", "source_id": "source_1", "src_time": 2.0},
               {"sfx_id": "punch", "source_id": "source_1", "src_time": 2.5},
               {"sfx_id": "nhac", "role": "bgm", "src_time": 2.0}])


p = lp()
ch = []
SC.snap_layers(p, ch)
L = p["layers"]
check("'MIỄN PHÍ' (dat o dau cau 2.0) -> ngay truoc khi noi 'miễn' 3.82",
      abs(L[0]["src_start"] - (3.82 - SC.LAYER_LEAD)) < 1e-6, L[0])
check("giu do dai hien (khong ngan hon 0.6s)", L[0]["src_end"] - L[0]["src_start"] >= 0.6, L[0])
check("hinh cung nhom doi theo", abs(L[1]["src_start"] - (2.1 + L[0]["src_start"] - 2.0)) < 1e-6, L[1])
check("da dung cho -> giu nguyen", L[2]["src_start"] == 5.80, L[2])
check("Whisper nghe sai ('chronic.') -> dung chu phu de, hien truoc 'khóa'",
      9.4 <= L[3]["src_start"] <= 9.75, L[3])
check("chu khong co trong loi -> giu nguyen", L[4]["src_start"] == 5.0, L[4])
check("tu da bi cat khoi video -> giu nguyen", L[5]["src_start"] == 7.3, L[5])
check("SFX dat dung luc lop hien -> doi theo", abs(p["audio"][0]["src_time"] - L[0]["src_start"]) < 1e-6, p["audio"][0])
check("SFX khong trung lop -> giu nguyen", p["audio"][1]["src_time"] == 2.5, p["audio"][1])
check("nhac nen khong dung toi", p["audio"][2]["src_time"] == 2.0, p["audio"][2])
check("co ghi nhat ky", any(c.startswith("layer0") for c in ch) and any(c.startswith("audio0") for c in ch), ch)
ch2 = []
SC.snap_layers(p, ch2)
check("chay lai: khong doi", not ch2, ch2)
p2 = lp()
del p2["asr_words"]
SC.snap_layers(p2, [])
check("khong co chu Whisper -> giu nguyen", p2["layers"] == lp()["layers"])

# ---------------------------------------------------------------------------
section("[8] build_spec voi video that")
WORK = tempfile.mkdtemp(prefix="speechcut-")
FF = remotion_plan._ffbin("ffmpeg")
sr = 16000
tt = np.arange(int(12 * sr)) / sr
gate = np.zeros_like(tt)
for k, w in enumerate(WS):
    gate[(tt >= w[1]) & (tt < (4.62 if k == 12 else w[2]))] = 1.0
pcm = (0.3 * np.sin(2 * np.pi * 300 * tt) * gate * 32767).astype(np.int16)
wav = os.path.join(WORK, "a.wav")
with wave.open(wav, "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sr)
    wf.writeframes(pcm.tobytes())
vid = os.path.join(WORK, "src.mp4")
subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=12",
                "-i", wav, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-shortest", vid], check=True)
plan = {"engine": "remotion", "fps": 30,
        "source_videos": [{"id": "source_1", "path": vid, "name": "src.mp4", "duration": 12}],
        "asr_words": {"source_1": copy.deepcopy(W)},
        "segments": [seg(0.0, 3.6, 0.0), seg(5.6, 7.5, 3.6)],
        "captions": [], "audio": [],
        "layers": [{"id": "mp", "type": "text", "source_id": "source_1", "src_start": 2.0, "src_end": 4.0,
                    "x": 0.5, "y": 0.3, "spans": [{"text": "MIỄN PHÍ", "size": 60}], "sfx": "pop"},
                   {"id": "tv", "type": "text", "source_id": "source_1", "src_start": 5.2, "src_end": 6.8,
                    "x": 0.5, "y": 0.3, "spans": [{"text": "TẢI VỀ", "size": 60}]}]}
before = copy.deepcopy(plan)
spec, rep = remotion_plan.build_spec(plan)
clips = (spec or {}).get("clips") or []
check("spec dung duoc", bool(spec) and rep.get("ok"), rep)
check("plan truyen vao khong bi sua", plan == before)
def src_end(c):
    return c.get("srcStart", 0) + (c.get("end", 0) - c.get("start", 0)) * (c.get("speed") or 1)


def clip_at(t_src):
    return next((c for c in clips if c.get("srcStart", 0) - 1e-3 <= t_src < src_end(c)), {})


def tl_of(t_src):
    c = clip_at(t_src)
    return c.get("start", 0) + (t_src - c.get("srcStart", 0)) / (c.get("speed") or 1) if c else None


# LUAT CUNG khoang lang (2026-10-01): lang 0.40s giua 'sẻ.' (1.60) va 'Công' (2.00) — truoc day giu (gioi han 0.45s)
c1 = clip_at(4.12)
check("doan chua 'phí.' ket thuc sau khi het tieng (4.62), khong om lang", 4.62 <= src_end(c1) <= 4.75, c1)
c2 = clip_at(5.0)
check("doan sau vao tu dau cau 'Bạn' (5.0)", 4.9 <= (c2.get("srcStart") or 0) <= 5.0, c2)
check("lang 0.40s giua cau (1.60-2.00) bi cat: khong clip nao phat 1.70-1.90",
      not any(c.get("srcStart", 0) < 1.85 and src_end(c) > 1.75 for c in clips), [(c["srcStart"], src_end(c)) for c in clips])
check("cat khong mat tieng: 'sẻ.' phat het (>= 1.60), 'Công' vao truoc 2.00",
      src_end(clip_at(1.5)) >= 1.60 and (clip_at(2.1).get("srcStart") or 9) <= 2.0, [(c["srcStart"], src_end(c)) for c in clips])
kc = rep.get("kiem_cat") or {}
check("kiem lai: khong con lang dai, khong mep cat roi vao tieng", not kc.get("im_lang") and not kc.get("cat_vao_tieng"), kc)
lays = {x["id"].rsplit("_", 1)[0]: x for x in spec.get("layers") or []}
mp = lays.get("mp") or {}
check("lop 'MIỄN PHÍ' hien ngay truoc 'miễn'", abs((mp.get("start") or 0) - (tl_of(3.82) - SC.LAYER_LEAD)) < 0.02,
      (mp.get("start"), tl_of(3.82)))
tv = lays.get("tv") or {}
t_tai = tl_of(5.92)
check("lop 'TẢI VỀ' hien ngay truoc 'tải' tren timeline", abs((tv.get("start") or 0) - (t_tai - SC.LAYER_LEAD)) < 0.02,
      (tv.get("start"), t_tai))
check("SFX cua lop keu cung luc lop hien",
      any(abs(a.get("start", -9) - mp.get("start", 0)) < 0.02 for a in spec.get("audio") or []),
      [(a.get("name"), a.get("start")) for a in spec.get("audio") or []])
check("nhat ky co cat an toan + lop chu", any("cat an toan" in c for c in rep.get("fixed") or [])
      and any("hien khop loi noi" in c for c in rep.get("fixed") or []), rep.get("fixed"))
spec2, _ = remotion_plan.build_spec(plan)


def timing(sp):   # (ten hien thi SFX lan dau co the khac: thu vien SFX moi tao trong HOME tam)
    return json.dumps({"clips": sp["clips"], "layers": sp["layers"], "captions": sp["captions"],
                       "audio": [(a.get("path"), a.get("start")) for a in sp["audio"]]}, sort_keys=True)


check("dung lai lan 2 ra dung moc gio cu", timing(spec2) == timing(spec))

# Meme neo DUNG cuoi doan, cuoi doan bi thu vao (dang cat trong lang nhung qua moc Whisper cua chu sau)
# -> meme van o cuoi doan do, khong nhay len dau video (loi that: meme 109.68 -> giay 1.32)
W2 = copy.deepcopy(W)
W2[13] = ["Bạn", 4.70, 5.30]                      # Whisper bao 'Bạn' bat dau som (am that 5.0)
plan2 = {"engine": "remotion", "fps": 30,
         "source_videos": [{"id": "source_1", "path": vid, "name": "src.mp4", "duration": 12}],
         "asr_words": {"source_1": W2},
         "segments": [seg(0.0, 1.9, 0.0), seg(2.0, 4.8, 1.9), seg(8.0, 8.7, 4.7)],
         "captions": [], "audio": [{"sfx_id": "khong_co", "source_id": "source_1", "src_time": 4.8}], "layers": [],
         "inserts": [{"meme_id": "wow", "file": vid, "source_id": "source_1", "src_time": 4.8, "src_start": 0,
                      "src_end": 1.6, "duration": 1.6, "placement": "cutaway", "_src_duration": 12}]}
spec_m, rep_m = remotion_plan.build_spec(plan2)
cl = (spec_m or {}).get("clips") or []
body = [c for c in cl if c.get("kind") != "insert"]
ins = [c for c in cl if c.get("kind") == "insert"]
b2 = next((c for c in body if abs(c.get("srcStart", -1) - 2.0) < 0.1), {})
b2_src_end = b2.get("srcStart", 0) + b2.get("end", 0) - b2.get("start", 0)
check("cuoi doan 2 thu ve het tieng 'phí.' (trong lang)", 4.62 <= b2_src_end <= 4.7, b2)
check("meme ngay sau doan 2 (khong nhay len dau video)", bool(ins) and abs(ins[0]["start"] - b2.get("end", -9)) < 0.05,
      [(c.get("kind"), c["start"], c["end"], c.get("srcStart")) for c in cl])
check("nhat ky ghi moc meme theo mep moi", any(c.startswith("inserts0: moc") for c in rep_m.get("fixed") or []),
      rep_m.get("fixed"))

# File nguon bi chuyen / xoa -> khong dung spec rong (UI giu ban cu), bao ro ten file
plan3 = copy.deepcopy(plan)
plan3["source_videos"][0]["path"] = os.path.join(WORK, "da_chuyen_di.mp4")
spec3, rep3 = remotion_plan.build_spec(plan3)
check("thieu file nguon -> khong ra spec, bao ro", spec3 is None and not rep3.get("ok")
      and any("da_chuyen_di.mp4" in i.get("problem", "") for i in rep3.get("issues") or []), rep3.get("issues"))

# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
if FAILED:
    print("CO %d TEST FAIL:" % len(FAILED))
    for f in FAILED:
        print("  - " + f)
    sys.exit(1)
print("TAT CA PASS")
