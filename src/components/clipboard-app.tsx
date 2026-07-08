"use client";

import { LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CreatorPanel } from "@/components/creator-panel";
import { E2EBadge } from "@/components/e2e-badge";
import { Hint } from "@/components/hint";
import { PrivacyHighlights } from "@/components/privacy-highlights";
import { RoomEditor } from "@/components/room-editor";
import { type EntryBusy, RoomEntry } from "@/components/room-entry";
import type { ConflictPolicy, Session, Status } from "@/components/room-types";
import { ShareControls } from "@/components/share-controls";
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
import {
  generateSaferPassword,
  generateSimplePassword,
} from "@/lib/password-gen";
import {
  loadPreferences,
  type PasswordKind,
  savePreferences,
} from "@/lib/preferences";
import { decodePasswordHash } from "@/lib/room-link";
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  type History,
  initHistory,
  record as histRecord,
  redo as histRedo,
  undo as histUndo,
} from "@/lib/text-history";

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
  // Initial values MUST equal DEFAULT_PREFERENCES so the server-rendered markup
  // matches the first client render; the stored prefs are applied in a mount
  // effect (post-hydration) to avoid a mismatch.
  const [password, setPassword] = useState("");
  const [passwordKind, setPasswordKind] = useState<PasswordKind>("simple");
  const [showPassword, setShowPassword] = useState(true);
  // Sealed (bounded, seals when full) vs open (unlimited, never seals). Open
  // rooms are requested with capacity 0.
  const [sealedRoom, setSealedRoom] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [capacity, setCapacity] = useState(2);
  const [syncMode, setSyncMode] = useState<SyncMode>("push");
  const [ttlMs, setTtlMs] = useState<number>(600_000);
  // The text box is backed by an undo/redo history; `present` is what's shown.
  const [history, setHistory] = useState<History>(() => initHistory(""));
  const text = history.present;
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
  // Bumped whenever a live `roster` frame arrives (a terminal joined or was
  // revoked) and on every socket (re)connect, so the creator's room controls
  // re-pull the member list in near real time — a reconnect catch-up covers any
  // nudge missed while the socket was down. Manual rooms never receive these —
  // they keep the Refresh button.
  const [rosterSignal, setRosterSignal] = useState(0);

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

  // The room view pushes one history entry so Back (and the header click, which
  // routes through it) returns to the entry view instead of leaving the site.
  // `roomHistoryPushed` tracks that entry; `suppressPopHome` marks a pop we make
  // ourselves (a non-Back exit) so the resulting popstate doesn't re-run goHome
  // and clobber the exit's status message.
  const roomHistoryPushed = useRef(false);
  const suppressPopHome = useRef(false);

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

  /**
   * Pop the room's pushed history entry, if any, without letting the resulting
   * popstate re-run goHome. Called on every programmatic exit (Leave, revoke,
   * room gone, slot lost, remove) via dropSession so the history stack stays
   * balanced however the room is left — a real Back press pops the entry in the
   * browser and clears the flag in the popstate handler instead.
   */
  const popRoomHistory = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!roomHistoryPushed.current) return;
    roomHistoryPushed.current = false;
    suppressPopHome.current = true;
    window.history.back();
  }, []);

  const dropSession = useCallback(() => {
    popRoomHistory();
    setSession(null);
    setExpiresAt(null);
  }, [popRoomHistory]);

  /** Replace the text box and reset its undo/redo history (join/leave/nuke). */
  const resetText = useCallback((value: string) => {
    setHistory(initHistory(value));
    textRef.current = value;
  }, []);

  /** Set the text box, recording an undoable step (pull / live update / clear). */
  const commitText = useCallback((value: string) => {
    setHistory((h) => histRecord(h, value));
    textRef.current = value;
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((h) => histUndo(h));
    // Undo/redo is an edit too: in typing mode, arm the auto-push (it no-ops if
    // the restored value already matches what the server last saw).
    debouncerRef.current?.call();
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((h) => histRedo(h));
    debouncerRef.current?.call();
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
        // An open room is requested with capacity 0 (server never seals it).
        // Ignored on join — the room already has its capacity.
        const requestedCapacity = sealedRoom ? capacity : 0;
        const res = await joinRoom(
          keys.value.roomId,
          requestedCapacity,
          mode,
          syncMode,
        );
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
        resetText("");
        lastSyncedRef.current = "";
        setExpiresAt(null);
        // Joiners see no room-status detail (slot counts / sealed state); that
        // is creator-only information. The creator gets the full picture.
        if (role !== "creator") {
          setStatus({ kind: "validated", message: "Joined the room." });
        } else if (cap === 0) {
          // Public room: no terminal limit, never sealed.
          setStatus({
            kind: "info",
            message: `Created a public room — anyone with the password can join (you are terminal ${slot}).`,
          });
        } else if (sealed) {
          setStatus({
            kind: "validated",
            message: `Private room sealed (${slot}/${cap}) — sharing is locked to these terminals.`,
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
    [capacity, sealedRoom, syncMode, resetText],
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

  /** Generate a fresh random password and remember which style was used. */
  const handleGeneratePassword = useCallback((kind: PasswordKind) => {
    setPasswordKind(kind);
    setPassword(
      kind === "safer" ? generateSaferPassword() : generateSimplePassword(),
    );
  }, []);

  // Restore last-visit UI preferences (never the password) and seed the entry
  // field with a fresh random password of the remembered style — so users start
  // from something usable, never an empty box. Runs once, post-hydration, in the
  // browser only (localStorage + WebCrypto). Skipped-seed when arriving via a
  // share link, which supplies its own password.
  const didLoadPrefs = useRef(false);
  useEffect(() => {
    if (didLoadPrefs.current) return;
    didLoadPrefs.current = true;
    const prefs = loadPreferences();
    setPasswordKind(prefs.passwordKind);
    setShowPassword(prefs.showPassword);
    setSealedRoom(prefs.sealedRoom);
    setAdvancedOpen(prefs.advancedOpen);
    setCapacity(prefs.capacity);
    setSyncMode(prefs.syncMode);
    if (!hasInboundShareLink()) {
      setPassword((p) =>
        p.length === 0
          ? prefs.passwordKind === "safer"
            ? generateSaferPassword()
            : generateSimplePassword()
          : p,
      );
    }
  }, []);

  // Persist UI preferences whenever they change. The first run (initial mount,
  // before the load effect's state settles) is skipped so we never clobber the
  // stored blob with defaults.
  const didInitSave = useRef(false);
  useEffect(() => {
    if (!didInitSave.current) {
      didInitSave.current = true;
      return;
    }
    savePreferences({
      passwordKind,
      showPassword,
      advancedOpen,
      sealedRoom,
      capacity,
      syncMode,
    });
  }, [passwordKind, showPassword, advancedOpen, sealedRoom, capacity, syncMode]);

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
          // The banner appends a persistent "· expires in …" countdown, so the
          // message itself stays countdown-free to avoid a doubled expiry.
          message: "Encrypted & pushed.",
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
    setHistory((h) => histRecord(h, value));
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
    commitText(dec.value);
    lastSyncedRef.current = dec.value;
    setExpiresAt(update.expiresAt);
    setNow(Date.now());
    setStatus({ kind: "info", message: "Live update received." });
  }, [commitText]);

  const liveStatus = useLiveRoom(session, {
    // Catch up on whatever was pushed before/while we were disconnected.
    onOpen: () => {
      const s = sessionRef.current;
      if (!s) return;
      // Also re-pull the roster: a membership change (join/revoke) whose
      // `roster` nudge landed while our socket was down would otherwise leave
      // the creator's list stale until a manual Refresh. Harmless for joiners,
      // whose CreatorPanel isn't mounted.
      setRosterSignal((n) => n + 1);
      void (async () => {
        const res = await pullClipboard(s.roomId, s.token);
        if (res.ok) await applyRemote(res.value);
        // EMPTY just means nothing was pushed yet — stay quiet.
      })();
    },
    onUpdate: (update) => void applyRemote(update),
    // A terminal joined or was revoked: signal the creator panel to re-pull.
    onRoster: () => setRosterSignal((n) => n + 1),
    onRevoked: () => {
      dropSession();
      resetText("");
      setStatus({
        kind: "error",
        message: "You were removed from this room by the creator.",
      });
    },
    onRoomGone: () => {
      dropSession();
      resetText("");
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
      commitText(dec.value);
      lastSyncedRef.current = dec.value;
      setExpiresAt(res.value.expiresAt);
      setNow(Date.now());
      setStatus({ kind: "validated", message: "Pulled & decrypted." });
    } finally {
      setBusy(null);
    }
  }, [session, dropSession, commitText]);

  // Clear is local-only: it empties the text box here without touching the
  // server. The shared blob is only replaced/removed via Push. (In typing
  // mode this also cancels any pending auto-push so the empty box isn't
  // synced by a stray timer.)
  const handleClear = useCallback(() => {
    debouncerRef.current?.cancel();
    commitText("");
    setStatus({ kind: "info", message: "Cleared the text box." });
  }, [commitText]);

  const handleLeave = useCallback(() => {
    debouncerRef.current?.cancel();
    dropSession();
    resetText("");
    setStatus({
      kind: "info",
      message:
        "Left the room — your slot is forfeited (it still counts until the room expires).",
    });
  }, [dropSession, resetText]);

  /**
   * Return to the entry ("main") view, dropping the in-memory session. Used by
   * the header title/lock click and the browser Back button (see the history
   * effects below) so both land on the main page instead of leaving the site.
   */
  const goHome = useCallback(() => {
    debouncerRef.current?.cancel();
    dropSession();
    resetText("");
    setStatus({ kind: "info", message: "" });
  }, [dropSession, resetText]);

  // Give the room view its own history entry so the browser Back button (and
  // the header click, which routes through it) returns to the entry view
  // instead of navigating away from the site. Pushed once per room entry;
  // dropSession/popRoomHistory pops it back off on any non-Back exit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (session && !roomHistoryPushed.current) {
      roomHistoryPushed.current = true;
      window.history.pushState({ csoRoom: true }, "");
    } else if (!session) {
      roomHistoryPushed.current = false;
    }
  }, [session]);

  // Back button: pop returns us to the entry view rather than off-site.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      // A pop we triggered ourselves (a non-Back exit) — the entry is already
      // gone; don't re-run goHome over the exit's status message.
      if (suppressPopHome.current) {
        suppressPopHome.current = false;
        return;
      }
      // A real Back press while in a room: the browser has popped our entry, so
      // clear the flag and return to the entry view.
      if (sessionRef.current) {
        roomHistoryPushed.current = false;
        goHome();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [goHome]);

  // Header title/lock click dispatches this; if we're in a room, step Back so
  // the pushed room entry is popped and popstate drives us home cleanly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHome = () => {
      if (sessionRef.current) window.history.back();
    };
    window.addEventListener("cso:home", onHome);
    return () => window.removeEventListener("cso:home", onHome);
  }, []);

  const handleRemoveRoom = useCallback(async () => {
    if (!session) return;
    const res = await deleteRoom(session.roomId, session.token);
    if (!res.ok) {
      if (res.error === ApiError.SLOT_LOST) dropSession();
      setStatus({ kind: "error", message: slotLostCopy(res.error) });
      return;
    }
    dropSession();
    resetText("");
    setStatus({
      kind: "info",
      message: "Room removed — content and all members were deleted.",
    });
  }, [session, dropSession, resetText]);

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
          {/* Three columns (spacer | title | button) so the title stays
              centered on the container whether or not the Leave button is
              present — an equal-width empty spacer balances the button's cell. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div aria-hidden="true" />
            <h1 className="text-center text-2xl font-semibold tracking-tight">
              Clipboard Room
            </h1>
            {/* Only a joiner may Leave (forfeiting their slot). The creator
                cannot — leaving would orphan the room with no way back in — so
                they use "Remove room" in the creator panel instead. */}
            <div className="justify-self-end">
              {session.role === "joiner" && (
                <Hint text="Leave the room. Your slot is forfeited but still counts against the cap until the room expires.">
                  <Button variant="outline" size="sm" onClick={handleLeave}>
                    <LogOut /> Leave
                  </Button>
                </Hint>
              )}
            </div>
          </div>

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
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={histCanUndo(history)}
            canRedo={histCanRedo(history)}
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

          {/* Sharing is available to every member; room administration (roster
              + Remove room) stays creator-only. Both live below the editor. */}
          <ShareControls password={password} />

          {session.role === "creator" && (
            <CreatorPanel
              session={session}
              onStatus={setStatus}
              onSessionInvalid={handleSessionInvalid}
              onRemoveRoom={handleRemoveRoom}
              refreshSignal={rosterSignal}
            />
          )}

          <PrivacyHighlights />
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
          onGeneratePassword={handleGeneratePassword}
          showPassword={showPassword}
          onToggleShowPassword={() => setShowPassword((v) => !v)}
          sealedRoom={sealedRoom}
          onSealedRoomChange={setSealedRoom}
          capacity={capacity}
          onCapacityChange={setCapacity}
          syncMode={syncMode}
          onSyncModeChange={setSyncMode}
          advancedOpen={advancedOpen}
          onAdvancedOpenChange={setAdvancedOpen}
          busy={entryBusy}
          onCreate={() => void allocate("create", password)}
          onJoin={() => void allocate("join", password)}
          statusBanner={
            <StatusBanner kind={status.kind}>
              {status.message || (
                <>
                  <strong>Share text</strong> across <strong>any device</strong>
                  : Just <strong>create a room</strong> with password on one
                  device and <strong>join</strong> from another
                </>
              )}
            </StatusBanner>
          }
        />
      )}
    </div>
  );
}
