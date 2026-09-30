# Phase 4: Cấu hình MCP Bridge Hermes ↔ CapCut API

## Objective
Cấu hình để Hermes (CapCut Engine) có thể gọi CapCut MCP server như 1 tool tích hợp. MCP server `capcut-api` đã có sẵn (mcp_server.py), chỉ cần khai báo trong config.

## Implementation

### 4.1 Tạo mcp_servers config

```json
// ~/.capcut-studio/engine/mcp_servers.json
{
  "capcut-api": {
    "command": "/Users/macbook/Documents/Antigravity/Tool-Edit-Capcut/CapCutAPI/.venv/bin/python",
    "args": [
      "/Users/macbook/Documents/Antigravity/Tool-Edit-Capcut/CapCutAPI/mcp_server.py"
    ],
    "env": {
      "CAPCUT_PROJECTS_PATH": "/Users/macbook/Movies/CapCut/User Data/Projects/com.lveditor.draft"
    },
    "timeout": 60,
    "connect_timeout": 15,
    "tools": {
      "include": [
        "create_draft",
        "add_video",
        "add_image",
        "add_text",
        "add_subtitle",
        "add_effect",
        "add_sticker",
        "add_audio",
        "add_video_keyframe",
        "save_draft",
        "get_video_duration"
      ]
    }
  }
}
```

### 4.2 Cập nhật config.yaml của engine

```yaml
# ~/.capcut-studio/engine/config.yaml
mcp_servers_config: ~/.capcut-studio/engine/mcp_servers.json
```

### 4.3 Verify MCP bridge

```python
# test_mcp_bridge.py
from capcut_engine.run_agent import AIAgent

agent = AIAgent(
    provider="openai",
    model="gpt-4o",
    quiet_mode=True,
    skip_context_files=True,
    max_iterations=10,
)

# Test: Engine gọi MCP tool
result = agent.chat("Get the duration of video at /path/to/test.mp4")
# Engine sẽ tự động gọi MCP capcut-api `get_video_duration`
print(result)
# Expected: duration value
```

### 4.4 Tool mapping

Sau khi MCP connected, các tool sẽ xuất hiện trong Hermes với format:

| MCP Tool | Hermes Name | Chức năng |
|----------|-------------|-----------|
| `create_draft` | `mcp_capcut_api_create_draft` | Tạo CapCut draft mới |
| `add_video` | `mcp_capcut_api_add_video` | Thêm video clip vào timeline |
| `add_text` | `mcp_capcut_api_add_text` | Thêm text overlay |
| `add_effect` | `mcp_capcut_api_add_effect` | Thêm hiệu ứng |
| `add_video_keyframe` | `mcp_capcut_api_add_video_keyframe` | Thêm keyframe animation |
| `save_draft` | `mcp_capcut_api_save_draft` | Lưu draft |
| `get_video_duration` | `mcp_capcut_api_get_video_duration` | Đọc duration video |

### 4.5 Lưu ý: 2 đường dùng MCP

Engine có thể gọi MCP theo 2 cách:
1. **Qua Hermes Agent** (khi generate plan cần đọc video duration): Agent tự gọi MCP tool
2. **Qua sidecar trực tiếp** (khi build draft): Sidecar gọi build_draft.py như hiện tại

Không conflict vì:
- Hermes chỉ dùng MCP trong phase understand (đọc duration)
- Build/export vẫn do sidecar đảm nhiệm trực tiếp (có sẵn retry logic)

## Success Criteria
- [ ] `mcp_servers.json` valid, Engine load được
- [ ] Hermes Agent có thể gọi `get_video_duration` qua MCP
- [ ] Các MCP tool xuất hiện trong agent's tool list
- [ ] Không conflict với sidecar gọi trực tiếp build_draft

## Files Changed
- `~/.capcut-studio/engine/mcp_servers.json` — NEW
- `~/.capcut-studio/engine/config.yaml` — MODIFY (add mcp_servers_config)
