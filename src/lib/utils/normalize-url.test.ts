import test from "node:test";
import assert from "node:assert/strict";
import { normalizeJobUrl, normalizeArticleUrl } from "./normalize-url";

test("Apple jobs.apple.com URLs differing only in rx_* and board_id collapse to one key", () => {
  const a =
    "https://jobs.apple.com/en-us/details/200657341-0836/sr-full-stack-software-engineer-aiml-data-operations?board_id=JB001&rx_a=0&rx_c=&rx_ch=&rx_id=17222ad4-1111-1111-1111-aaaaaaaaaaaa&rx_p=DE5AOL74GZ&rx_ts=20260417T180411Z";
  const b =
    "https://jobs.apple.com/en-us/details/200657341-0836/sr-full-stack-software-engineer-aiml-data-operations?board_id=JB001&rx_a=0&rx_c=&rx_ch=&rx_id=17222ad4-2222-2222-2222-bbbbbbbbbbbb&rx_p=PGVYTUZLID&rx_ts=20260417T020500Z";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
});

test("Intuit URLs differing only in p_uid click-tracking collapse to one key", () => {
  const a =
    "https://jobs.intuit.com/job/-/-/27595/93513715968?cid=job_id_click_us_swe-other-fy26_cn_text_job_int-tm&p_sid=Sx5Ukhb&p_uid=iGZy5Db74r&ss=paid&utm_campaign=&utm_content=pj_board&utm_medium=jobad&utm_source=indeed+organic";
  const b =
    "https://jobs.intuit.com/job/-/-/27595/93513715968?cid=job_id_click_us_swe-other-fy26_cn_text_job_int-tm&p_sid=Sx5Ukhb&p_uid=9LBBaaf7ak&ss=paid&utm_campaign=&utm_content=pj_board&utm_medium=jobad&utm_source=indeed+organic";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
});

test("Google careers URLs differing only in search filter params collapse to one key", () => {
  const a =
    "https://www.google.com/about/careers/applications/jobs/results/132865192286397126-senior-software-engineer-aiml-genai-search?target_level=MID&target_level=ADVANCED&employment_type=FULL_TIME&skills=software%20engineer&sort_by=date";
  const b =
    "https://www.google.com/about/careers/applications/jobs/results/132865192286397126-senior-software-engineer-aiml-genai-search?employment_type=FULL_TIME&skills=software%20engineer&sort_by=date&target_level=EARLY&target_level=MID&target_level=ADVANCED&degree=MASTERS&page=2";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
});

test("Eightfold URL preserves pid (the job identity) after stripping filter params", () => {
  const url =
    "https://paypal.eightfold.ai/careers?start=0&location=San+Jose&pid=274918706156&sort_by=timestamp&filter_distance=80&filter_include_remote=1&filter_job_category=Software+Engineering";
  const normalized = normalizeJobUrl(url);
  assert.ok(normalized.includes("pid=274918706156"), `expected pid to survive: ${normalized}`);
});

test("Two Eightfold URLs with same pid but different filters collapse to one key", () => {
  const a =
    "https://paypal.eightfold.ai/careers?start=0&location=San+Jose&pid=274918706156&sort_by=timestamp&filter_distance=80&filter_include_remote=1&filter_job_category=Software+Engineering";
  const b =
    "https://paypal.eightfold.ai/careers?pid=274918706156&sort_by=date&filter_distance=40&location=Oakland";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
});

test("Workday URL's path-based job ID is preserved", () => {
  const a =
    "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-Manager--Site-Reliability-Engineering_JR123";
  const b =
    "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-Manager--Site-Reliability-Engineering_JR123?utm_source=linkedin";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
  assert.ok(normalizeJobUrl(a).includes("jr123"), "workday path job ID preserved");
});

test("Greenhouse URL gh_src tracking param is stripped but job path preserved", () => {
  const a = "https://job-boards.greenhouse.io/cresta/jobs/5133464008?gh_src=9a5432008us";
  const b = "https://job-boards.greenhouse.io/cresta/jobs/5133464008";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
  assert.ok(normalizeJobUrl(a).endsWith("/jobs/5133464008"), "greenhouse job path preserved");
});

test("Amazon amazon.jobs URLs with cmpid differ only in campaign param", () => {
  const a = "https://www.amazon.jobs/en/jobs/10387280/software-engineer-ii-safety?cmpid=DA_INAD200785B";
  const b = "https://www.amazon.jobs/en/jobs/10387280/software-engineer-ii-safety";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
});

test("Different job IDs in the same ATS do NOT collapse", () => {
  const a = "https://jobs.apple.com/en-us/details/200657341-0836/sr-full-stack-software-engineer?rx_id=x";
  const b = "https://jobs.apple.com/en-us/details/200646671-0836/software-engineer-siri?rx_id=y";
  assert.notEqual(normalizeJobUrl(a), normalizeJobUrl(b));
});

test("Glassdoor jl tracking param stripped", () => {
  const a =
    "https://www.glassdoor.com/job-listing/senior-data-engineer-scale-JV_IC1147401_KO0,20_KE21,26.htm?jl=1010100492473&utm_source=x";
  const b =
    "https://www.glassdoor.com/job-listing/senior-data-engineer-scale-JV_IC1147401_KO0,20_KE21,26.htm";
  assert.equal(normalizeJobUrl(a), normalizeJobUrl(b));
});

test("normalizeArticleUrl behaves the same for tracking params (regression guard)", () => {
  const a = "https://example.com/post?utm_source=twitter&rx_id=abc";
  const b = "https://example.com/post";
  assert.equal(normalizeArticleUrl(a), normalizeArticleUrl(b));
});

test("empty and malformed inputs do not throw", () => {
  assert.equal(normalizeJobUrl(""), "");
  assert.equal(normalizeJobUrl("   "), "");
  assert.equal(normalizeJobUrl("not-a-url"), "not-a-url");
});
