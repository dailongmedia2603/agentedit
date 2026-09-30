#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""[EXPERIMENTAL - macOS] Tu dong Export trong CapCut.
PHAI chay bang VENV python (co Quartz). Yeu cau: PROJECT DANG MO trong editor + quyen Accessibility.
Luong da kiem chung: activate CapCut -> Cmd+E (mo popup) -> doc toa do nut 'ExportOkBtn' qua AX
-> click chuot that (Quartz) tai dung nut do (KHONG hardcode toa do).

  <venv_python> export_capcut.py
  <venv_python> export_capcut.py --ultra   # bam 'Export in ultra HD' (Pro) thay vi ban thuong
"""
import sys, subprocess, time, platform, argparse

def osa(s):
    r = subprocess.run(["osascript", "-e", s], capture_output=True, text=True)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()

def click(x, y):
    import Quartz
    for t in (Quartz.kCGEventMouseMoved, Quartz.kCGEventLeftMouseDown, Quartz.kCGEventLeftMouseUp):
        e = Quartz.CGEventCreateMouseEvent(None, t, (x, y), Quartz.kCGMouseButtonLeft)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, e)
        time.sleep(0.08)

def btn_center(name):
    rc, out, err = osa(
        'tell application "System Events" to tell process "CapCut" to tell button "%s" of sheet 1 of window 1 to '
        'return (item 1 of position) & "," & (item 2 of position) & "," & (item 1 of size) & "," & (item 2 of size)' % name)
    if rc != 0 or not out:
        return None
    try:
        x, y, w, h = [float(v) for v in out.replace(" ", "").split(",")]
        return (x + w/2, y + h/2)
    except Exception:
        return None

def main():
    if platform.system() != "Darwin":
        print("Chi macOS."); sys.exit(2)
    ap = argparse.ArgumentParser(); ap.add_argument("--ultra", action="store_true")
    ap.add_argument("--popup-delay", type=float, default=2.0); a = ap.parse_args()

    osa('tell application "CapCut" to activate'); time.sleep(1.0)
    rc, _, err = osa('tell application "System Events" to keystroke "e" using command down')
    if rc != 0:
        print("FAIL Cmd+E (Accessibility?):", err); sys.exit(1)
    time.sleep(a.popup_delay)

    name = "VideoEnhanceExportOkBtn" if a.ultra else "ExportOkBtn"
    c = btn_center(name)
    if not c:
        print("Khong doc duoc nut '%s' tu AX -> popup chua mo? hoac CapCut doi UI." % name); sys.exit(1)
    click(c[0], c[1])
    print("Da click '%s' @ %.0f,%.0f -> CapCut dang render." % (name, c[0], c[1]))

if __name__ == "__main__":
    main()
