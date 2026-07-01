-- Zero-knowledge clipboard store. The server only ever holds opaque ids,
-- ciphertext, ivs, timestamps, a capacity count, and membership token *hashes*.
CREATE TABLE IF NOT EXISTS rooms (
  room_id    TEXT    PRIMARY KEY,   -- opaque, client-derived (see crypto)
  capacity   INTEGER NOT NULL,      -- max terminals; default 2, clamped 1–10
  ciphertext TEXT,                  -- base64url AES-GCM ciphertext (nullable until first push)
  iv         TEXT,                  -- base64url 96-bit nonce (nullable until first push)
  created_at INTEGER NOT NULL,      -- epoch ms
  expires_at INTEGER NOT NULL       -- epoch ms; row is dead once now > this
);

CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    TEXT    NOT NULL,      -- FK → rooms.room_id
  token_hash TEXT    NOT NULL,      -- SHA-256 of the bearer membership token
  joined_at  INTEGER NOT NULL       -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_members_room ON members(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_expires ON rooms(expires_at);
