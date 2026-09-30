# Phase 1: Fork & Rename Hermes Agent → "CapCut Engine"

## Objective
Fork Hermes Agent từ GitHub, rename toàn bộ branding thành "CapCut Engine", cấu hình để chạy như embedded module trong sidecar.

## Architecture Decision
Hermes Agent hiện tại có thể import như Python library (`pip install git+https://github.com/NousResearch/hermes-agent.git`). Sau fork, ta cài từ repo đã rename.

## Implementation Steps

### 1.1 Fork repo
```bash
# Clone về workspace
cd ~/Documents/Antigravity/Tool-Edit-Capcut
git clone https://github.com/NousResearch/hermes-agent.git capcut-engine
cd capcut-engine

# Đổi remote origin → repo riêng (nếu cần)
git remote rename origin upstream
git remote add origin <your-private-repo-url>
```

### 1.2 Rename tất cả references
```bash
# Search tổng số files chứa "hermes"
grep -r "hermes" --include="*.py" --include="*.md" --include="*.yaml" --include="*.json" -l | wc -l

# Rename từng bước:
# 1. Package name: hermes → capcut_engine
# 2. Class names: Hermes → CapCutEngine
# 3. Env vars: HERMES_HOME → CAPCUT_ENGINE_HOME
# 4. Config paths: ~/.hermes/ → ~/.capcut-studio/engine/
# 5. Log prefix: [HERMES] → [Engine]
```

**Các file critical cần rename:**

| File | Thay đổi |
|------|----------|
| `setup.py` / `pyproject.toml` | `name="hermes-agent"` → `name="capcut-engine"` |
| `run_agent.py` | Class name + import paths |
| `hermes_cli/` | Folder → `capcut_engine_cli/` |
| `hermes_state.py` | File + all references |
| `hermes_logging.py` | Log prefix |
| `hermes_time.py` | File rename |
| `providers/` | Check internal refs |
| `tools/*.py` | Module imports |
| `skills/` | Path references |
| `config.yaml.example` | Default paths |

### 1.3 Đổi default paths
```python
# Trong file config/constants (tạo mới nếu chưa có)
DEFAULT_HOME = Path.home() / ".capcut-studio" / "engine"
DEFAULT_CONFIG = DEFAULT_HOME / "config.yaml"
DEFAULT_MEMORY = DEFAULT_HOME / "memory"
DEFAULT_SKILLS = DEFAULT_HOME / "skills"
```

### 1.4 Strip log branding
```python
# Trong capcut_engine_logging.py
# [HERMES] Starting agent v2.x.x
# → [Engine] Starting...
# Bỏ version number hoàn toàn
```

### 1.5 Verify rename
```bash
# Không còn từ "hermes" nào trong source (trừ LICENSE giữ nguyên)
grep -ri "hermes" --include="*.py" capcut_engine/ | grep -v "LICENSE" | grep -v "hermes-agent" || echo "CLEAN"
```

## Success Criteria
- [ ] `pip install -e .` từ thư mục capcut-engine thành công
- [ ] `python -c "from capcut_engine import AIAgent"` import được
- [ ] Không còn string "hermes" trong source code (trừ license attribution)
- [ ] Default paths trỏ về `~/.capcut-studio/engine/`
- [ ] Log output không có chữ Hermes

## Risk
- **Có thể bỏ sót hardcoded path** → grep toàn bộ cả file .yaml, .json, .env.example
- **Import chain gãy** → test import từng module sau rename

## Files Changed
- Toàn bộ `capcut-engine/` repo (forked)
