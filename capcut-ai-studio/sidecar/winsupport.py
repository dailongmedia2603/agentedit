#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Khac biet Windows cua sidecar gom MOT cho (macOS: cac ham giu nguyen hanh vi cu).

- install()      : goi 1 lan luc sidecar khoi dong (server.py). Windows:
                     * tien trinh con (ffmpeg, codex, claude...) KHONG bat cua so console (CREATE_NO_WINDOW);
                     * subprocess che do chu doc/ghi UTF-8, ky tu la -> thay the (Windows mac dinh cp1252 /
                       cp1258 -> prompt / ten file tieng Viet loi UnicodeError);
                     * stdout / stderr cua chinh sidecar UTF-8;
                     * Pillow doc HEIC (pillow-heif) — macOS dung sips.
- exe(name)      : "ffmpeg" -> "ffmpeg.exe" tren Windows.
- ffbin(name)    : ffmpeg / ffprobe GHIM cua app (Doctor cai vao ~/.capcut-studio/tools/bin) truoc, roi moi toi may.
- kill_tree(p)   : dung CA CAY tien trinh (Windows: taskkill /T /F; POSIX: killpg neu tien trinh co session rieng).
- run(argv, ...) : nhu subprocess.run(capture, timeout) nhung het gio thi giet CA CAY roi moi doc not (Windows:
                   chau con giu ong dan -> subprocess.run treo vo han sau khi giet con).
- parent_alive(pid): tien trinh me con song (Windows khong doi ppid khi me chet -> phai hoi he dieu hanh).
"""
import os
import subprocess
import sys

IS_WIN = os.name == "nt"
ENGINE_HOME = os.path.join(os.path.expanduser("~"), ".capcut-studio")
TOOLS_BIN = os.path.join(ENGINE_HOME, "tools", "bin")
CREATE_NO_WINDOW = 0x08000000

_installed = False


def exe(name):
    return name + ".exe" if IS_WIN and not os.path.splitext(name)[1] else name


def ffbin(name):
    """Duong dan ffmpeg / ffprobe: ban GHIM cua app (kiem SHA-256) truoc, roi moi toi may; khong co -> ten tran (PATH)."""
    cands = [os.path.join(TOOLS_BIN, exe(name))]
    if not IS_WIN:
        cands += [os.path.expanduser("~/.local/bin/%s" % name), "/opt/homebrew/bin/%s" % name, "/usr/local/bin/%s" % name]
    for p in cands:
        if os.path.isfile(p):
            return p
    return exe(name)


def _patch_popen():
    orig = subprocess.Popen.__init__

    def __init__(self, *args, **kw):
        if IS_WIN:
            if not kw.get("creationflags"):
                kw["creationflags"] = CREATE_NO_WINDOW
            if (kw.get("text") or kw.get("universal_newlines")) and not kw.get("encoding"):
                kw["encoding"] = "utf-8"
                kw.setdefault("errors", "replace")
        orig(self, *args, **kw)
    subprocess.Popen.__init__ = __init__


def install():
    global _installed
    if _installed or not IS_WIN:
        return
    _installed = True
    _patch_popen()
    for st in (sys.stdout, sys.stderr):
        try:
            st.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except Exception:
        pass


def kill_tree(p):
    """Dung tien trinh p (subprocess.Popen) cung moi tien trinh con chau."""
    if p is None or p.poll() is not None:
        return
    if IS_WIN:
        try:
            subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True, timeout=30,
                           creationflags=CREATE_NO_WINDOW)
        except Exception:
            pass
        try:
            p.kill()
        except Exception:
            pass
        return
    import signal
    try:
        if os.getpgid(p.pid) == p.pid:          # co session rieng (start_new_session) -> giet ca nhom
            os.killpg(p.pid, signal.SIGTERM)
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
            return
    except Exception:
        pass
    try:
        p.kill()
    except Exception:
        pass


def run(argv, input=None, timeout=60, env=None, cwd=None):
    """(returncode, stdout, stderr) che do chu UTF-8. Het gio -> TimeoutExpired SAU khi da giet ca cay tien trinh."""
    p = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                         encoding="utf-8", errors="replace", env=env, cwd=cwd)
    try:
        out, err = p.communicate(input=input, timeout=timeout)
    except subprocess.TimeoutExpired:
        kill_tree(p)
        try:
            p.communicate(timeout=10)
        except Exception:
            pass
        raise
    return p.returncode, out or "", err or ""


def parent_alive(pid):
    """Tien trinh `pid` con chay khong (Windows: OpenProcess + GetExitCodeProcess)."""
    if not IS_WIN:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    import ctypes
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x1000, False, int(pid))     # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return False
    try:
        code = ctypes.c_ulong()
        if not k32.GetExitCodeProcess(h, ctypes.byref(code)):
            return True
        return code.value == 259                      # STILL_ACTIVE
    finally:
        k32.CloseHandle(h)


def node_env(base_path=None):
    """Env toi thieu cho Node / Electron-as-Node (hop cach ly FX). Windows can SYSTEMROOT, TEMP... (thieu ->
    Winsock / crypto cua Node khoi dong loi)."""
    env = {"PATH": base_path or os.environ.get("PATH", "/usr/bin:/bin"), "HOME": os.path.expanduser("~")}
    if IS_WIN:
        for k in ("SYSTEMROOT", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
                  "COMSPEC", "PATHEXT", "PROGRAMDATA", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"):
            if os.environ.get(k):
                env[k] = os.environ[k]
    return env
