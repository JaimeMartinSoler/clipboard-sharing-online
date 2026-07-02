"use client";

import { LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CreatorPanel } from "@/components/creator-panel";
import { E2EBadge } from "@/components/e2e-badge";
import { Hint } from "@/components/hint";
import { RoomEditor } from "@/components/room-editor";
import { type EntryBusy, RoomEntry } from "@/components/room-entry";
import type { Session, Status } from "@/components/room-types";
import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  deleteRoom,
  joinRoom,
  type JoinMode,
  pullClipboard,
  pushClipboard,
} from "@/lib/api";
import { decrypt, deriveKeys, encrypt } from "@/lib/crypto";
import { decodePasswordHash } from "@/lib/room-link";

type Busy = EntryBusy | "push" | "pull";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Replace the generic 401 copy with the strict-slot lockout wording. */
function slotLostCopy(error: string): string {
  return error === ApiError.SLOT_LOST
    ? "Your slot was lost (reload/closed) — locked out until this room expires."
    : error;
}

/**
 * True on first render when the page was opened via a `#p=…` share link, so we
 * can show a neutral "joining" placeholder instead of flashing the entry view
 * while the (slow) key derivation + join runs.
 */
function hasInboundShareLink(): boolean {
  if (typeof window === "undefined") return false;
  return decodePasswordHash(window.location.hash) !== null;
}

/**
 * Top-level state machine for the app. Two views:
 *  - **Entry** (no session): pick a password, then Create or Join a room.
 *  - **Room** (session): the shared editor, plus creator-only controls.
 *
 * The password is held in memory only (for Share/QR), never persisted. An
 * inbound `#p=…` share link auto-joins on mount and is then scrubbed from the
 * address bar so it doesn't linger in history or on screen.
 */
