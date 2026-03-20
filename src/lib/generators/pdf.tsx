import React from "react";
import type { ResumeData } from "@/lib/types";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Link,
  Font,
} from "@react-pdf/renderer";

// ── Register custom fonts ──
Font.register({
  family: "Source Sans 3",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-400-normal.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-600-normal.ttf",
      fontWeight: "semibold",
    },
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-700-normal.ttf",
      fontWeight: "bold",
    },
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@latest/latin-400-italic.ttf",
      fontStyle: "italic",
    },
  ],
});

// Disable hyphenation for cleaner text
Font.registerHyphenationCallback((word) => [word]);

const COLORS = {
  primary: "#1A1A1A",
  secondary: "#4A4A4A",
  muted: "#6B7280",
  accent: "#2563EB",
  divider: "#D1D5DB",
  rule: "#1A1A1A",
};

const FONT = "Source Sans 3";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 40,
    fontFamily: FONT,
    fontSize: 9.5,
    color: COLORS.primary,
    lineHeight: 1.3,
  },
  // ── Header ──
  header: {
    marginBottom: 1,
    textAlign: "center",
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.primary,
    letterSpacing: 1.0,
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    fontSize: 8.5,
    color: COLORS.muted,
    gap: 0,
  },
  contactItem: {
    paddingHorizontal: 4,
    color: COLORS.muted,
  },
  contactLink: {
    paddingHorizontal: 4,
    color: COLORS.accent,
    textDecoration: "none",
  },
  contactSep: {
    color: COLORS.divider,
    fontSize: 8,
  },
  headerRule: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.rule,
    marginTop: 6,
    marginBottom: 2,
  },
  // ── Sections ──
  section: {
    marginTop: 6,
    marginBottom: 1,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 2.0,
    marginBottom: 1,
  },
  sectionRule: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.divider,
    marginBottom: 4,
  },
  // ── Summary ──
  summary: {
    fontSize: 9,
    lineHeight: 1.4,
    color: COLORS.secondary,
  },
  // ── Experience ──
  experienceItem: {
    marginBottom: 4,
  },
  expHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 2,
    gap: 8,
  },
  expTitleCompany: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 1,
    flexWrap: "wrap",
    maxWidth: "75%",
  },
  expTitle: {
    fontWeight: "bold",
    fontSize: 10,
    color: COLORS.primary,
  },
  expCompanySep: {
    fontSize: 9,
    color: COLORS.muted,
    paddingHorizontal: 3,
  },
  expCompany: {
    fontSize: 9.5,
    fontStyle: "italic",
    color: COLORS.secondary,
  },
  expDate: {
    fontSize: 8.5,
    color: COLORS.muted,
    textAlign: "right",
    flexShrink: 0,
    minWidth: 80,
  },
  // ── Bullets ──
  bullet: {
    flexDirection: "row",
    marginBottom: 1,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 9,
    color: COLORS.muted,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.4,
    color: COLORS.secondary,
  },
  // ── Education ──
  eduItem: {
    marginBottom: 3,
  },
  eduHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  eduDegree: {
    fontWeight: "bold",
    fontSize: 9.5,
    color: COLORS.primary,
    maxWidth: "75%",
    flexShrink: 1,
  },
  eduDate: {
    fontSize: 8.5,
    color: COLORS.muted,
    flexShrink: 0,
    minWidth: 50,
  },
  eduSchool: {
    fontSize: 9,
    fontStyle: "italic",
    color: COLORS.secondary,
  },
  eduGpa: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginLeft: 8,
  },
  // ── Projects ──
  projectItem: {
    marginBottom: 4,
  },
  projectName: {
    fontWeight: "bold",
    fontSize: 9.5,
    color: COLORS.primary,
  },
  projectUrl: {
    fontSize: 8,
    color: COLORS.accent,
    marginLeft: 4,
    textDecoration: "none",
  },
  projectDesc: {
    fontSize: 9,
    color: COLORS.secondary,
    lineHeight: 1.4,
    paddingLeft: 4,
  },
  // ── Publications ──
  pubItem: {
    marginBottom: 3,
  },
  pubTitle: {
    fontWeight: "bold",
    fontSize: 9,
    color: COLORS.primary,
  },
  pubDetails: {
    fontSize: 8.5,
    color: COLORS.secondary,
    fontStyle: "italic",
  },
  pubLink: {
    fontSize: 8,
    color: COLORS.accent,
    textDecoration: "none",
  },
  // ── Certifications ──
  certItem: {
    marginBottom: 3,
  },
  certName: {
    fontWeight: "bold",
    fontSize: 9,
    color: COLORS.primary,
  },
  certIssuer: {
    fontSize: 8.5,
    color: COLORS.secondary,
    fontStyle: "italic",
  },
  certMeta: {
    fontSize: 8,
    color: COLORS.muted,
  },
  // ── Skills ──
  skillsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 2,
  },
  skillCategory: {
    fontWeight: "bold",
    fontSize: 9,
    color: COLORS.primary,
    width: 95,
    flexShrink: 0,
  },
  skillList: {
    fontSize: 9,
    color: COLORS.secondary,
    flex: 1,
  },
});

function SectionHeading({ title }: { title: string }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionRule} />
    </>
  );
}

function cleanUrl(url: string): string {
  return url
    .replace(/https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "");
}

