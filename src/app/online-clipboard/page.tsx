import { ClipboardCopy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ContentPage,
  ContentSection,
  StartSharingCta,
  TEXT_LINK_CLASS,
} from "@/components/content-page";
import { pageMetadata } from "@/lib/pages";

export const metadata: Metadata = pageMetadata("/online-clipboard/");

export default function OnlineClipboardPage() {
  return (
    <ContentPage
      icon={ClipboardCopy}
      title="A free online clipboard that can't read your text"
      lead="An online clipboard is a place on the web to drop text on one device and pick it up on another. This one encrypts the text before it leaves your browser, and forgets it within the hour."
    >
      <ContentSection title="What an online clipboard is for">
        <p>
          Your device&apos;s clipboard only lives on that device. An online
          clipboard stretches it across devices: copy on one, paste on
          another, with the web in between. It&apos;s the tool you reach for
          when the text is too short to be worth a file, too awkward to retype,
          and not something you want sitting in your email.
        </p>
        <p>
          The catch with most online clipboards is the bit in the middle. Your
          text is stored on someone else&apos;s server, and &ldquo;secure&rdquo;
          usually means only that it travelled there over HTTPS. Once it
          arrives, the service can read it — and so can anyone who breaches
          it, subpoenas it or simply guesses the short link it lives at.
        </p>
      </ContentSection>

      <ContentSection title="How this one is different">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Encrypted before upload.</strong> Text is encrypted with
            AES-GCM-256 in your browser. The server stores a blob it has no key
            for.
          </li>
          <li>
            <strong>No public link to guess.</strong> There is no paste URL.
            Devices find each other through a room id derived from a shared
            password, and knowing the id alone still doesn&apos;t decrypt
            anything.
          </li>
          <li>
            <strong>No account.</strong> No email, no login, no profile — the
            password is the only thing you share.
          </li>
          <li>
            <strong>Short-lived.</strong> Content expires 10 minutes after the
            last push by default. The room creator can choose 1 minute or 1
            hour, and nothing lives longer than that.
          </li>
          <li>
            <strong>No cookies.</strong> Preferences such as the theme stay in
            your browser&apos;s local storage, and the analytics are cookieless.
          </li>
        </ul>
      </ContentSection>

      <ContentSection title="What you can do with it">
        <p>
          Paste anything you can express as text — up to 256 KB of it once
          encrypted, which is room for a long document. The editor has
          undo and redo, copy and paste buttons, and three ways to move
          content between devices:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Broadcast</strong> (the default): you press Push, and every
            other device in the room receives it instantly.
          </li>
          <li>
            <strong>Sync</strong>: text pushes itself while you type, for a
            shared scratchpad that stays in step.
          </li>
          <li>
            <strong>Manual</strong>: explicit Push and Pull, with no live
            connection at all.
          </li>
        </ul>
        <p>
          A room holds two devices by default, up to six if you raise the
          limit, or any number as an open room. To bring a device in, share
          the password, send a join link, or show a QR code.
        </p>
      </ContentSection>

      <ContentSection title="What it is not">
        <p>
          It is not a pastebin for publishing text to the world, not a notes
          app and not a file-transfer service. There is no history to scroll
          back through, no folder of old clips and no upload button for photos
          or documents — text only. Everything is designed to disappear, which
          is exactly what you want from something that carries passwords,
          codes and addresses.
        </p>
        <p>
          If you need a permanent record, paste the text somewhere permanent
          once it arrives. If you need it gone, it already will be.
        </p>
      </ContentSection>

      <ContentSection title="Free, and open source">
        <p>
          There&apos;s no paid tier, no ads, and nothing to sign up for. The
          whole thing is open source, so the claims on this page are checkable
          rather than promises. The{" "}
          <Link href="/how-it-works/" className={TEXT_LINK_CLASS}>
            how it works
          </Link>{" "}
          guide explains the steps in plain language, and the{" "}
          <Link href="/security/" className={TEXT_LINK_CLASS}>
            security page
          </Link>{" "}
          covers the cryptography and its limits.
        </p>
      </ContentSection>

      <StartSharingCta heading="Use the online clipboard">
        Create a room with a password, open the same page on your other
        device, and join it.
      </StartSharingCta>
    </ContentPage>
  );
}
