/**
 * capture.js — Stateless content extraction script.
 * Injected on demand by background.js via chrome.scripting.executeScript.
 * Reads rendered DOM and responds with extracted content.
 * Completely isolated from content.js (form filling).
 */

(() => {
  /** Try to extract JSON-LD JobPosting structured data. */
  function tryJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        let data = JSON.parse(script.textContent || "");
        // Handle @graph arrays
        if (data["@graph"]) data = data["@graph"];
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item["@type"] === "JobPosting") {
            const desc = [
              item.title && `Title: ${item.title}`,
              item.hiringOrganization?.name && `Company: ${item.hiringOrganization.name}`,
              item.jobLocation?.address?.addressLocality && `Location: ${item.jobLocation.address.addressLocality}`,
              item.description,
              item.qualifications,
              item.responsibilities,
            ]
              .filter(Boolean)
              .join("\n\n");
            return {
              title: item.title || null,
              company: item.hiringOrganization?.name || null,
              text: desc.slice(0, 15000),
            };
          }
        }
      } catch {
        // Invalid JSON — skip this script tag
      }
    }
    return null;
  }

  /** Extract Open Graph and article metadata from <meta> tags. */
  function extractOgMeta() {
    const get = (prop) =>
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute("content") ||
      document.querySelector(`meta[name="${prop}"]`)?.getAttribute("content") ||
      null;
    return {
      ogTitle: get("og:title"),
      siteName: get("og:site_name"),
      publishedTime: get("article:published_time"),
      description: get("og:description"),
    };
  }

  /** Extract rendered text from the best container element. */
  function extractBestText() {
    const selectors = [
      "article",
      '[role="main"]',
      "main",
      ".content",
      "#content",
      ".post-content",
      ".entry-content",
      ".article-body",
      '[class*="job-description"]',
      '[class*="posting"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.innerText.replace(/\s+/g, " ").trim();
        if (text.length > 100) return text;
      }
    }

    // Fallback to body, stripping nav/footer/header noise
    const clone = document.body.cloneNode(true);
    for (const tag of clone.querySelectorAll(
      "script, style, nav, footer, header, aside, iframe, noscript, svg"
    )) {
      tag.remove();
    }
    return clone.innerText.replace(/\s+/g, " ").trim();
  }

  /** Main extraction — combines all strategies. */
  function extractContent() {
    const url = window.location.href;
    const pageTitle =
      document.querySelector("h1")?.innerText.trim() ||
      document.title.trim() ||
      "Untitled";

    const ogMeta = extractOgMeta();
    const jsonLd = tryJsonLd();
    const text = jsonLd?.text || extractBestText();
    const title = jsonLd?.title || ogMeta.ogTitle || pageTitle;

    return {
      url,
      title,
      text,
      company: jsonLd?.company || null,
      metadata: {
        siteName: ogMeta.siteName,
        publishedTime: ogMeta.publishedTime,
        ogDescription: ogMeta.description,
        hasJsonLd: !!jsonLd,
      },
    };
  }

  // Listen for extraction request from background.js
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "EXTRACT_CONTENT") {
      try {
        const result = extractContent();
        sendResponse(result);
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return false; // synchronous response
    }
  });
})();
