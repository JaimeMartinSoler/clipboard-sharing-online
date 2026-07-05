"use client";

import { Eye, EyeOff, QrCode } from "lucide-react";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
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
 * - **Share link** — copies the auto-join link.
 * - **Show QR** — renders a scannable QR of the same link for phones.
 */
export function ShareControls({ password }: { password: string }) {
  const [showQr, setShowQr] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const shareUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const res = buildShareUrl(origin, password);
    return res.ok ? res.value : "";
  }, [password]);

  const qrMarkup = useMemo(
    () => (showQr && shareUrl ? qrSvg(shareUrl) : null),
    [showQr, shareUrl],
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Share controls</h2>
      </div>

      {/* Equal-width buttons: portrait splits the row into four equal columns;
          wider screens size all four to the widest so they never jump when a
          label changes (e.g. "Copy" → "Copied"). */}
      <div className="grid w-full grid-cols-2 gap-2 sm:inline-grid sm:grid-cols-4 sm:w-auto">
        <Hint text="Copy the room password to your clipboard without revealing it on screen.">
          <CopyButton
            value={password}
            label="Copy password"
            disabled={!password}
            variant="outline"
            className="w-full"
          />
        </Hint>
        <Hint text="Reveal the room password here so you can read it aloud or retype it on another device.">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setShowPassword((v) => !v)}
            disabled={!password}
          >
            {showPassword ? <EyeOff /> : <Eye />}
            {showPassword ? "Hide password" : "Show password"}
          </Button>
        </Hint>
        <Hint text="Copy the auto-join link. The password rides in the URL fragment (after #), which browsers never send to the server.">
          <CopyButton
            value={shareUrl}
            label="Share link"
            disabled={!shareUrl}
            variant="outline"
            className="w-full"
          />
        </Hint>
        <Hint text="Show a QR of the same link so a phone can join by scanning it.">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setShowQr((v) => !v)}
            disabled={!shareUrl}
          >
            <QrCode /> {showQr ? "Hide QR" : "Show QR"}
          </Button>
        </Hint>
      </div>

      {showPassword && password && (
        <p className="break-all rounded-md border bg-muted/40 p-3 text-center font-mono text-sm">
          {password}
        </p>
      )}

      {showQr &&
        (qrMarkup ? (
          <div className="flex flex-col items-center gap-2">
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
          <p className="text-xs text-muted-foreground">
            This link is too long to encode as a QR — use the Share link button
            instead.
          </p>
        ))}
    </section>
  );
}
