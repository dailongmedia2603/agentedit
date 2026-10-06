import type { RenderSpec } from '../remotion-src/types'

export {}

interface OpenDialogReturn {
  canceled: boolean
  filePaths?: string[]
}

interface StudioBridge {
  /** process.platform cua main (darwin / win32) */
  platform: string
  appInfo(): Promise<{ version: string; build: string; name: string; engineHome: string }>

  // ---- Ban quyen (1 key = 1 may) ----
  licenseState(): Promise<LicenseState>
  /** Hoi may chu ban quyen (mo app) */
  licenseCheck(): Promise<LicenseState>
  licenseActivate(key: string): Promise<LicenseState>
  /** Xoa key tren may nay (khong go may tren server) */
  licenseForget(): Promise<LicenseState>
  onLicenseChanged(cb: (s: LicenseState) => void): () => void

  doctorRun(): Promise<DoctorCheck[]>
  doctorFix(id: string): Promise<{ ok: boolean; error?: string }>
  /** Tu cai moi cong cu con thieu / sai phien ban (1 luot, theo thu tu phu thuoc) -> ket qua kiem lai */
  doctorAutoFix(): Promise<{ checks: DoctorCheck[]; progress: DoctorProgress }>
  doctorStatus(): Promise<DoctorProgress>
  onDoctorProgress(cb: (p: DoctorProgress) => void): () => void
  onDoctorLog(cb: (data: { id: string; line: string }) => void): () => void

  settingsGet(): Promise<Record<string, MaskedProvider>>
  settingsSave(providers: ProvidersMap): Promise<Record<string, MaskedProvider>>
  settingsTest(name: string, providers?: ProvidersMap): Promise<{ ok: boolean; detail?: string; error?: string }>
  settingsCliStatus(
    name?: string
  ): Promise<{ ok: boolean; status?: Record<string, CliStatus>; error?: string }>
  /** Dang nhap CLI chinh chu: gpt = `codex login` (browser / device = link + ma 1 lan);
   *  gemini = mo Terminal chay Antigravity CLI `agy`; claude = mo Terminal chay `claude auth login`
   *  (terminal: true -> UI tu hoi lai trang thai) */
  settingsCliLogin(
    mode?: 'browser' | 'device',
    name?: 'gpt' | 'gemini' | 'claude'
  ): Promise<{ ok: boolean; already?: boolean; canceled?: boolean; terminal?: boolean; error?: string }>
  /** Cap nhat Claude Code (`claude update`); dong chu in ra di qua onCliLoginLog */
  settingsCliUpdate(
    name: 'claude'
  ): Promise<{ ok: boolean; version?: string | null; changed?: boolean; canceled?: boolean; error?: string }>
  /** AI lap ke hoach (B1..B7, R4, R5): GPT hoac Claude */
  settingsGetPlanner(): Promise<PlanProvider>
  settingsSetPlanner(v: PlanProvider): Promise<PlanProvider>
  /** So video PHAN TICH (Gemini) / LAP PLAN (Claude) chay cung luc o "Tao video" (src/lib/jobQueue.ts) */
  settingsGetJobLimits(): Promise<{ gemini: number; claude: number }>
  settingsSetJobLimits(v: { gemini?: number; claude?: number }): Promise<{ gemini: number; claude: number }>
  /** Huy luot dang nhap / cai dat CLI dang chay */
  settingsCliLoginCancel(): Promise<{ ok: boolean }>
  /** Dang xuat CLI (codex logout / claude auth logout / agy /logout) de dang nhap tai khoan khac */
  settingsCliLogout(name: string): Promise<{ ok: boolean; already?: boolean; canceled?: boolean; error?: string }>
  /** Gui ma xac thuc nguoi dung dan vao toi CLI dang dang nhap (agy / Claude Code) */
  settingsCliLoginInput(text: string): Promise<{ ok: boolean }>
  /** Cai CLI (npm cho Codex; trinh cai chinh chu cho Antigravity CLI); dong chu in ra di qua onCliLoginLog */
  settingsCliInstall(name: string): Promise<{ ok: boolean; version?: string; canceled?: boolean; error?: string }>
  /** Mo link dang nhap chinh chu (chi auth.openai.com / chatgpt.com / accounts.google.com) */
  openLoginUrl(url: string): Promise<unknown>
  onCliLoginLog(cb: (line: string) => void): () => void

  sidecarStart(): Promise<{ ok: boolean; error?: string }>
  sidecarStatus(): Promise<{ port: number; ready: boolean; hasChild: boolean }>
  onSidecarLog(cb: (line: string) => void): () => void

  pickVideo(): Promise<OpenDialogReturn>
  pickReferenceVideo(): Promise<OpenDialogReturn>
  pickOneVideo(title?: string): Promise<OpenDialogReturn>
  /** Chon anh / video (nhieu file) de chen LEN video dang edit */
  pickInsertMedia(): Promise<OpenDialogReturn>
  /** Kho Text: chon 1 thu muc mau (template.json + preview.mp4 + fonts/ + audio/ + assets/) */
  pickFolder(title?: string): Promise<OpenDialogReturn>
  /** duong dan that cua File keo-tha vao app ('' neu khong co) */
  pathForFile(file: File): string
  /** Chep video vao thu muc du an (<workDir>/video-nguon | video-mau | tu-lieu-chen); ket qua theo thu tu `paths` */
  mediaImport(
    workDir: string,
    paths: string[],
    kind: 'source' | 'reference' | 'insert',
    names?: (string | undefined)[]
  ): Promise<{ ok: boolean; items: ImportedMedia[]; error?: string }>
  /** Nhung duong dan khong con file */
  mediaMissing(paths: string[]): Promise<string[]>
  openPath(p: string): Promise<string>

