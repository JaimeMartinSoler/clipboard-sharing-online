import { Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ContentPage,
  ContentSection,
  StartSharingCta,
  TEXT_LINK_CLASS,
} from "@/components/content-page";
import { pageMetadata } from "@/lib/pages";

export const metadata: Metadata = pageMetadata("/how-it-works/");

export default function HowItWorksPage() {
  return (
    <ContentPage
      icon={Workflow}
      title="How it works, step by step"
      lead="Two devices that have never met, no accounts, and a server that can't read what passes through it. Here is what happens between typing a password and seeing your text on the other screen."
    >
      <ContentSection title="1. Your password becomes two separate things">
        <p>
          When you press Create or Join, your browser runs the password through{" "}
          <strong>Argon2id</strong>, a function built to be slow and
          memory-hungry on purpose: it needs 64 MiB of memory for every
          attempt. You wait a moment once; someone trying millions of guesses
          pays that price millions of times.
        </p>
        <p>
          The result is then split in two with <strong>HKDF</strong>. Think of a
          locker: one half becomes the <strong>locker number</strong> (the room
          id), the other becomes the <strong>key</strong> (the encryption key).
          The two are unrelated, so knowing the number tells you nothing about
          the key. Only the number is ever sent to the server — the key and the
          password stay in your browser.
        </p>
      </ContentSection>

      <ContentSection title="2. The same password finds the same room">
        <p>
          The other device does exactly the same calculation. Same password in,
          same locker number and same key out, so both devices arrive at the
          same room without exchanging anything else — no account, no invite,
          no room code.
        </p>
        <p>
          The flip side: anyone who types the same password while the room
          exists arrives at the same room. That is why the app rejects weak
          passwords, offers random ones, and lets private rooms lock themselves
          once full (step 3).
        </p>
      </ContentSection>

      <ContentSection title="3. Joining gets you a pass, not an account">
        <p>
          When a device creates or joins a room, the server hands it a random
          membership token — a pass that every later request must show. The
          server keeps only a <strong>scrambled fingerprint</strong> of each
          pass (a SHA-256 hash), never the pass itself. Your browser keeps the
          pass in memory only, so a reload or closed tab gives it up.
        </p>
        <p>
          A private room admits the number of devices its creator chose (two by
          default) and then <strong>seals</strong> for good. Someone who learns
          the password afterwards finds the door locked, even if a member
          leaves.
        </p>
      </ContentSection>

      <ContentSection title="4. Sending: lock the box, then post it">
        <p>
          When you push, your browser encrypts the text with{" "}
          <strong>AES-GCM-256</strong> using the key from step 1 and a fresh
          random number (a nonce) drawn for every push. Only then does anything
          go over the network: the room id, the scrambled text and the nonce,
          with your pass and the expiry setting alongside.
        </p>
        <p>
          AES-GCM also seals the box. If anyone changes even one byte of the
          stored ciphertext, the receiving device refuses to open it rather
          than show you altered text.
        </p>
      </ContentSection>

      <ContentSection title="5. Receiving: open it on the other side">
        <p>
          In live rooms, the server forwards the encrypted blob to the other
          devices over a WebSocket the moment it lands. In Manual rooms,
          they press Pull to fetch it. Either way, the other device decrypts it
          locally with its own copy of the key. The server only ever relays and
          stores the locked box.
        </p>
      </ContentSection>

      <ContentSection title="6. Then it disappears">
        <p>
          Every room has a timer: 10 minutes after it was created or last
          pushed to by default, 1 hour at most. When it runs out, the room, its
          members and its content expire together — deleted the next time
          anyone asks for them, and by a cleanup job every 5 minutes. The room
          creator can also remove everything at once.
        </p>
      </ContentSection>

      <ContentSection title="The shortcut: links and QR codes">
        <p>
          Typing a password twice is the slow path. Share link and Show QR
          create a link with the password tucked after the <code>#</code>. That
          part of a web address stays in the browser — it is not sent to the
          server — and the app wipes it from the address bar once it has
          joined. Treat the link like the password itself: whoever has it can
          get in.
        </p>
        <p>
          For the cryptography in full, including what an attacker with our
          database would get, read the{" "}
          <Link href="/security/" className={TEXT_LINK_CLASS}>
            security and threat model
          </Link>
          .
        </p>
      </ContentSection>

      <StartSharingCta heading="Try it with two devices" />
    </ContentPage>
  );
}
