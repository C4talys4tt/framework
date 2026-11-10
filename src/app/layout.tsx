import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { appearanceScript } from "@/modules/preferences/appearance-script";
import { DEFAULT_APPEARANCE, appearanceAttributes } from "@/modules/preferences/domain/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FRAMEWORK", template: "%s · FRAMEWORK" },
  description: "A creative production workspace for motion designers, editors, VFX artists and filmmakers.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script rewrites these attributes from the appearance cookie
    // before first paint, hence suppressHydrationWarning.
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      {...appearanceAttributes(DEFAULT_APPEARANCE)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