  findSfx(params: unknown): Promise<{ ok: boolean; results: unknown[] }>

  newWorkDir(name: string): Promise<string>
  /** fresh = bo qua phan tich da luu trong thu vien, phan tich lai tu dau */
  understandSources(payload: { videos: SourceVideo[]; fresh?: boolean; _run?: RunCtx }): Promise<{
    ok: boolean
    brief?: SourceBrief
    /** id nguon -> luc phan tich (lay tu thu vien, khong goi lai Gemini) */
    reused?: Record<string, string>
    error?: string
  }>

  // ---- Thu vien phan tich ----
  libraryList(): Promise<{ ok: boolean; items?: LibraryItem[]; error?: string }>
  libraryLookup(paths: string[]): Promise<{ ok: boolean; found?: Record<string, LibraryLookup>; error?: string }>
  libraryDelete(fp: string, part?: LibraryPart): Promise<{ ok: boolean; error?: string }>
  syncLibrary(): Promise<{
    ok: boolean
    error?: string
    sfx?: { added: number; updated: number; total: number; errors: string[] }
    memes?: { added: number; updated: number; total: number; errors: string[] }
    texts?: { added: number; updated: number; total: number; errors: string[] }
    /** kho nhac nen (nhac CC0); may chu cu khong co -> total 0 */
    music?: { added: number; updated: number; total: number; errors: string[] }
    /** kho hieu ung chung (muc da duyet); null = may chu chua co kho hieu ung */
    fx?: { added: number; updated: number; removed: number; total: number; errors: string[] } | null
    log?: string[]
    manifest_updated?: string
  }>
  /** Dang co luot dong bo kho chay (vd luot tu chay luc mo app) */
  librarySyncRunning(): Promise<boolean>
  /** Dang dong bo + ket qua luot gan nhat (at = luc xong) — muc "Dong bo tai nguyen" o Doctor */
  librarySyncStatus(): Promise<LibrarySyncStatus>
  /** Luot dong bo kho bat dau (running) / xong (result = ket qua syncLibrary) — ke ca luot tu chay luc mo app */
  onLibrarySyncState(cb: (s: LibrarySyncStatus) => void): () => void

  projectsList(): Promise<Project[]>
  projectGet(id: string): Promise<Project | null>
  projectSave(p: Project): Promise<Project>
  /** withFiles = dua thu muc du an (~/.capcut-studio/projects/...) + nhat ky vao Thung rac */
  projectDelete(id: string, withFiles?: boolean): Promise<{ ok: boolean; trashed: string[]; error?: string }>
  /** Dung luong + kha nang dua vao Thung rac cua thu muc du an (cho hop xac nhan xoa) */
  projectDiskInfo(id: string): Promise<ProjectDiskInfo | null>
  /** mode 'remotion' = project dang lam cua menu Video Remotion (con tro rieng) */
  projectCurrent(mode?: 'remotion'): Promise<Project | null>
  projectSetCurrent(id: string | null, mode?: 'remotion'): Promise<void>
  /** Cac the video dang mo o "Tao video" (nhieu video chay cung luc) + the dang xem */
  projectOpenTabs(): Promise<{ ids: string[]; active: string | null }>
  projectSetOpenTabs(ids: string[], active?: string | null): Promise<void>

  // ---- Video Remotion ----
  remotionUnderstandReference(payload: { video: VideoFile; fresh?: boolean; _run?: RunCtx }): Promise<{
    ok: boolean
    analysis?: RemotionReferenceAnalysis
    error?: string
  }>
  /** Tu lieu cua nguoi dung: Gemini doc tung anh / video + may do (luu theo noi dung file; fresh = doc lai) */
  remotionUnderstandMedia(payload: {
    items: { id: string; kind: UserMediaKind; path: string; name: string }[]
    fresh?: boolean
    _run?: RunCtx
  }): Promise<{
    ok: boolean
    results?: Record<
      string,
      { analysis?: UserMediaAnalysis; measured?: UserMediaMeasured; at?: string; cached?: boolean; work?: string; error?: string }
    >
    missing?: string[]
    error?: string
  }>
  remotionAutoplan(payload: {
    brief: SourceBrief
    reference_analysis?: RemotionReferenceAnalysis | null
    edit_request?: EditRequest
    brand_guide?: BrandGuide
    /** tu lieu cua nguoi dung (anh / video hien LEN video) + muc dich + phan tich Gemini */
    user_media?: UserMediaPayload[]
    /** khung video xuat ra: doc 9:16 1080x1920 (mac dinh) | ngang 16:9 1920x1080 — sidecar canvas.py */
    orientation?: VideoOrientation
    title?: string
    /** du an dang lap plan — Kho hieu ung khong lay ung vien sinh tu chinh du an nay */
    project?: string
    fresh?: boolean
    _run?: RunCtx
  }): Promise<{
    ok: boolean
    plan?: RemotionPlan
    spec?: RenderSpec
    guard?: GuardReport
    warnings?: string[]
    reused_steps?: string[]
    summary?: RemotionSummary
    /** brief da can lai gio loi noi (Whisper) — luu de lan sau khoi can lai */
    brief?: SourceBrief
    error?: string
  }>
  // ---- Kho hieu ung tu viet (sidecar fx_lib.py) ----
  fxlibList(): Promise<{ ok: boolean; effects?: FxLibItem[]; pending?: FxLibPending; error?: string }>
  fxlibHarvest(payload: { fx: unknown[]; project?: string; orientation?: VideoOrientation }): Promise<{
    ok: boolean
    added?: string[]
    reused?: string[]
    skipped?: { id: string; src?: string; ly_do?: string }[]
    error?: string
  }>
  fxlibRenderPreview(id: string): Promise<{ ok: boolean; busy?: boolean; cancelled?: boolean; error?: string }>
  fxlibLabel(ids: string[]): Promise<{
    ok: boolean
    labeled?: string[]
    errors?: Record<string, string>
    /** Gemini loi chung (chua dang nhap / mat mang) -> dung gan nhan trong phien nay */
    stop?: boolean
    error?: string
  }>
  fxlibShare(id: string): Promise<{ ok: boolean; status?: 'pending' | 'approved' | 'rejected'; error?: string; retry?: boolean }>
  fxlibRetry(id: string): Promise<{ ok: boolean }>
  fxlibToggle(id: string, disabled: boolean): Promise<{ ok: boolean }>
  fxlibDelete(id: string): Promise<{ ok: boolean }>
  remotionSpec(payload: { plan: RemotionPlan; _run?: RunCtx }): Promise<{
    ok: boolean
    spec?: RenderSpec
    guard?: GuardReport
    summary?: RemotionSummary
    error?: string
  }>
  remotionCatalog(): Promise<{ ok: boolean; catalog?: RemotionCatalog; error?: string }>
  remotionMediaBase(): Promise<string>
  remotionMediaUrl(path: string): Promise<string>
  remotionRender(payload: { spec: RenderSpec; workDir?: string; name?: string; _run?: RunCtx }): Promise<RemotionRenderEvent>
  remotionCancel(): Promise<boolean>
  remotionStatus(): Promise<{ running: boolean; browserInstalled: boolean; last?: RemotionRenderEvent | null }>
  remotionSaveAs(src: string, name?: string): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>
  onRemotionProgress(cb: (ev: RemotionRenderEvent) => void): () => void
  showItemInFolder(p: string): Promise<void>

