import React from "react";
import type { ResumeData } from "@/lib/types";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#333",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    paddingBottom: 12,
  },
  name: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#1e293b",
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 9,
    color: "#64748b",
  },
  contactItem: {
    marginRight: 12,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  summary: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "#475569",
  },
  experienceItem: {
    marginBottom: 8,
  },
  expHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  expTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: "#1e293b",
  },
  expDate: {
    fontSize: 9,
    color: "#64748b",
  },
  expCompany: {
    fontSize: 10,
    color: "#475569",
    marginBottom: 3,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 2,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 10,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.4,
  },
  eduItem: {
    marginBottom: 4,
  },
  eduTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  eduSchool: {
    fontSize: 9,
    color: "#475569",
  },
  projectItem: {
    marginBottom: 6,
  },
  projectName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  projectDesc: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.4,
  },
  skillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 3,
  },
  skillCategory: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginRight: 4,
  },
  skillList: {
    fontSize: 9,
    color: "#475569",
  },
});


function ResumeDocument({ data }: { data: ResumeData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{data.name}</Text>
          <View style={styles.contactRow}>
            {data.email && <Text style={styles.contactItem}>{data.email}</Text>}
            {data.phone && <Text style={styles.contactItem}>{data.phone}</Text>}
            {data.location && (
              <Text style={styles.contactItem}>{data.location}</Text>
            )}
            {data.linkedin && (
              <Text style={styles.contactItem}>{data.linkedin}</Text>
            )}
            {data.github && (
              <Text style={styles.contactItem}>{data.github}</Text>
            )}
            {data.website && (
              <Text style={styles.contactItem}>{data.website}</Text>
            )}
          </View>
        </View>

        {/* Summary */}
        {data.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{data.summary}</Text>
          </View>
        )}

        {/* Experience */}
        {data.experiences && data.experiences.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {data.experiences.map((exp, i) => (
              <View key={i} style={styles.experienceItem}>
                <View style={styles.expHeader}>
                  <Text style={styles.expTitle}>{exp.title}</Text>
                  <Text style={styles.expDate}>
                    {exp.startDate} — {exp.endDate || "Present"}
                  </Text>
                </View>
                <Text style={styles.expCompany}>{exp.company}</Text>
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
            <Text style={styles.sectionTitle}>Projects</Text>
            {data.projects.map((proj, i) => (
              <View key={i} style={styles.projectItem}>
                <Text style={styles.projectName}>
                  {proj.name}
                  {proj.url ? ` — ${proj.url}` : ""}
                </Text>
                {proj.description && (
                  <Text style={styles.projectDesc}>{proj.description}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {data.educations && data.educations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {data.educations.map((edu, i) => (
              <View key={i} style={styles.eduItem}>
                <Text style={styles.eduTitle}>
                  {edu.degree}
                  {edu.field ? ` in ${edu.field}` : ""}
                  {edu.gpa ? ` — GPA: ${edu.gpa}` : ""}
                </Text>
                <Text style={styles.eduSchool}>
                  {edu.school}
                  {edu.endDate ? ` (${edu.endDate})` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {data.skills && Object.keys(data.skills).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {Object.entries(data.skills).map(
              ([category, skillList], i) =>
                skillList.length > 0 && (
                  <View key={i} style={styles.skillsRow}>
                    <Text style={styles.skillCategory}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}:
                    </Text>
                    <Text style={styles.skillList}>{skillList.join(", ")}</Text>
                  </View>
                )
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function generatePdf(
  data: ResumeData
): Promise<Buffer> {
  const buffer = await renderToBuffer(<ResumeDocument data={data} />);
  return Buffer.from(buffer);
}
