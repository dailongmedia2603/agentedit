// IPC "Bot Telegram" (2026-10-21) — Cai dat API > Bot Telegram. Kenh telegram:*; su kien telegram:status.
import { BrowserWindow, ipcMain, shell } from 'electron'
import { configureTelegram, onTelegramStatus, removeTelegramChat, telegramInfo, testTelegram } from './services/telegram/bot'

export function registerTelegramIpc(getWindow: () => BrowserWindow | null): void {
  onTelegramStatus(() => getWindow()?.webContents.send('telegram:status', telegramInfo()))

  ipcMain.handle('telegram:get', () => telegramInfo())
  ipcMain.handle('telegram:save', async (_e, cfg: { token?: string; enabled?: boolean }) => {
    const r = await configureTelegram({ token: cfg?.token, enabled: cfg?.enabled })
    return { ...r, info: telegramInfo() }
  })
  ipcMain.handle('telegram:test', (_e, token?: string) => testTelegram(token))
  ipcMain.handle('telegram:removeChat', (_e, chatId: number) => {
    removeTelegramChat(Number(chatId))
    return telegramInfo()
  })
  ipcMain.handle('telegram:openBotFather', () => shell.openExternal('https://t.me/BotFather'))
  ipcMain.handle('telegram:openBot', (_e, username: string) => {
    if (/^\w{3,40}$/.test(String(username || ''))) return shell.openExternal(`https://t.me/${username}`)
  })
}
