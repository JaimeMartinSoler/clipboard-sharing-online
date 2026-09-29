/**
 * Homepage FAQ — the single source for BOTH the rendered FAQ
 * (`src/components/faq-section.tsx`) and its schema.org `FAQPage` JSON-LD, so
 * the structured data can never describe content that isn't on the page.
 * `faq.test.ts` renders the component and asserts the two match.
 *
 * Answers are plain text on purpose: what renders is exactly what the JSON-LD
 * says. Every claim must be verifiable in this repo (see docs/SECURITY.md).
 */
import { pageUrl } from "./pages";

export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ: readonly FaqEntry[] = [
  {
    question: "Is it really end-to-end encrypted? What does that mean here?",
    answer:
      "Yes. Your text is encrypted with AES-GCM-256 inside your browser before any network request, using a key derived from your password on your own device. Only the other devices that know the password can derive the same key and decrypt it. Everything in between — the network, our server, our database — only ever handles ciphertext.",
  },
  {
    question: "Can you, the operator, read my text?",
    answer:
      "No. The server receives an opaque room id, the ciphertext and its random nonce — never the password or any key — so there is nothing on our side that can decrypt it. The one caveat is that you are trusting the JavaScript this site serves you to do what it says; the code is open source so you can check it, and your browser's Network tab shows exactly what leaves the page.",
  },
  {
    question: "How long is my text stored?",
    answer:
      "Briefly. By default a room expires 10 minutes after it was created or last pushed to; the room creator can pick 1 minute or 1 hour instead, and the server caps it at 1 hour. Expired rooms are deleted when next read and by a cleanup job that runs every 5 minutes, and the room creator can delete the room and its content at any time with Remove room.",
  },
  {
    question: "What happens if I lose the password?",
    answer:
      "The text is gone for you — there is no reset, recovery or backup, because we never had the password or the key. Just create a new room with a new password. Since rooms expire within an hour at most, very little is ever lost.",
  },
  {
    question: "Can I share files or images?",
    answer:
      "No. It is text only: anything you can type or paste as text, up to 256 KB of encrypted data per push. There is no file or image upload.",
  },
  {
    question: "How many devices can join a room?",
    answer:
      "Two by default. The room creator can allow up to 6 devices, or make an open room with no limit, under Advanced Settings.",
  },
  {
    question: "What is a private (sealed) room?",
    answer:
      "A private room stops accepting new devices the moment it is full, and it stays sealed for the rest of its life — even if someone later learns the password, they cannot get in. Removing a device does not reopen its slot. Because your place in the room lives only in the open tab, a reload or a closed tab uses up a slot, so keep the tab open.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. There is no sign-up, no email and no login. The shared password is the only thing two devices need to find each other.",
  },
  {
    question: "Does it work between an iPhone and a Windows PC?",
    answer:
      "Yes. It runs in any modern browser, so iPhone, iPad, Android, Windows, macOS and Linux can all share the same room. There is nothing to install on either side.",
  },
  {
    question: "What if two people pick the same password?",
    answer:
      "They end up at the same room — this is the honest trade-off of a password-only design. The room and its key are derived from the password alone, so anyone who types the same password while the room exists can join it (unless it is already sealed) and read what is pushed to it. That is why the app blocks weak passwords, offers random ones, and seals private rooms when full; if Create says a room already exists for your password, someone else is using it, so pick a different one.",
  },
];

/**
 * schema.org `FAQPage` JSON-LD for the homepage, built from `FAQ` verbatim.
 * Absolute URL only (crawlers do not resolve relative paths).
 */
export function faqPageJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: pageUrl("/"),
    mainEntity: FAQ.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}
