"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Briefcase,
  Sparkles,
  History,
  Trophy,
  BookOpen,
  BarChart3,
} from "lucide-react";

const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/top-matches", label: "Top Matches", icon: Trophy },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/versions", label: "Versions", icon: History },
];

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.65rem",
  letterSpacing: "0.10em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

export function NavLinks({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide py-1">
        {navLinks.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/" && pathname.startsWith(link.href));
          const Icon = link.icon;
          return (
            <a
              key={link.href}
              href={link.href}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-sm transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              style={monoStyle}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {link.label}
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center">
      {navLinks.map((link, i) => {
        const isActive =
          pathname === link.href ||
          (link.href !== "/" && pathname.startsWith(link.href));
        return (
          <a
            key={link.href}
            href={link.href}
            className={`relative px-3 py-2 transition-colors ${
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={monoStyle}
          >
            {link.label}
            {isActive && (
              <span className="absolute bottom-0 left-3 right-3 h-px bg-primary" />
            )}
            {i < navLinks.length - 1 && (
              <span
                className="absolute right-0 top-1/2 -translate-y-1/2 text-border"
                style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.5rem" }}
              >
                ·
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}
