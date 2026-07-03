"use client";

import { LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CreatorPanel } from "@/components/creator-panel";
import { E2EBadge } from "@/components/e2e-badge";
import { Hint } from "@/components/hint";
import { RoomEditor } from "@/components/room-editor";
import { type EntryBusy, RoomEntry } from "@/components/room-entry";
import type { ConflictPolicy, Session, Status } from "@/components/room-types";
import { StatusBanner } from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import { useLiveRoom } from "@/components/use-live-room";
import {
  ApiError,
  deleteRoom,
  joinRoom,
  type JoinMode,
  pullClipboard,
  pushClipboard,
  type SyncMode,
} from "@/lib/api";
import { decrypt, deriveKeys, encrypt } from "@/lib/crypto";
import { createDebounced, type Debounced } from "@/lib/debounce";
import type { LiveUpdate } from "@/lib/live";
import { generateSimplePassword } from "@/lib/password-gen";
import { decodePasswordHash } from "@/lib/room-link";

type Busy = EntryBusy | "push" | "pull";

/** Debounce for the `typing` sync mode: quiet 1s → push; bursts cap at 3s. */
const TYPING_WAIT_MS = 1_000;
const TYPING_MAX_WAIT_MS = 3_000;

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
 *
 * Live modes (`push`/`typing`) additionally hold a WebSocket via useLiveRoom:
 * incoming broadcasts are decrypted locally and applied to the textarea,
 * subject to the per-client conflict policy. Uploads always go over HTTP —
 * the socket is downstream-only.
 */
