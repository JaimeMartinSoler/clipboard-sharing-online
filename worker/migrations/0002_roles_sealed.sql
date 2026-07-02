-- Create/Join roles + an explicit seal flag (issue #7).
--
-- `rooms.sealed` makes "sealed once full, forever" an explicit invariant rather
-- than one merely implied by `member_count >= capacity`. A creator removing a
-- joiner drops the member count but must NOT reopen the slot, so join checks
-- `sealed = 0` (not just count < capacity). Set to 1 the moment capacity is
-- first reached; never reset for that room instance.
--
-- `members.role` records who created the room vs who joined it. The creator is
-- the first member; only the creator may list members, remove a joiner, or nuke
-- the room. Enforced at the Worker/DB layer, not just the view.
-- `members.role` is 'creator' | 'joiner'.
ALTER TABLE rooms   ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN role   TEXT    NOT NULL DEFAULT 'joiner';
