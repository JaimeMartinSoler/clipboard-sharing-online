"use client";

import {
  Download,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { E2EBadge } from "@/components/e2e-badge";
import { Hint } from "@/components/hint";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import {
  type BannerKind,
  StatusBanner,
} from "@/components/status-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  clearClipboard,
  joinRoom,
  pullClipboard,
  pushClipboard,
} from "@/lib/api";
import { decrypt, deriveKeys, encrypt } from "@/lib/crypto";

interface Session {
  roomId: string;
  token: string;
  contentKey: CryptoKey;
  slot: number;
  capacity: number;
  sealed: boolean;
}

interface Status {
  kind: BannerKind;
  message: string;
}

const TTL_OPTIONS = [
  { label: "1 minute", ms: 60_000 },
  { label: "10 minutes", ms: 600_000 },
  { label: "1 hour", ms: 3_600_000 },
] as const;

const CAPACITY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipboardTool() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capacity, setCapacity] = useState(2);
  const [ttlMs, setTtlMs] = useState<number>(600_000);
  const [text, setText] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<null | "join" | "push" | "pull" | "clear">(
    null,
  );
  const [status, setStatus] = useState<Status>({
    kind: "info",
    message: "Enter a shared password and join a room to start.",
  });

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second only while there is a countdown to render.
  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const joined = session !== null;
  const remaining = expiresAt === null ? null : expiresAt - now;

  const dropSession = useCallback(() => {
    setSession(null);
    setExpiresAt(null);
  }, []);

  const handleJoin = useCallback(async () => {
    setBusy("join");
    try {
      const keys = await deriveKeys(password);
      if (!keys.ok) {
        setStatus({ kind: "error", message: keys.error });
        return;
      }
      const res = await joinRoom(keys.value.roomId, capacity);
      if (!res.ok) {
        const kind: BannerKind =
          res.error === ApiError.SEALED ? "warning" : "error";
        setStatus({ kind, message: res.error });
        return;
      }
      const { token, joined: slot, capacity: cap, sealed } = res.value;
      setSession({
        roomId: keys.value.roomId,
        token,
        contentKey: keys.value.contentKey,
        slot,
        capacity: cap,
        sealed,
      });
      setStatus(
        sealed
          ? {
              kind: "validated",
              message: `Room sealed (${slot}/${cap}) — sharing is locked to these terminals.`,
            }
          : {
              kind: "info",
              message: `Joined as terminal ${slot} of ${cap} — waiting for ${cap - slot} more.`,
            },
      );
    } finally {
      setBusy(null);
    }
  }, [password, capacity]);

  const handleLeave = useCallback(() => {
    dropSession();
    setStatus({
      kind: "info",
      message:
        "Left the room — your slot is forfeited (it still counts until the room expires).",
    });
  }, [dropSession]);

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
        if (res.error === ApiError.SLOT_LOST) dropSession();
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

  const handleClear = useCallback(async () => {
    if (!session) return;
    setBusy("clear");
    try {
      const res = await clearClipboard(session.roomId, session.token);
      if (!res.ok) {
        if (res.error === ApiError.SLOT_LOST) dropSession();
        setStatus({ kind: "error", message: slotLostCopy(res.error) });
        return;
      }
      setExpiresAt(null);
      setStatus({
        kind: "info",
        message: "Cleared the room's content on the server.",
      });
    } finally {
      setBusy(null);
    }
  }, [session, dropSession]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Clipboard Sharing Online
        </h1>
        <p className="text-sm text-muted-foreground">
          Type the same password on two devices, then Push on one and Pull on
          the other. Text is encrypted in your browser; the server only ever
          stores ciphertext it cannot read.
        </p>
        <div>
          <E2EBadge />
        </div>
      </div>

      {/* Join panel */}
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <label htmlFor="password" className="text-sm font-medium">
          Shared password
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              placeholder="A long passphrase you share out-of-band"
              value={password}
              disabled={joined || busy === "join"}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-9"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>
        <PasswordStrengthMeter password={password} />

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Terminals
            <Hint text="How many devices may share this room. The room seals at this count; set it once, on the first join.">
              <Select
                value={capacity}
                disabled={joined}
                onChange={(e) => setCapacity(Number(e.target.value))}
                aria-label="Terminals"
              >
                {CAPACITY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Hint>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Expiry
            <Hint text="How long a pushed blob lives on the server. Shorter is safer.">
              <Select
                value={ttlMs}
                onChange={(e) => setTtlMs(Number(e.target.value))}
                aria-label="Expiry"
              >
                {TTL_OPTIONS.map((o) => (
                  <option key={o.ms} value={o.ms}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Hint>
          </label>

          <div className="ml-auto flex items-center gap-2">
            {joined ? (
              <Hint text="Leave the room. Your slot is forfeited but still counts against the cap until the room expires.">
                <Button variant="outline" size="sm" onClick={handleLeave}>
                  <LogOut /> Leave
                </Button>
              </Hint>
            ) : (
              <Button
                size="sm"
                onClick={handleJoin}
                disabled={password.length === 0 || busy === "join"}
              >
                <LogIn /> {busy === "join" ? "Joining…" : "Join"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Always-on status line */}
      <StatusBanner kind={status.kind}>
        {status.message}
        {remaining !== null && (
          <span className="ml-1 tabular-nums">
            {" "}
            · expires in {formatRemaining(remaining)}
          </span>
        )}
      </StatusBanner>

      {/* Editor + actions */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Text</h2>
          <div className="flex items-center gap-2">
            <CopyButton value={text} disabled={!joined} />
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste the text to share…"
          spellCheck={false}
          className="min-h-60 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            disabled={!joined || busy !== null}
            onClick={handlePush}
            hint="Encrypt this text in your browser and upload it, replacing the room's blob."
            icon={<Upload />}
            label={busy === "push" ? "Pushing…" : "Push"}
          />
          <ActionButton
            disabled={!joined || busy !== null}
            onClick={handlePull}
            hint="Download the room's blob and decrypt it here. A wrong password simply fails to decrypt."
            icon={<Download />}
            label={busy === "pull" ? "Pulling…" : "Pull"}
            variant="outline"
          />
          <ActionButton
            disabled={!joined || busy !== null}
            onClick={handleClear}
            hint="Delete the shared content from the server immediately."
            icon={<Trash2 />}
            label="Clear"
            variant="outline"
          />
        </div>
      </section>
    </div>
  );
}

/** Push/Pull/Clear share the disabled-with-hint pattern. */
function ActionButton({
  disabled,
  onClick,
  hint,
  icon,
  label,
  variant = "default",
}: {
  disabled: boolean;
  onClick: () => void;
  hint: string;
  icon: React.ReactNode;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <Hint text={hint}>
      <Button size="sm" variant={variant} onClick={onClick} disabled={disabled}>
        {icon} {label}
      </Button>
    </Hint>
  );
}

/** Replace the generic 401 copy with the strict-slot lockout wording. */
function slotLostCopy(error: string): string {
  return error === ApiError.SLOT_LOST
    ? "Your slot was lost (reload/closed) — locked out until this room expires."
    : error;
}