export function ClipboardApp() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [capacity, setCapacity] = useState(2);
  const [syncMode, setSyncMode] = useState<SyncMode>("push");
  const [ttlMs, setTtlMs] = useState<number>(600_000);
  const [text, setText] = useState("");
  const [conflictPolicy, setConflictPolicy] =
    useState<ConflictPolicy>("overwrite");

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  // Set synchronously when arriving via a share link so the entry view never
  // flashes before the auto-join resolves.
  const [autoJoining, setAutoJoining] = useState(hasInboundShareLink);
  const [status, setStatus] = useState<Status>({
    kind: "info",
    message: "",
  });

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Mirrors for async callbacks (live updates, debounced pushes) that must see
  // the latest values without re-subscribing.
  const textRef = useRef(text);
  textRef.current = text;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const conflictPolicyRef = useRef(conflictPolicy);
  conflictPolicyRef.current = conflictPolicy;
  const ttlMsRef = useRef(ttlMs);
  ttlMsRef.current = ttlMs;
  /** The text as last agreed with the server (pushed, pulled, or applied). */
  const lastSyncedRef = useRef("");

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
        const res = await joinRoom(keys.value.roomId, capacity, mode, syncMode);
        if (!res.ok) {
          const kind = res.error === ApiError.SEALED ? "warning" : "error";
          setStatus({ kind, message: res.error });
          return;
        }
        const {
          token,
          joined: slot,
          capacity: cap,
          sealed,
          role,
          syncMode: roomSyncMode,
        } = res.value;
        setSession({
          roomId: keys.value.roomId,
          token,
          contentKey: keys.value.contentKey,
          slot,
          capacity: cap,
          sealed,
          role,
          // The stored mode: on join this is the creator's choice, not ours.
          syncMode: roomSyncMode,
        });
        setText("");
        lastSyncedRef.current = "";
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
    [capacity, syncMode],
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

  // Seed the entry field with a simple random password on first load so users
  // start from something usable (and are nudged to the Simple/Safer tools),
  // never an empty box. Skipped when arriving via a share link, which supplies
  // its own password. Runs in the browser only (WebCrypto).
  const didSeed = useRef(false);
  useEffect(() => {
    if (didSeed.current) return;
    didSeed.current = true;
    if (hasInboundShareLink()) return;
    setPassword((p) => (p.length === 0 ? generateSimplePassword() : p));
  }, []);

  /**
   * Encrypt the current text and upload it. `silent` is the debounced
   * typing-mode path: no busy spinner, no success banner (failures still
   * surface), and a no-op when nothing changed since the last sync.
   */
  const doPush = useCallback(async (opts: { silent: boolean }) => {
    const s = sessionRef.current;
    if (!s) return;
    const value = textRef.current;
    if (opts.silent && value === lastSyncedRef.current) return;
    if (!opts.silent) setBusy("push");
    try {
      const enc = await encrypt(s.contentKey, value);
      if (!enc.ok) {
        setStatus({ kind: "error", message: enc.error });
        return;
      }
      const res = await pushClipboard(s.roomId, s.token, enc.value, ttlMsRef.current);
      if (!res.ok) {
        if (res.error === ApiError.SLOT_LOST || res.error === ApiError.ROOM_GONE) {
          dropSession();
        }
        setStatus({ kind: "error", message: slotLostCopy(res.error) });
        return;
      }
      lastSyncedRef.current = value;
      setExpiresAt(res.value.expiresAt);
      setNow(Date.now());
      if (!opts.silent) {
        setStatus({
          kind: "validated",
          message: `Encrypted & pushed — expires in ${formatRemaining(res.value.expiresAt - Date.now())}.`,
        });
      }
    } finally {
      if (!opts.silent) setBusy(null);
    }
  }, [dropSession]);

  const doPushRef = useRef(doPush);
  doPushRef.current = doPush;

  // The typing-mode debouncer lives for as long as a typing-mode session does.
  const debouncerRef = useRef<Debounced | null>(null);
  const isTypingRoom = session !== null && session.syncMode === "typing";
  useEffect(() => {
    if (!isTypingRoom) return;
    const d = createDebounced(
      () => void doPushRef.current({ silent: true }),
      { waitMs: TYPING_WAIT_MS, maxWaitMs: TYPING_MAX_WAIT_MS },
    );
    debouncerRef.current = d;
    return () => {
      d.cancel();
      debouncerRef.current = null;
    };
  }, [isTypingRoom]);

  /** Textarea edits; in `typing` mode every keystroke arms the auto-push. */
  const handleTextChange = useCallback((value: string) => {
    setText(value);
    textRef.current = value;
    debouncerRef.current?.call();
  }, []);

  const handlePush = useCallback(() => {
    // In typing mode the button doubles as "sync now": drop the pending timer
    // and push immediately with full feedback.
    debouncerRef.current?.cancel();
    void doPush({ silent: false });
  }, [doPush]);

  /**
   * Decrypt an incoming blob (live broadcast or catch-up pull) and apply it,
   * honouring the conflict policy: with `warn` and unsaved local edits the
   * text is kept and a banner points at Pull instead.
   */
  const applyRemote = useCallback(async (update: LiveUpdate) => {
    const s = sessionRef.current;
    if (!s) return;
    if (
      conflictPolicyRef.current === "warn" &&
      textRef.current !== lastSyncedRef.current
    ) {
      setExpiresAt(update.expiresAt);
      setNow(Date.now());
      setStatus({
        kind: "warning",
        message: "New content received — Pull to load it (your edits are kept).",
      });
      return;
    }
    const dec = await decrypt(s.contentKey, {
      ciphertext: update.ciphertext,
      iv: update.iv,
    });
    if (!dec.ok) {
      setStatus({ kind: "error", message: dec.error });
      return;
    }
    setText(dec.value);
    textRef.current = dec.value;
    lastSyncedRef.current = dec.value;
    setExpiresAt(update.expiresAt);
    setNow(Date.now());
    setStatus({ kind: "info", message: "Live update received." });
  }, []);

  const liveStatus = useLiveRoom(session, {
    // Catch up on whatever was pushed before/while we were disconnected.
    onOpen: () => {
      const s = sessionRef.current;
      if (!s) return;
      void (async () => {
        const res = await pullClipboard(s.roomId, s.token);
        if (res.ok) await applyRemote(res.value);
        // EMPTY just means nothing was pushed yet — stay quiet.
      })();
    },
    onUpdate: (update) => void applyRemote(update),
    onRevoked: () => {
      dropSession();
      setText("");
      setStatus({
        kind: "error",
        message: "You were removed from this room by the creator.",
      });
    },
    onRoomGone: () => {
      dropSession();
      setText("");
      setStatus({
        kind: "error",
        message: "This room was removed or expired.",
      });
    },
    onFailed: () =>
      setStatus({
        kind: "warning",
        message:
          "Live connection lost — updates won't arrive automatically, but Push and Pull still work.",
      }),
  });

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
      // An explicit Pull is the user asking for the server's copy: it always
      // applies, clearing any "new content received" warning state.
      setText(dec.value);
      textRef.current = dec.value;
      lastSyncedRef.current = dec.value;
      setExpiresAt(res.value.expiresAt);
      setNow(Date.now());
      setStatus({ kind: "validated", message: "Pulled & decrypted." });
    } finally {
      setBusy(null);
    }
  }, [session, dropSession]);

  // Clear is local-only: it empties the text box here without touching the
  // server. The shared blob is only replaced/removed via Push. (In typing
  // mode this also cancels any pending auto-push so the empty box isn't
  // synced by a stray timer.)
  const handleClear = useCallback(() => {
    debouncerRef.current?.cancel();
    setText("");
    textRef.current = "";
    setStatus({ kind: "info", message: "Cleared the text box." });
  }, []);

  const handleLeave = useCallback(() => {
    debouncerRef.current?.cancel();
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
            onTextChange={handleTextChange}
            ttlMs={ttlMs}
            onTtlChange={setTtlMs}
            busy={busy === "push" || busy === "pull" ? busy : null}
            onPush={handlePush}
            onPull={handlePull}
            onClear={handleClear}
            canSetExpiry={session.role === "creator"}
            syncMode={session.syncMode}
            liveStatus={liveStatus}
            conflictPolicy={conflictPolicy}
            onConflictPolicyChange={setConflictPolicy}
          />
        </>
      ) : autoJoining ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
          <E2EBadge />
          <span>Joining the room…</span>
        </div>
      ) : (
        <RoomEntry
          password={password}
          onPasswordChange={setPassword}
          showPassword={showPassword}
          onToggleShowPassword={() => setShowPassword((v) => !v)}
          capacity={capacity}
          onCapacityChange={setCapacity}
          syncMode={syncMode}
          onSyncModeChange={setSyncMode}
          busy={entryBusy}
          onCreate={() => void allocate("create", password)}
          onJoin={() => void allocate("join", password)}
          statusBanner={
            <StatusBanner kind={status.kind}>
              {status.message ||
                "Create a room with password on one device and share it or Join it on the others"}
            </StatusBanner>
          }
        />
      )}
    </div>
  );
}
