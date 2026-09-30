# Hermes Hybrid Integration — Implementation Plan

## Tình trạng hiện tại (pre-assessment)

### Cái gì đã có:
- `sidecar/server.py` — Flask API (:8765) với đầy đủ `/plan`, `/autoplan`, `/build`, `/deploy`, `/export`, `/doctor`
- `sidecar/engine.py` — `build_draft()`, `deploy_draft()`, `auto_export()`, `selftest_build()`, `find_effect()`
- `sidecar/providers.py` — `gpt_plan()`, `claude_review()`, `gemini_understand()` gọi API trực tiếp
- `sidecar/config.py` — `~/.capcut-studio/state.json` cho engine paths, providers trong RAM
- `electron/ipc.ts` — 20+ IPC handlers (pipeline:*, sfx:*, doctor:*, settings:*)
- `electron/services/sidecar.ts` — spawn sidecar process, health poll, pushConfig
- `~/.capcut-studio/` — đã có state.json và cấu trúc thư mục

### Cái gì chưa có:
- Hermes Agent repo (chưa clone, chưa fork)
- `~/.capcut-studio/engine/` thư mục con (memory, skills, mcp_servers)
- `sidecar/engine_manager.py`
- Bất kỳ integration code nào

### Rủi ro đã xác định:
- **Rủi ro chính**: Hermes Agent là dự án bên ngoài (NousResearch), API nội bộ có thể không giống như plan mô tả. Các class như `AIAgent`, `run_agent`, `memory.search_memory` có thể không tồn tại hoặc khác signature.
- **Python 3.12 compat**: Hermes Agent yêu cầu Python 3.11 theo README. Sidecar hiện dùng Python 3.12.
- **Độ phức tạp**: Thêm 1 AI agent framework bên ngoài vào sidecar đang hoạt động ổn định có thể gây instability.

## Chiến lược triển khai (Adaptive Approach)

Thay vì làm theo đúng 6 phase tuần tự, ta dùng **spike-driven approach**:

### Phase 0: Spike — Khám phá Hermes Agent (30 phút)
1. Clone `https://github.com/NousResearch/hermes-agent.git` vào `capcut-engine/`
2. Đọc cấu trúc source thật: tìm class `AIAgent`, memory system, skill system, MCP support
3. Test import `from hermes_agent.xxx import AIAgent` (nếu có)
4. Nếu Hermes không có API như mô tả → chuyển sang Plan B

**Decision gate sau Phase 0:**
- ✅ Hermes có API đúng như plan → tiếp tục Phase 1-6
- ❌ Hermes không có API như plan → **Plan B: Build lightweight EngineManager nội bộ** (không fork Hermes)

### Plan A: Full Hermes Integration (nếu Hermes Agent có API đúng)

#### Phase 1: Fork & Rename (1-2h)
- Clone repo, rename `hermes` → `capcut_engine` trong toàn bộ source
- Đổi default paths → `~/.capcut-studio/engine/`
- Test `pip install -e .`
- Test import: `from capcut_engine.xxx import AIAgent`

#### Phase 2: Memory + Skill Setup (2-3h)
- Cài Holographic memory (SQLite local)
- Tạo `~/.capcut-studio/engine/` structure
- Viết `SKILL.md` cho capcut-video-editor (dùng nội dung từ references/ hiện có)
- Tạo effects-catalog.md và sfx-catalog.md rút gọn

#### Phase 3: MCP Bridge Config (1h)
- Tạo `~/.capcut-studio/engine/mcp_servers.json`
- Cấu hình Hermes → MCP capcut-api
- Test gọi `get_video_duration` qua MCP

#### Phase 4: Sidecar Integration (3-4h)
- Viết `sidecar/engine_manager.py` (EngineManager class)
- Sửa `sidecar/server.py`: thêm `/engine/health`, `/engine/init`, tích hợp vào `/autoplan`
- Sửa `sidecar/engine.py`: `plan_video()` với Engine + fallback
- Sửa `electron/ipc.ts`: thêm `engine:*` handlers
- Sửa `electron/services/sidecar.ts`: init engine sau sidecar start

#### Phase 5: Test & Verify (2h)
- Doctor check: `/engine/health`
- E2E test: Engine plan → build → deploy
- Fallback test: Engine unavailable → GPT direct
- Memory persistence test

### Plan B: Lightweight EngineManager nội bộ (nếu Hermes không phù hợp)

