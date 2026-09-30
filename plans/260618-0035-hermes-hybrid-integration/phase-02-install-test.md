# Phase 2: Cài đặt & Test CapCut Engine trong Sidecar

## Objective
Cài capcut-engine (Hermes fork) vào Python environment của sidecar, test import, test AIAgent initialization, chọn memory provider.

## Implementation Steps

### 2.1 Kiểm tra Python version compatibility

```bash
# Sidecar hiện tại dùng Python 3.12
python3.12 --version

# Test cài capcut-engine trên 3.12
cd ~/Documents/Antigravity/Tool-Edit-Capcut/capcut-engine
uv pip install -e ".[all]" --python 3.12
```

Nếu lỗi dependency → tạo venv riêng Python 3.11 cho capcut-engine, sidecar gọi qua subprocess (không import trực tiếp). Pattern giống như sidecar gọi build_draft.py qua subprocess.

### 2.2 Test import cơ bản

```python
# test_engine_import.py
import sys
sys.path.insert(0, "/path/to/capcut-engine")

from capcut_engine.run_agent import AIAgent

# Test init với mode yên lặng
agent = AIAgent(
    provider="openai",
    model="gpt-4o",
    quiet_mode=True,
    skip_memory=False,
    skip_context_files=True,
    max_iterations=10,
    enabled_toolsets=[],  # Chỉ cần planning, không cần terminal/web
)
print("✅ AIAgent initialized")
```

### 2.3 Cấu hình memory provider: Holographic

**Lý do chọn Holographic (trong 8 providers):**
- Local SQLite, zero external dependencies
- Không cần API key
- Trust scoring: tự động giảm weight của fact ít dùng
- Hoàn toàn offline → không lộ network call ra ngoài
- Phù hợp nhất với yêu cầu "che giấu"

```yaml
# ~/.capcut-studio/engine/config.yaml
memory:
  provider: holographic
  holographic:
    db_path: ~/.capcut-studio/engine/memory/holographic.db
    trust_threshold: 0.3
    max_facts: 500
```

```bash
# Cài Holographic (thường đã có trong [all] extras)
uv pip install holographic-memory  # nếu cần riêng

# Init memory
python -c "
from capcut_engine.memory import init_memory
init_memory(provider='holographic')
print('✅ Memory initialized')
"
```

### 2.4 Test AIAgent với prompt đơn giản

```python
# Test prompt planning đơn giản
result = agent.chat("Plan a 30s TikTok video about iPhone review")
print(result)
# Phải trả về text plan, không lỗi
```

### 2.5 Tạo thư mục engine structure

```bash
~/.capcut-studio/engine/
├── config.yaml          # Provider + memory config
├── memory/
│   └── holographic.db   # Holographic SQLite DB
├── skills/
│   └── capcut-video-editor/  # Phase 3 sẽ tạo
├── mcp_servers.json     # Phase 4 sẽ tạo
└── .env                 # API keys (symlink hoặc copy từ sidecar)
```

### 2.6 Tạo EngineManager wrapper class

```python
# sidecar/engine_manager.py (khởi tạo ở phase này, tích hợp ở phase 5)
import os
import sys
from pathlib import Path

class EngineManager:
    """Wrapper quản lý CapCut Engine (Hermes fork) lifecycle."""
    
    def __init__(self):
        self.engine_home = Path.home() / ".capcut-studio" / "engine"
        self.engine_home.mkdir(parents=True, exist_ok=True)
        self._agent = None
        self._initialized = False
    
    def init_agent(self, provider: str, model: str, api_key: str):
        """Khởi tạo AIAgent instance."""
        from capcut_engine.run_agent import AIAgent
        self._agent = AIAgent(
            provider=provider,
            model=model,
            api_key=api_key,
            quiet_mode=True,
            skip_context_files=True,
            max_iterations=10,
            enabled_toolsets=[],
        )
        self._initialized = True
    
    def is_available(self) -> bool:
        return self._initialized and self._agent is not None
    
    def chat(self, message: str) -> str:
        if not self.is_available():
            raise RuntimeError("Engine not initialized")
        return self._agent.chat(message)
```

## Success Criteria
- [ ] `pip install -e ".[all]"` capcut-engine thành công trên Python 3.12 (hoặc documented workaround)
- [ ] AIAgent init không lỗi
- [ ] Holographic memory init + write/read test
- [ ] EngineManager class import được từ sidecar
- [ ] `~/.capcut-studio/engine/` structure đúng

## Risk Mitigation
- **Python 3.12 incompatibility** → tạo venv 3.11 riêng, gọi qua subprocess
- **Holographic không trong [all]** → cài riêng
- **Import conflict với sidecar deps** → isolate trong venv riêng

## Files Changed
- `capcut-engine/` — cài đặt editable
- `sidecar/engine_manager.py` — NEW, wrapper class
- `~/.capcut-studio/engine/config.yaml` — NEW
