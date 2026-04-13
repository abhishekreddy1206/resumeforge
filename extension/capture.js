/**
 * capture.js — Stateless content extraction script.
 * Injected on demand by background.js via chrome.scripting.executeScript.
 * Reads rendered DOM and responds with extracted content.
 * Completely isolated from content.js (form filling).
 */

(() => {
  const NOISE_SELECTOR = [
    "script",
    "style",
    "nav",
    "footer",
    "header",
    "aside",
    "iframe",
    "noscript",
    "svg",
    "form",
    "button",
    "[hidden]",
    '[aria-hidden="true"]',
  ].join(", ");

  const PRIMARY_TEXT_SELECTORS = [
    "article",
    ".article-body",
    ".post-content",
    ".entry-content",
    "main",
    '[role="main"]',
    ".content",
    "#content",
    '[class*="job-description"]',
    '[class*="posting"]',
  ];

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function extractCleanText(node) {
    if (!node) return "";

    const clone = node.cloneNode(true);
    for (const noisy of clone.querySelectorAll(NOISE_SELECTOR)) {
      noisy.remove();
    }

    const rawText = clone.innerText || clone.textContent || "";
    return normalizeText(rawText);
  }

  /** Try to extract JSON-LD JobPosting structured data. */
  function tryJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        let data = JSON.parse(script.textContent || "");
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

  /** Extract rendered text from the best candidate container. */
  function extractBestText() {
    const candidateLengths = {};
    let bestSelector = null;
    let bestText = "";

    for (const selector of PRIMARY_TEXT_SELECTORS) {
      const element = document.querySelector(selector);
      if (!element) continue;

      const text = extractCleanText(element);
      candidateLengths[selector] = text.length;

      if (text.length > bestText.length) {
        bestSelector = selector;
        bestText = text;
      }
    }

    const bodyText = extractCleanText(document.body);
    candidateLengths.body = bodyText.length;

    let selectedSelector = bestSelector;
    let selectedText = bestText;

    if (!selectedText) {
      selectedSelector = "body";
      selectedText = bodyText;
    } else if (bodyText.length >= Math.max(Math.floor(selectedText.length * 1.2), selectedText.length + 200)) {
      selectedSelector = "body";
      selectedText = bodyText;
    }

    return {
      text: selectedText,
      selectedSelector,
      selectedTextLength: selectedText.length,
      bodyTextLength: bodyText.length,
      candidateLengths,
    };
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
    const extractedText = jsonLd
      ? {
          text: jsonLd.text,
          selectedSelector: "jsonld",
          selectedTextLength: jsonLd.text.length,
          bodyTextLength: 0,
          candidateLengths: {},
        }
      : extractBestText();
    const title = jsonLd?.title || ogMeta.ogTitle || pageTitle;

    return {
      url,
      title,
      text: extractedText.text,
      selectedSelector: extractedText.selectedSelector,
      selectedTextLength: extractedText.selectedTextLength,
      bodyTextLength: extractedText.bodyTextLength,
      candidateLengths: extractedText.candidateLengths,
      company: jsonLd?.company || null,
      metadata: {
        siteName: ogMeta.siteName,
        publishedTime: ogMeta.publishedTime,
        ogDescription: ogMeta.description,
        hasJsonLd: !!jsonLd,
      },
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "EXTRACT_CONTENT") {
      try {
        const result = extractContent();
        sendResponse(result);
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return false;
    }
  });
})();