function ResumeDocument({ data }: { data: ResumeData }) {
  const contactItems: Array<{ text: string; href?: string }> = [];
  if (data.email)
    contactItems.push({ text: data.email, href: `mailto:${data.email}` });
  if (data.phone) contactItems.push({ text: data.phone });
  if (data.location) contactItems.push({ text: data.location });
  if (data.linkedin)
    contactItems.push({ text: cleanUrl(data.linkedin), href: data.linkedin });
  if (data.github)
    contactItems.push({ text: cleanUrl(data.github), href: data.github });
  if (data.website)
    contactItems.push({ text: cleanUrl(data.website), href: data.website });

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{data.name}</Text>
          {contactItems.length > 0 && (
            <View style={styles.contactRow}>
              {contactItems.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Text style={styles.contactSep}> | </Text>}
                  {item.href ? (
                    <Link src={item.href} style={styles.contactLink}>
                      {item.text}
                    </Link>
                  ) : (
                    <Text style={styles.contactItem}>{item.text}</Text>
                  )}
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
        <View style={styles.headerRule} />

        {/* Summary */}
        {data.summary && (
          <View style={styles.section}>
            <SectionHeading title="Summary" />
            <Text style={styles.summary}>{data.summary}</Text>
          </View>
        )}

        {/* Experience */}
        {data.experiences && data.experiences.length > 0 && (
          <View style={styles.section}>
            <SectionHeading title="Experience" />
            {data.experiences.map((exp, i) => (
              <View key={i} style={styles.experienceItem}>
                <View style={styles.expHeaderRow}>
                  <View style={styles.expTitleCompany}>
                    <Text style={styles.expTitle}>{exp.title}</Text>
                    <Text style={styles.expCompanySep}>|</Text>
                    <Text style={styles.expCompany}>{exp.company}</Text>
                  </View>
                  <Text style={styles.expDate}>
                    {exp.startDate} — {exp.endDate || "Present"}
                  </Text>
                </View>
                {exp.bullets?.map((bullet, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {data.projects && data.projects.length > 0 && (
          <View style={styles.section}>
            <SectionHeading title="Projects" />
            {data.projects.map((proj, i) => (
              <View key={i} style={styles.projectItem}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text style={styles.projectName}>{proj.name}</Text>
                  {proj.url && (
                    <Link src={proj.url} style={styles.projectUrl}>
                      {cleanUrl(proj.url)}
                    </Link>
                  )}
                </View>
                {proj.description && (
                  <View style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.projectDesc}>{proj.description}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {data.educations && data.educations.length > 0 && (
          <View style={styles.section}>
            <SectionHeading title="Education" />
            {data.educations.map((edu, i) => (
              <View key={i} style={styles.eduItem}>
                <View style={styles.eduHeaderRow}>
                  <Text style={styles.eduDegree}>
                    {edu.degree}
                    {edu.field ? `, ${edu.field}` : ""}
                  </Text>
                  {edu.endDate && (
                    <Text style={styles.eduDate}>{edu.endDate}</Text>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text style={styles.eduSchool}>{edu.school}</Text>
                  {edu.gpa && (
                    <Text style={styles.eduGpa}>GPA: {edu.gpa}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Publications */}
        {data.publications && data.publications.length > 0 && (
          <View style={styles.section}>
            <SectionHeading title="Publications" />
            {data.publications.map((pub, i) => (
              <View key={i} style={styles.pubItem}>
                <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" }}>
                  <Text style={styles.pubTitle}>{pub.title}</Text>
                  {pub.publisher && (
                    <Text style={styles.pubDetails}>{" — "}{pub.publisher}</Text>
                  )}
                  {pub.date && (
                    <Text style={{ ...styles.certMeta, marginLeft: 4 }}>{pub.date}</Text>
                  )}
                </View>
                {(pub.url || pub.doi) && (
                  <Link src={pub.url || `https://doi.org/${pub.doi}`} style={styles.pubLink}>
                    {pub.doi ? `DOI: ${pub.doi}` : cleanUrl(pub.url!)}
                  </Link>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Certifications */}
        {data.certifications && data.certifications.length > 0 && (
          <View style={styles.section}>
            <SectionHeading title="Certifications" />
            {data.certifications.map((cert, i) => (
              <View key={i} style={styles.certItem}>
                <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" }}>
                  <Text style={styles.certName}>{cert.name}</Text>
                  {cert.issuer && (
                    <Text style={styles.certIssuer}>{" — "}{cert.issuer}</Text>
                  )}
                  {cert.date && (
                    <Text style={{ ...styles.certMeta, marginLeft: 4 }}>{cert.date}</Text>
                  )}
                  {cert.expiryDate && (
                    <Text style={styles.certMeta}>{" (exp. "}{cert.expiryDate}{")"}</Text>
                  )}
                </View>
                {cert.credentialId && (
                  <Text style={styles.certMeta}>ID: {cert.credentialId}</Text>
                )}
                {cert.url && (
                  <Link src={cert.url} style={styles.pubLink}>
                    {cleanUrl(cert.url)}
                  </Link>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {data.skills && Object.keys(data.skills).length > 0 && (
          <View style={styles.section}>
            <SectionHeading title="Technical Skills" />
            {Object.entries(data.skills).map(
              ([category, skillList], i) =>
                skillList.length > 0 && (
                  <View key={i} style={styles.skillsRow}>
                    <Text style={styles.skillCategory}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}:
                    </Text>
                    <Text style={styles.skillList}>
                      {skillList.join(", ")}
                    </Text>
                  </View>
                )
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function generatePdf(data: ResumeData): Promise<Buffer> {
  const buffer = await renderToBuffer(<ResumeDocument data={data} />);
  return Buffer.from(buffer);
}
