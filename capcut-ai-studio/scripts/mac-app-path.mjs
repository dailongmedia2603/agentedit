// Vi tri "Agent Edit.app" do electron-builder dong goi theo KIEN TRUC (2026-10-12, them ban Mac Intel):
//   arm64 -> release/mac-arm64/Agent Edit.app ; x64 (kien truc mac dinh cua electron-builder) -> release/mac/Agent Edit.app
// Kien truc lay tu release/build-info-mac.json (dist.mjs ghi) — khong co thi theo may dang chay.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Kien truc cua lan dong goi mac gan nhat ('arm64' | 'x64'). */
export function macBuildArch(root) {
  try {
    const info = JSON.parse(readFileSync(join(root, 'release', 'build-info-mac.json'), 'utf-8'))
    if (info.arch === 'arm64' || info.arch === 'x64') return info.arch
  } catch {
    /* chua dong goi */
  }
  return process.arch === 'x64' ? 'x64' : 'arm64'
}

/** Duong dan .app theo kien truc (x64: thu ca release/mac-x64 phong khi electron-builder doi cach dat ten). */
export function macAppPath(root, arch = macBuildArch(root)) {
  const dirs = arch === 'x64' ? ['mac', 'mac-x64'] : ['mac-arm64']
  for (const d of dirs) {
    const p = join(root, 'release', d, 'Agent Edit.app')
    if (existsSync(p)) return p
  }
  return join(root, 'release', dirs[0], 'Agent Edit.app')
}
