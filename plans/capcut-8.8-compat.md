# Plan: Nâng cấp tương thích CapCut 8.8.0

## Phát hiện từ phân tích thực tế

### ✅ Tín hiệu tốt
- **`version: 360000`** — KHÔNG thay đổi giữa template và CapCut 8.8.0 thật → schema core tương thích
- Engine sinh draft vẫn dùng đúng schema version 360000
- `script_file.py` đã handle `masks` → `common_mask` switch dựa trên `IS_CAPCUT_ENV`

### 🔴 Cần sửa (7 files)

#### 1. Version gate - HIỂN THỊ WARNING SAI
**File:** `capcut-ai-studio/electron/services/capcut.ts` (line 9)
- `SUPPORTED_CAPCUT_VERSION = '8.6.0'` → `'8.8.0'`
- Doctor page hiện tại sẽ hiển thị warning vàng cho 8.8.0

#### 2. Platform metadata - 3 vị trí hardcode `"6.5.0"` → `"8.8.0"`
- `CapCutAPI/settings/__init__.py:30` — `get_platform_info()`
- `CapCutAPI/pyJianYingDraft/script_file.py:889` — `last_modified_platform.app_version`
- `CapCutAPI/pyJianYingDraft/script_file.py:899` — `platform.app_version`

#### 3. Template `new_version` — `"110.0.0"` → `"169.0.0"`
- `CapCutAPI/pyJianYingDraft/draft_content_template.json:108`
- `CapCutAPI/template/draft_info.json:245`

#### 4. Thêm 8 top-level keys mới vào template (CapCut 8.8 thêm)
Cả 2 template files cần thêm:
- `draft_type: "video"` 
- `function_assistant_info: {...}`
- `is_drop_frame_timecode: false`
- `lyrics_effects: []`
- `path: ""`
- `platform: {...}` (copy from last_modified_platform)
- `smart_ads_info: {...}`
- `uneven_animation_template_info: {...}`

#### 5. Thêm 10 material keys mới vào template (CapCut 8.8 thêm)
Cả 2 template cần thêm vào `materials`:
- `audio_pannings: []`, `audio_pitch_shifts: []`
- `digital_human_model_dressing: []`
- `hsl_curves: []`, `manual_beautys: []`
- `placeholder_infos: []`
- `video_radius: []`, `video_shadows: []`, `video_strokes: []`

> **Note:** `common_mask` đã được `script_file.py` tự động xử lý qua `IS_CAPCUT_ENV` — không cần sửa template

#### 6. Dọn dẹp
- Xóa file `_test_compat_88.py` sau khi hoàn tất

## Risk Assessment
- **Rủi ro thấp**: Các thay đổi là additive (thêm field mới, không xóa field cũ)
- **Backward compatible**: Template mới vẫn tương thích CapCut cũ (field thừa bị ignore)
- **Không cần test OSS**: Không thay đổi logic upload/download
