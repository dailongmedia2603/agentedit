#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test VE BAN QUYEN phia sidecar (server.py): Ed25519 thuan Python + cong chan route. Khong can mang.

Chay:  HOME=$(mktemp -d) <venv_python> tests/test_license_ticket.py
"""
import os
import sys
import json
import base64
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sidecar"))
os.environ.pop("STUDIO_LICENSE_OFF", None)

FAILS = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % (detail,)))
    if not cond:
        FAILS.append(name)


import server  # noqa: E402

# RFC 8032 muc 7.1 — TEST 1 (thong diep rong) va TEST 2 (1 byte 0x72)
V = [
    ("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
     "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
    ("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
     "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
]
print("Ed25519 (RFC 8032)")
for i, (pub, msg, sig) in enumerate(V, 1):
    pub, msg, sig = bytes.fromhex(pub), bytes.fromhex(msg), bytes.fromhex(sig)
    check("vector %d dung" % i, server._ed_verify(pub, msg, sig))
    check("vector %d sua thong diep -> sai" % i, not server._ed_verify(pub, msg + b"x", sig))
    bad = bytearray(sig)
    bad[5] ^= 1
    check("vector %d sua chu ky -> sai" % i, not server._ed_verify(pub, msg, bytes(bad)))

print("Ve ky bang Node (dinh dang that cua may chu)")
NODE = r"""
const { generateKeyPairSync, sign } = require('crypto')
const [fpJson, until, exp] = process.argv.slice(1)
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
const mk = (p) => { const body = Buffer.from(JSON.stringify(p)).toString('base64url'); return 'v1.' + body + '.' + sign(null, Buffer.from('v1.' + body), privateKey).toString('base64url') }
const now = Date.now()
const fp = JSON.parse(fpJson)
console.log(JSON.stringify({ pub,
  good: mk({ v: 1, lid: 'L1', plan: 'year', exp: exp === 'null' ? null : now + Number(exp), iat: now, until: now + Number(until), fp, dev: 'x' }),
  old: mk({ v: 1, lid: 'L1', plan: 'year', exp: null, iat: now, until: now - 3 * 86400000, fp, dev: 'x' }),
  other: mk({ v: 1, lid: 'L1', plan: 'year', exp: null, iat: now, until: now + 86400000, fp: { platform: fp.platform, c: Object.fromEntries(Object.keys(fp.c).map(k => [k, '0'.repeat(32)])) }, dev: 'x' }),
  expired: mk({ v: 1, lid: 'L1', plan: 'month', exp: now - 3 * 86400000, iat: now, until: now + 86400000, fp, dev: 'x' }) }))
"""
own = server._lic_fp()
out = json.loads(subprocess.check_output(["node", "-e", NODE, json.dumps(own), str(3 * 86400000), "null"], text=True))
os.environ["STUDIO_LICENSE_PUB"] = out["pub"]
p, why = server._lic_parse(out["good"])
check("ve dung -> nhan", p is not None and p["plan"] == "year", why)
check("ve het han (until) -> tu choi", server._lic_parse(out["old"])[0] is None)
check("ve key het han (exp) -> tu choi", server._lic_parse(out["expired"])[0] is None)
if own["c"]:
    check("ve cua may khac -> tu choi", server._lic_parse(out["other"])[0] is None)
os.environ["STUDIO_LICENSE_PUB"] = base64.b64encode(b"\x01" * 32).decode()
check("khoa cong khai khac -> tu choi", server._lic_parse(out["good"])[0] is None)
os.environ["STUDIO_LICENSE_PUB"] = out["pub"]

print("Cong chan route")
server._LIC["payload"] = None
with server.app.test_client() as c:
    r = c.get("/health")
    check("/health khong can ve", r.status_code == 200)
    r = c.post("/remotion/autoplan", json={})
    check("chua co ve -> /remotion/autoplan 403", r.status_code == 403 and r.get_json().get("code") == "license", r.get_data()[:200])
    r = c.post("/understand_sources", json={})
    check("chua co ve -> /understand_sources 403", r.status_code == 403)
    r = c.post("/library/sync", json={})
    check("chua co ve -> /library/sync 403", r.status_code == 403)
    r = c.post("/license/ticket", json={"ticket": out["old"]})
    check("day ve het han -> 400", r.status_code == 400)
    r = c.post("/license/ticket", json={"ticket": out["good"]})
    check("day ve dung -> ok", r.status_code == 200 and r.get_json().get("ok"), r.get_data()[:200])
    r = c.get("/sfx/list")
    check("co ve -> /sfx/list qua cong", r.status_code != 403, r.status_code)
    r = c.post("/license/ticket", json={"ticket": ""})
    r = c.get("/sfx/list")
    check("thu hoi ve -> lai 403", r.status_code == 403)

print("\n%s" % ("TAT CA OK" if not FAILS else "%d FAIL" % len(FAILS)))
sys.exit(1 if FAILS else 0)
