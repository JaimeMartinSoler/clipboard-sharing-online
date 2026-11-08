import { MonitorSmartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ContentPage,
  ContentSection,
  OpenClipboardButton,
  TEXT_LINK_CLASS,
} from "@/components/content-page";
import { pageMetadata } from "@/lib/pages";

export const metadata: Metadata = pageMetadata(
  "/share-text-between-phone-and-pc/",
);

export default function PhoneToPcPage() {
  return (
    <ContentPage
      icon={MonitorSmartphone}
      title={
        <>
          Share text between{" "}
          {/* Portrait phones wrap after "between" so the second line isn't a
              lone "PC". */}
          <br className="sm:hidden" />
          phone and PC
        </>
      }
      lead="The quickest way to get a link, a code or a paragraph from your phone onto your computer — or back again — without installing an app or signing in to anything."
    >
      <ContentSection title="Phone to PC in under a minute">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>On the PC</strong>, open this site and press{" "}
            <strong>Create room</strong>. A random password is already filled
            in for you.
          </li>
          <li>
            Press <strong>Show QR</strong> and point your phone&apos;s camera at
            it. The link opens in the phone&apos;s browser and joins the room on
            its own — no typing.
          </li>
          <li>
            <strong>On the phone</strong>, paste your text into the box and
            press <strong>Push</strong>.
          </li>
          <li>
            It appears on the PC straight away. Press <strong>Copy</strong>{" "}
            and paste it wherever you need it.
          </li>
        </ol>
        <p>
          Going the other way is identical: create the room on the phone, join
          from the PC. If the camera isn&apos;t handy, type the password on the
          second device and press <strong>Join room</strong> — the default
          &ldquo;Simple&rdquo; passwords are six characters, easy to read off one
          screen and type on another.
        </p>
        <div className="flex justify-center pt-1">
          <OpenClipboardButton />
        </div>
      </ContentSection>

      <ContentSection title="Any phone, any computer">
        <p>
          It is a web page, so the only requirement is a modern browser. iPhone
          to Windows, Android to Mac, iPad to a Linux box — any combination
          works, because neither side needs to know what the other one is.
          There&apos;s no app store listing, no browser extension and no account
          to create.
        </p>
      </ContentSection>

      <ContentSection title="No Google, Apple or Microsoft account needed">
        <p>
          The usual workarounds all go through an account: emailing or
          messaging the text to yourself, pasting it into a cloud notes app, or
          a phone maker&apos;s clipboard sync, which usually needs both devices
          signed in to the same ecosystem. Each one keeps a copy in a history
          you don&apos;t control, tied to your identity.
        </p>
        <p>
          Here there is nothing to sign in to. The two devices meet on a shared
          password, our server stores only ciphertext it can&apos;t read, and
          the room is deleted within minutes. No cookies are set; the only
          third-party request is Cloudflare&apos;s cookieless page-view beacon.
        </p>
      </ContentSection>

      <ContentSection title="Tips for a smooth hand-off">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Keep both tabs open.</strong> Your place in the room lives
            only in the open page. Reloading or closing it gives up that slot,
            and a private room won&apos;t hand it out again.
          </li>
          <li>
            <strong>Need it both ways, live?</strong> Under Advanced Settings,
            choose the <strong>Sync</strong> sharing mode and text
            pushes itself as you type.
          </li>
          <li>
            <strong>More than two devices?</strong> Raise the terminal count
            (up to 6) before creating the room, or make it an open room.
          </li>
          <li>
            <strong>Sending something sensitive?</strong> Follow the{" "}
            <a href="#send-a-password" className={TEXT_LINK_CLASS}>
              password steps below
            </a>
            .
          </li>
        </ul>
      </ContentSection>

      <ContentSection
        id="send-a-password"
        title="Sending a password or 2FA code securely"
      >
        <p>
          Emailing a password to yourself, or sending it in a chat or text
          message, leaves a copy in that conversation&apos;s history, usually
          synced to every device you are signed in on. Unless the service is
          end-to-end encrypted, the provider can read it too. For a one-off
          hand-off between your own devices, this is the cleaner route:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>On the device that has the secret</strong>, press{" "}
            <strong>Password Safer</strong> for a 16-character random room
            password, then <strong>Create room</strong>.
          </li>
          <li>
            Press <strong>Show QR</strong> and scan it with the other device.
            The room password travels in the part of the link after{" "}
            <code>#</code>, which browsers never send to a server, so nothing
            is typed and nothing is overheard.
          </li>
          <li>
            Set <strong>Expiry</strong> to <strong>1 minute</strong>, paste the
            secret and press <strong>Push</strong>. On the other device, press{" "}
            <strong>Copy</strong>.
          </li>
          <li>
            Press <strong>Remove room</strong>. The encrypted text, the room
            and its members are deleted right away instead of when the timer
            runs out.
          </li>
        </ol>
        <p>
          <strong>What protects it.</strong> The secret is encrypted with
          AES-GCM-256 in the sending browser before it is uploaded, and only a
          device with the same room password can decrypt it. Our server holds
          the ciphertext and nothing it could read it with. A private room (the
          default, for two devices) seals as soon as the second device joins,
          so nobody else can get in afterwards, even with the password.
        </p>
        <p>
          <strong>The limits.</strong> Until the room is full, anyone with the
          link or QR can join, so show the QR only to your own device and keep
          an eye on who can see your screen. If someone stole our database,
          they could try to guess room passwords offline, because devices meet
          on the password alone and key derivation uses a fixed, public salt;
          a Safer password makes that impractical. The{" "}
          <Link href="/security/" className={TEXT_LINK_CLASS}>
            security page
          </Link>{" "}
          has the full threat model. For credentials a team shares long-term, a
          password manager&apos;s sharing feature is the better tool.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
