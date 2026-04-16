import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Newsreader, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavLinks } from "@/components/nav-links";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "prismjs/themes/prism-tomorrow.css";
import "./globals.css";

// Display: DM Serif Display — high-contrast didone, masthead-worthy
const displaySerif = DM_Serif_Display({
  variable: "--font-cormorant", // reuse existing var name so every reference picks up the new face
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

// Body: Newsreader — screen-optimized news serif, warm and readable
const bodySerif = Newsreader({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

// Mono: IBM Plex Mono — typewriter-adjacent editorial mono
const mono = IBM_Plex_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "ResumeForge — A Personal Broadsheet",
  description: "AI-powered resume builder for software engineers",
  applicationName: "ResumeForge",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ResumeForge",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#8A2C24" },
    { media: "(prefers-color-scheme: dark)", color: "#C67840" },
  ],
};

function formatIssueDate(d: Date) {
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const date = d.getDate();
  const year = d.getFullYear();
  return `${day}, ${month} ${date}, ${year}`;
}

function romanize(n: number) {
  const map: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let s = "";
  for (const [v, r] of map) {
    while (n >= v) { s += r; n -= v; }
  }
  return s;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const today = new Date();
  const issue = today.getFullYear() - 2023; // "Volume II/III/…" — stable per year
  const issueNum = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000) + 1;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${displaySerif.variable} ${bodySerif.variable} ${mono.variable} antialiased min-h-screen bg-background paper-bg`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
        <TooltipProvider>
          {/* ─── MASTHEAD ─── */}
          <header className="sticky top-0 z-50 bg-background/92 backdrop-blur-xl border-b border-foreground/15">
            {/* Folio: date · volume · issue — above the flag */}
            <div className="hidden md:block border-b border-foreground/10">
              <div className="max-w-6xl mx-auto px-6 flex items-center justify-between py-1.5">
                <span
                  style={{
                    fontFamily: "var(--font-dm-mono)",
                    fontSize: "0.58rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--marginalia)",
                  }}
                >
                  {formatIssueDate(today)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-dm-mono)",
                    fontSize: "0.58rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--marginalia)",
                  }}
                >
                  Vol. {romanize(Math.max(1, issue))} · No. {String(issueNum).padStart(3, "0")} · A Personal Broadsheet
                </span>
                <div className="flex items-center gap-3">
                  <ThemeToggle />
                </div>
              </div>
            </div>

            {/* Flag row */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="h-14 sm:h-16 flex items-center justify-between gap-6">
                <Link href="/" className="flex items-center gap-3 shrink-0 group">
                  <div className="masthead-mark">RF</div>
                  <span className="masthead-title hidden sm:inline">
                    ResumeForge
                  </span>
                </Link>

                <div className="flex items-center gap-1">
                  <NavLinks />
                  <div className="md:hidden">
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </div>

            {/* Double rule — broadsheet signature */}
            <div className="rule-thick" />
            <div className="h-[3px]" aria-hidden />
            <div className="rule-hair" />
          </header>

          {/* Mobile nav row */}
          <div className="sticky top-14 sm:top-16 z-40 bg-background/95 backdrop-blur-md border-b border-foreground/10 md:hidden">
            <div className="max-w-6xl mx-auto px-4">
              <NavLinks mobile />
            </div>
          </div>

          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            {children}
          </main>

          {/* ─── COLOPHON ─── */}
          <footer className="mt-24 border-t-[3px] border-foreground/85">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="masthead-mark" style={{ width: 22, height: 22, fontSize: "0.55rem" }}>RF</div>
                  <span
                    style={{
                      fontFamily: "var(--font-cormorant)",
                      fontStyle: "italic",
                      fontSize: "1rem",
                      lineHeight: 1,
                      color: "var(--ink)",
                    }}
                  >
                    ResumeForge
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-dm-mono)",
                      fontSize: "0.56rem",
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color: "var(--marginalia)",
                    }}
                  >
                    — A Personal Broadsheet
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-dm-mono)",
                    fontSize: "0.56rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--marginalia)",
                  }}
                >
                  Set in DM Serif Display, Newsreader &amp; IBM Plex Mono · Printed locally · {today.getFullYear()}
                </span>
              </div>
            </div>
          </footer>
          <Toaster />
        </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
