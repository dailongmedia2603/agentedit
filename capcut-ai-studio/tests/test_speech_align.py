#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test can gio loi noi (speech_align) — khong can Whisper that, dung chu gia lap.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_speech_align.py
"""
import os
import sys
import copy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sidecar"))

import speech_align as SA  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % detail))
    if not cond:
        FAILS.append(name)


def words_of(seq):
    """[('chu', start)] -> dinh dang Whisper, moi chu 0.2s."""
    return [{"w": w, "s": s, "e": round(s + 0.2, 3)} for w, s in seq]


def main():
    print("[1] chuan hoa chu")
    check("bo dau + dong nghia tui->toi", SA.norm_tokens("Tui nói, Việt Nam!") == ["toi", "noi", "viet", "nam"],
          SA.norm_tokens("Tui nói, Việt Nam!"))

    print("[2] can gio transcript: Gemini tre ~1.5s, giu chu, lay gio that")
    # Loi noi that: "nhan tin hoi toi" 0.2-1.0 | "co phai hang Viet Nam" 3.0-4.0 | "san xuat tai Viet Nam" 5.0-6.0
    W = words_of([("nhắn", 0.2), ("tin", 0.4), ("hỏi", 0.6), ("tôi", 0.8),
                  ("có", 3.0), ("phải", 3.2), ("hàng", 3.4), ("Việt", 3.6), ("Nam", 3.8),
                  ("sản", 5.0), ("xuất", 5.2), ("tại", 5.4), ("Việt", 5.6), ("Nam", 5.8)])
    src = {"id": "source_1", "duration": 8.0,
           "transcript": [
               {"start": 1.2, "end": 2.5, "text": "nhắn tin hỏi tui"},
               {"start": 4.5, "end": 5.6, "text": "có phải là hàng Việt Nam"},
               {"start": 6.4, "end": 7.6, "text": "sản xuất tại Việt Nam."},
               {"start": 7.6, "end": 8.0, "text": ""},
           ],
           "key_moments": [{"start": 4.5, "end": 5.6, "type": "hook"}],
           "emotion_map": [{"start": 1.2, "end": 7.6, "emotion": "calm"}]}
    tm = SA.retime_source(src, W, 8.0)
    T = src["transcript"]
    check("phuong phap asr-align", tm["method"] == "asr-align", tm)
    check("cau 1 bat dau dung 0.2", abs(T[0]["start"] - 0.2) < 0.01, T[0])
    check("cau 2 bat dau dung 3.0 (chu 'la' khong khop van noi suy)", abs(T[1]["start"] - 3.0) < 0.01, T[1])
    check("cau 3 bat dau 5.0, ket thuc 6.0", abs(T[2]["start"] - 5.0) < 0.01 and abs(T[2]["end"] - 6.0) < 0.01, T[2])
    check("giu chu Gemini", T[0]["text"] == "nhắn tin hỏi tui")
    check("luu gio Gemini goc", T[1]["start_gemini"] == 4.5)
    check("khong chong nhau", all(a["end"] <= b["start"] + 1e-6 for a, b in zip(T, T[1:])), T)
    km = src["key_moments"][0]
    check("key_moment co gian theo cung ham (4.5 -> ~3.0)", abs(km["start"] - 3.0) < 0.35, km)
    check("lech trung vi duoc bao", tm["median_shift"] > 1.0, tm)
    check("co asr_words cho caption", len(src["asr_words"]) == len(W))

    print("[3] khop qua it -> giu gio Gemini")
    src2 = {"id": "s", "transcript": [{"start": 1.0, "end": 2.0, "text": "hoàn toàn khác biệt nhau luôn"}]}
    goc = copy.deepcopy(src2)
    tm2 = SA.retime_source(src2, words_of([("âm", 0.1), ("nhạc", 0.3)]), 5.0)
    check("method gemini + ly do", tm2["method"] == "gemini" and tm2.get("ly_do"), tm2)
    check("transcript khong doi", src2["transcript"] == goc["transcript"])

    print("[4] retime_brief khong bao gio nem loi (file khong co)")
    brief = {"source_videos": [{"id": "source_1", "path": "/khong/co/file.mp4"}],
             "sources": [{"id": "source_1", "transcript": [{"start": 0, "end": 1, "text": "xin chào"}]}]}
    notes = SA.retime_brief(brief)
    check("ghi chu giu gio Gemini", notes and "GIU GIO GEMINI" in notes[0], notes)
    check("needs_retime van True (lan sau thu lai)", SA.needs_retime(brief))

    print("[5] moc tung chu cho caption")
    rows = [[w["w"], w["s"], w["e"]] for w in W]
    wt = SA.caption_word_times("Có phải hàng Việt Nam?", rows, 3.1, 4.2)
    check("caption khop dung cau 3.0-4.0", wt and abs(wt[0][1] - 3.0) < 0.01 and abs(wt[-1][2] - 4.0) < 0.01, wt)
    check("giu chu goc cua caption", wt and wt[-1][0] == "Nam?", wt)
    check("caption viet lai qua xa -> None", SA.caption_word_times("hoàn toàn khác", rows, 3.0, 4.0) is None)

    print("\n%s (%d loi)" % ("TAT CA PASS" if not FAILS else "FAIL", len(FAILS)))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
