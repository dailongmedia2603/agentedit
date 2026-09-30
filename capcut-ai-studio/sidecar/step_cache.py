#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO NHO DEM TUNG BUOC cua pipeline lap ke hoach.

Ly do ton tai: pipeline co 7 lan goi model (B1..B6 + review). Truoc day chi can
MOT buoc hong — mat mang vai giay, proxy chop 401, model bi cat giua chung — la
ca lan chay do bo, va nhung buoc DA CHAY XONG VA DA TRA TIEN cung mat theo.
Bam "Tiep tuc" la chay lai tu B1.

Nay moi buoc duoc luu theo VAN TAY CUA DAU VAO. Chay lai voi cung dau vao thi
lay lai ket qua cu (mien phi, tuc thi); chi buoc that su hong moi goi model lai.

Dat o ~/.capcut-studio/cache/steps/. Tu don file cu hon TTL_HOURS.
"""
import os
import json
import time
import hashlib

HOME = os.path.expanduser("~")
CACHE_DIR = os.path.join(HOME, ".capcut-studio", "cache", "steps")
TTL_HOURS = 48
MAX_FILES = 400


def _key(step, payload):
    """Van tay cua (ten buoc + toan bo dau vao). Doi 1 ky tu trong dau vao -> key khac."""
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return "%s-%s" % (step, hashlib.sha256(blob.encode("utf-8")).hexdigest()[:24])


def _path(step, payload):
    return os.path.join(CACHE_DIR, _key(step, payload) + ".json")


def get(step, payload):
    """Ket qua da luu, hoac None."""
    p = _path(step, payload)
    try:
        if not os.path.isfile(p):
            return None
        if time.time() - os.path.getmtime(p) > TTL_HOURS * 3600:
            return None
        with open(p, encoding="utf-8") as f:
            return json.load(f).get("result")
    except Exception:
        return None


def put(step, payload, result):
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(_path(step, payload), "w", encoding="utf-8") as f:
            json.dump({"step": step, "ts": time.time(), "result": result},
                      f, ensure_ascii=False)
        _prune()
    except Exception:
        pass  # cache hong thi bo qua, khong duoc lam vo pipeline
    return result


def _prune():
    try:
        files = [os.path.join(CACHE_DIR, f) for f in os.listdir(CACHE_DIR) if f.endswith(".json")]
        now = time.time()
        for f in files:
            if now - os.path.getmtime(f) > TTL_HOURS * 3600:
                os.remove(f)
        files = [f for f in files if os.path.isfile(f)]
        if len(files) > MAX_FILES:
            for f in sorted(files, key=os.path.getmtime)[:len(files) - MAX_FILES]:
                os.remove(f)
    except Exception:
        pass


def clear():
    n = 0
    try:
        for f in os.listdir(CACHE_DIR):
            if f.endswith(".json"):
                os.remove(os.path.join(CACHE_DIR, f))
                n += 1
    except Exception:
        pass
    return n


def run(step, payload, fn, use_cache=True, log=None):
    """Chay fn() va nho ket qua. Lan sau cung dau vao -> tra lai ngay.

    fn phai la ham khong tham so tra ve thu JSON-hoa duoc.
    """
    if use_cache:
        hit = get(step, payload)
        if hit is not None:
            if log:
                log("%s: dung lai ket qua da co (khong goi model, khong ton tien)" % step)
            return hit, True
    return put(step, payload, fn()), False
