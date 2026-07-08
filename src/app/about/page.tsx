import { ExternalLink, Github, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const REPO_URL = "https://github.com/JaimeMartinSoler/clipboard-sharing-online";
const AUTHOR_URL = "https://github.com/JaimeMartinSoler";

const OTHER_SITES = [
  {
    name: "office-dev-tools.com",
    url: "https://office-dev-tools.com",
    description:
      "Free, private office tools (json formatter, json to yaml/xml/csv, case converter, base64... and much more) that run entirely in your browser — no backend, nothing ever uploaded.",
  },
];

export const metadata: Metadata = {
  title: "About",
  description:
    "About Clipboard Sharing Online — built by Jaime Martín Soler. View the source on GitHub.",
  alternates: { canonical: "/about/" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-center gap-3">
        <Info className="size-6" />
        <h1 className="text-2xl font-semibold tracking-tight">About</h1>
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-6">
        <p className="text-center text-sm text-muted-foreground">
          The whole project is open source. Take a look at the code, open an
          issue, or just have a browse.
        </p>
        <div className="flex justify-center">
          <Link
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg" })}
          >
            <Github className="size-4" />
            clipboard-sharing-online
          </Link>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-6">
        <p className="text-center text-sm text-muted-foreground">
          Other useful websites:
        </p>
        <div className="flex flex-col items-center gap-3">
          {OTHER_SITES.map((site) => (
            <div key={site.url} className="flex flex-col items-center gap-2">
              <Link
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                <ExternalLink className="size-4" />
                {site.name}
              </Link>
              <p className="max-w-sm text-center text-xs text-muted-foreground">
                {site.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-muted-foreground">
        This page has been created by{" "}
        <Link
          href={AUTHOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Jaime Martín Soler
        </Link>
        .
      </p>
    </div>
  );
}