  runlogRead(runId: string, offset?: number): Promise<{ events: RunEvent[]; offset: number; size: number }>
  runlogAppend(runId: string, ev: { title: string; kind?: string; step?: string; level?: string; [k: string]: unknown }): Promise<void>
  runlogClear(runId: string): Promise<void>
  runlogOpenDir(runId: string): Promise<string>
  promptsList(): Promise<PromptsListing>
  promptsSave(
    payload:
      | { kind: 'prompt' | 'ref' | 'rule'; id: string; value: string | number }
      | { kind: 'rules'; values: Record<string, number> }
  ): Promise<PromptsListing>
  promptsReset(payload: { kind: 'prompt' | 'ref' | 'rule'; id: string }): Promise<PromptsListing>
  memeList(): Promise<{ ok: boolean; memes: MemeItem[] }>
  memeFetch(payload: { urls: string[]; cookies_from?: string }): Promise<{ ok: boolean; added?: MemeItem[]; failed?: { url: string; error: string }[]; error?: string }>
  memeImport(payload: { paths: string[] }): Promise<{ ok: boolean; added?: MemeItem[]; failed?: { file: string; error: string }[]; error?: string }>
  memeLabel(id: string): Promise<{ ok: boolean; meme?: MemeItem; error?: string }>
  memeUpdate(payload: { id: string; [k: string]: unknown }): Promise<{ ok: boolean; meme?: MemeItem }>
  memeDelete(id: string): Promise<{ ok: boolean }>
  // ---- Kho Text (mau chu dong, chuyen tu preset CapCut) ----
  textList(): Promise<{ ok: boolean; templates: TextTemplateItem[] }>
  /** dir = thu muc tuyet doi chua template.json (vd ~/.capcut-studio/text_templates/<id>) */
  textRegister(dir: string): Promise<{ ok: boolean; template?: TextTemplateItem; error?: string }>
  textLabel(id: string): Promise<{ ok: boolean; template?: TextTemplateItem; error?: string }>
  textUpdate(payload: { id: string; [k: string]: unknown }): Promise<{ ok: boolean; template?: TextTemplateItem }>
  textDelete(id: string): Promise<{ ok: boolean }>
  sfxList(): Promise<{ ok: boolean; sfx: SfxItem[] }>
  sfxSearchOnline(query: string): Promise<{ ok: boolean; results: SfxOnline[]; error?: string }>
  sfxAddOnline(payload: { name: string; mp3: string; slug?: string; emotion?: string; use_when?: string }): Promise<{ ok: boolean; entry?: SfxItem; error?: string }>
  sfxImportLocal(payload: { path: string; name?: string; emotion?: string; use_when?: string }): Promise<{ ok: boolean; entry?: SfxItem; error?: string }>
  sfxUpdate(payload: { id: string; emotion?: string; name?: string; use_when?: string }): Promise<{ ok: boolean }>
  /** Gemini NGHE cac SFX roi viet nhan (theo cach ket noi Gemini dang chon) */
  sfxLabel(ids: string[]): Promise<{
    ok: boolean
    updated?: SfxItem[]
    failed?: { id: string; error: string }[]
    error?: string
  }>
  sfxDelete(id: string): Promise<{ ok: boolean }>

