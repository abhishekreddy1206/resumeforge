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

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove scripts, styles, and nav elements
  $("script, style, nav, header, footer, iframe, noscript").remove();

  // Try common job description selectors
  const selectors = [
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[class*="posting-"]',
    '[id*="job-description"]',
    '[class*="description"]',
    "article",
    "main",
    '[role="main"]',
  ];

  for (const selector of selectors) {
    const el = $(selector);
    if (el.length && el.text().trim().length > 200) {
      return el.text().trim();
    }
  }

  // Fallback: get body text
  return $("body").text().trim().slice(0, 10000);
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
