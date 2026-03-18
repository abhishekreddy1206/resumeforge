import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">
                  RF
                </span>
              </div>
              <span className="text-lg font-semibold tracking-tight">
                ResumeForge
              </span>
            </a>
            <div className="flex items-center gap-1">
              {[
                { href: "/", label: "Dashboard" },
                { href: "/profile", label: "Profile" },
                { href: "/jobs", label: "Jobs" },
                { href: "/skills", label: "Skills" },
                { href: "/generate", label: "Generate" },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-md hover:text-foreground hover:bg-accent transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
