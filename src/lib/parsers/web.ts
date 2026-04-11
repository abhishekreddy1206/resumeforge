import * as cheerio from "cheerio";

const BLOCKED_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd/i,
];

function validateExternalUrl(url: string): void {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = parsed.hostname;
  if (BLOCKED_IP_PATTERNS.some((p) => p.test(hostname))) {
    throw new Error("URLs pointing to internal or private addresses are not allowed");
  }
}

// --- Shared helpers used by both scrapeJobUrl and scrapeJobUrlResolved ---

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchWithRedirects(url: string): Promise<{ html: string; finalUrl: string }> {
  validateExternalUrl(url);
  console.log(`[web-scraper] Fetching URL: ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const finalUrl = response.url || url;
  if (finalUrl !== url) {
    validateExternalUrl(finalUrl);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${response.status}). The site may block automated requests.`);
  }

  const html = await response.text();
  console.log(`[web-scraper] Fetched ${html.length} chars of HTML`);
  return { html, finalUrl };
}

function extractJobText(html: string): string {
  const $ = cheerio.load(html);

  // Try JSON-LD structured data first
  const jsonLdText = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => {
      try {
        const data = JSON.parse($(el).html() || "");
        if (data["@type"] === "JobPosting") {
          const parts = [
            data.title && `Title: ${data.title}`,
            data.hiringOrganization?.name && `Company: ${data.hiringOrganization.name}`,
            data.jobLocation?.address?.addressLocality && `Location: ${data.jobLocation.address.addressLocality}`,
            data.description,
            data.qualifications,
            data.responsibilities,
          ].filter(Boolean);
          return parts.join("\n\n");
        }
      } catch {
        // not valid JSON or not a job posting
      }
      return "";
    })
    .find((t) => t.length > 100);

  if (jsonLdText) {
    console.log(`[web-scraper] Extracted JSON-LD job posting (${jsonLdText.length} chars)`);
    return jsonLdText.slice(0, 15000);
  }

  // Try SPA data injection patterns
  const spaDataText = $("script")
    .toArray()
    .map((el) => {
      const content = $(el).html() || "";
      const nextMatch = content.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]+\})/);
      if (nextMatch) {
        try {
          const data = JSON.parse(nextMatch[1]);
          const str = JSON.stringify(data);
          if (/description|qualifications|responsibilities|jobTitle/i.test(str)) {
            return str.replace(/[{}"\\[\]]/g, " ").replace(/\s+/g, " ").trim();
          }
        } catch {
          // ignore
        }
      }
      return "";
    })
    .find((t) => t.length > 100);

  if (spaDataText) {
    console.log(`[web-scraper] Extracted SPA data (${spaDataText.length} chars)`);
    return spaDataText.slice(0, 15000);
  }

  // Remove noise elements
  $("script, style, nav, footer, iframe, noscript, svg, img, link, meta").remove();

  // Try common job description selectors
  const selectors = [
    '[class*="posting-"]', ".posting-page",
    "#content", ".job__description", '[class*="job-description"]', '[class*="jobDescription"]',
    '[class*="ashby-job"]',
    '[data-automation-id="jobPostingDescription"]',
    '[class*="jd-"]', '[data-testid*="job"]',
    '[id*="job-description"]', '[id*="jobDescription"]',
    '[class*="job-detail"]', '[class*="jobDetail"]',
    '[class*="job-post"]', '[class*="description"]',
    "article", "main", '[role="main"]', ".content", "#main-content",
  ];

  for (const selector of selectors) {
    const el = $(selector);
    if (el.length) {
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > 100) {
        console.log(`[web-scraper] Matched selector "${selector}" (${text.length} chars)`);
        return text.slice(0, 15000);
      }
    }
  }

  // Fallback: body text
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  console.log(`[web-scraper] Falling back to body text (${bodyText.length} chars)`);
  return bodyText.slice(0, 15000);
}

// --- LinkedIn URL rewriting ---

