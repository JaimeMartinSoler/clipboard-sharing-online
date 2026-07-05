import {
  Code,
  Hourglass,
  KeyRound,
  Lock,
  LockKeyhole,
  SearchCode,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy & Security",
  description:
    "How Clipboard Sharing Online keeps your data private: end-to-end encryption in the browser, a zero-knowledge server, private rooms that seal when full, and short-lived storage.",
  alternates: { canonical: "/privacy/" },
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 font-medium">
        <Icon className="size-4 shrink-0" />
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-center gap-3">
        <Lock className="size-6" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Privacy &amp; Security
        </h1>
      </div>

      <p className="text-center text-muted-foreground">
        Security is the product. Your text is encrypted on your device before it
        is ever sent, and the server has no way to read it. This isn&apos;t a
        policy promise — it&apos;s how the app is built.
      </p>

      <div className="space-y-3">
        <Section
          icon={LockKeyhole}
          title="Clipboard text is encrypted in your browser"
        >
          Text is encrypted client-side with AES-GCM-256 before any network
          call. The server stores only an opaque room id, the ciphertext, the
          nonce, and timestamps — never the plaintext or any key that could
          decrypt it. Live rooms change nothing: the real-time connection
          delivers the same ciphertext, which is decrypted on your device when
          it arrives.
        </Section>

        <Section icon={KeyRound} title="Password is never sent nor stored">
          Your password and every key derived from it never leave this browser.
          Two devices that type the same password independently derive the same
          room id and encryption key (Argon2id + HKDF) — nothing else is
          exchanged: no accounts, no room codes, and the password is never
          persisted anywhere, not even on this device. Because the only shared
          secret is the password, a weak password is the dominant risk: use a
          long, high-entropy passphrase shared over a channel you trust.
        </Section>

        <Section icon={Users} title="Rooms can be private">
          A private room is capped at the number of terminals you choose
          (default 2) and is permanently <strong>sealed</strong> once full — no
          one else can join that room instance. If the legitimate devices seal
          the room first, someone who cracks the password later finds it sealed
          and is locked out. Slots are strict: your membership lives only in
          the page while it&apos;s open, so a reload or closed tab forfeits its
          slot — and it still counts against the cap. Keep your tabs open and
          set the terminal count to match the devices you actually use. This is
          access control layered on top of the encryption, never a substitute
          for it.
        </Section>

        <Section icon={Code} title="Highly configurable but simple by default">
          Type a password and hit Create or Join — the defaults just work.
          When you want more, Advanced Settings lets the creator choose a
          Private room (seals when full) or a Public one (anyone with the
          password can keep joining), how many terminals may share it, and the
          sharing mode: manual Push/Pull, instant push over a live connection,
          or auto-sync while typing. None of these options touch the
          encryption — they only shape how the room is accessed and synced.
        </Section>

        <Section icon={Hourglass} title="Ephemeral by default">
          Rooms, memberships, and blobs auto-expire after a short TTL (default
          10 minutes) and are removed both lazily on read and by a cleanup
          cron.
          <strong> Clear</strong> deletes the shared content immediately.
        </Section>

        <Section icon={SearchCode} title="Verify it yourself">
          Open your browser&apos;s Network tab and watch the requests: only an
          opaque id, ciphertext, a nonce, and an opaque membership token ever
          go out. In a live room you&apos;ll also see one WebSocket to this
          same origin — inspect its frames: ciphertext in, a literal
          &quot;ping&quot; out. Your password and plaintext never appear on the
          wire. A strict Content-Security-Policy blocks any third-party egress.
        </Section>
      </div>
    </div>
  );
}
