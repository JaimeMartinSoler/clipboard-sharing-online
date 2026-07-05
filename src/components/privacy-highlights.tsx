import { Code, Info, KeyRound, LockKeyhole, Users } from "lucide-react";
import Link from "next/link";

/**
 * The reassurance card summarising the app's privacy guarantees, with a link to
 * the full policy. Shared verbatim between the entry view and the room view so
 * the promise stays visible wherever the user is (and lives in one place).
 */
export function PrivacyHighlights() {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      <p className="flex items-start gap-2">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-foreground" />
        <span>
          <strong>Clipboard text is encrypted</strong> in your browser, never
          sent or stored directly
        </span>
      </p>
      <p className="flex items-start gap-2">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-foreground" />
        <span>
          <strong>Password is never sent nor stored</strong>
        </span>
      </p>
      <p className="flex items-start gap-2">
        <Users className="mt-0.5 size-4 shrink-0 text-foreground" />
        <span>
          <strong>Rooms can be private</strong>, sealing when full so no one
          else can enter
        </span>
      </p>
      <p className="flex items-start gap-2">
        <Code className="mt-0.5 size-4 shrink-0 text-foreground" />
        <span>
          <strong>Highly configurable</strong> but simple by default
        </span>
      </p>
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
        <span>
          For more info check our{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            privacy policy
          </Link>
        </span>
      </p>
    </section>
  );
}
