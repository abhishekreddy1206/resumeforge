"use client";

import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Front" },
  { href: "/profile", label: "Profile" },
  { href: "/jobs", label: "Jobs" },
  { href: "/skills", label: "Skills" },
  { href: "/top-matches", label: "Shortlist" },
  { href: "/learn", label: "Study" },
  { href: "/insights", label: "Market" },
  { href: "/versions", label: "Archive" },
  { href: "/settings", label: "Desk" },
];

export function NavLinks({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide py-2">
        {navLinks.map((link, i) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/" && pathname.startsWith(link.href));
          return (
            <a
              key={link.href}
              href={link.href}
              className={`nav-rubric ${isActive ? "is-active" : ""} px-3 py-2 whitespace-nowrap`}
              style={{ borderRight: i < navLinks.length - 1 ? "1px solid var(--rule-soft)" : "none" }}
            >
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
            className={`nav-rubric ${isActive ? "is-active" : ""} px-2.5 py-2`}
            style={{
              borderRight: i < navLinks.length - 1 ? "1px solid var(--rule-soft)" : "none",
            }}
          >
            {link.label}
          </a>
        );
      })}
    </div>
  );
}
