#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test cach xu ly loi khi goi model. Chay: python3 tests/test_providers_errors.py

Case lay tu su co that 2026-09-23: proxy tra HTTP 401
  {"error":{"message":"This token status is unavailable","type":"new_api_error"}}
Code cu thu lai 4 lan (vo ich, ton quota) roi bao "Proxy co the dang chan/qua tai"
— sai ban chat, khien nguoi dung di doi thay vi di kiem tra token.
"""
import os
import sys
import types

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

# requests that co the chua cai trong python he thong -> gia lap du dung cho test
try:
    import requests  # noqa: F401
except ImportError:
    fake = types.ModuleType("requests")

    class _Exc(Exception):
        pass

    fake.exceptions = types.SimpleNamespace(RequestException=_Exc, Timeout=_Exc)
    fake.post = lambda *a, **k: None
    fake.get = lambda *a, **k: None
    sys.modules["requests"] = fake

import requests  # noqa: E402
import providers  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " " + str(detail)))
    if not cond:
        FAILED.append(name)


class Resp:
    def __init__(self, code, text):
        self.status_code = code
        self.text = text

    def json(self):
        import json as _j
        return _j.loads(self.text)


def run(resp_factory, **kw):
    """Goi _openai_chat voi requests.post da bi thay. Tra (loi, so_lan_goi)."""
    calls = {"n": 0}

    def fake_post(*a, **k):
        calls["n"] += 1
        return resp_factory(calls["n"])

    old = requests.post
    requests.post = fake_post
    try:
        providers._openai_chat("https://proxy.test/v1", "sk-x", "gpt-5.5",
                               [{"role": "system", "content": "s"},
                                {"role": "user", "content": "u"}], **kw)
        return None, calls["n"]
    except Exception as e:
        return e, calls["n"]
    finally:
        requests.post = old


print("\n[1] 401 'token status is unavailable' — dung NGAY, khong thu lai")
err, n = run(lambda i: Resp(401, '{"error":{"message":"This token status is unavailable",'
                                 '"type":"new_api_error"}}'))
check("chi goi 1 lan (khong thu lai 4 lan)", n == 1, "-> goi %d lan" % n)
check("bao dung ban chat: token khong dung duoc",
      err and "KHONG DUNG DUOC" in str(err), "-> %s" % str(err)[:90])
check("KHONG bao sai la 'qua tai'", err and "qua tai" not in str(err).lower())
check("co noi ro buoc nao hong", err and "Buoc:" in str(err))

print("\n[2] 401 'expired' — huong dan cap key moi")
err, n = run(lambda i: Resp(401, '{"error":{"message":"API key expired"}}'))
check("dung ngay", n == 1, "-> %d" % n)
check("noi key het han", err and "HET HAN" in str(err), "-> %s" % str(err)[:90])

print("\n[3] 403 — cung dung ngay")
err, n = run(lambda i: Resp(403, "forbidden"))
check("dung ngay", n == 1, "-> %d" % n)

print("\n[4] 429 — VAN thu lai (co the qua tai that), roi bao dung")
err, n = run(lambda i: Resp(429, "rate limited"), max_attempts=3)
check("co thu lai", n == 3, "-> %d" % n)
check("bao la gioi han toc do/han muc", err and "429" in str(err), "-> %s" % str(err)[:90])

print("\n[5] 500 — thu lai roi bao proxy loi")
err, n = run(lambda i: Resp(500, "bad gateway"), max_attempts=2)
check("co thu lai", n == 2, "-> %d" % n)
check("bao proxy/model loi", err and "loi" in str(err).lower(), "-> %s" % str(err)[:90])

print("\n[6] 401 o lan thu 2 — van dung ngay tai do")
err, n = run(lambda i: Resp(200, '{"choices":[{"message":{"content":""}}]}') if i == 1
             else Resp(401, "This token status is unavailable"))
check("dung o lan 2, khong chay het 4 lan", n == 2, "-> %d" % n)

print("\n[6b] Model suy luan dot het token, content RONG (su co that B4-captions)")
# Phan hoi y het cua proxy: content="", finish_reason="length", completion_tokens = max_tokens
CUT = ('{"choices":[{"index":0,"message":{"role":"assistant","content":"","refusal":null},'
       '"finish_reason":"length"}],"usage":{"prompt_tokens":4773,"completion_tokens":4096}}')
OK = '{"choices":[{"message":{"content":"{\\"captions\\":[]}"}}],"usage":{}}'

budgets = []


def spy(i):
    """Ghi lai max_tokens cua tung lan goi; lan 3 moi cho thanh cong."""
    import json as _j
    body = _j.loads(spy.last_body)
    budgets.append(body.get("max_tokens"))
    return Resp(200, CUT if i < 3 else OK)


# bat lay body gui di
_orig_post = requests.post


def capture_post(url, **k):
    import json as _j
    capture_post.n += 1
    spy.last_body = _j.dumps(k.get("json") or {})
    return spy(capture_post.n)


capture_post.n = 0
requests.post = capture_post
try:
    out = providers._openai_chat("https://proxy.test/v1", "sk-x", "gpt-5.5",
                                 [{"role": "system", "content": "s"},
                                  {"role": "user", "content": "u"}],
                                 json_mode=True, max_tokens=4096, max_attempts=2)
    err = None
except Exception as e:
    out, err = None, e
finally:
    requests.post = _orig_post

check("khong nem loi — tu cuu duoc", err is None, "-> %s" % str(err)[:120])
check("tra ve dung noi dung", out and "captions" in out, "-> %s" % out)
check("co TANG ngan sach token sau moi lan bi cat",
      len(budgets) >= 3 and budgets[1] > budgets[0] and budgets[2] > budgets[1],
      "-> cac muc da thu: %s" % budgets)
check("bat dau dung tu muc duoc yeu cau (4096)", budgets and budgets[0] == 4096,
      "-> %s" % budgets)

print("\n[6c] Tang het tran ma van bi cat -> bao dung nguyen nhan")
err, n = run(lambda i: Resp(200, CUT), max_tokens=providers.MAX_OUTPUT_BUDGET, max_attempts=2)
check("bao la dot het token cho SUY LUAN",
      err and "SUY LUAN" in str(err), "-> %s" % str(err)[:130])
check("goi y doi sang model khong-suy-luan",
      err and "khong-suy-luan" in str(err), "-> %s" % str(err)[:130])

print("\n[7] Thanh cong binh thuong thi khong doi gi")
err, n = run(lambda i: Resp(200, '{"choices":[{"message":{"content":"{\\"ok\\":1}"}}]}'))
check("khong nem loi", err is None, "-> %s" % err)
check("chi goi 1 lan", n == 1, "-> %d" % n)

print("\n" + "=" * 60)
if FAILED:
    print("FAIL: " + ", ".join(FAILED))
    raise SystemExit(1)
print("TAT CA PASS")
