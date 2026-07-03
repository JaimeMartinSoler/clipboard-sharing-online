-- Room-level sync mode for real-time sharing (Durable Object + WebSocket).
--
-- `rooms.sync_mode` is chosen by the creator at room creation and never changes
-- for that room instance:
--   'manual' — Push/Pull buttons only, no WebSocket (legacy behavior).
--   'push'   — explicit Push; other members receive it live over WebSocket.
--   'typing' — auto-push while typing (debounced); received live.
-- The default keeps pre-existing rooms and old clients on exact legacy
-- semantics: no live socket is ever opened for a 'manual' room.
ALTER TABLE rooms ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'manual';
