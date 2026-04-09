/**
 * Field mapping rules for ATS form auto-fill.
 *
 * Each key is a PrefillData field path. The value is an object with:
 * - keywords: array of regex patterns to match against field labels, names, ids, placeholders
 * - workdayId: optional data-automation-id value for Workday-specific matching
 * - type: "text" | "select" | "checkbox" | "file" | "radio"
 */

const FIELD_MAP = {
  // Personal info
  "personal.firstName": {
    keywords: [/first.?name/i, /fname/i, /given.?name/i, /^first$/i],
    workdayId: "legalNameSection_firstName",
    type: "text",
  },
  "personal.lastName": {
    keywords: [/last.?name/i, /lname/i, /surname/i, /family.?name/i, /^last$/i],
    workdayId: "legalNameSection_lastName",
    type: "text",
  },
  "personal.email": {
    keywords: [/e.?mail/i, /email.?address/i],
    workdayId: "email",
    type: "text",
  },
  "personal.phone": {
    keywords: [/phone/i, /mobile/i, /telephone/i, /cell/i, /contact.?number/i],
    workdayId: "phone",
    type: "text",
  },
  "personal.location": {
    keywords: [/city/i, /location/i, /address/i],
    workdayId: "addressSection_city",
    type: "text",
  },
  "personal.linkedin": {
    keywords: [/linkedin/i, /linked.?in/i],
    workdayId: "linkedinQuestion",
    type: "text",
  },
  "personal.github": {
    keywords: [/github/i, /git.?hub/i],
    type: "text",
  },
  "personal.website": {
    keywords: [/website/i, /portfolio/i, /personal.?url/i, /homepage/i],
    workdayId: "websiteQuestion",
    type: "text",
  },

  // Work authorization
  "workAuth.authorized": {
    keywords: [/authorized.?to.?work/i, /legally.?authorized/i, /eligible.?to.?work/i, /work.?authorization/i, /right.?to.?work/i],
    type: "radio",
  },
  "workAuth.sponsorshipNeeded": {
    keywords: [/sponsor/i, /visa/i, /require.?sponsor/i, /need.?sponsor/i, /immigration/i],
    type: "radio",
  },

  // Preferences
  "preferences.salaryMin": {
    keywords: [/salary.?expect/i, /desired.?salary/i, /compensation/i, /salary.?min/i, /minimum.?salary/i],
    type: "text",
  },

  // Experience
  "experience.currentTitle": {
    keywords: [/current.?title/i, /job.?title/i, /position/i, /^title$/i],
    type: "text",
  },
  "experience.currentCompany": {
    keywords: [/current.?company/i, /current.?employer/i, /company.?name/i, /employer/i],
    workdayId: "currentCompany",
    type: "text",
  },
  "experience.totalYears": {
    keywords: [/years?.?of.?experience/i, /total.?experience/i, /how.?many.?years/i],
    type: "text",
  },

  // Education
  "education.highest.school": {
    keywords: [/school/i, /university/i, /college/i, /institution/i, /alma.?mater/i],
    type: "text",
  },
  "education.highest.degree": {
    keywords: [/degree/i, /education.?level/i, /highest.?education/i, /qualification/i],
    type: "text",
  },
  "education.highest.field": {
    keywords: [/field.?of.?study/i, /major/i, /discipline/i, /area.?of.?study/i],
    type: "text",
  },
  "education.highest.gpa": {
    keywords: [/gpa/i, /grade.?point/i, /cumulative/i],
    type: "text",
  },

  // EEO
  "eeo.gender": {
    keywords: [/gender/i, /sex$/i],
    type: "select",
  },
  "eeo.veteranStatus": {
    keywords: [/veteran/i, /military/i, /protected.?veteran/i],
    type: "select",
  },
  "eeo.disabilityStatus": {
    keywords: [/disability/i, /disabled/i, /handicap/i],
    type: "select",
  },
  "eeo.race": {
    keywords: [/race/i, /ethnicity/i, /ethnic/i],
    type: "select",
  },

  // Defaults
  "defaults.heardAbout": {
    keywords: [/how.?did.?you.?hear/i, /hear.?about/i, /referral.?source/i, /source/i, /where.?did.?you.?find/i],
    type: "text",
  },
  "defaults.over18": {
    keywords: [/over.?18/i, /at.?least.?18/i, /18.?years/i, /legal.?age/i, /are.?you.?18/i],
    type: "checkbox",
  },

  // Documents
  "documents.resume": {
    keywords: [/resume/i, /cv$/i, /curriculum.?vitae/i],
    type: "file",
  },
  "documents.coverLetter": {
    keywords: [/cover.?letter/i],
    type: "file",
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
