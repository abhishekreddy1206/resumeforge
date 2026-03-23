/** Structured diff entry for rendering inline diffs in the UI. */
export interface DiffEntry {
  section: string;
  type: "field" | "text" | "list" | "badges";
  label: string;
  oldValue?: string;
  newValue?: string;
  added?: string[];
  removed?: string[];
  modified?: Array<{ old: string; new: string }>;
}

/**
 * Compute a structured diff between two profiles for rendering rich inline diffs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeDetailedDiff(oldProfile: any, newProfile: any): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  // Simple fields
  for (const [key, label] of [
    ["name", "Name"],
    ["email", "Email"],
    ["phone", "Phone"],
    ["location", "Location"],
  ] as const) {
    if ((oldProfile[key] || "") !== (newProfile[key] || "")) {
      diffs.push({
        section: "Details",
        type: "field",
        label,
        oldValue: oldProfile[key] || "(empty)",
        newValue: newProfile[key] || "(empty)",
      });
    }
  }

  // Summary
  if ((oldProfile.summary || "") !== (newProfile.summary || "")) {
    diffs.push({
      section: "Summary",
      type: "text",
      label: "Summary",
      oldValue: oldProfile.summary || "",
      newValue: newProfile.summary || "",
    });
  }

  // Experiences
  const oldExps = oldProfile.experiences || [];
  const newExps = newProfile.experiences || [];
  // Match by company+title
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expKey = (e: any) => `${e.company}|||${e.title}`;
  const oldExpMap = new Map(oldExps.map((e: Record<string, unknown>) => [expKey(e), e]));
  const newExpMap = new Map(newExps.map((e: Record<string, unknown>) => [expKey(e), e]));

  for (const [key, newExp] of newExpMap) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ne = newExp as any;
    if (!oldExpMap.has(key)) {
      const bullets = (ne.bullets || []) as string[];
      diffs.push({
        section: "Experience",
        type: "list",
        label: `${ne.title} at ${ne.company} (added)`,
        added: bullets.length > 0 ? bullets : ["New position added"],
        removed: [],
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oe = oldExpMap.get(key) as any;
      const oldBullets: string[] = oe.bullets || [];
      const newBullets: string[] = ne.bullets || [];
      const addedBullets = newBullets.filter((b: string) => !oldBullets.includes(b));
      const removedBullets = oldBullets.filter((b: string) => !newBullets.includes(b));
      if (addedBullets.length > 0 || removedBullets.length > 0) {
        diffs.push({
          section: "Experience",
          type: "list",
          label: `${ne.title} at ${ne.company}`,
          added: addedBullets,
          removed: removedBullets,
        });
      }
    }
  }
  for (const [key, oldExp] of oldExpMap) {
    if (!newExpMap.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oe = oldExp as any;
      diffs.push({
        section: "Experience",
        type: "list",
        label: `${oe.title} at ${oe.company} (removed)`,
        added: [],
        removed: ["Entire position removed"],
      });
    }
  }

  // Skills
  const oldSkills = (oldProfile.skills || []).map((s: { name: string }) => s.name);
  const newSkills = (newProfile.skills || []).map((s: { name: string }) => s.name);
  const addedSkills = newSkills.filter((s: string) => !oldSkills.includes(s));
  const removedSkills = oldSkills.filter((s: string) => !newSkills.includes(s));
  if (addedSkills.length > 0 || removedSkills.length > 0) {
    diffs.push({
      section: "Skills",
      type: "badges",
      label: "Skills",
      added: addedSkills,
      removed: removedSkills,
    });
  }

  // Projects
  const oldProjs = oldProfile.projects || [];
  const newProjs = newProfile.projects || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addedProjs = newProjs.filter((p: any) => !oldProjs.some((op: any) => op.name === p.name));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removedProjs = oldProjs.filter((p: any) => !newProjs.some((np: any) => np.name === p.name));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modifiedProjs = newProjs.filter((np: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const op = oldProjs.find((o: any) => o.name === np.name);
    return op && JSON.stringify(op) !== JSON.stringify(np);
  });
  if (addedProjs.length > 0 || removedProjs.length > 0 || modifiedProjs.length > 0) {
    diffs.push({
      section: "Projects",
      type: "badges",
      label: "Projects",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      added: [...addedProjs.map((p: any) => p.name), ...modifiedProjs.map((p: any) => `${p.name} (edited)`)],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      removed: removedProjs.map((p: any) => p.name),
    });
  }

  // Education
  const oldEdus = oldProfile.educations || [];
  const newEdus = newProfile.educations || [];
  if (JSON.stringify(oldEdus) !== JSON.stringify(newEdus)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addedEdus = newEdus.filter((e: any) => !oldEdus.some((oe: any) => oe.school === e.school && oe.degree === e.degree));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removedEdus = oldEdus.filter((e: any) => !newEdus.some((ne: any) => ne.school === e.school && ne.degree === e.degree));
    if (addedEdus.length > 0 || removedEdus.length > 0) {
      diffs.push({
        section: "Education",
        type: "badges",
        label: "Education",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        added: addedEdus.map((e: any) => `${e.degree} at ${e.school}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        removed: removedEdus.map((e: any) => `${e.degree} at ${e.school}`),
      });
    }
  }

  return diffs;
}

/**
 * Compute a structured diff between two skill lists.
 */
export interface SkillDiffResult {
  added: Array<{ name: string; category: string }>;
  removed: Array<{ name: string; category: string }>;
  recategorized: Array<{ name: string; oldCategory: string; newCategory: string }>;
  unchanged: number;
}

