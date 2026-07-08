"use client";

import { Check, Copy, Eye, EyeOff, QrCode, Share2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { qrSvg } from "@/lib/qr";
import { buildShareUrl } from "@/lib/room-link";

/**
 * Password + link sharing, available to every member (creator and joiners) so
 * anyone can invite another device or re-copy the password. All of it is a
 * client-side convenience: the password never leaves the browser and the share
 * link carries it only in the URL *fragment* (after `#`), which browsers never
 * send to the server.
 *
 * - **Copy password** — writes the password to the clipboard without ever
 *   showing it on screen.
 * - **Show password** — reveals the password inline (like the QR reveal) for
 *   reading it aloud or retyping.
 * - **Share link** — opens the native share sheet on mobile (WhatsApp, copy,
 *   …), falling back to copying the auto-join link on desktop.
 * - **Show QR** — renders a scannable QR of the same link for phones.
 */
export function ShareControls({ password }: { password: string }) {
  const [showQr, setShowQr] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const shareUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const res = buildShareUrl(origin, password);
    return res.ok ? res.value : "";
  }, [password]);

  // Built whenever a link exists (not gated on `showQr`) so the reveal has
  // content to slide open — the Collapse keeps it mounted but height-clipped.
  const qrMarkup = useMemo(
    () => (shareUrl ? qrSvg(shareUrl) : null),
    [shareUrl],
  );

  const copy = useCallback(
    async (value: string, flash: (v: boolean) => void) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        flash(true);
        setTimeout(() => flash(false), 1500);
      } catch {
        // Clipboard API unavailable (e.g. insecure context) — fail quietly.
      }
    },
    [],
  );

  // Mobile-first: hand the link to the OS share sheet (WhatsApp, Messages,
  // "Copy", …). On desktop, where there's no share sheet, fall back to copy.
  const handleShareLink = useCallback(async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Clipboard Sharing Online",
          text: "Join my clipboard room:",
          url: shareUrl,
        });
      } catch {
        // User dismissed the share sheet (or it failed) — nothing to do.
      }
      return;
    }
    await copy(shareUrl, setLinkCopied);
  }, [shareUrl, copy]);

  return (
    // No parent `gap-*`: the reveals below animate open, so their spacing lives
    // inside the Collapse (a `mt-3` that eases in with the height) — otherwise a
    // zero-height collapsed reveal would still leave a flex gap behind it.
    <section className="flex flex-col rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Share options</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Invite another device to this room. <strong>Anyone with the password
          or link can join</strong> — only share it with people you trust.
        </p>

        {/* Buttons: icon pinned to the left, label centered in the remaining
            space. Portrait splits the row into two equal columns; wider screens
            size all four to the widest so they never jump when a label changes
            (e.g. "Copy password" → "Copied"). */}
        <div className="grid w-full grid-cols-2 gap-2 sm:inline-grid sm:grid-cols-4 sm:w-auto">
          <ShareButton
            hint="Copy the room password to your clipboard without revealing it on screen."
            icon={passwordCopied ? <Check /> : <Copy />}
            label={passwordCopied ? "Copied" : "Copy password"}
            onClick={() => void copy(password, setPasswordCopied)}
            disabled={!password}
          />
          <ShareButton
            hint="Reveal the room password here so you can read it aloud or retype it on another device."
            icon={showPassword ? <EyeOff /> : <Eye />}
            label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            disabled={!password}
          />
          <ShareButton
            hint="Share the auto-join link — the phone share sheet on mobile, or copy on desktop. The password rides in the URL fragment (after #), which browsers never send to the server."
            icon={linkCopied ? <Check /> : <Share2 />}
            label={linkCopied ? "Copied" : "Share link"}
            onClick={() => void handleShareLink()}
            disabled={!shareUrl}
          />
          <ShareButton
            hint="Show a QR of the same link so a phone can join by scanning it."
            icon={<QrCode />}
            label={showQr ? "Hide QR" : "Show QR"}
            onClick={() => setShowQr((v) => !v)}
            disabled={!shareUrl}
          />
        </div>
      </div>

      <Collapse open={showPassword && !!password}>
        <p className="mt-3 break-all rounded-md border bg-muted/40 p-3 text-center font-mono text-sm">
          {password}
        </p>
      </Collapse>

      <Collapse open={showQr}>
        {qrMarkup ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            <div
              className="h-48 w-48 rounded-md border bg-white p-2"
              // Inline SVG only — no external refs, safe under the strict CSP.
              dangerouslySetInnerHTML={{ __html: qrMarkup }}
            />
            <span className="break-all text-center text-xs text-muted-foreground">
              {shareUrl}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            This link is too long to encode as a QR — use the Share link button
            instead.
          </p>
        )}
      </Collapse>
    </section>
  );
}

/**
 * A Share-options button: the icon is pinned to the left and the label is
 * centered in the remaining width (`justify-start` + a flex-1 centered label),
 * so the four buttons read as a tidy column of centered labels.
 */
function ShareButton({
  hint,
  icon,
  label,
  onClick,
  disabled,
}: {
  hint: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Hint text={hint}>
      <Button
        size="sm"
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
        <span className="flex-1 text-center">{label}</span>
      </Button>
    </Hint>
  );
}
