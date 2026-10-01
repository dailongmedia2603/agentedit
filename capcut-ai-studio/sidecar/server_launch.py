#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Diem vao sidecar cho ban DA BIEN DICH (Cython -> server.so).
`server.py` bien dich thanh `server.cpython-*.so`; khong the giu file `server.py` cung ten
(loader Python uu tien .so) nen dung launcher rieng nay goi server.main().
Ban dev van chay thang `server.py` (khong qua launcher). Lenh khoi dong giong het:
  <python> server_launch.py --port <PORT> [--token <SECRET>]
"""
import server

if __name__ == "__main__":
    server.main()