export function computeSkillsDiff(
  oldSkills: Array<{ name: string; category: string }>,
  newSkills: Array<{ name: string; category: string }>
): SkillDiffResult {
  const oldMap = new Map(oldSkills.map((s) => [s.name.toLowerCase(), s]));
  const newMap = new Map(newSkills.map((s) => [s.name.toLowerCase(), s]));

  const added: Array<{ name: string; category: string }> = [];
  const removed: Array<{ name: string; category: string }> = [];
  const recategorized: Array<{ name: string; oldCategory: string; newCategory: string }> = [];
  let unchanged = 0;

  for (const [key, ns] of newMap) {
    const os = oldMap.get(key);
    if (!os) {
      added.push(ns);
    } else if (os.category !== ns.category) {
      recategorized.push({ name: ns.name, oldCategory: os.category, newCategory: ns.category });
    } else {
      unchanged++;
    }
  }

  for (const [key, os] of oldMap) {
    if (!newMap.has(key)) {
      removed.push(os);
    }
  }

  return { added, removed, recategorized, unchanged };
}

/**
 * Compare two serialized profiles and return a human-readable list of changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function summarizeChanges(oldProfile: any, newProfile: any): string[] {
  const changes: string[] = [];

  if (oldProfile.name !== newProfile.name)
    changes.push(`Name: "${oldProfile.name}" → "${newProfile.name}"`);
  if (oldProfile.summary !== newProfile.summary)
    changes.push("Summary updated");
  if (oldProfile.email !== newProfile.email) changes.push("Email updated");
  if (oldProfile.phone !== newProfile.phone) changes.push("Phone updated");
  if (oldProfile.location !== newProfile.location)
    changes.push("Location updated");

  const oldExpCount = oldProfile.experiences?.length || 0;
  const newExpCount = newProfile.experiences?.length || 0;
  if (newExpCount > oldExpCount)
    changes.push(`${newExpCount - oldExpCount} experience(s) added`);
  else if (newExpCount < oldExpCount)
    changes.push(`${oldExpCount - newExpCount} experience(s) removed`);
  else if (
    oldExpCount > 0 &&
    JSON.stringify(oldProfile.experiences) !==
      JSON.stringify(newProfile.experiences)
  )
    changes.push("Experience details modified");

  const oldSkillNames = (oldProfile.skills || [])
    .map((s: { name: string }) => s.name)
    .sort();
  const newSkillNames = (newProfile.skills || [])
    .map((s: { name: string }) => s.name)
    .sort();
  const addedSkills = newSkillNames.filter(
    (s: string) => !oldSkillNames.includes(s)
  );
  const removedSkills = oldSkillNames.filter(
    (s: string) => !newSkillNames.includes(s)
  );
  if (addedSkills.length > 0)
    changes.push(`Skills added: ${addedSkills.join(", ")}`);
  if (removedSkills.length > 0)
    changes.push(`Skills removed: ${removedSkills.join(", ")}`);

  const oldProjCount = oldProfile.projects?.length || 0;
  const newProjCount = newProfile.projects?.length || 0;
  if (newProjCount !== oldProjCount)
    changes.push(`Projects: ${oldProjCount} → ${newProjCount}`);
  else if (
    oldProjCount > 0 &&
    JSON.stringify(oldProfile.projects) !== JSON.stringify(newProfile.projects)
  )
    changes.push("Project details modified");

  const oldEduCount = oldProfile.educations?.length || 0;
  const newEduCount = newProfile.educations?.length || 0;
  if (newEduCount !== oldEduCount)
    changes.push(`Education: ${oldEduCount} → ${newEduCount}`);

  if (changes.length === 0) changes.push("Minor formatting changes");
  return changes;
}

/**
 * Serialize a Prisma profile (with JSON-encoded fields) into a plain object
 * suitable for AI consumption and diffing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeProfile(p: any) {
  return {
    name: p.name,
    email: p.email,
    phone: p.phone,
    location: p.location,
    summary: p.summary,
    linkedin: p.linkedin,
    github: p.github,
    website: p.website,
    twitter: p.twitter,
    pinterest: p.pinterest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    experiences: (p.experiences || []).map((e: any) => ({
      company: e.company,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      current: e.current,
      bullets:
        typeof e.bullets === "string" ? JSON.parse(e.bullets) : e.bullets,
      skills:
        typeof e.skills === "string" ? JSON.parse(e.skills) : e.skills || [],
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    educations: (p.educations || []).map((e: any) => ({
      school: e.school,
      degree: e.degree,
      field: e.field,
      startDate: e.startDate,
      endDate: e.endDate,
      gpa: e.gpa,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projects: (p.projects || []).map((pr: any) => ({
      name: pr.name,
      description: pr.description,
      url: pr.url,
      skills:
        typeof pr.skills === "string"
          ? JSON.parse(pr.skills)
          : pr.skills || [],
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skills: (p.skills || []).map((s: any) => ({
      name: s.name,
      category: s.category,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publications: (p.publications || []).map((pub: any) => ({
      title: pub.title,
      publisher: pub.publisher,
      date: pub.date,
      url: pub.url,
      doi: pub.doi,
      description: pub.description,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    certifications: (p.certifications || []).map((c: any) => ({
      name: c.name,
      issuer: c.issuer,
      date: c.date,
      expiryDate: c.expiryDate,
      credentialId: c.credentialId,
      url: c.url,
    })),
    recommendations: (() => {
      try {
        const raw = typeof p.recommendations === "string"
          ? JSON.parse(p.recommendations)
          : p.recommendations;
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    })(),
    additionalEmails: (() => {
      try {
        const raw = typeof p.additionalEmails === "string"
          ? JSON.parse(p.additionalEmails)
          : p.additionalEmails;
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    })(),
  };
}