  // ---- Kho nhac nen ----
  musicList(): Promise<{
    ok: boolean
    tracks: MusicTrack[]
    settings: MusicSettings
    /** quy tac buoc lap ke hoach: nhac nen = bao nhieu % tieng nguoi (Prompt & quy tac) */
    voice_pct: number
    error?: string
  }>
  musicImport(items: { path: string; name?: string }[]): Promise<{
    ok: boolean
    added?: MusicTrack[]
    failed?: { path: string; error: string }[]
    error?: string
  }>
  musicUpdate(payload: { id: string; name?: string; use_when?: string; disabled?: boolean }): Promise<{
    ok: boolean
    track?: MusicTrack | null
    error?: string
  }>
  musicDelete(id: string): Promise<{ ok: boolean }>
  musicLabel(ids: string[]): Promise<{
    ok: boolean
    updated?: MusicTrack[]
    failed?: { id: string; error: string }[]
    error?: string
  }>
  musicSettings(payload: Partial<MusicSettings>): Promise<{ ok: boolean; settings?: MusicSettings; error?: string }>
  /** volume 0..1 de nghe thu bai o dung quy tac % tieng nguoi (so voi giong noi mau) */
  musicPreviewVolume(id: string): Promise<{ ok: boolean; volume: number | null }>
  pickMusic(): Promise<{ canceled: boolean; filePaths?: string[] }>
  sfxFetchLinks(links: string[]): Promise<FetchOutcome>
  sfxOpenMyinstants(): Promise<{ ok: boolean }>
  sfxCloseMyinstants(): Promise<{ ok: boolean }>
  /** Xoa file tam da tai ve (chi tac dong thu muc staging cua app) */
  sfxDiscardStaged(paths: string[]): Promise<{ removed: number }>
  /** Nghe ngong file user tai ve tu cua so Myinstants trong app. Tra ham huy dang ky. */
  onSfxStaged(cb: (item: StagedSfx) => void): () => void
  pickAudio(): Promise<OpenDialogReturn>
}

