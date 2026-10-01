// Khac biet giao dien theo he dieu hanh (preload truyen process.platform qua window.studio.platform).
export const PLATFORM: string = (typeof window !== 'undefined' && window.studio?.platform) || 'darwin'
export const IS_WIN = PLATFORM === 'win32'

/** Cua so dong lenh nguoi dung mo de dang nhap CLI. */
export const TERM = IS_WIN ? 'PowerShell' : 'Terminal'
/** Nut mo thu muc chua file. */
export const REVEAL_LABEL = IS_WIN ? 'Hiện trong thư mục' : 'Hiện trong Finder'
/** Noi he dieu hanh ma hoa khoa API (Electron safeStorage). */
export const KEY_STORE = IS_WIN ? 'Windows (DPAPI)' : 'Keychain'
/** Phim tat chinh. */
export const MOD_KEY = IS_WIN ? 'Ctrl' : '⌘/Ctrl'

/** Duong dan file tren may -> URL file:// hop le (Windows: C:\a b\x.mp4 -> file:///C:/a%20b/x.mp4). */
export function fileUrl(p: string | null | undefined): string {
  if (!p) return ''
  let s = p.replace(/\\/g, '/')
  if (!s.startsWith('/')) s = '/' + s
  return 'file://' + encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F')
}
