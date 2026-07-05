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
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 font-medium">
        <Icon className="size-4 shrink-0" />
        {title}
      </h2>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
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
        <strong>Security is the product.</strong> Your text is encrypted on your
        device <strong>before</strong> it is ever sent, and the server has no
        way to read it. This isn&apos;t a policy promise — it&apos;s how the app
        is built.
      </p>

      <div className="space-y-3">
        <Section
          icon={LockKeyhole}
          title="Clipboard text is encrypted in your browser"
        >
          <p>
            Text is encrypted client-side with{" "}
            <strong>AES-GCM-256</strong> before any network call. The server
            only ever holds:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>An opaque room id.</li>
            <li>The ciphertext and its nonce.</li>
            <li>Timestamps.</li>
          </ul>
          <p>
            It <strong>never</strong> sees the plaintext or any key that could
            decrypt it. Live rooms change nothing — the real-time connection
            carries the <strong>same ciphertext</strong>, decrypted only on your
            device when it arrives.
          </p>
        </Section>

        <Section icon={KeyRound} title="Password is never sent nor stored">
          <p>
            Your password and every key derived from it{" "}
            <strong>never leave this browser</strong>. Two devices that type the
            same password independently derive the same room id and encryption
            key (<strong>Argon2id + HKDF</strong>) — nothing else is exchanged:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>No accounts.</li>
            <li>No room codes.</li>
            <li>
              The password is <strong>never persisted</strong> anywhere, not
              even on this device.
            </li>
          </ul>
          <p>
            Because the only shared secret is the password, a{" "}
            <strong>weak password is the dominant risk</strong>: use a long,
            high-entropy passphrase shared over a channel you trust.
          </p>
        </Section>

        <Section icon={Users} title="Rooms can be private">
          <p>
            A private room is capped at the number of terminals you choose
            (default 2) and is <strong>permanently sealed</strong> once full —
            no one else can join that room instance.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Seal first, lock attackers out.</strong> If the legitimate
              devices fill the room, someone who cracks the password later finds
              it sealed.
            </li>
            <li>
              <strong>Slots are strict.</strong> Your membership lives only in
              the open page, so a reload or closed tab forfeits its slot — and
              it still counts against the cap. Keep your tabs open and set the
              terminal count to match the devices you actually use.
            </li>
          </ul>
          <p>
            This is <strong>access control layered on top of</strong> the
            encryption, never a substitute for it.
          </p>
        </Section>

        <Section icon={Code} title="Highly configurable but simple by default">
          <p>
            Type a password and hit <strong>Create</strong> or{" "}
            <strong>Join</strong> — the defaults just work. When you want more,{" "}
            <strong>Advanced Settings</strong> exposes three knobs, none of
            which touch the encryption:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Room type</strong> —{" "}
              <strong>Private</strong> seals when full so no one else can enter,
              while <strong>Public</strong> stays open for anyone with the
              password to keep joining.
            </li>
            <li>
              <strong>Terminals</strong> — how many devices may share the room
              (default 2).
            </li>
            <li>
              <strong>Sharing mode</strong> — how content moves between members:
              <ul className="mt-1 list-[circle] space-y-1 pl-5">
                <li>
                  <strong>Manual</strong> — explicit{" "}
                  <strong>Push</strong>/<strong>Pull</strong> buttons only; no
                  live connection is ever opened.
                </li>
                <li>
                  <strong>Broadcast</strong> — you still Push explicitly, but the
                  other members receive it <strong>instantly</strong> over a live
                  connection.
                </li>
                <li>
                  <strong>Sync</strong> — content <strong>auto-pushes while you
                  type</strong> (the Push button becomes &quot;Sync now&quot;).
                </li>
              </ul>
            </li>
          </ul>
          <p>
            These options only shape how the room is{" "}
            <strong>accessed and synced</strong> — the content encryption is
            identical in every mode.
          </p>
        </Section>

        <Section icon={Hourglass} title="Ephemeral by default">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Rooms, memberships, and blobs <strong>auto-expire</strong> after a
              short TTL (default 10 minutes).
            </li>
            <li>
              Expired data is removed both <strong>lazily on read</strong> and
              by a <strong>cleanup cron</strong>.
            </li>
            <li>
              <strong>Clear</strong> deletes the shared content immediately.
            </li>
          </ul>
        </Section>

        <Section icon={SearchCode} title="Verify it yourself">
          <p>
            Open your browser&apos;s <strong>Network tab</strong> and watch the
            requests — only an <strong>opaque id</strong>, the{" "}
            <strong>ciphertext</strong>, a <strong>nonce</strong>, and an{" "}
            <strong>opaque membership token</strong> ever go out.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              In a live room you&apos;ll also see one <strong>WebSocket</strong>{" "}
              to this same origin — inspect its frames: ciphertext in, a literal
              &quot;ping&quot; out.
            </li>
            <li>
              Your <strong>password and plaintext never appear on the
              wire</strong>.
            </li>
            <li>
              A strict <strong>Content-Security-Policy</strong> blocks any
              third-party egress.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