declare global {
  interface LicenseState {
    status: 'ok' | 'need_key' | 'invalid_key' | 'locked' | 'expired' | 'other_machine' | 'offline' | 'error'
    message: string
    plan?: 'month' | 'year' | 'lifetime'
    expiresAt?: number | null
    keyHint?: string
    customer?: string
    checkedAt?: number
    dev?: boolean
  }
  interface Window {
    studio: StudioBridge
  }

  /** 1 cong cu / dieu kien app can (electron/services/doctor.ts). fail = chan tao video; warn = mat 1 phan */
  interface DoctorCheck {
    id: string
    label: string
    status: 'ok' | 'fail' | 'warn' | 'checking'
    detail: string
    group: 'system' | 'media' | 'python' | 'ai'
    /** dung o buoc nao cua luong edit */
    purpose: string
    required?: string
    found?: string
    /** id cach sua (doctorFix) */
    fix?: string
    /** tu cai khi mo app */
    auto?: boolean
    /** can vao Cai dat API */
    settings?: boolean
    fixable: boolean
  }

  /** Ket qua 1 luot dong bo kho (syncLibrary) — dung chung cho Doctor + trang Tai nguyen */
  interface LibrarySyncKind {
    added: number
    updated: number
    total: number
    errors: string[]
  }
  interface LibrarySyncResult {
    ok: boolean
    error?: string
    sfx?: LibrarySyncKind
    memes?: LibrarySyncKind
    texts?: LibrarySyncKind
    music?: LibrarySyncKind
    fx?: (LibrarySyncKind & { removed: number }) | null
  }
  interface LibrarySyncStatus {
    running: boolean
    result?: LibrarySyncResult
    at?: number
  }

  interface DoctorProgress {
    running: boolean
    current: string | null
    queue: string[]
    done: string[]
    failed: { id: string; error: string }[]
  }

  type AuthMode = 'api_key' | 'subscription'

  interface MaskedProvider {
    base_url: string
    model: string
    has_key: boolean
    key_hint: string
    auth_mode: AuthMode
    sub_model: string
    sub_effort: string
    subscription_capable: boolean
  }

  interface ProviderConfig {
    base_url: string
    model: string
    api_key: string
    auth_mode: AuthMode
    sub_model: string
    /** Muc suy nghi cho Codex CLI; '' = mac dinh cua model */
    sub_effort?: string
  }
  type ProvidersMap = Record<string, ProviderConfig>

  /** 1 model goi y cho CLI chinh chu */
  interface CliModel {
    id: string
    label: string
    note: string
    /** Claude: ban Claude Code toi thieu model nay can (CLI dang cai cu hon) */
    needs_update?: string
  }

  type PlanProvider = 'gpt' | 'claude'

  interface ProjectDiskInfo {
    workDir: string | null
    trashable: boolean
    reason?: string
    bytes: number
    files: number
    renders: number
    /** Video nguon / mau nam ngoai thu muc du an — khong bi xoa */
    outside: string[]
    hasRunLog: boolean
  }

  /** Trang thai CLI chinh chu dung cho che do goi subscription */
  interface CliStatus {
    supported: boolean
    label?: string
    plan_label?: string
    install_cmd?: string
    /** Goi npm chinh chu (nut "Cai tu dong") */
    npm_package?: string | null
    login_cmd?: string
    models?: CliModel[]
    default_model?: string
    installed: boolean
    path?: string | null
    version?: string | null
    logged_in: boolean
    account?: string | null
    plan?: string | null
    detail: string
    /** Codex: muc suy nghi tung model ho tro (tu `codex debug models`) */
    reasoning?: Record<string, { default: string; levels: string[] }>
    /** Gemini CLI: thu muc lam viec rieng cua app */
    workdir?: string
    /** Claude Code: lenh cap nhat + cac model can ban CLI moi hon ban dang cai */
    update_cmd?: string
    outdated_models?: string[]
    /** Codex: han muc goi ChatGPT (`codex app-server` account/rateLimits/read) — dong chu da dinh dang */
    usage?: string[]
    limit_reached?: boolean
  }

  interface Brief {
    summary?: string
    duration?: number
    tone?: string
    language?: string
    on_screen_text?: string[]
    transcript?: { start: number; end: number; text: string; emphasis?: string[] }[]
    beats?: { start: number; end: number; label: string; emotion: string; description: string; suggested_action: string }[]
    hook_strength?: string
    sfx_suggestions?: { start: number; type: string; reason: string }[]
    faces_region?: string
    warnings?: string[]
    source_video?: string
    source_videos?: SourceVideo[]
    _source?: string
  }

  interface VideoFile {
    /** ban trong thu muc du an (du an cu: co the con la file ben ngoai) */
    path: string
    name: string
    duration: number
    thumb?: string
    /** noi nguoi dung chon file luc them (chi de hien thi / nhan trung) */
    origPath?: string
    /** file goc da mat, dang dung ban lam viec app con giu (SDR 1080p) */
    recovered?: boolean
  }

  /** TU LIEU CUA NGUOI DUNG — anh / video hien LEN video dang edit (sidecar user_media.py) */
  type UserMediaKind = 'image' | 'video'
  /** show = chen truc tiep · ai_ref = chi lam mau cho anh AI · both = ca hai */
  type UserMediaUse = 'show' | 'ai_ref' | 'both'
  type UserMediaPlacement = 'auto' | 'overlay' | 'cutout' | 'split' | 'fullscreen'
  interface UserMediaAnalysis {
    loai?: string
    mo_ta?: string
    chu_the?: string
    dac_diem_nhan_dien?: string
    chu_trong_anh?: string
    can_doc_chu?: boolean
    nen?: string
    tach_nen_duoc?: boolean
    vi_tri_chu_the?: string
    mau_chu_dao?: string[]
    tu_khoa?: string[]
    hop_khi_noi_ve?: string
    goi_y_hien_thi?: { cach: string; ly_do?: string }
    canh?: { start: number; end: number; mo_ta?: string }[]
    doan_dep?: { start: number; end: number; ly_do?: string }[]
    co_loi_noi?: boolean
    chuyen_dong?: string
  }
  interface UserMediaMeasured {
    width?: number | null
    height?: number | null
    ti_le?: number
    alpha?: boolean
    duration?: number | null
    has_audio?: boolean
  }
  /** Phan gui sidecar khi lap ke hoach */
  interface UserMediaPayload {
    id: string
    kind: UserMediaKind
    path: string
    name: string
    use: UserMediaUse
    placement: UserMediaPlacement
    note: string
    analysis?: UserMediaAnalysis | null
  }
  interface UserMediaItem extends UserMediaPayload {
    /** noi nguoi dung chon file (ban trong du an nam o `path`) */
    origPath?: string
    /** anh thu nho (video) — anh thi hien thang qua may chu media */
    thumb?: string
    /** ban lam viec cua anh (HEIC -> PNG, dung chieu) — de hien anh thu nho */
    workPath?: string
    duration?: number
    measured?: UserMediaMeasured
    analyzedAt?: string
    /** Gemini dang doc (chi trong phien, khong luu) */
    analyzing?: boolean
    error?: string
  }
  /** Bao cao sau lap ke hoach: tu lieu hien o dau (gio timeline) */
  interface UserMediaUsage {
    id: string
    name: string
    kind: UserMediaKind
    use: UserMediaUse
    dung: { start: number; end: number; cach: string }[]
    anh_ai_dung_mau: number
    ly_do?: string
    bo_qua?: string
    du_phong?: boolean
  }

  interface ImportedMedia {
    src: string
    path?: string
    copied?: boolean
    cloned?: boolean
    error?: string
  }

  interface SourceVideo extends VideoFile {
    id: string
  }

  /** 'source' = hieu nguon · 'ref_video' = video mau (Gemini) · 'ref_gpt' = video mau cu (GPT · Codex CLI, van dung lai) */
  type LibraryPart = 'source' | 'ref_video' | 'ref_gpt'

  interface LibraryLookup {
    exists: boolean
    fp?: string
    source_at?: string
    ref_video_at?: string
    ref_gpt_at?: string
  }

  interface LibraryItem {
    fp: string
    name: string
    path: string
    /** file video con o duong dan da luu khong */
    exists: boolean
    duration?: number
    size?: number
    created?: string
    updated?: string
    thumb?: string | null
    source?: { at: string; summary?: string; tone?: string; n_transcript?: number; timing?: string }
    ref_video?: { at: string; summary?: string; format?: string; style_kit?: boolean }
    ref_gpt?: { at: string; summary?: string; format?: string; style_kit?: boolean }
  }

  /** Loai video tao ra: doc 9:16 (TikTok / Reels, mac dinh) hoac ngang 16:9 (YouTube / Facebook) */
  type VideoOrientation = 'portrait' | 'landscape'

  interface EditRequest {
    purpose?: string
    style?: string
    audience?: string
    duration?: string
  }

  /** Brand Guideline (khong bat buoc) — sidecar brand_guide.py dua vao dung buoc AI + ep font / ma mau */
  interface BrandGuide {
    typography?: string
    colors?: string
    graphics?: string
    imagery?: string
    motion?: string
  }

  interface SourceAnalysisItem {
    id: string
    name: string
    duration?: number
    summary?: string
    role?: string
    quality?: { visual?: string; audio?: string; notes?: string }
    transcript?: { start: number; end: number; text: string; emphasis?: string[] }[]
    beats?: { start: number; end: number; label: string; emotion: string; description: string; suggested_action?: string }[]
    usable_ranges?: { start: number; end: number; reason: string; priority?: string }[]
    on_screen_text?: string[]
    faces_region?: string
    warnings?: string[]
    /** Gio loi noi da can bang Whisper chua (sidecar/speech_align.py) */
    timing?: { method: 'asr-align' | 'gemini'; matched?: number; median_shift?: number; max_shift?: number; ly_do?: string }
  }

  interface SourceBrief extends Brief {
    total_source_duration?: number
    story_opportunities?: string[]
    sources?: SourceAnalysisItem[]
    recommended_structure?: { source_id: string; start: number; end: number; purpose: string }[]
    source_videos?: SourceVideo[]
  }

  /** Mot muc trong danh sach video mau: ban prompt cu tra chuoi, ban moi tra object. */
  type RefItem = string | Record<string, unknown>

  /** Ket qua phan tich VIDEO MAU. Prompt sua duoc trong menu "Prompt & quy tac" nen
   *  schema co 2 doi (cu: chuoi phang; moi: object chi tiet) — moi truong deu co the thieu. */
  interface ReferenceAnalysis {
    analysis_meta?: {
      duration_seconds?: number
      aspect_ratio?: string
      analysis_confidence?: string
      limitations?: string[]
    }
    summary?: string
    duration?: number
    format?: string
    style_fingerprint?: string[]
    pacing?: {
      energy?: string
      average_shot_seconds?: number
      estimated_cuts_per_10_seconds?: number
      cut_density?: string
      visual_change_frequency?: string
      rhythm_pattern?: string
      speech_cut_relationship?: string
      pause_handling?: string
      speed_manipulation?: string
    }
    structure?: { start: number; end: number; role: string; description: string; editing_shift?: string }[]
    shot_system?: Record<string, unknown>
    editing_language?: {
      cuts?: RefItem[]
      transitions?: { type: string; when?: string; duration?: string; frequency?: string }[]
      camera_motion?: RefItem[]
      effects?: { look: string; purpose?: string; trigger?: string; intensity?: string }[]
    }
    captions?: {
      present?: boolean
      density?: string
      coverage?: string
      words_per_chunk?: string
      line_count?: string
      position?: string
      safe_zone_behavior?: string
      typography?: Record<string, string>
      colors?: string[]
      animation?: string | Record<string, string>
      keyword_emphasis?: string | Record<string, string>
      hierarchy?: {
        levels?: number
        hero?: string
        support?: string
        size_contrast?: string
        layout?: string
      }
    }
    motion_graphics?: Record<string, unknown>
    audio?: {
      music_mood?: string
      music_level?: string
      voice_priority?: string
      voice_processing?: string
      music?: { present?: boolean; mood?: string; energy?: string; level_vs_voice?: string; role?: string }
      sfx_pattern?: RefItem[]
      beat_sync?: string
      audio_visual_sync?: string
    }
    visual_identity?: { color_tone?: string; composition?: string; overlays?: string[]; [k: string]: unknown }
    attention_system?: Record<string, unknown>
    timeline_style_events?: Record<string, unknown>[]
    style_patterns?: Record<string, unknown>[]
    transfer_rules?: RefItem[]
    avoid_copying?: string[]
    warnings?: RefItem[]
    reference_video?: VideoFile
    _source?: string
  }

  interface GuardIssue {
    severity: 'high' | 'medium' | 'low'
    area: string
    problem: string
  }

  /** Bao cao cua lop kiem tra vat ly (build_spec + plan_guard) — chay deterministic, khong goi AI */
  interface GuardReport {
    /** Loi AI thuc su mac phai truoc khi sua */
    issues_before?: GuardIssue[]
    /** Nhung gi da tu dong sua */
    fixed?: string[]
    /** Loi con lai sau khi sua — phai rong truoc khi dung */
    issues?: GuardIssue[]
    ok?: boolean
  }

  /** 1 clip meme trong kho — AI chon no HOAN TOAN dua tren use_when/tags, no khong xem duoc clip */
  interface MemeItem {
    id: string
    name: string
    file: string
    duration: number
    width?: number
    height?: number
    emotion: string
    /** sidecar luu ve chuoi; mang chi con o du lieu cu/ngoai le */
    use_when: string | string[]
    tags?: string[]
    summary?: string
    /** Cac truong duoi chi co khi gan nhan bang prompt meme chi tiet */
    reaction?: string
    intensity?: string
    role?: string
    avoid_when?: string[]
    semantic_triggers?: string[]
    insert_timing?: string
    speech_content?: string
    has_onscreen_text?: boolean
    onscreen_text?: string
    audio_reason?: string
    /** doan "dat" nhat trong clip, do AI xem va danh dau */
    best_start?: number
    best_end?: number
    keep_audio?: boolean
    has_speech?: boolean
    notes?: string
    source?: string
    /** 'title' = doan tu ten file | 'gemini' = AI da xem clip */
    labeled_by?: 'title' | 'gemini'
  }

  /** 1 o chu (slot) trong mau — "sample" la CHU MAU, khong bao gio dung nguyen trong video thuc */
  interface TextSlot {
    id: string
    role?: string
    sample?: string
  }

  /** Vai tro AI nen dien cho 1 slot — do Gemini viet sau khi xem preview (xem _GEMINI_TEXT_TEMPLATE_PROMPT) */
  interface TextSlotRole {
    id: string
    role?: string
    max_len?: string
  }

  /** 1 mau chu dong trong Kho Text (chuyen tu preset CapCut) — AI chon mau HOAN TOAN dua tren nhan,
   * KHONG xem duoc hoat canh. Chu trong `slots[].sample` CHI LA CHU MAU minh hoa bo cuc. */
  interface TextTemplateItem {
    id: string
    name: string
    source: string
    /** thu muc tuyet doi chua template.json + preview.mp4 + fonts/ + audio/ + assets/ — rieng tung may */
    dir: string
    duration: number
    width?: number
    height?: number
    slots: TextSlot[]
    sample_texts?: string[]
    /** ten file preview trong `dir` (thuong "preview.mp4") */
    preview?: string | null
    // ---- Nhan Gemini (phan tich; GIU NGUYEN qua cac lan register_from_dir cau truc) ----
    summary?: string
    style?: string
    mood?: string
    energy?: 'nhe' | 'vua' | 'manh'
    motion?: string
    best_for?: string[]
    use_when?: string | string[]
    avoid_when?: string[]
    slot_roles?: TextSlotRole[]
    tags?: string[]
    sound_notes?: string
    /** 'gemini' = AI da xem preview; khong co = chua gan nhan */
    labeled_by?: 'gemini'
    labeled_at?: string
  }

  /** Nhan Gemini cua 1 hieu ung trong Kho hieu ung (tong quat, khong ten san pham / loi noi video goc) */
  interface FxLibLabel {
    name?: string
    summary?: string
    visual?: string
    use_when?: string
    avoid_when?: string[]
    moods?: string[]
    moments?: string[]
    placement?: string
    energy?: 'nhe' | 'vua' | 'manh'
    tags?: string[]
    quality?: number
    quality_note?: string
  }

  /** 1 hieu ung tu viet da dong goi (kho may nay + kho chung tai ve) */
  interface FxLibItem {
    id: string
    kind: 'overlay' | 'transform'
    layer?: 'front' | 'behind'
    duration?: number
    params?: { colors?: string[]; intensity?: number }
    canvas?: VideoOrientation
    works?: Partial<Record<VideoOrientation, boolean>>
    origin: 'local' | 'shared'
    label?: FxLibLabel | null
    /** thiet ke goc (CHI may nay) */
    design?: { visual?: string; goal?: string } | null
    uses?: number
    created?: string
    parent?: string
    sfx?: string
    disabled?: boolean
    preview?: string | null
    has_code?: boolean
    state?: {
      preview?: 'ok' | 'error' | null
      preview_err?: string | null
      label?: 'ok' | 'error' | null
      label_err?: string | null
      share?: 'pending' | 'approved' | 'rejected' | 'error' | null
      share_err?: string | null
    }
  }

  interface FxLibPending {
    preview: string[]
    label: string[]
    share: string[]
  }

  interface SfxItem {
    id: string
    name: string
    file: string
    emotion: string
    use_when: string
    source: string
    tags?: string[]
    /** 'gemini' = Gemini da nghe file; khong co = nhan doan tu ten */
    labeled_by?: string
    labeled_at?: string
    summary?: string
    sound_type?: string
    has_speech?: boolean
    speech_text?: string
    intensity?: string
    avoid_when?: string[]
    /** Do bang am thanh that (giay) */
    duration?: number
    peak_time?: number
    lufs_m?: number
  }

  interface MusicSettings {
    /** true = AI tu chon nhac nen khi lap ke hoach */
    auto: boolean
  }

  interface MusicTrack {
    id: string
    name: string
    file: string
    source?: string
    artist?: string
    license?: string
    source_url?: string
    duration?: number
    lufs_i?: number
    disabled?: boolean
    labeled_by?: string
    labeled_at?: string
    summary?: string
    genre?: string
    moods?: string[]
    energy?: 'thap' | 'vua' | 'cao'
    tempo?: 'cham' | 'vua' | 'nhanh'
    bpm?: number
    instruments?: string[]
    has_vocals?: boolean
    vocals_note?: string
    speech_friendly?: 'tot' | 'vua' | 'kem'
    speech_note?: string
    use_when?: string
    avoid_when?: string[]
    best_start?: number
    structure?: string
    tags?: string[]
  }

  /** 1 file da tai ve thu muc cho, CHUA vao kho */
  interface StagedSfx {
    key: string
    name: string
    path: string
    pageUrl: string
    bytes: number
  }

  interface FetchOutcome {
    ok: boolean
    items: StagedSfx[]
    failed: { url: string; reason: string }[]
    blocked?: boolean
  }

  interface SfxOnline {
    name: string
    mp3: string
    slug?: string
    emotion: string
    use_when: string
    license: string
  }

  interface Project {
    id: string
    createdAt: number
    updatedAt: number
    status: string
    topic?: string
    video?: VideoFile
    videos?: SourceVideo[]
    referenceVideo?: VideoFile | null
    editRequest?: EditRequest
    brandGuide?: BrandGuide
    /** Khung video chon khi tao (vang mat = doc, du an cu) */
    orientation?: VideoOrientation
    workDir?: string
    sourceBrief?: SourceBrief
    referenceAnalysis?: ReferenceAnalysis
    guard?: GuardReport
    error?: { step: string; message: string } | null
    /** 'remotion' = project cua menu Video Remotion; vang mat = du an cua luong CapCut cu (an khoi danh sach) */
    mode?: 'remotion'
    rmPlan?: RemotionPlan
    rmSpec?: RenderSpec
    rmSummary?: RemotionSummary
    rmRender?: RemotionRenderInfo | null
    /** Tu lieu cua nguoi dung (anh / video chen LEN video) — file nam trong <workDir>/tu-lieu-chen */
    userMedia?: UserMediaItem[]
  }

  /** Menu "Prompt & quy tac" — sidecar/prompt_store.py */
  interface PromptGroup {
    id: string
    title: string
    info: string
  }
  interface PromptTextItem {
    id: string
    group: string
    title: string
    info: string
    used_in: string
    /** Cac cho {ten} bat buoc giu (prompt template) */
    template?: string[]
    default: string
    value: string
    overridden: boolean
  }
  interface PromptRuleItem {
    id: string
    group: string
    title: string
    info: string
    min: number
    max: number
    unit: string
    integer: boolean
    default: number
    value: number
    overridden: boolean
  }
  interface PromptMechanism {
    id: string
    title: string
    info: string
    body: string
  }
  interface PromptsListing {
    ok: boolean
    error?: string
    groups?: PromptGroup[]
    prompts?: PromptTextItem[]
    refs?: PromptTextItem[]
    rules?: PromptRuleItem[]
    mechanisms?: PromptMechanism[]
    path?: string
  }

  /** Nhat ky xu ly — sidecar/run_log.py + electron/services/runlog.ts */
  interface RunEvent {
    id: string
    ts: number
    /** stage_start|stage_end|ai_call|ai_response|ai_error|note|guard|result|ui */
    kind: string
    title: string
    step?: string | null
    level?: 'info' | 'ok' | 'warn' | 'error' | string
    provider?: string
    model?: string
    attempt?: number
    params?: Record<string, unknown>
    system_prompt?: string
    user_message?: string
    raw_text?: string
    parsed?: unknown
    error?: string
    call_id?: string
    duration?: number
    chars?: number
    cached?: boolean
    output?: unknown
    input?: unknown
    result?: unknown
    [k: string]: unknown
  }
  /** Gan vao payload de sidecar ghi nhat ky dung project */
  interface RunCtx {
    id: string
    label?: string
  }

  // ---------------------------------------------------------------------------
  // VIDEO REMOTION (sidecar/remotion_plan.py, sidecar/reference_gpt.py, remotion/)
  // ---------------------------------------------------------------------------
  interface RemotionHints {
    caption_style_body?: string
    caption_style_hero?: string
    font_body?: string
    font_hero?: string
    accent_colors?: string[]
    uppercase_hero?: boolean
    grade?: string
    transitions?: string[]
    effects?: string[]
    notes?: string
  }
  /** Phan tich video mau bang Gemini (ban cu: GPT qua Codex CLI) — schema chung + phan do bang may */
  interface RemotionReferenceAnalysis extends ReferenceAnalysis {
    remotion_hints?: RemotionHints
    evidence?: { time?: number; observation?: string }[]
    _source?: string
    _measured?: {
      do_dai_giay?: number
      kich_thuoc?: string
      so_lan_cat_canh?: number
      moc_cat_canh?: number[]
      giay_moi_shot_tb?: number
      am_thanh?: { co_am_thanh?: boolean; db_trung_binh?: number; ti_le_gan_im_lang?: number }
    }
    /** ban cu (GPT xem anh luoi) */
    _frames?: { frames: number; sheets: number }
    /** Gemini: dung luong video mau da gui + so dai khung day (luot 2) */
    _media?: { video_mb: number; strips: number }
  }
  /** Plan THO cua luong Remotion (gio than video) — build_spec tu dung cau truc */
  interface RemotionPlan {
    engine: 'remotion'
    title?: string
    duration?: number
    segments?: Record<string, unknown>[]
    captions?: { text: string; role?: string; style?: string; [k: string]: unknown }[]
    caption_theme?: Record<string, unknown>
    scene_effects?: { type: string; [k: string]: unknown }[]
    grade?: { preset?: string; intensity?: number }
    hook?: { caption?: string; src_start?: number; src_end?: number; reason?: string; [k: string]: unknown } | null
    inserts?: Record<string, unknown>[]
    audio?: Record<string, unknown>[]
    /** nhac nen ca video (B7 chon trong Kho nhac nen); track_id null = AI chon khong dung (co ly do) */
    music?: { track_id: string | null; name?: string; muc?: string; ly_do?: string; by?: 'ai' | 'code' } | null
    _pipeline?: { story_arc?: string; tone?: string; notes?: string; [k: string]: unknown }
    [k: string]: unknown
  }
  interface RemotionSummary {
    do_dai?: number
    clip?: number
    caption?: number
    hieu_ung?: number
    sfx?: number
    /** ten bai nhac nen dang dung (null = khong co) */
    nhac_nen?: string | null
    meme_de_len?: number
    tong_mau?: string
    chuyen_canh?: string[]
    /** so tu lieu cua nguoi dung dang hien trong ban dung */
    tu_lieu?: number
  }
  interface RemotionCatalogItem {
    id: string
    label: string
    look?: string
    [k: string]: unknown
  }
  interface RemotionCatalog {
    transitions: RemotionCatalogItem[]
    effects: RemotionCatalogItem[]
    grades: RemotionCatalogItem[]
    caption_styles: RemotionCatalogItem[]
    fonts: RemotionCatalogItem[]
    accent_colors: string[]
  }
  interface RemotionRenderEvent {
    jobId: string
    type: 'progress' | 'done' | 'error' | 'cancelled' | 'log'
    stage?: 'browser' | 'prepare' | 'render' | 'encode' | string
    progress?: number
    renderedFrames?: number
    encodedFrames?: number
    totalFrames?: number
    output?: string
    size?: number
    seconds?: number
    message?: string
  }
  interface RemotionRenderInfo {
    output: string
    size?: number
    seconds?: number
    at: number
  }
}
