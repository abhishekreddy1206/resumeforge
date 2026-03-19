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
} from "@react-pdf/renderer";

const COLORS = {
  primary: "#1a1a1a",
  secondary: "#4a4a4a",
  muted: "#6b7280",
  accent: "#2563eb",
  divider: "#d1d5db",
  light: "#f3f4f6",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLORS.primary,
    lineHeight: 1.3,
  },
  // ── Header ──
  header: {
    marginBottom: 2,
    textAlign: "center",
  },
  name: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    fontSize: 8.5,
    color: COLORS.muted,
  },
  contactItem: {
    paddingHorizontal: 5,
  },
  contactSep: {
    color: COLORS.divider,
  },
  headerRule: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    marginTop: 7,
    marginBottom: 2,
  },
  // ── Sections ──
  section: {
    marginTop: 7,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 1,
  },
  sectionRule: {
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.divider,
    marginBottom: 5,
  },
  // ── Summary ──
  summary: {
    fontSize: 9,
    lineHeight: 1.5,
    color: COLORS.secondary,
  },
  // ── Experience ──
  experienceItem: {
    marginBottom: 6,
  },
  expHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 1,
  },
  expTitleCompany: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 1,
    maxWidth: "78%",
  },
  expTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: COLORS.primary,
  },
  expCompanySep: {
    fontSize: 9,
    color: COLORS.muted,
    paddingHorizontal: 4,
  },
  expCompany: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Oblique",
    color: COLORS.secondary,
  },
  expDate: {
    fontSize: 8.5,
    color: COLORS.muted,
    textAlign: "right",
    flexShrink: 0,
  },
  // ── Bullets ──
  bullet: {
    flexDirection: "row",
    marginBottom: 1.5,
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
    lineHeight: 1.45,
    color: COLORS.secondary,
  },
  // ── Education ──
  eduItem: {
    marginBottom: 4,
  },
  eduHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  eduDegree: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: COLORS.primary,
    maxWidth: "78%",
  },
  eduDate: {
    fontSize: 8.5,
    color: COLORS.muted,
    flexShrink: 0,
  },
  eduSchool: {
    fontSize: 9,
    fontFamily: "Helvetica-Oblique",
    color: COLORS.secondary,
  },
  eduGpa: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginLeft: 8,
  },
  // ── Projects ──
  projectItem: {
    marginBottom: 5,
  },
  projectName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: COLORS.primary,
  },
  projectUrl: {
    fontSize: 8,
    color: COLORS.accent,
    marginLeft: 4,
  },
  projectDesc: {
    fontSize: 9,
    color: COLORS.secondary,
    lineHeight: 1.45,
    paddingLeft: 4,
  },
  // ── Skills ──
  skillsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 2.5,
  },
  skillCategory: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLORS.primary,
    width: 100,
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

function ResumeDocument({ data }: { data: ResumeData }) {
  const contactParts = [
    data.email,
    data.phone,
    data.location,
    data.linkedin,
    data.github,
    data.website,
  ].filter(Boolean) as string[];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{data.name}</Text>
          {contactParts.length > 0 && (
            <View style={styles.contactRow}>
              {contactParts.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Text style={styles.contactSep}>|</Text>}
                  {item.startsWith("http") ? (
                    <Link src={item} style={styles.contactItem}>
                      {item
                        .replace(/https?:\/\/(www\.)?/, "")
                        .replace(/\/$/, "")}
                    </Link>
                  ) : (
                    <Text style={styles.contactItem}>{item}</Text>
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
                      {proj.url
                        .replace(/https?:\/\/(www\.)?/, "")
                        .replace(/\/$/, "")}
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