export function rewriteGlassdoorUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("glassdoor.com")) return url;

    // /partner/jobListing.htm?...&jobListingId=XXXX → /job-listing/XXXX.htm
    if (parsed.pathname.includes("/partner/jobListing")) {
      const jobId = parsed.searchParams.get("jobListingId");
      if (jobId) {
        return `https://www.glassdoor.com/job-listing/j?jl=${jobId}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

export function rewriteLinkedInUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("linkedin.com")) return url;

    // Match /comm/jobs/view/ID or /jobs/view/ID
    const match = parsed.pathname.match(/\/(?:comm\/)?jobs\/view\/(\d+)/);
    if (match) {
      return `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${match[1]}`;
    }
    return url;
  } catch {
    return url;
  }
}

// --- Employer URL extraction from aggregator pages ---

const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "jobvite.com",
  "workday.com",
  "taleo.net",
  "successfactors.com",
];

const AGGREGATOR_DOMAINS = ["glassdoor.com", "indeed.com", "linkedin.com"];

const APPLY_TEXT_RE = /apply|apply now|apply on company|apply externally|apply at/i;

export function extractEmployerUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const pageDomain = new URL(pageUrl).hostname;

  // 1. Check JSON-LD for applyUrl pointing to a different domain
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).html() || "");
      const applyUrl = data.applyUrl || data.url;
      if (applyUrl && typeof applyUrl === "string") {
        try {
          const applyHost = new URL(applyUrl).hostname;
          if (applyHost !== pageDomain && !AGGREGATOR_DOMAINS.some(d => applyHost.includes(d))) {
            validateExternalUrl(applyUrl);
            return applyUrl;
          }
        } catch { /* invalid URL */ }
      }
    } catch { /* not valid JSON */ }
  }

  // 2. Look for links with apply-related text
  for (const el of $("a[href]").toArray()) {
    const text = $(el).text().trim();
    const href = $(el).attr("href");
    if (!href || !text) continue;
    if (!APPLY_TEXT_RE.test(text)) continue;

    try {
      const resolved = new URL(href, pageUrl).toString();
      const linkHost = new URL(resolved).hostname;
      if (linkHost === pageDomain) continue;
      if (AGGREGATOR_DOMAINS.some(d => linkHost.includes(d))) continue;
      validateExternalUrl(resolved);
      return resolved;
    } catch { /* invalid URL */ }
  }

  // 3. Look for links pointing to known ATS domains
  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href");
    if (!href) continue;

    try {
      const resolved = new URL(href, pageUrl).toString();
      const linkHost = new URL(resolved).hostname;
      if (ATS_DOMAINS.some(d => linkHost.includes(d))) {
        validateExternalUrl(resolved);
        return resolved;
      }
    } catch { /* invalid URL */ }
  }

  return null;
}

// --- Public API ---

export async function scrapeJobUrl(url: string): Promise<string> {
  const { html } = await fetchWithRedirects(url);
  const text = extractJobText(html);

  if (text.length < 50) {
    throw new Error(
      "Could not extract job description from URL. The page may require JavaScript to render. Try pasting the job description text directly instead."
    );
  }

  return text;
}

export async function scrapeJobUrlResolved(url: string): Promise<{ text: string; canonicalUrl?: string }> {
  // Step 1: Rewrite email tracking URLs to cleaner forms
  let fetchUrl = rewriteLinkedInUrl(url);
  fetchUrl = rewriteGlassdoorUrl(fetchUrl);

  // Step 2: Fetch and follow redirects
  const { html, finalUrl } = await fetchWithRedirects(fetchUrl);

  // Step 3: Check if we landed on an aggregator
  const isAggregator = AGGREGATOR_DOMAINS.some(d => new URL(finalUrl).hostname.includes(d));

  if (isAggregator) {
    const employerUrl = extractEmployerUrl(html, finalUrl);
    if (employerUrl) {
      console.log(`[web-scraper] Two-hop: resolved to employer URL: ${employerUrl}`);
      // Hop 2: scrape the employer's ATS page
      const text = await scrapeJobUrl(employerUrl);
      return { text, canonicalUrl: employerUrl };
    }
  }

  // Fallback: extract from the page we already have
  const text = extractJobText(html);

  if (text.length < 50) {
    throw new Error(
      "Could not extract job description from URL. The page may require JavaScript to render. Try pasting the job description text directly instead."
    );
  }

  return { text, canonicalUrl: finalUrl !== url ? finalUrl : undefined };
}

async function fetchSubstackArticle(url: string): Promise<{
  title: string;
  text: string;
  publisher?: string;
  date?: string;
}> {
  const match = url.match(/(?:https?:\/\/)?([^.]+)\.substack\.com\/p\/([^/?#]+)/);
  if (!match) throw new Error("Invalid Substack URL");
  const [, publication, slug] = match;

  const connectSid = process.env.SUBSTACK_CONNECT_SID;
  const apiUrl = `https://${publication}.substack.com/api/v1/posts/${slug}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      headers: {
        ...(connectSid ? { Cookie: `connect.sid=${connectSid}` } : {}),
        Accept: "application/json",
        "User-Agent": BROWSER_HEADERS["User-Agent"],
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`Substack API returned ${res.status}`);
  const data = await res.json();

  const $ = cheerio.load(data.body_html || "");
  const text = $.text().replace(/\s+/g, " ").trim();

  console.log(`[web-scraper] Fetched Substack article "${data.title}" (${text.length} chars)`);

  return {
    title: data.title || "Untitled",
    text,
    publisher: `${publication} (Substack)`,
    date: data.post_date || undefined,
  };
}

