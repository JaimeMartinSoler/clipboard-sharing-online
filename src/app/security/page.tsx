import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ContentPage,
  ContentSection,
  TEXT_LINK_CLASS,
} from "@/components/content-page";
import { pageMetadata } from "@/lib/pages";
import { REPO_URL } from "@/lib/site";

export const metadata: Metadata = pageMetadata("/security/");

const SECURITY_DOC_URL = `${REPO_URL}/blob/main/docs/SECURITY.md`;

export default function SecurityPage() {
  return (
    <ContentPage
      icon={ShieldCheck}
      title="Security and threat model"
      lead="What the server and a database thief can see, what the design guarantees, and where it is weak — condensed from docs/SECURITY.md in the repository."
    >
      <ContentSection title="The claim, stated precisely">
        <p>
          &ldquo;Encrypted&rdquo; on most clipboard sites means TLS: the text is
          protected on the wire, then decrypted by the operator&apos;s server,
          which can read, log, retain or leak it. Our claim is stronger: the
          server receives only ciphertext and never any key or password, so it
          has nothing to decrypt with. TLS (with HSTS) remains, as a second
          layer.
        </p>
      </ContentSection>

      <ContentSection title="Construction">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <code>Argon2id(password, APP_SALT)</code>, m = 64 MiB, t = 3, p = 1,
            32-byte output, in the browser via WebAssembly.
          </li>
          <li>
            HKDF-SHA-256 with distinct info strings splits that into a 16-byte{" "}
            <code>room_id</code> (sent) and a non-extractable AES-GCM-256{" "}
            <code>CryptoKey</code> (never sent).
          </li>
          <li>
            Each push: a random 96-bit IV from{" "}
            <code>crypto.getRandomValues</code>; the upload is{" "}
            <code>{"{roomId, ciphertext, iv, ttlMs}"}</code>.
          </li>
          <li>
            Membership: a 256-bit random bearer token, returned once, held in
            memory only; the server stores its SHA-256.
          </li>
        </ul>
      </ContentSection>

      <ContentSection title="What the server sees">
        <p>
          <strong>Sees:</strong> room ids; ciphertext and IVs; ciphertext size
          and timing; created and expiry timestamps; each room&apos;s capacity,
          sealed flag and sync mode; member rows of id, role, token hash and
          join time. Client IPs are counted in memory by the rate limiter and
          never written to the database.
        </p>
        <p>
          <strong>Never sees:</strong> the password, the Argon2id output, the
          content key or the plaintext — including in live rooms, where the
          WebSocket frames carry the same ciphertext the database stores.
        </p>
      </ContentSection>

      <ContentSection title="An attacker with the entire database">
        <p>
          They get the ciphertext of rooms alive at that moment — an hour at
          most. They do not get a key. They do get an{" "}
          <strong>offline guessing oracle</strong>: for each candidate
          password, run Argon2id and HKDF and check whether the derived{" "}
          <code>room_id</code> is in the table. Because the salt is fixed and
          public (two devices share nothing but the password, so there is no
          per-user salt to exchange), one guess is tested against every room at
          once, and a precomputed dictionary works against every future dump.
        </p>
        <p>
          Argon2id makes each guess cost 64 MiB and three passes, and that is
          the whole defence. The built-in &ldquo;Safer&rdquo; generator gives
          roughly 100 bits (16 characters from 85 symbols) — out of reach. The
          default &ldquo;Simple&rdquo; one gives about 25 bits (four distinct
          letters, two distinct digits): fine against someone racing a sealed
          room in real time, <strong>not</strong> against an offline attacker
          with a GPU cluster. Token hashes are SHA-256 of 256-bit random values
          and grant nothing.
        </p>
      </ContentSection>

      <ContentSection title="What sealing buys, and what it doesn't">
        <p>
          A private room seals the moment it reaches capacity, and the flag is
          write-once. Legitimate devices join in seconds and cracking takes
          hours, so a password cracked or leaked later finds the room closed.
          It is access control, not cryptography: it does nothing for
          ciphertext already in a stolen database, lasts only as long as the
          room, and open rooms opt out of it.
        </p>
      </ContentSection>

      <ContentSection title="Known limitations">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Weak passwords lose</strong> — see above; nothing
            server-side fixes that.
          </li>
          <li>
            <strong>You trust the JavaScript we serve.</strong> A hostile build
            could exfiltrate plaintext. The CSP limits egress to our origin and
            Cloudflare Web Analytics, whose beacon script also runs in the page.
            It is not an XSS backstop: <code>script-src</code> allows{" "}
            <code>&apos;unsafe-inline&apos;</code>, which Next.js&apos;s static
            runtime requires.
          </li>
          <li>
            <strong>No freshness guarantee.</strong> GCM detects modification,
            but nothing binds a blob to a sequence number, so a malicious server
            could replay an older blob from the same room, or withhold it.
          </li>
          <li>
            <strong>Same password, same room.</strong> Anyone who knows the
            password while the room lives can join an unsealed room, or claim
            its last slot and lock you out.
          </li>
          <li>
            <strong>Self-lockout.</strong> Tokens live in memory, so a reload
            forfeits your slot in a sealed room.
          </li>
          <li>
            <strong>Out of scope:</strong> compromised devices or browser
            extensions, traffic analysis (who talked to which room id, how much,
            when), and share links or passwords sent over insecure channels — a
            share link is the password.
          </li>
        </ul>
      </ContentSection>

      <ContentSection title="Check it yourself">
        <p>
          Read the{" "}
          <a
            href={SECURITY_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={TEXT_LINK_CLASS}
          >
            full threat model
          </a>{" "}
          and the code in the{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={TEXT_LINK_CLASS}
          >
            repository
          </a>
          , then open your browser&apos;s Network tab while you use a room. The
          plain-language version is on{" "}
          <Link href="/privacy/" className={TEXT_LINK_CLASS}>
            the privacy page
          </Link>
          .
        </p>
      </ContentSection>
    </ContentPage>
  );
}
