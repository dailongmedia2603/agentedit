import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  /** He dieu hanh (darwin / win32) — UI doi chu (Finder / Terminal...) + cho nut cua so Windows */
  platform: process.platform,
  appInfo: () => ipcRenderer.invoke('app:info'),

  // Ban quyen
  licenseState: () => ipcRenderer.invoke('license:state'),
  licenseCheck: () => ipcRenderer.invoke('license:check'),
  licenseActivate: (key: string) => ipcRenderer.invoke('license:activate', key),
  licenseForget: () => ipcRenderer.invoke('license:forget'),
  onLicenseChanged: (cb: (s: unknown) => void) => {
    const fn = (_e: unknown, s: unknown) => cb(s)
    ipcRenderer.on('license:changed', fn)
    return () => ipcRenderer.removeListener('license:changed', fn)
  },

  // Tu cap nhat
  updateState: () => ipcRenderer.invoke('update:state'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateApply: (busy: boolean) => ipcRenderer.invoke('update:apply', busy),
  onUpdateChanged: (cb: (s: unknown) => void) => {
    const fn = (_e: unknown, s: unknown) => cb(s)
    ipcRenderer.on('update:changed', fn)
    return () => ipcRenderer.removeListener('update:changed', fn)
  },

  // Doctor
  doctorRun: () => ipcRenderer.invoke('doctor:run'),
  doctorFix: (id: string) => ipcRenderer.invoke('doctor:fix', id),
  doctorAutoFix: () => ipcRenderer.invoke('doctor:autoFix'),
  doctorStatus: () => ipcRenderer.invoke('doctor:status'),
  onDoctorProgress: (cb: (p: unknown) => void) => {
    const fn = (_e: unknown, p: unknown) => cb(p)
    ipcRenderer.on('doctor:progress', fn)
    return () => ipcRenderer.removeListener('doctor:progress', fn)
  },
  onDoctorLog: (cb: (data: { id: string; line: string }) => void) => {
    const fn = (_e: unknown, data: { id: string; line: string }) => cb(data)
    ipcRenderer.on('doctor:log', fn)
    return () => ipcRenderer.removeListener('doctor:log', fn)
  },

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSave: (providers: unknown) => ipcRenderer.invoke('settings:save', providers),
  settingsTest: (name: string, providers?: unknown) =>
    ipcRenderer.invoke('settings:test', name, providers),
  settingsCliStatus: (name?: string) => ipcRenderer.invoke('settings:cliStatus', name),
  settingsCliLogin: (mode?: 'browser' | 'device', name?: string) => ipcRenderer.invoke('settings:cliLogin', mode, name),
  settingsCliLoginCancel: () => ipcRenderer.invoke('settings:cliLoginCancel'),
  settingsCliLogout: (name: string) => ipcRenderer.invoke('settings:cliLogout', name),
  settingsCliLoginInput: (text: string) => ipcRenderer.invoke('settings:cliLoginInput', text),
  settingsCliInstall: (name: string) => ipcRenderer.invoke('settings:cliInstall', name),
  settingsCliUpdate: (name: string) => ipcRenderer.invoke('settings:cliUpdate', name),
  settingsGetPlanner: () => ipcRenderer.invoke('settings:getPlanner'),
  settingsSetPlanner: (v: 'gpt' | 'claude') => ipcRenderer.invoke('settings:setPlanner', v),
  settingsGetJobLimits: () => ipcRenderer.invoke('settings:getJobLimits'),
  settingsSetJobLimits: (v: unknown) => ipcRenderer.invoke('settings:setJobLimits', v),
  openLoginUrl: (url: string) => ipcRenderer.invoke('settings:openLoginUrl', url),
  onCliLoginLog: (cb: (line: string) => void) => {
    const fn = (_e: unknown, line: string) => cb(line)
    ipcRenderer.on('settings:cliLoginLog', fn)
    return () => ipcRenderer.removeListener('settings:cliLoginLog', fn)
  },

  // Sidecar
  sidecarStart: () => ipcRenderer.invoke('sidecar:start'),
  sidecarStatus: () => ipcRenderer.invoke('sidecar:status'),
  onSidecarLog: (cb: (line: string) => void) => {
    const fn = (_e: unknown, line: string) => cb(line)
    ipcRenderer.on('sidecar:log', fn)
    return () => ipcRenderer.removeListener('sidecar:log', fn)
  },

  // Files
  pickVideo: () => ipcRenderer.invoke('dialog:pickVideo'),
  pickReferenceVideo: () => ipcRenderer.invoke('dialog:pickReferenceVideo'),
  pickOneVideo: (title?: string) => ipcRenderer.invoke('dialog:pickOneVideo', title),
  pickInsertMedia: () => ipcRenderer.invoke('dialog:pickInsertMedia'),
  pickFolder: (title?: string) => ipcRenderer.invoke('dialog:pickFolder', title),
  // Duong dan that cua file keo-tha (Electron 32+ bo File.path -> keo-tha khong lay duoc duong dan)
  pathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  mediaImport: (workDir: string, paths: string[], kind: 'source' | 'reference' | 'insert', names?: (string | undefined)[]) =>
    ipcRenderer.invoke('media:import', workDir, paths, kind, names),
  mediaMissing: (paths: string[]) => ipcRenderer.invoke('media:missing', paths),
  openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),

  // SFX
  findSfx: (params: unknown) => ipcRenderer.invoke('sfx:find', params),

  // Thu muc lam viec + hieu video nguon + thu vien phan tich
  newWorkDir: (name: string) => ipcRenderer.invoke('pipeline:newWorkDir', name),
  understandSources: (payload: unknown) => ipcRenderer.invoke('pipeline:understandSources', payload),
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryLookup: (paths: string[]) => ipcRenderer.invoke('library:lookup', paths),
  libraryDelete: (fp: string, part?: string) => ipcRenderer.invoke('library:delete', fp, part),
  syncLibrary: () => ipcRenderer.invoke('library:sync'),
  librarySyncRunning: () => ipcRenderer.invoke('library:syncRunning'),
  librarySyncStatus: () => ipcRenderer.invoke('library:syncStatus'),
  onLibrarySyncState: (cb: (s: unknown) => void) => {
    const fn = (_e: unknown, s: unknown) => cb(s)
    ipcRenderer.on('library:syncState', fn)
    return () => ipcRenderer.removeListener('library:syncState', fn)
  },

  // Projects
  projectsList: () => ipcRenderer.invoke('projects:list'),
  projectGet: (id: string) => ipcRenderer.invoke('projects:get', id),
  projectSave: (p: unknown) => ipcRenderer.invoke('projects:save', p),
  projectDelete: (id: string, withFiles?: boolean) => ipcRenderer.invoke('projects:delete', id, withFiles),
  projectDiskInfo: (id: string) => ipcRenderer.invoke('projects:diskInfo', id),
  projectCurrent: (mode?: string) => ipcRenderer.invoke('projects:current', mode),
  projectSetCurrent: (id: string | null, mode?: string) => ipcRenderer.invoke('projects:setCurrent', id, mode),
  projectOpenTabs: () => ipcRenderer.invoke('projects:openTabs'),
  projectSetOpenTabs: (ids: string[], active?: string | null) => ipcRenderer.invoke('projects:setOpenTabs', ids, active),

  // Video Remotion
  remotionUnderstandReference: (payload: unknown) => ipcRenderer.invoke('remotion:understandReference', payload),
  remotionUnderstandMedia: (payload: unknown) => ipcRenderer.invoke('remotion:understandMedia', payload),
  remotionAutoplan: (payload: unknown) => ipcRenderer.invoke('remotion:autoplan', payload),
  // Kho hieu ung tu viet
  fxlibList: () => ipcRenderer.invoke('fxlib:list'),
  fxlibHarvest: (payload: unknown) => ipcRenderer.invoke('fxlib:harvest', payload),
  fxlibRenderPreview: (id: string) => ipcRenderer.invoke('fxlib:renderPreview', id),
  fxlibLabel: (ids: string[]) => ipcRenderer.invoke('fxlib:label', ids),
  fxlibShare: (id: string) => ipcRenderer.invoke('fxlib:share', id),
  fxlibRetry: (id: string) => ipcRenderer.invoke('fxlib:retry', id),
  fxlibToggle: (id: string, disabled: boolean) => ipcRenderer.invoke('fxlib:toggle', id, disabled),
  fxlibDelete: (id: string) => ipcRenderer.invoke('fxlib:delete', id),
  remotionSpec: (payload: unknown) => ipcRenderer.invoke('remotion:spec', payload),
  remotionCatalog: () => ipcRenderer.invoke('remotion:catalog'),
  remotionMediaBase: () => ipcRenderer.invoke('remotion:mediaBase'),
  remotionMediaUrl: (path: string) => ipcRenderer.invoke('remotion:mediaUrl', path),
  remotionRender: (payload: unknown) => ipcRenderer.invoke('remotion:render', payload),
  remotionCancel: () => ipcRenderer.invoke('remotion:cancel'),
  remotionStatus: () => ipcRenderer.invoke('remotion:status'),
  remotionSaveAs: (src: string, name?: string) => ipcRenderer.invoke('remotion:saveAs', src, name),
  onRemotionProgress: (cb: (ev: unknown) => void) => {
    const fn = (_e: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on('remotion:progress', fn)
    return () => ipcRenderer.removeListener('remotion:progress', fn)
  },
  showItemInFolder: (p: string) => ipcRenderer.invoke('shell:showItem', p),

  // Nhat ky xu ly
  runlogRead: (runId: string, offset?: number) => ipcRenderer.invoke('runlog:read', runId, offset),
  runlogAppend: (runId: string, ev: unknown) => ipcRenderer.invoke('runlog:append', runId, ev),
  runlogClear: (runId: string) => ipcRenderer.invoke('runlog:clear', runId),
  runlogOpenDir: (runId: string) => ipcRenderer.invoke('runlog:openDir', runId),

  // Prompt & quy tac
  promptsList: () => ipcRenderer.invoke('prompts:list'),
  promptsSave: (payload: unknown) => ipcRenderer.invoke('prompts:save', payload),
  promptsReset: (payload: unknown) => ipcRenderer.invoke('prompts:reset', payload),

  // Kho meme + kho am thanh
  memeList: () => ipcRenderer.invoke('meme:list'),
  memeFetch: (payload: unknown) => ipcRenderer.invoke('meme:fetch', payload),
  memeImport: (payload: unknown) => ipcRenderer.invoke('meme:import', payload),
  memeLabel: (id: string) => ipcRenderer.invoke('meme:label', id),
  memeUpdate: (payload: unknown) => ipcRenderer.invoke('meme:update', payload),
  memeDelete: (id: string) => ipcRenderer.invoke('meme:delete', id),
  textList: () => ipcRenderer.invoke('text:list'),
  textRegister: (dir: string) => ipcRenderer.invoke('text:register', dir),
  textLabel: (id: string) => ipcRenderer.invoke('text:label', id),
  textUpdate: (payload: unknown) => ipcRenderer.invoke('text:update', payload),
  textDelete: (id: string) => ipcRenderer.invoke('text:delete', id),
  sfxList: () => ipcRenderer.invoke('sfx:list'),
  sfxSearchOnline: (query: string) => ipcRenderer.invoke('sfx:searchOnline', query),
  sfxAddOnline: (payload: unknown) => ipcRenderer.invoke('sfx:addOnline', payload),
  sfxImportLocal: (payload: unknown) => ipcRenderer.invoke('sfx:importLocal', payload),
  sfxUpdate: (payload: unknown) => ipcRenderer.invoke('sfx:update', payload),
  sfxLabel: (ids: string[]) => ipcRenderer.invoke('sfx:label', ids),
  sfxDelete: (id: string) => ipcRenderer.invoke('sfx:delete', id),
  sfxFetchLinks: (links: string[]) => ipcRenderer.invoke('sfx:fetchLinks', links),
  sfxOpenMyinstants: () => ipcRenderer.invoke('sfx:openMyinstants'),
  sfxCloseMyinstants: () => ipcRenderer.invoke('sfx:closeMyinstants'),
  sfxDiscardStaged: (paths: string[]) => ipcRenderer.invoke('sfx:discardStaged', paths),
  onSfxStaged: (cb: (item: unknown) => void) => {
    const h = (_e: unknown, item: unknown) => cb(item)
    ipcRenderer.on('sfx:staged', h)
    return () => ipcRenderer.removeListener('sfx:staged', h)
  },
  pickAudio: () => ipcRenderer.invoke('dialog:pickAudio'),
  // ---- Kho nhac nen ----
  musicList: () => ipcRenderer.invoke('music:list'),
  musicImport: (items: unknown) => ipcRenderer.invoke('music:import', items),
  musicUpdate: (payload: unknown) => ipcRenderer.invoke('music:update', payload),
  musicDelete: (id: string) => ipcRenderer.invoke('music:delete', id),
  musicLabel: (ids: string[]) => ipcRenderer.invoke('music:label', ids),
  musicSettings: (payload: unknown) => ipcRenderer.invoke('music:settings', payload),
  musicPreviewVolume: (id: string) => ipcRenderer.invoke('music:previewVolume', id),
  pickMusic: () => ipcRenderer.invoke('dialog:pickMusic')
}

contextBridge.exposeInMainWorld('studio', api)

export type StudioApi = typeof api
