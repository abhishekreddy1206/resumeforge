import type { Metadata } from "next";
import { Fraunces, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavLinks } from "@/components/nav-links";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

// Display: Fraunces — variable optical serif, warm ink-trap resilience in dark mode
const fraunces = Fraunces({
  variable: "--font-cormorant", // reuse var name so existing references pick it up
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

// Body: Source Sans 3 — humanist sans-serif, excellent readability at all sizes
const sourceSans = Source_Sans_3({
  variable: "--font-geist-sans", // reuse var name so existing references pick it up
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Mono: JetBrains Mono — technical character, reads cleanly at 0.6rem labels
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-dm-mono", // reuse var name so existing references pick it up
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "ResumeForge",
  description: "AI-powered resume builder for software engineers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${sourceSans.variable} ${jetbrainsMono.variable} antialiased min-h-screen bg-background paper-bg`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
        <TooltipProvider>
          {/* Magazine masthead navigation */}
          <nav className="border-b border-border bg-card/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="h-14 sm:h-16 flex items-center justify-between gap-6">
                {/* Brand */}
                <Link href="/" className="flex items-center gap-3 shrink-0 group">
                  <div className="w-7 h-7 bg-primary flex items-center justify-center shrink-0">
                    <span
                      className="text-primary-foreground font-bold text-xs tracking-widest"
                      style={{ fontFamily: "var(--font-dm-mono)" }}
                    >
                      RF
                    </span>
                  </div>
                  <span
                    className="text-xl sm:text-2xl text-foreground font-medium hidden sm:inline"
                    style={{
                      fontFamily: "var(--font-cormorant)",
                      fontStyle: "italic",
                      lineHeight: 1,
                    }}
                  >
                    ResumeForge
                  </span>
                </Link>

                {/* Desktop nav + theme toggle */}
                <div className="flex items-center gap-1">
                  <NavLinks />
                  <ThemeToggle />
                </div>
              </div>
            </div>
            {/* Vermillion accent rule */}
            <div className="h-0.5 bg-primary" />
          </nav>
          {/* Mobile nav row — sticks below the 56px header */}
          <div className="sticky top-14 z-40 bg-background border-b border-border sm:hidden">
            <div className="max-w-6xl mx-auto px-4 flex items-center">
              <NavLinks mobile />
              <div className="ml-auto pl-2 shrink-0">
                <ThemeToggle />
              </div>
            </div>
          </div>

          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
            {children}
          </main>

          <footer className="border-t border-border mt-20 py-6">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
              <span
                className="text-muted-foreground"
                style={{
                  fontFamily: "var(--font-dm-mono)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                ResumeForge
              </span>
              <span
                className="text-muted-foreground"
                style={{
                  fontFamily: "var(--font-dm-mono)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                AI-Powered Resume Builder
              </span>
            </div>
          </footer>
          <Toaster />
        </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
