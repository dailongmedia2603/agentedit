#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test bo nho dem tung buoc. Chay: python3 tests/test_step_cache.py

Boi canh: 2026-09-23 mot cu chop DNS vai giay o buoc B4 lam hong ca lan chay,
vut sach ket qua B1-B3 da goi model va da tra tien. Bam "Tiep tuc" chay lai tu dau.
"""
import os
import sys
import tempfile

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

import step_cache  # noqa: E402

# doi thu muc cache sang tam de khong dung vao cache that cua may
step_cache.CACHE_DIR = tempfile.mkdtemp(prefix="stepcache-test-")

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " " + str(detail)))
    if not cond:
        FAILED.append(name)


calls = {"n": 0}


def fake_model(result):
    def fn():
        calls["n"] += 1
        return result
    return fn


print("\n[1] Cung dau vao -> khong goi model lan 2")
calls["n"] = 0
payload = {"brief": {"a": 1}, "req": "lam tiktok 30s"}
r1, hit1 = step_cache.run("B1-select", payload, fake_model({"selections": [1, 2]}))
r2, hit2 = step_cache.run("B1-select", payload, fake_model({"selections": ["KHAC"]}))
check("lan 1 co goi model", calls["n"] == 1 and hit1 is False)
check("lan 2 KHONG goi model", calls["n"] == 1, "-> goi %d lan" % calls["n"])
check("lan 2 bao la dung lai", hit2 is True)
check("ket qua giong lan 1", r2 == r1, "-> %s" % r2)

print("\n[2] Doi dau vao -> phai goi lai model")
calls["n"] = 0
step_cache.run("B1-select", {"brief": {"a": 1}}, fake_model({"x": 1}))
step_cache.run("B1-select", {"brief": {"a": 2}}, fake_model({"x": 2}))
check("2 dau vao khac nhau -> 2 lan goi", calls["n"] == 2, "-> %d" % calls["n"])

print("\n[3] Thu tu key trong dau vao khong lam doi van tay")
calls["n"] = 0
step_cache.run("B2", {"a": 1, "b": 2}, fake_model({"r": 1}))
_, hit = step_cache.run("B2", {"b": 2, "a": 1}, fake_model({"r": 2}))
check("van nhan ra la cung dau vao", hit is True and calls["n"] == 1, "-> %d lan" % calls["n"])

print("\n[4] Cung dau vao nhung KHAC buoc -> tach rieng")
calls["n"] = 0
step_cache.run("B3-effects", {"x": 1}, fake_model({"r": "effects"}))
r, hit = step_cache.run("B4-captions", {"x": 1}, fake_model({"r": "captions"}))
check("khong lan ket qua giua 2 buoc", hit is False and r == {"r": "captions"}, "-> %s" % r)

print("\n[5] use_cache=False (nut 'Dung lai plan') -> luon goi model moi")
calls["n"] = 0
p = {"same": True}
step_cache.run("B5", p, fake_model({"v": 1}))
r, hit = step_cache.run("B5", p, fake_model({"v": 2}), use_cache=False)
check("bo qua cache", hit is False and r == {"v": 2}, "-> %s" % r)
check("co goi model lan 2", calls["n"] == 2, "-> %d" % calls["n"])
check("nhung van ghi de cache moi", step_cache.get("B5", p) == {"v": 2})

print("\n[6] Mo phong su co that: B4 hong, chay lai chi ton dung B4")
calls["n"] = 0
steps = [("B1-select", {"i": 1}), ("B2-timeline", {"i": 2}),
         ("B3-effects", {"i": 3}), ("B4-captions", {"i": 4})]


def run_pipeline(fail_at=None):
    """Tra so lan THUC SU goi model."""
    before = calls["n"]
    for name, pl in steps:
        if name == fail_at:
            raise RuntimeError("mat mang o %s" % name)
        step_cache.run(name, pl, fake_model({"step": name}))
    return calls["n"] - before


n1 = 0
try:
    run_pipeline(fail_at="B4-captions")
except RuntimeError:
    n1 = calls["n"]
check("lan dau chay duoc 3 buoc roi hong", n1 == 3, "-> %d lan goi" % n1)
n2 = run_pipeline()
check("chay lai chi goi model 1 lan (dung buoc B4)", n2 == 1, "-> %d lan goi" % n2)

print("\n[7] Cache hong khong duoc lam vo pipeline")
step_cache.CACHE_DIR = "/khong/ton/tai/duoc/dau"
calls["n"] = 0
r, hit = step_cache.run("BX", {"a": 1}, fake_model({"ok": True}))
check("van tra ve ket qua binh thuong", r == {"ok": True} and hit is False)

print("\n" + "=" * 60)
if FAILED:
    print("FAIL: " + ", ".join(FAILED))
    raise SystemExit(1)
print("TAT CA PASS")
