"use client";

import { useEffect, useRef } from "react";

/**
 * Observes a container and adds the `revealed` class to children
 * with `.scroll-reveal` as they enter the viewport.
 * Pass deps to re-observe when content changes (e.g. new list items).
 */
export function useScrollReveal<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    // Only observe unrevealed elements
    const targets = container.querySelectorAll(".scroll-reveal:not(.revealed)");
    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
