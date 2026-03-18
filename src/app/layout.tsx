import type { Metadata } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond, DM_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavLinks } from "@/components/nav-links";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${dmMono.variable} antialiased min-h-screen bg-background paper-bg`}
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

                {/* Desktop nav */}
                <NavLinks />

                {/* Mobile nav */}
                <NavLinks mobile />
              </div>
            </div>
            {/* Vermillion accent rule */}
            <div className="h-0.5 bg-primary" />
          </nav>

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
      </body>
    </html>
  );
}
