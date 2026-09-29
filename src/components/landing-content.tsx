import {
  ClipboardList,
  Github,
  Lightbulb,
  ListOrdered,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import {
  ContentSection,
  TEXT_LINK_CLASS,
} from "@/components/content-page";
import { FaqSection } from "@/components/faq-section";
import { buttonVariants } from "@/components/ui/button";
import { REPO_URL } from "@/lib/site";

const USE_CASES = [
  {
    title: "A URL from your phone to your laptop",
    body: "You found the article on your phone; you want to read it on the big screen. Paste, push, open.",
  },
  {
    title: "A 2FA backup code",
    body: "Move a recovery code between devices without it sitting in your email, chat history or a cloud note.",
  },
  {
    title: "An address",
    body: "Send the delivery or meeting address from your desktop to the phone that's about to open the maps app.",
  },
  {
    title: "A long command onto a remote box",
    body: "Open the page in the remote machine's browser and paste a long command or config snippet instead of retyping it.",
  },
  {
    title: "Text off a work machine",
    body: "Get a snippet from a locked-down work laptop to your own device with nothing to install and no account to sign in to.",
  },
  {
    title: "A Wi-Fi password for a guest",
    body: "Show the room's QR code and the long Wi-Fi key lands on their phone — no spelling it out character by character.",
  },
];

/**
 * Static, crawlable homepage content rendered BELOW the app. The app wrapper in
 * `src/app/page.tsx` claims the whole first screen (`min-h-full`), so this
 * section only ever starts under the fold — the Create/Join entry view stays
 * the only thing visible on load. Everything here is server-rendered markup: no
 * client state, no network, no third-party anything.
 */
export function LandingContent() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pt-16">
      <ContentSection title="What is Clipboard Sharing Online?" icon={ClipboardList}>
        <p>
          Clipboard Sharing Online moves text from one device to another through
          your browser. Open this page on two devices — say your phone and your
          laptop — type the same password on both, and whatever you push on one
          appears on the other. No app to install, no account, no emailing
          yourself.
        </p>
        <p>
          The text is encrypted on the device you send it from and decrypted on
          the device that receives it. In between, our server holds only
          ciphertext it has no key for, and deletes it within minutes: 10 by
          default, an hour at most.
        </p>
        <p>
          It is built for the small, constant friction of owning more than one
          device: the link on your phone you want on your monitor, the snippet
          on your work laptop you need on your own.
        </p>
      </ContentSection>

      <ContentSection title="How it works" icon={ListOrdered}>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Create a room.</strong> On the first device, type a
            password (or let the app generate one) and press{" "}
            <strong>Create room</strong>.
          </li>
          <li>
            <strong>Join from the other device.</strong> Open this site there,
            type the same password and press <strong>Join room</strong>. Easier
            still: on the first device use <strong>Share link</strong> or{" "}
            <strong>Show QR</strong> — opening the link or scanning the code
            joins the room automatically, with the password carried in the part
            of the link after <code>#</code>, which browsers never send to a
            server.
          </li>
          <li>
            <strong>Type or paste.</strong> Put your text in the room&apos;s
            editor and press <strong>Push</strong>.
          </li>
          <li>
            <strong>It appears on the other device.</strong> By default it
            arrives instantly; in Manual rooms the other side presses{" "}
            <strong>Pull</strong>. Copy it and you&apos;re done — the room
            expires on its own.
          </li>
        </ol>
      </ContentSection>

      <ContentSection
        title="Why this is different from other online clipboards"
        icon={ShieldCheck}
      >
        <p>
          Almost every online clipboard says it is &ldquo;encrypted&rdquo;.
          Usually that means <strong>TLS</strong> — the padlock in your address
          bar — which protects your text on its way to their server. When it
          arrives, their server decrypts it and stores or relays it in a form
          they can read. That is <em>encryption in transit</em>: you are
          trusting the operator, their logs, their staff and anyone who ever
          breaches them.
        </p>
        <p>
          Here the text is encrypted <strong>before it leaves your
          device</strong>, with a key the server never receives. Our server
          holds ciphertext it is mathematically unable to decrypt — not because
          of a policy, but because it never has the key. Concretely, and all of
          it checkable in the source:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Your password is stretched with <strong>Argon2id</strong> (64 MiB of
            memory, 3 passes) in your browser, so every password guess costs
            real memory and time.
          </li>
          <li>
            <strong>HKDF</strong> splits the result into two independent values:
            an opaque <strong>room id</strong> — the only thing sent to the
            server, to find your room — and an <strong>AES-GCM-256</strong>{" "}
            content key that never leaves the browser. Your password never
            leaves it either.
          </li>
          <li>
            Every push is encrypted with a fresh random 96-bit nonce. GCM is
            authenticated: if anyone, us included, tampered with the stored
            ciphertext, decryption would fail rather than show you altered text.
          </li>
          <li>
            The server stores only the room id, the ciphertext, its nonce,
            timestamps and a few room settings. Devices prove membership with a
            random token that the server keeps <strong>only as a SHA-256
            hash</strong>.
          </li>
          <li>
            <strong>Private rooms seal when full</strong>, so a password that
            leaks later can&apos;t get in, and every room{" "}
            <strong>auto-expires</strong> — 10 minutes by default, 1 hour at
            most.
          </li>
          <li>
            The code is <strong>open source</strong>, and a strict
            Content-Security-Policy lets the page connect only to our own origin
            (the API and its live-sync WebSocket) and to Cloudflare Web
            Analytics, a cookieless page-view beacon — no other third party.
          </li>
        </ul>
        <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-foreground" />
          <p>
            <strong>The honest caveat.</strong> Two devices meet on the password
            alone, so key derivation uses a fixed, public salt rather than a
            random per-user one. Someone who stole the database could therefore
            guess passwords offline, and each guess is tested against every room
            at once. Argon2id makes every guess expensive and rooms vanish within
            an hour, but a weak password is still the biggest risk — which is why
            the app refuses weak passwords and can generate a random one. The{" "}
            <Link href="/security/" className={TEXT_LINK_CLASS}>
              security page
            </Link>{" "}
            covers the full threat model.
          </p>
        </div>
      </ContentSection>

      <ContentSection title="Use cases" icon={Lightbulb}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {USE_CASES.map((useCase) => (
            <li key={useCase.title} className="rounded-md border p-3">
              <h3 className="font-medium text-foreground">{useCase.title}</h3>
              <p className="mt-1">{useCase.body}</p>
            </li>
          ))}
        </ul>
        <p>
          Moving text between a phone and a computer?{" "}
          <Link
            href="/share-text-between-phone-and-pc/"
            className={TEXT_LINK_CLASS}
          >
            Here&apos;s the quickest way
          </Link>
          .
        </p>
      </ContentSection>

      <FaqSection />

      <ContentSection title="Open source — check it yourself" icon={Github}>
        <p>
          Don&apos;t take our word for any of this. Every line of the app, the
          API and the encryption is public: read it, run it, and open your
          browser&apos;s Network tab to see that nothing leaves the page but an
          opaque room id, ciphertext, its nonce, a membership token and a few
          room settings — plus Cloudflare&apos;s page-view beacon.
        </p>
        <div className="flex justify-center">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "sm" })}
          >
            <Github /> Source on GitHub
          </a>
        </div>
      </ContentSection>
    </div>
  );
}
