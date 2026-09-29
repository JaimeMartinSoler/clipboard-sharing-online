import { MonitorSmartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ContentPage,
  ContentSection,
  StartSharingCta,
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
      title="Share text between your phone and PC"
      lead="The quickest way to get a link, a code or a paragraph from your phone onto your computer — or back again — without installing an app or signing in to anything."
    >
      <ContentSection title="The workarounds everyone uses">
        <p>
          Most of us move text between a phone and a computer the long way
          round. We email it to ourselves and dig it out of the inbox. We send
          it to ourselves in a chat app. We paste it into a cloud note and wait
          for it to sync. Or we give up and retype a 40-character URL with one
          thumb.
        </p>
        <p>
          Built-in clipboard sync helps, but usually only inside one
          vendor&apos;s world, with the same account signed in on both sides. The
          moment your phone and your PC come from different ecosystems — or the
          PC is a work machine you can&apos;t install things on — you&apos;re
          back to emailing yourself.
        </p>
      </ContentSection>

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
            <strong>Sending something sensitive?</strong> Use{" "}
            <strong>Password Safer</strong> for a 16-character random password
            and join by QR, so nobody has to type it.
          </li>
        </ul>
      </ContentSection>

      <ContentSection title="Is it safe for passwords and codes?">
        <p>
          Your text is encrypted on the phone before it is uploaded, and only a
          device with the same password can decrypt it. Our server stores the
          encrypted blob and nothing it could use to read it, then deletes it
          10 minutes after the last push by default. The trade-offs of a
          password-only design are spelled out plainly on the{" "}
          <Link href="/security/" className={TEXT_LINK_CLASS}>
            security page
          </Link>
          .
        </p>
      </ContentSection>

      <StartSharingCta heading="Send it from your phone now">
        Open the clipboard on your computer, press Create room, then scan the
        QR code with your phone.
      </StartSharingCta>
    </ContentPage>
  );
}
