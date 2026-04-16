/**
 * Field mapping rules for ATS form auto-fill.
 *
 * Each key is a PrefillData field path. The value is an object with:
 * - keywords: array of regex patterns to match against field labels, names, ids, placeholders
 * - workdayId: optional data-automation-id value for Workday-specific matching
 * - isFile: true for file upload fields (resume, cover letter)
 *
 * Field type detection is handled entirely by the DOM (detectFieldType in content.js).
 * No type hints here — the DOM is always the source of truth.
 */

const FIELD_MAP = {
  // Personal info
  "personal.preferredFirstName": {
    keywords: [/preferred.?first.?name/i, /preferred.?name/i],
  },
  "personal.firstName": {
    keywords: [/first.?name/i, /fname/i, /given.?name/i, /^first$/i],
    workdayId: "legalNameSection_firstName",
  },
  "personal.lastName": {
    keywords: [/last.?name/i, /lname/i, /surname/i, /family.?name/i, /^last$/i],
    workdayId: "legalNameSection_lastName",
  },
  "personal.email": {
    keywords: [/e.?mail/i, /email.?address/i],
    workdayId: "email",
  },
  "personal.phone": {
    keywords: [/phone/i, /mobile/i, /telephone/i, /cell/i, /contact.?number/i],
    workdayId: "phone",
  },
  "personal.location": {
    keywords: [/city/i, /location/i, /address/i],
    workdayId: "addressSection_city",
  },
  "personal.country": {
    keywords: [/country\/?region/i, /country.?of.?residence/i, /^country$/i, /\bcountry\b/i],
  },
  "personal.linkedin": {
    keywords: [/linkedin/i, /linked.?in/i, /linked\s+in/i],
    workdayId: "linkedinQuestion",
  },
  "personal.github": {
    keywords: [/github/i, /git.?hub/i, /code.?repo/i],
  },
  "personal.website": {
    keywords: [/website/i, /portfolio/i, /personal.?url/i, /homepage/i],
    workdayId: "websiteQuestion",
  },

  // Work authorization
  "workAuth.authorized": {
    keywords: [/authorized.?to.?work/i, /legally.?authorized/i, /eligible.?to.?work/i, /work.?authorization/i, /right.?to.?work/i],
  },
  "workAuth.sponsorshipNeeded": {
    keywords: [/sponsor/i, /visa/i, /require.?sponsor/i, /need.?sponsor/i, /immigration/i],
  },

  // Preferences
  "preferences.salaryMin": {
    keywords: [/salary.?expect/i, /desired.?salary/i, /compensation/i, /salary.?min/i, /minimum.?salary/i],
  },

  // Experience
  "experience.currentTitle": {
    keywords: [/current.?title/i, /job.?title/i, /position/i, /^title$/i],
  },
  "experience.currentCompany": {
    keywords: [/current.?company/i, /current.?employer/i, /company.?name/i, /employer/i],
    workdayId: "currentCompany",
  },
  "experience.totalYears": {
    keywords: [/years?.?of.?experience/i, /total.?experience/i, /how.?many.?years/i, /experience$/i],
  },

  // Education
  "education.highest.school": {
    keywords: [/school/i, /university/i, /college/i, /institution/i, /alma.?mater/i],
  },
  "education.highest.degree": {
    keywords: [/degree/i, /education.?level/i, /highest.?education/i, /qualification/i],
  },
  "education.highest.field": {
    keywords: [/field.?of.?study/i, /major/i, /discipline/i, /area.?of.?study/i],
  },
  "education.highest.gpa": {
    keywords: [/gpa/i, /grade.?point/i, /cumulative/i],
  },

  // EEO
  "eeo.gender": {
    keywords: [/gender/i, /sex$/i],
  },
  "eeo.veteranStatus": {
    keywords: [/veteran/i, /military/i, /protected.?veteran/i],
  },
  "eeo.disabilityStatus": {
    keywords: [/disability/i, /disabled/i, /handicap/i],
  },
  "eeo.race": {
    keywords: [/race/i, /ethnicity/i, /ethnic/i],
  },

  // Defaults
  "defaults.heardAbout": {
    keywords: [/how.?did.?you.?hear/i, /hear.?about/i, /referral.?source/i, /source/i, /where.?did.?you.?find/i],
  },
  "defaults.over18": {
    keywords: [/over.?18/i, /at.?least.?18/i, /18.?years/i, /legal.?age/i, /are.?you.?18/i],
  },

  // Additional personal
  "personal.pronouns": {
    keywords: [/pronoun/i, /preferred.?pronoun/i],
  },

  // Additional preferences
  "preferences.salaryMax": {
    keywords: [/salary.?max/i, /maximum.?salary/i, /salary.?upper/i, /salary.?ceiling/i],
  },
  "preferences.willingToRelocate": {
    keywords: [/relocat/i, /willing.?to.?move/i],
  },
  "preferences.noticePeriod": {
    keywords: [/notice.?period/i, /notice.?required/i, /start.?date/i, /when.?can.?you.?start/i, /earliest.?start/i, /availability/i],
  },
  "preferences.preferredWorkMode": {
    keywords: [/work.?mode/i, /work.?arrangement/i, /remote.?or.?on.?site/i, /hybrid/i, /work.?preference/i],
  },

  // Documents
  "documents.resume": {
    keywords: [/resume/i, /cv$/i, /curriculum.?vitae/i],
    isFile: true,
  },
  "documents.coverLetter": {
    keywords: [/cover.?letter/i],
    isFile: true,
  },
};

/**
 * Workday data-automation-id to field path mapping.
 * Checked first before keyword matching.
 */
const WORKDAY_ID_MAP = {};
for (const [fieldPath, config] of Object.entries(FIELD_MAP)) {
  if (config.workdayId) {
    WORKDAY_ID_MAP[config.workdayId] = fieldPath;
  }
}
// Additional Workday automation IDs not tied to FIELD_MAP entries
WORKDAY_ID_MAP["addressSection_addressLine1"] = "personal.location";
WORKDAY_ID_MAP["sourceSection_sourcePrompt"] = "defaults.heardAbout";
