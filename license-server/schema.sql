-- May chu ban quyen Agent Edit (Cloudflare D1). Chay 1 lan:
--   npx wrangler d1 execute agent-edit-license --remote --file schema.sql
-- Thoi gian luu bang mili-giay (Date.now()).

-- Moi key = 1 dong. 1 key chi gan DUNG 1 may (cot device_pub / fp / ...).
CREATE TABLE IF NOT EXISTS licenses (
  id            TEXT PRIMARY KEY,                 -- 'L' + ngau nhien (khong lo key)
  key_hash      TEXT NOT NULL UNIQUE,             -- SHA-256 cua key da chuan hoa -> tra cuu
  key_enc       TEXT NOT NULL,                    -- key ma hoa AES-GCM (KEY_ENC_SECRET) -> trang quan tri xem lai
  key_hint      TEXT NOT NULL,                    -- 5 ky tu cuoi, de tim / hien thi
  plan          TEXT NOT NULL CHECK (plan IN ('month', 'year', 'lifetime')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
  customer      TEXT,
  contact       TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  activated_at  INTEGER,                          -- lan kich hoat DAU TIEN (han dung tinh tu day)
  expires_at    INTEGER,                          -- NULL = vinh vien / chua kich hoat
  device_pub    TEXT,                             -- khoa thiet bi (Ed25519, base64) cua may dang gan
  fp            TEXT,                             -- JSON ma may: {"platform":..,"c":{ten: bam}}
  platform      TEXT,
  hostname      TEXT,
  app_version   TEXT,
  last_seen_at  INTEGER,
  last_ip       TEXT,
  last_country  TEXT,
  conflicts     INTEGER NOT NULL DEFAULT 0,       -- so lan may KHAC thu dung key nay
  locked_reason TEXT
);
CREATE INDEX IF NOT EXISTS licenses_created ON licenses (created_at DESC);
CREATE INDEX IF NOT EXISTS licenses_hint ON licenses (key_hint);

-- Nhat ky: kich hoat, kiem tra, tu choi, may khac, dong bo kho, thao tac quan tri.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id  TEXT,
  at          INTEGER NOT NULL,
  type        TEXT NOT NULL,
  ip          TEXT,
  country     TEXT,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS events_license ON events (license_id, at DESC);
CREATE INDEX IF NOT EXISTS events_at ON events (at DESC);

-- Chong do key: dem lan nhap key SAI theo IP trong 1 gio.
CREATE TABLE IF NOT EXISTS throttle (
  ip           TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  fails        INTEGER NOT NULL
);