export function ClipboardApp() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capacity, setCapacity] = useState(2);
  const [ttlMs, setTtlMs] = useState<number>(600_000);
  const [text, setText] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  // Set synchronously when arriving via a share link so the entry view never
  // flashes before the auto-join resolves.
  const [autoJoining, setAutoJoining] = useState(hasInboundShareLink);
  const [status, setStatus] = useState<Status>({
    kind: "info",
    message: "Enter a shared password, then Create or Join a room.",
  });

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second only while there is a live countdown.
  useEffect(() => {
    if (expiresAt === null) return;
    if (Date.now() >= expiresAt) {
      setNow(Date.now());
      return;
    }
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= expiresAt) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const remaining = expiresAt === null ? null : expiresAt - now;

  const dropSession = useCallback(() => {
    setSession(null);
    setExpiresAt(null);
  }, []);

  /** Derive keys from a password and create/join a room. */
  const allocate = useCallback(
    async (mode: JoinMode, pw: string) => {
      setBusy(mode);
      try {
        const keys = await deriveKeys(pw);
        if (!keys.ok) {
          setStatus({ kind: "error", message: keys.error });
          return;
        }
        const res = await joinRoom(keys.value.roomId, capacity, mode);
        if (!res.ok) {
          const kind = res.error === ApiError.SEALED ? "warning" : "error";
          setStatus({ kind, message: res.error });
          return;
        }
        const { token, joined: slot, capacity: cap, sealed, role } = res.value;
        setSession({
          roomId: keys.value.roomId,
          token,
          contentKey: keys.value.contentKey,
          slot,
          capacity: cap,
          sealed,
          role,
        });
        setText("");
        setExpiresAt(null);
        // Joiners see no room-status detail (slot counts / sealed state); that
        // is creator-only information. The creator gets the full picture.
        if (role !== "creator") {
          setStatus({ kind: "validated", message: "Joined the room." });
        } else if (sealed) {
          setStatus({
            kind: "validated",
            message: `Room sealed (${slot}/${cap}) — sharing is locked to these terminals.`,
          });
        } else {
          setStatus({
            kind: "info",
            message: `Created as terminal ${slot} of ${cap} — waiting for ${cap - slot} more.`,
          });
        }
      } finally {
        setBusy(null);
      }
    },
    [capacity],
  );

  // Auto-join from an inbound `#p=…` share link, exactly once.
  const didAuto = useRef(false);
  useEffect(() => {
    if (didAuto.current) return;
    didAuto.current = true;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const pw = decodePasswordHash(hash);
    if (hash) {
      // Scrub the fragment so the password doesn't linger in the address bar.
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    if (pw) {
      setPassword(pw);
      void allocate("join", pw).finally(() => setAutoJoining(false));
    } else {
      setAutoJoining(false);
    }
  }, [allocate]);

  const handlePush = useCallback(async () => {
    if (!session) return;
    setBusy("push");
    try {
      const enc = await encrypt(session.contentKey, text);
      if (!enc.ok) {
        setStatus({ kind: "error", message: enc.error });
        return;
      }
      const res = await pushClipboard(
        session.roomId,
        session.token,
        enc.value,
        ttlMs,
      );
      if (!res.ok) {
        if (res.error === ApiError.SLOT_LOST || res.error === ApiError.ROOM_GONE) {
          dropSession();
        }
        setStatus({ kind: "error", message: slotLostCopy(res.error) });
        return;
      }
      setExpiresAt(res.value.expiresAt);
      setNow(Date.now());
      setStatus({
        kind: "validated",
        message: `Encrypted & pushed — expires in ${formatRemaining(res.value.expiresAt - Date.now())}.`,
      });
    } finally {
      setBusy(null);
    }
  }, [session, text, ttlMs, dropSession]);

  const handlePull = useCallback(async () => {
    if (!session) return;
    setBusy("pull");
    try {
      const res = await pullClipboard(session.roomId, session.token);
      if (!res.ok) {
        if (res.error === ApiError.EMPTY) {
          setStatus({ kind: "info", message: res.error });
        } else {
          if (res.error === ApiError.SLOT_LOST) dropSession();
          setStatus({ kind: "error", message: slotLostCopy(res.error) });
        }
        return;
      }
      const dec = await decrypt(session.contentKey, {
        ciphertext: res.value.ciphertext,
        iv: res.value.iv,
      });
      if (!dec.ok) {
        setStatus({ kind: "error", message: dec.error });
        return;
      }
      setText(dec.value);
      setExpiresAt(res.value.expiresAt);
      setNow(Date.now());
      setStatus({ kind: "validated", message: "Pulled & decrypted." });
    } finally {
      setBusy(null);
    }
  }, [session, dropSession]);

  // Clear is local-only: it empties the text box here without touching the
  // server. The shared blob is only replaced/removed via Push.
  const handleClear = useCallback(() => {
    setText("");
    setStatus({ kind: "info", message: "Cleared the text box." });
  }, []);

  const handleLeave = useCallback(() => {
    dropSession();
    setText("");
    setStatus({
      kind: "info",
      message:
        "Left the room — your slot is forfeited (it still counts until the room expires).",
    });
  }, [dropSession]);

  const handleRemoveRoom = useCallback(async () => {
    if (!session) return;
    const res = await deleteRoom(session.roomId, session.token);
    if (!res.ok) {
      if (res.error === ApiError.SLOT_LOST) dropSession();
      setStatus({ kind: "error", message: slotLostCopy(res.error) });
      return;
    }
    dropSession();
    setText("");
    setStatus({
      kind: "info",
      message: "Room removed — content and all members were deleted.",
    });
  }, [session, dropSession]);

  const handleSessionInvalid = useCallback(() => {
    dropSession();
    setStatus({ kind: "error", message: slotLostCopy(ApiError.SLOT_LOST) });
  }, [dropSession]);

  const entryBusy: EntryBusy =
    busy === "create" || busy === "join" ? busy : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {session ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Clipboard room
            </h1>
            {/* Only a joiner may Leave (forfeiting their slot). The creator
                cannot — leaving would orphan the room with no way back in — so
                they use "Remove room" in the creator panel instead. */}
            {session.role === "joiner" && (
              <div className="ml-auto">
                <Hint text="Leave the room. Your slot is forfeited but still counts against the cap until the room expires.">
                  <Button variant="outline" size="sm" onClick={handleLeave}>
                    <LogOut /> Leave
                  </Button>
                </Hint>
              </div>
            )}
          </div>
          <div>
            <E2EBadge />
          </div>

          {session.role === "creator" && (
            <CreatorPanel
              session={session}
              password={password}
              onStatus={setStatus}
              onSessionInvalid={handleSessionInvalid}
              onRemoveRoom={handleRemoveRoom}
            />
          )}

          <StatusBanner kind={status.kind}>
            {status.message}
            {remaining !== null && (
              <span className="ml-1 tabular-nums">
                {" "}
                · expires in {formatRemaining(remaining)}
              </span>
            )}
          </StatusBanner>

          <RoomEditor
            text={text}
            onTextChange={setText}
            ttlMs={ttlMs}
            onTtlChange={setTtlMs}
            busy={busy === "push" || busy === "pull" ? busy : null}
            onPush={handlePush}
            onPull={handlePull}
            onClear={handleClear}
            canSetExpiry={session.role === "creator"}
          />
        </>
      ) : autoJoining ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
          <E2EBadge />
          <span>Joining the room…</span>
        </div>
      ) : (
        <>
          <RoomEntry
            password={password}
            onPasswordChange={setPassword}
            showPassword={showPassword}
            onToggleShowPassword={() => setShowPassword((v) => !v)}
            capacity={capacity}
            onCapacityChange={setCapacity}
            busy={entryBusy}
            onCreate={() => void allocate("create", password)}
            onJoin={() => void allocate("join", password)}
          />
          <StatusBanner kind={status.kind}>{status.message}</StatusBanner>
        </>
      )}
    </div>
  );
}