Không fork Hermes. Thay vào đó, xây dựng EngineManager đơn giản trong sidecar:

```python
# sidecar/engine_manager.py
class EngineManager:
    def __init__(self):
        self.engine_home = Path.home() / ".capcut-studio" / "engine"
        self.memory = HolographicMemory(db_path=...)
        self.skills = SkillLoader(skills_dir=...)
    
    def plan(self, prompt, video_path, style):
        # 1. Load skill context từ SKILL.md (local file)
        # 2. Query memory cho user preferences (Holographic SQLite)
        # 3. Build enhanced prompt = skill + memory + user prompt
        # 4. Gọi GPT API với prompt đã enrich (qua providers.py)
        # 5. Save extracted facts vào memory
        # 6. Return plan
```

**Ưu điểm của Plan B:**
- Không phụ thuộc vào external package (Hermes)
- Tận dụng providers.py hiện có (đã test kỹ)
- Memory layer đơn giản: SQLite + full-text search
- Skill system: đọc MD files từ disk
- Dễ maintain, dễ debug
- Fallback tự nhiên (nếu memory/skill lỗi → vẫn gọi GPT như cũ)

**Memory implementation Plan B:**
- Dùng SQLite3 (built-in Python) thay vì Holographic package
- Schema: `facts(id, content, source, trust_score, created_at, last_accessed_at)`
- Full-text search qua `LIKE` hoặc FTS5
- Auto-decay trust score nếu fact không được dùng

**Các thành phần vẫn giữ nguyên từ plan gốc:**
- ✅ Skill `capcut-video-editor` với SKILL.md
- ✅ MCP config bridge (cho tương lai)
- ✅ EngineManager wrapper class
- ✅ Fallback guarantee
- ✅ `/engine/health` endpoint
- ✅ Doctor check
- ✅ Memory persistence

## Files sẽ tạo/sửa

| File | Action | Description |
|------|--------|-------------|
| `sidecar/engine_manager.py` | **NEW** | EngineManager class + memory + skill loader |
| `sidecar/memory_store.py` | **NEW** | Lightweight SQLite memory (Plan B) hoặc Holographic wrapper |
| `sidecar/server.py` | MODIFY | Add /engine/* routes, integrate into /autoplan |
| `sidecar/engine.py` | MODIFY | plan_video() with Engine + fallback |
| `sidecar/config.py` | MODIFY | Add engine_home path helpers |
| `electron/ipc.ts` | MODIFY | Add engine:* handlers |
| `electron/services/sidecar.ts` | MODIFY | Init engine after sidecar start |
| `~/.capcut-studio/engine/` | **NEW DIR** | Engine home structure |
| `~/.capcut-studio/engine/skills/capcut-video-editor/SKILL.md` | **NEW** | Video editor skill |
| `~/.capcut-studio/engine/skills/capcut-video-editor/references/` | **NEW** | plan-schema, effects-catalog, sfx-catalog, templates |
| `~/.capcut-studio/engine/config.yaml` | **NEW** | Engine config |
| `~/.capcut-studio/engine/mcp_servers.json` | **NEW** | MCP bridge config |
| `tests/test_engine_manager.py` | **NEW** | Unit tests |
| `tests/test_engine_e2e.py` | **NEW** | E2E engine tests |

## NOT in scope (defer như plan gốc)
- ❌ Fork/clone Hermes Agent (nếu Plan B)
- ❌ Nuitka compile
- ❌ Cron scheduler
- ❌ Telegram/Discord gateways
- ❌ Honcho dialectic reasoning
- ❌ .dmg bundle
- ❌ pip install external package

## Execution Order

1. **Spike khám phá Hermes** → quyết định Plan A hay B
2. **Memory layer** (SQLite hoặc Holographic)
3. **Skill system** (SKILL.md + references)
4. **EngineManager class**  
5. **Sidecar integration** (/engine/* routes + /autoplan modify)
6. **Electron IPC handlers**
7. **Doctor check + tests**
8. **Verify fallback**

## Success Criteria
- [ ] `/engine/health` trả về status của memory + skills
- [ ] `/autoplan` hoạt động với Engine (có memory context)
- [ ] `/autoplan` fallback về GPT nếu Engine lỗi
- [ ] Memory tích luỹ facts sau mỗi plan
- [ ] Doctor check hiển thị Engine status
- [ ] Không crash sidecar khi Engine unavailable
- [ ] Plan từ Engine có `_metadata.planner = "engine"`
