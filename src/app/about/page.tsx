import { ExternalLink, Github, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const REPO_URL = "https://github.com/JaimeMartinSoler/clipboard-sharing-online";

const OTHER_SITES = [
  {
    name: "office-dev-tools.com",
    url: "https://office-dev-tools.com",
    description:
      "Free, private office tools (json formatter, json to yaml/xml/csv, case converter, base64... and much more) that run entirely in your browser — no backend, nothing ever uploaded",
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
        <p className="text-center text-sm text-muted-foreground">
          Take a look at the code, open an issue, or just have a browse
        </p>
      </section>

      <div className="space-y-3">
        <h2 className="text-center text-lg font-semibold tracking-tight">
          Other useful websites
        </h2>
        <section className="space-y-3 rounded-lg border bg-card p-6">
          <div className="flex flex-col items-center gap-3">
            {OTHER_SITES.map((site) => (
              <div
                key={site.url}
                className="flex w-full flex-col items-center gap-2"
              >
                <Link
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({
                    variant: "secondary",
                    size: "lg",
                  })}
                >
                  <ExternalLink className="size-4" />
                  {site.name}
                </Link>
                <p className="w-full text-center text-sm text-muted-foreground">
                  {site.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-center text-muted-foreground">
        This page has been created by Jaime Martín Soler
      </p>
    </div>
  );
}
