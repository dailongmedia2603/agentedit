#!/usr/bin/env python3
"""
Đẩy 1 draft do CapCutAPI sinh ra (folder dfd_cat_...) vào thư mục Projects của
CapCut International trên macOS, đồng thời patch lại các trường path/tên trong
draft_meta_info.json cho khớp máy hiện tại (repo gốc hardcode path của tác giả).

Cách dùng:
    python3 deploy_to_capcut.py <đường_dẫn_folder_dfd> [tên_hiển_thị]

Ví dụ:
    python3 deploy_to_capcut.py CapCutAPI/dfd_cat_1780422908_2f9abe84 "Test 1"
"""
import json
import os
import shutil
import sys
import time

CAPCUT_PROJECTS = os.path.expanduser(
    "~/Movies/CapCut/User Data/Projects/com.lveditor.draft"
)


def deploy(src_folder, display_name=None):
    src_folder = os.path.abspath(src_folder)
    if not os.path.isdir(src_folder):
        raise SystemExit(f"Không tìm thấy folder draft: {src_folder}")
    if not os.path.isdir(CAPCUT_PROJECTS):
        raise SystemExit(f"Không tìm thấy thư mục CapCut Projects: {CAPCUT_PROJECTS}")

    folder_name = os.path.basename(src_folder.rstrip("/"))
    display_name = display_name or folder_name
    dst_folder = os.path.join(CAPCUT_PROJECTS, folder_name)

    if os.path.exists(dst_folder):
        print(f"Xoá bản cũ: {dst_folder}")
        shutil.rmtree(dst_folder)
    shutil.copytree(src_folder, dst_folder)
    print(f"Đã copy -> {dst_folder}")

    # Patch draft_meta_info.json
    meta_path = os.path.join(dst_folder, "draft_meta_info.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        now_us = int(time.time() * 1_000_000)
        meta["draft_fold_path"] = dst_folder
        meta["draft_root_path"] = CAPCUT_PROJECTS
        meta["draft_name"] = display_name
        meta["draft_need_rename_folder"] = False
        # cập nhật thời gian để CapCut xếp lên đầu danh sách
        meta.setdefault("tm_draft_create", now_us)
        meta["tm_draft_modified"] = now_us
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False)
        print(f"Đã patch draft_meta_info.json (name='{display_name}', path khớp máy)")
    else:
        print("CẢNH BÁO: không có draft_meta_info.json trong draft")

    return dst_folder


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    name = sys.argv[2] if len(sys.argv) > 2 else None
    out = deploy(sys.argv[1], name)
    print(f"\nXong. Mở CapCut để kiểm tra. Draft tại:\n  {out}")
