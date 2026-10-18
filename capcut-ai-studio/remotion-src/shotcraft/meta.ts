// Mo ta MOT mau shot (file <Component>.meta.json canh file .tsx). Nguon duy nhat cho:
//  - registry.ts (scripts/shotcraft-sync.mjs sinh) -> ShotPlayer biet do dai goc / bo cuc doc / o chu
//  - sidecar/references/shotcraft_catalog.json (cung script sinh) -> buoc lap ke hoach R4 doc TOAN BO kho
export type ShotSlotRole =
  | 'title' // tieu de chinh
  | 'subtitle' // cau phu / mo ta
  | 'kicker' // dong nho tren tieu de (chuyen muc, nhan)
  | 'label' // nhan ngan tren the / truc / nut
  | 'number' // con so (tu loi noi) — chi chu so + don vi
  | 'item' // muc trong danh sach
  | 'quote' // trich dan / loi nhan xet
  | 'cta' // keu goi hanh dong
  | 'name' // ten nguoi / san pham
  | 'code' // dong lenh / ma

export interface ShotSlot {
  id: string
  role: ShotSlotRole
  /** chu mau (tieng Viet) hien khi xem thu */
  sample: string
  /** so ky tu toi da (chu dai hon -> mau tu thu nho / bo) */
  max: number
  /** o kieu danh sach: so muc cho phep */
  list?: { min: number; max: number }
  optional?: boolean
  /** ghi chu cho AI lap ke hoach (vd "chi so", "1-2 tu") */
  note?: string
}

export interface ShotImage {
  id: string
  /** screen = anh chup man hinh / giao dien; photo = anh minh hoa; product = san pham cat nen; video = doan video */
  role: 'screen' | 'photo' | 'product' | 'video'
  /** ti le mong muon (vd "16:9", "9:16", "1:1", "page" = trang dai) */
  aspect?: string
  optional?: boolean
  note?: string
}

export interface ShotSfx {
  /** khung goc (@30fps) */
  at: number
  type: 'whoosh' | 'swoosh' | 'pop' | 'click' | 'boom' | 'riser' | 'ding' | 'typing'
}

export interface ShotMeta {
  /** = style key cua kho goc (duy nhat) */
  id: string
  /** ten component export trong file .tsx */
  component: string
  card: string
  category: string
  /** do dai goc (khung @30fps) */
  duration: number
  /** insert = canh toan man hinh thay A-roll; overlay = lop trong suot de len canh cat (vd chop sang) */
  kind: 'insert' | 'overlay'
  /** nen toi (true) / sang (false) */
  dark: boolean
  /** khung doc 9:16: native = mau tu bo cuc theo chieu cao that (useVideoConfig().height);
   *  band = giu khoi 1920x1080, phong to `zoom` (>=1, cat bot hai mep), dat tam doc tai focusY (0..1) */
  portrait: { mode: 'native' | 'band'; zoom?: number; focusY?: number }
  /** mau nen phu phan tren / duoi (khung doc, mau KHONG dung <Stage>) */
  bleed?: [string, string]
  /** khoang toc do cho phep de vua do dai canh [cham, nhanh] (mac dinh [0.8, 1.25]) */
  rate?: [number, number]
  /** tu khung nay moi thong tin da hien du -> canh co the cat sau khung nay */
  hold: number
  slots: ShotSlot[]
  images: ShotImage[]
  /** can thuong hieu: required = khong co thuong hieu thi khong dung; optional = co thi hien; none */
  brand: 'required' | 'optional' | 'none'
  sfx: ShotSfx[]
  /** mo ta tieng Viet cho AI lap ke hoach */
  vi: {
    ten: string
    /** trong thay gi, chuyen dong ra sao (2-3 cau) */
    mo_ta: string
    /** dung khi nao trong video edit (noi dung loi noi / khoanh khac) */
    hop_khi: string
    tranh_khi: string
    nang_luong: 'thap' | 'vua' | 'cao'
    /** tu khoa chu de (vd "dien thoai", "so lieu", "so sanh", "ra mat") */
    chu_de: string[]
  }
}