async function fetchMediumArticle(url: string): Promise<{
  title: string;
  text: string;
  publisher?: string;
  date?: string;
}> {
  const sid = process.env.MEDIUM_SID;
  const uid = process.env.MEDIUM_UID;

  validateExternalUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        ...(sid && uid ? { Cookie: `sid=${sid}; uid=${uid}` } : {}),
        ...BROWSER_HEADERS,
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Medium returned ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    "Untitled";

  const publisher =
    $("meta[property='og:site_name']").attr("content") || "Medium";

  const date =
    $("meta[property='article:published_time']").attr("content") || undefined;

  $("script, style, nav, footer, iframe, noscript, svg, img, link, meta, header, aside").remove();

  let text = "";
  for (const selector of ["article", '[role="main"]', "main", ".content"]) {
    const el = $(selector);
    if (el.length) {
      text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > 200) break;
    }
  }

  if (!text || text.length < 200) {
    throw new Error("Could not extract full article — Medium cookies may have expired");
  }

  console.log(`[web-scraper] Fetched Medium article "${title}" (${text.length} chars)`);

  return { title, text, publisher, date };
}

export async function scrapeArticleUrl(url: string): Promise<{
  title: string;
  text: string;
  publisher?: string;
  date?: string;
  doi?: string;
}> {
  validateExternalUrl(url);

  // Authenticated fetching for Substack member content
  if (url.match(/\.substack\.com\/p\//)) {
    try {
      const result = await fetchSubstackArticle(url);
      return { ...result, text: result.text.slice(0, 10000) };
    } catch (err) {
      console.log(`[web-scraper] Substack API failed, falling back to HTML scraping: ${err}`);
      // Fall through to regular scraping
    }
  }

  // Authenticated fetching for Medium member content
  if (url.includes("medium.com/") || url.includes("towardsdatascience.com/") || url.includes("levelup.gitconnected.com/") || url.includes("betterprogramming.pub/")) {
    try {
      const result = await fetchMediumArticle(url);
      return { ...result, text: result.text.slice(0, 10000) };
    } catch (err) {
      console.log(`[web-scraper] Medium auth failed, falling back to HTML scraping: ${err}`);
      // Fall through to regular scraping
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  // Validate the final URL after redirects to prevent SSRF bypass
  if (response.url && response.url !== url) {
    validateExternalUrl(response.url);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${response.status})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract title
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("meta[name='citation_title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Untitled";

  // Extract publisher / site name
  const publisher =
    $("meta[property='og:site_name']").attr("content") ||
    $("meta[name='citation_journal_title']").attr("content") ||
    $("meta[name='publisher']").attr("content") ||
    undefined;

  // Extract date
  const date =
    $("meta[name='citation_publication_date']").attr("content") ||
    $("meta[property='article:published_time']").attr("content") ||
    $("meta[name='date']").attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    undefined;

  // Extract DOI
  const doi =
    $("meta[name='citation_doi']").attr("content") ||
    $("meta[name='DOI']").attr("content") ||
    undefined;

  // Extract article text
  $("script, style, nav, footer, iframe, noscript, svg, img, link, meta, header, aside").remove();

  const articleSelectors = [
    "article",
    '[role="main"]',
    ".article-body",
    ".post-content",
    ".entry-content",
    '[class*="article"]',
    "main",
    ".content",
    "#content",
  ];

  let text = "";
  for (const selector of articleSelectors) {
    const el = $(selector);
    if (el.length) {
      text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > 100) break;
    }
  }

  if (!text || text.length < 100) {
    text = $("body").text().replace(/\s+/g, " ").trim();
  }

  return {
    title: title.slice(0, 500),
    text: text.slice(0, 10000),
    publisher: publisher?.slice(0, 200),
    date: date?.slice(0, 20),
    doi: doi?.slice(0, 100),
  };
}

interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  blog: string | null;
  public_repos: number;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  topics: string[];
}

interface GitHubLanguages {
  [language: string]: number;
}

export async function fetchGitHubProfile(username: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const [userRes, reposRes] = await Promise.all([
    fetch(`https://api.github.com/users/${username}`, { headers }),
    fetch(
      `https://api.github.com/users/${username}/repos?sort=stars&per_page=20`,
      { headers }
    ),
  ]);

  if (!userRes.ok) throw new Error(`GitHub user not found: ${username}`);

  const user: GitHubUser = await userRes.json();
  const repos: GitHubRepo[] = await reposRes.json();

  const topRepos = repos.filter((r) => !r.fork).slice(0, 10);
  const repoLanguages = await Promise.all(
    topRepos.slice(0, 5).map(async (repo) => {
      const langRes = await fetch(
        `https://api.github.com/repos/${username}/${repo.name}/languages`,
        { headers }
      );
      const languages: GitHubLanguages = await langRes.json();
      return { repo: repo.name, languages };
    })
  );

  return {
    source: "github" as const,
    username: user.login,
    name: user.name,
    bio: user.bio,
    location: user.location,
    website: user.blog,
    repositories: topRepos.map((r) => ({
      name: r.name,
      description: r.description,
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
      topics: r.topics,
    })),
    languages: repoLanguages,
  };
}

interface StackOverflowUser {
  display_name: string;
  reputation: number;
  badge_counts: { gold: number; silver: number; bronze: number };
  about_me?: string;
  website_url?: string;
  location?: string;
  link: string;
}

interface StackOverflowTag {
  tag_name: string;
  answer_count: number;
  answer_score: number;
  question_count: number;
  question_score: number;
}

export async function fetchStackOverflowProfile(userId: string) {
  const baseUrl = "https://api.stackexchange.com/2.3";
  const params = "site=stackoverflow&filter=default";

  const [userRes, tagsRes] = await Promise.all([
    fetch(`${baseUrl}/users/${userId}?${params}`),
    fetch(`${baseUrl}/users/${userId}/top-tags?${params}&pagesize=20`),
  ]);

  if (!userRes.ok)
    throw new Error(`StackOverflow user not found: ${userId}`);

  const userData = await userRes.json();
  const tagsData = await tagsRes.json();

  if (!userData.items?.length)
    throw new Error(`StackOverflow user not found: ${userId}`);

  const user: StackOverflowUser = userData.items[0];
  const tags: StackOverflowTag[] = tagsData.items || [];

  return {
    source: "stackoverflow" as const,
    displayName: user.display_name,
    reputation: user.reputation,
    badges: user.badge_counts,
    aboutMe: user.about_me,
    website: user.website_url,
    location: user.location,
    profileUrl: user.link,
    topTags: tags.map((t) => ({
      name: t.tag_name,
      answerCount: t.answer_count,
      answerScore: t.answer_score,
      questionCount: t.question_count,
    })),
  };
}
