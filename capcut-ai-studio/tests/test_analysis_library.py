#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test THU VIEN PHAN TICH: luu / dung lai phan tich video nguon + video mau (khong goi AI that).

Chay:  HOME=$(mktemp -d) <venv_python> tests/test_analysis_library.py   (can ffmpeg)
"""
import os
import sys
import json
import shutil
import tempfile
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sidecar"))

FAILS = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % (detail,)))
    if not cond:
        FAILS.append(name)


def main():
    # ghi vao ~/.capcut-studio -> bat buoc HOME tam, khong dung vao thu vien that
    assert "tmp" in os.path.expanduser("~").lower(), "Chay voi HOME=$(mktemp -d)"
    import remotion_plan as RP
    tmp = tempfile.mkdtemp(prefix="lib-test-")
    try:
        vids = []
        for k, col in enumerate(("red", "blue", "green")):
            p = os.path.join(tmp, "v%d.mp4" % k)
            subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-y", "-f", "lavfi", "-i",
                            "color=c=%s:s=180x320:d=3" % col, "-c:v", "libx264", "-pix_fmt", "yuv420p", p], check=True)
            vids.append(p)
        import analysis_library as AL
        import providers
        import server
        import speech_align
        speech_align.needs_retime = lambda brief: False      # khong chay Whisper trong test

        calls = []
        fresh_seen = []

        def fake_sources(videos, log=None, fresh=False):
            calls.append([v["id"] for v in videos])
            fresh_seen.append(fresh)
            return {"summary": "tom tat moi", "tone": "vui", "language": "vi", "_source": "gemini-test",
                    "sources": [{"id": v["id"], "summary": "noi dung %s" % v["name"],
                                 "transcript": [{"text": "xin chao", "start": 0.1, "end": 1.0}],
                                 "timing": {"method": "asr-align"}} for v in videos]}
        providers.gemini_understand_sources = fake_sources
        import reference_video
        gem_calls = []

        def fake_ref(video, log=None, keep_dir=None):
            gem_calls.append(video["path"])
            return {"summary": "mau gemini moi", "_source": "gemini-ref:test", "style_kit": {"name": "x"}}
        reference_video.analyze_reference = fake_ref

        c = server.app.test_client()
        H = {"X-Studio-Token": server.AUTH_TOKEN or ""}
        V = lambda i, vid: {"id": vid, "path": vids[i], "name": "v%d.mp4" % i, "duration": 3.0}

        print("[1] hieu nguon: lan dau goi Gemini, lan sau dung lai")
        r = c.post("/understand_sources", json={"videos": [V(0, "source_1")]}, headers=H).get_json()
        check("lan 1 ok + goi Gemini", r["ok"] and calls == [["source_1"]], (r, calls))
        check("lan 1 khong bao dung lai", not r.get("reused"), r.get("reused"))
        r2 = c.post("/understand_sources", json={"videos": [V(0, "source_1")]}, headers=H).get_json()
        check("lan 2 KHONG goi Gemini", len(calls) == 1, calls)
        check("lan 2 bao dung lai", "source_1" in (r2.get("reused") or {}), r2.get("reused"))
        s0 = r2["brief"]["sources"][0]
        check("brief dung lai giu transcript + gio da can", s0.get("transcript") and s0.get("timing", {}).get("method") == "asr-align", s0)
        check("brief dung lai giu tom tat", r2["brief"].get("summary") == "tom tat moi", r2["brief"].get("summary"))

        print("[2] doi ten / chuyen file van nhan ra (theo noi dung)")
        moved = os.path.join(tmp, "sub", "da doi ten.mp4")
        os.makedirs(os.path.dirname(moved))
        shutil.copy2(vids[0], moved)
        r3 = c.post("/understand_sources", json={"videos": [{"id": "source_1", "path": moved, "name": "da doi ten.mp4",
                                                             "duration": 3.0}]}, headers=H).get_json()
        check("file copy/doi ten -> dung lai", len(calls) == 1 and "source_1" in (r3.get("reused") or {}), (calls, r3.get("reused")))
        check("ten + duong dan moi trong brief", r3["brief"]["source_videos"][0]["path"] == moved and
              r3["brief"]["sources"][0]["name"] == "da doi ten.mp4", r3["brief"]["sources"][0])

        check("file goc con -> thu vien giu duong dan goc",
              AL._read(AL.fingerprint(vids[0]))["path"] == os.path.abspath(vids[0]), AL._read(AL.fingerprint(vids[0])))
        # file thu vien tro toi bi chuyen / xoa, gap lai ban chep CUNG noi dung (vd trong thu muc du an)
        # -> thu vien tro sang ban chep (van mo / chon lai duoc)
        gone = os.path.join(tmp, "gone.mp4")
        subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=yellow:s=180x320:d=3",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", gone], check=True)
        AL.save_source(gone, {"summary": "vang"})
        copy_in_project = os.path.join(tmp, "du-an", "video-nguon", "gone.mp4")
        os.makedirs(os.path.dirname(copy_in_project))
        shutil.copy2(gone, copy_in_project)
        os.remove(gone)
        AL.lookup([copy_in_project])
        fpg = AL.fingerprint(copy_in_project)
        check("file thu vien mat -> tro sang ban chep cung noi dung", AL._read(fpg)["path"] == copy_in_project,
              AL._read(fpg))
        row = [i for i in c.post("/library/list", json={}, headers=H).get_json()["items"] if i["fp"] == fpg][0]
        check("thu vien bao file con (exists)", row["exists"] is True, row)
        AL.delete(fpg)                      # don muc thu, khong lam lech cac buoc dem ben duoi

        print("[3] tron: 1 da luu + 1 moi -> chi phan tich video moi, dung dung id")
        r4 = c.post("/understand_sources", json={"videos": [V(1, "source_1"), V(0, "source_2")]}, headers=H).get_json()
        check("chi gui Gemini video moi (source_1 = v1)", calls[-1] == ["source_1"] and len(calls) == 2, calls)
        ids = [x["id"] for x in r4["brief"]["sources"]]
        check("brief du 2 nguon, dung thu tu", ids == ["source_1", "source_2"], ids)
        check("nguon da luu doi id theo lan chon moi", r4["brief"]["sources"][1]["summary"] == "noi dung v0.mp4",
              r4["brief"]["sources"][1])
        check("reused chi co source_2", list((r4.get("reused") or {}).keys()) == ["source_2"], r4.get("reused"))

        print("[4] phan tich lai (fresh) -> goi Gemini du da luu")
        c.post("/understand_sources", json={"videos": [V(0, "source_1")], "fresh": True}, headers=H)
        check("fresh goi lai Gemini", len(calls) == 3, calls)
        # fresh cung phai di xuong provider -> bo qua ca cache tung luot Gemini (48h)
        check("fresh truyen xuong gemini_understand_sources", fresh_seen[-1] is True and not any(fresh_seen[:-1]),
              fresh_seen)

        print("[5] video mau: Gemini (ref_video, tu 2026-09-28); ban GPT cu (ref_gpt) van dung lai; ban CapCut cu khong dung")
        # ref_gemini = du lieu luong CapCut da go (schema khac) -> khong bao gio duoc dung lai cho Remotion.
        AL.save_reference(vids[2], "ref_gemini", {"summary": "mau capcut cu", "format": "talking_head"}, name="m.mp4")
        AL.save_reference(vids[2], "ref_gpt", {"summary": "mau gpt cu", "_source": "gpt-cli:x", "style_kit": {"name": "g"}},
                          name="m.mp4")
        check("route Gemini cu da go", c.post("/understand_reference", json={"video": {"path": vids[2]}},
                                              headers=H).status_code == 404)
        g0 = c.post("/remotion/understand_reference", json={"video": {"path": vids[2], "name": "m.mp4"}}, headers=H).get_json()
        check("chua co ban Gemini -> dung lai ban GPT cu (khong goi AI, khong dung ban CapCut)",
              not gem_calls and g0["analysis"]["summary"] == "mau gpt cu"
              and g0["analysis"]["_library"]["kind"] == "ref_gpt", g0)
        g1 = c.post("/remotion/understand_reference", json={"video": {"path": vids[2], "name": "m.mp4"}, "fresh": True},
                    headers=H).get_json()
        check("fresh -> Gemini phan tich lai", gem_calls == [vids[2]] and g1["analysis"]["summary"] == "mau gemini moi", g1)
        g2 = c.post("/remotion/understand_reference", json={"video": {"path": vids[2], "name": "m.mp4"}}, headers=H).get_json()
        check("lan sau dung lai ban Gemini (uu tien hon GPT cu, giu style_kit)",
              len(gem_calls) == 1 and g2["analysis"]["summary"] == "mau gemini moi" and g2["analysis"].get("style_kit")
              and g2["analysis"]["_library"]["kind"] == "ref_video", g2)

        print("[6] lookup / list / delete")
        f = c.post("/library/lookup", json={"paths": [vids[0], vids[2], "/khong/co.mp4"]}, headers=H).get_json()["found"]
        check("lookup: v0 co nguon", f[vids[0]].get("source_at"), f[vids[0]])
        check("lookup: mau co ca 3 kieu", f[vids[2]].get("ref_gemini_at") and f[vids[2]].get("ref_gpt_at")
              and f[vids[2]].get("ref_video_at"), f[vids[2]])
        check("lookup: file khong co", f["/khong/co.mp4"] == {"exists": False})
        items = c.post("/library/list", json={}, headers=H).get_json()["items"]
        check("list co 3 video", len(items) == 3, [i["name"] for i in items])
        it2 = [i for i in items if i["fp"] == f[vids[2]]["fp"]][0]
        check("list co anh nho + 3 phan tich mau", (it2.get("thumb") or "").startswith("data:image/jpeg") and
              it2.get("ref_gemini") and it2.get("ref_gpt", {}).get("style_kit") and it2.get("ref_video", {}).get("style_kit"), it2)
        c.post("/library/delete", json={"fp": it2["fp"], "part": "ref_gemini"}, headers=H)
        f2 = c.post("/library/lookup", json={"paths": [vids[2]]}, headers=H).get_json()["found"][vids[2]]
        check("xoa 1 phan (du lieu cu): con GPT + Gemini moi, mat ban CapCut",
              f2.get("ref_gpt_at") and f2.get("ref_video_at") and not f2.get("ref_gemini_at"), f2)
        c.post("/library/delete", json={"fp": it2["fp"]}, headers=H)
        items = c.post("/library/list", json={}, headers=H).get_json()["items"]
        check("xoa ca muc", len(items) == 2, [i["name"] for i in items])

        print("[7] nhap tu du an cu (projects.json)")
        v_old = os.path.join(tmp, "cu.mp4")
        shutil.copy2(vids[2], v_old)
        os.makedirs(AL.HOME, exist_ok=True)
        with open(AL.PROJECTS_PATH, "w", encoding="utf-8") as fh:
            json.dump({"items": {"p1": {"id": "p1", "updatedAt": 1790000000000, "mode": "remotion",
                                        "sourceBrief": {"summary": "brief cu", "source_videos": [{"id": "source_1", "path": v_old,
                                                                                                    "name": "cu.mp4"}],
                                                        "sources": [{"id": "source_1", "summary": "nguon cu",
                                                                     "transcript": [{"text": "a", "start": 0, "end": 1}]}]},
                                        "referenceVideo": {"path": vids[1], "name": "v1.mp4"},
                                        "referenceAnalysis": {"summary": "mau cu", "_source": "gpt-cli:x"}},
                                 "p2": {"id": "p2", "updatedAt": 1790000000001, "mode": "remotion",
                                        "referenceVideo": {"path": vids[0], "name": "v0.mp4"},
                                        "referenceAnalysis": {"summary": "mau gemini du an", "_source": "gemini-ref:agy:x"}}}}, fh)
        items = c.post("/library/list", json={}, headers=H).get_json()["items"]
        old = [i for i in items if i["path"] == v_old]
        check("du an cu -> nguon vao thu vien", old and old[0].get("source", {}).get("summary") == "brief cu", old)
        v1 = [i for i in items if i["path"] == vids[1]][0]
        check("du an cu (Remotion) -> mau GPT", v1.get("ref_gpt", {}).get("summary") == "mau cu", v1)
        v0 = [i for i in items if i["path"] == vids[0]][0]
        check("du an (mau Gemini moi) -> ref_video", v0.get("ref_video", {}).get("summary") == "mau gemini du an", v0)
        n = AL.import_projects_once()
        check("khong nhap lai lan 2", n == 0, n)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("\n%s (%d loi)" % ("TAT CA PASS" if not FAILS else "FAIL", len(FAILS)))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
