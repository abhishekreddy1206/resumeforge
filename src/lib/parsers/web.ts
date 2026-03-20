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

export async function scrapeJobUrl(url: string): Promise<string> {
  validateExternalUrl(url);

  console.log(`[web-scraper] Fetching URL: ${url}`);

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
    throw new Error(`Failed to fetch URL (HTTP ${response.status}). The site may block automated requests.`);
  }

  const html = await response.text();
  console.log(`[web-scraper] Fetched ${html.length} chars of HTML`);

  const $ = cheerio.load(html);

  // Try JSON-LD structured data first (works for many job boards)
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

  // Try SPA data injection patterns (Next.js, Nuxt, etc.)
  const spaDataText = $("script")
    .toArray()
    .map((el) => {
      const content = $(el).html() || "";
      // Next.js __NEXT_DATA__
      const nextMatch = content.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]+\})/);
      if (nextMatch) {
        try {
          const data = JSON.parse(nextMatch[1]);
          const str = JSON.stringify(data);
          // Heuristic: if the JSON blob mentions job-related fields it's useful
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

  // Try common job description selectors (ordered by specificity)
  const selectors = [
    // Lever
    '[class*="posting-"]',
    ".posting-page",
    // Greenhouse
    "#content",
    ".job__description",
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    // Ashby
    '[class*="ashby-job"]',
    // Workday
    '[data-automation-id="jobPostingDescription"]',
    // Apple Jobs
    '[class*="jd-"]',
    '[data-testid*="job"]',
    // General
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '[class*="job-detail"]',
    '[class*="jobDetail"]',
    '[class*="job-post"]',
    '[class*="description"]',
    // Structural
    "article",
    "main",
    '[role="main"]',
    ".content",
    "#main-content",
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

  // Fallback: get body text
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  console.log(`[web-scraper] Falling back to body text (${bodyText.length} chars)`);

  if (bodyText.length < 50) {
    throw new Error(
      "Could not extract job description from URL. The page may require JavaScript to render. Try pasting the job description text directly instead."
    );
  }

  return bodyText.slice(0, 15000);
}

export async function scrapeArticleUrl(url: string): Promise<{
  title: string;
  text: string;
  publisher?: string;
  date?: string;
  doi?: string;
}> {
  validateExternalUrl(url);

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
