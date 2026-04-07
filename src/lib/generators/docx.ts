import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Packer,
  TabStopPosition,
  TabStopType,
  HeadingLevel,
  convertInchesToTwip,
} from "docx";
import type { ResumeData } from "@/lib/types";

const COLORS = {
  primary: "1A1A1A",
  secondary: "4A4A4A",
  muted: "6B7280",
  accent: "2563EB",
  divider: "D1D5DB",
};

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 21, // 10.5pt
        color: COLORS.primary,
        font: "Calibri",
        characterSpacing: 60, // tracking
      }),
    ],
    spacing: { before: 200, after: 60 },
    border: {
      bottom: {
        color: COLORS.divider,
        space: 2,
        style: BorderStyle.SINGLE,
        size: 4,
      },
    },
  });
}

function contactSeparator(): TextRun {
  return new TextRun({
    text: "  |  ",
    size: 17,
    color: COLORS.divider,
    font: "Calibri",
  });
}

export async function generateDocx(data: ResumeData): Promise<Buffer> {
  const children: Paragraph[] = [];

  // ── Name ──
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: data.name,
          bold: true,
          size: 32, // 16pt
          color: COLORS.primary,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    })
  );

  // ── Contact ──
  const contactParts = [
    data.email,
    data.phone,
    data.location,
    data.linkedin,
    data.github,
    data.website,
    data.twitter,
    data.pinterest,
  ].filter(Boolean) as string[];

  if (contactParts.length > 0) {
    const contactRuns: TextRun[] = [];
    contactParts.forEach((part, i) => {
      if (i > 0) contactRuns.push(contactSeparator());
      const display = part.startsWith("http")
        ? part.replace(/https?:\/\/(www\.)?/, "").replace(/\/$/, "")
        : part;
      contactRuns.push(
        new TextRun({
          text: display,
          size: 17, // 8.5pt
          color: COLORS.muted,
          font: "Calibri",
        })
      );
    });

    children.push(
      new Paragraph({
        children: contactRuns,
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      })
    );
  }

  // Thick rule under header
  children.push(
    new Paragraph({
      children: [],
      spacing: { before: 0, after: 40 },
      border: {
        bottom: {
          color: COLORS.primary,
          space: 1,
          style: BorderStyle.SINGLE,
          size: 12,
        },
      },
    })
  );

  // ── Summary ──
  if (data.summary) {
    children.push(sectionHeading("Summary"));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: data.summary,
            size: 19, // 9.5pt
            color: COLORS.secondary,
            font: "Calibri",
          }),
        ],
        spacing: { after: 60 },
      })
    );
  }

  // ── Core Competencies ──
  if (data.coreCompetencies && data.coreCompetencies.length > 0) {
    children.push(sectionHeading("Core Competencies"));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: data.coreCompetencies.join("  •  "),
            size: 19, // 9.5pt
            color: COLORS.secondary,
            font: "Calibri",
          }),
        ],
        spacing: { after: 60 },
      })
    );
  }

  // ── Experience ──
  if (data.experiences && data.experiences.length > 0) {
    children.push(sectionHeading("Experience"));
    for (const exp of data.experiences) {
      // Title | Company \t Date
      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          children: [
            new TextRun({
              text: exp.title,
              bold: true,
              size: 20, // 10pt
              color: COLORS.primary,
              font: "Calibri",
            }),
            new TextRun({
              text: `  |  ${exp.company}`,
              size: 19,
              italics: true,
              color: COLORS.secondary,
              font: "Calibri",
            }),
            new TextRun({ text: "\t" }),
            new TextRun({
              text: `${exp.startDate} – ${exp.endDate || "Present"}`,
              size: 17,
              color: COLORS.muted,
              font: "Calibri",
            }),
          ],
          spacing: { before: 80, after: 30 },
        })
      );

      for (const bullet of exp.bullets || []) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: bullet,
                size: 19,
                color: COLORS.secondary,
                font: "Calibri",
              }),
            ],
            bullet: { level: 0 },
            spacing: { after: 15 },
            indent: { left: convertInchesToTwip(0.25) },
          })
        );
      }
    }
  }

  // ── Projects ──
  if (data.projects && data.projects.length > 0) {
    children.push(sectionHeading("Projects"));
    for (const proj of data.projects) {
      const projRuns: TextRun[] = [
        new TextRun({
          text: proj.name,
          bold: true,
          size: 19,
          color: COLORS.primary,
          font: "Calibri",
        }),
      ];
      if (proj.url) {
        projRuns.push(
          new TextRun({
            text: `  —  ${proj.url.replace(/https?:\/\/(www\.)?/, "").replace(/\/$/, "")}`,
            size: 17,
            color: COLORS.accent,
            font: "Calibri",
          })
        );
      }
      children.push(
        new Paragraph({
          children: projRuns,
          spacing: { before: 60, after: 15 },
        })
      );
      if (proj.description) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: proj.description,
                size: 19,
                color: COLORS.secondary,
                font: "Calibri",
              }),
            ],
            bullet: { level: 0 },
            spacing: { after: 15 },
            indent: { left: convertInchesToTwip(0.25) },
          })
        );
      }
    }
  }

  // ── Education ──
  if (data.educations && data.educations.length > 0) {
    children.push(sectionHeading("Education"));
    for (const edu of data.educations) {
      const degreeText = `${edu.degree}${edu.field ? `, ${edu.field}` : ""}`;
      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          children: [
            new TextRun({
              text: degreeText,
              bold: true,
              size: 19,
              color: COLORS.primary,
              font: "Calibri",
            }),
            new TextRun({ text: "\t" }),
            new TextRun({
              text: edu.endDate || "",
              size: 17,
              color: COLORS.muted,
              font: "Calibri",
            }),
          ],
          spacing: { before: 60, after: 10 },
        })
      );

      const schoolRuns: TextRun[] = [
        new TextRun({
          text: edu.school,
          italics: true,
          size: 19,
          color: COLORS.secondary,
          font: "Calibri",
        }),
      ];
      if (edu.gpa) {
        schoolRuns.push(
          new TextRun({
            text: `  |  GPA: ${edu.gpa}`,
            size: 17,
            color: COLORS.muted,
            font: "Calibri",
          })
        );
      }
      children.push(
        new Paragraph({
          children: schoolRuns,
          spacing: { after: 30 },
        })
      );
    }
  }

  // ── Publications ──
  if (data.publications && data.publications.length > 0) {
    children.push(sectionHeading("Publications"));
    for (const pub of data.publications) {
      const pubRuns: TextRun[] = [
        new TextRun({
          text: pub.title,
          bold: true,
          size: 19,
          color: COLORS.primary,
          font: "Calibri",
        }),
      ];
      if (pub.publisher) {
        pubRuns.push(
          new TextRun({
            text: ` — ${pub.publisher}`,
            italics: true,
            size: 19,
            color: COLORS.secondary,
            font: "Calibri",
          })
        );
      }
      if (pub.date) {
        pubRuns.push(
          new TextRun({
            text: `, ${pub.date}`,
            size: 17,
            color: COLORS.muted,
            font: "Calibri",
          })
        );
      }
      children.push(
        new Paragraph({
          children: pubRuns,
          spacing: { before: 40, after: 15 },
        })
      );
      if (pub.doi) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `DOI: ${pub.doi}`,
                size: 17,
                color: COLORS.accent,
                font: "Calibri",
              }),
            ],
            spacing: { after: 15 },
          })
        );
      }
    }
  }

  // ── Certifications ──
  if (data.certifications && data.certifications.length > 0) {
    children.push(sectionHeading("Certifications"));
    for (const cert of data.certifications) {
      const certRuns: TextRun[] = [
        new TextRun({
          text: cert.name,
          bold: true,
          size: 19,
          color: COLORS.primary,
          font: "Calibri",
        }),
      ];
      if (cert.issuer) {
        certRuns.push(
          new TextRun({
            text: ` — ${cert.issuer}`,
            italics: true,
            size: 19,
            color: COLORS.secondary,
            font: "Calibri",
          })
        );
      }
      if (cert.date) {
        certRuns.push(
          new TextRun({
            text: `, ${cert.date}`,
            size: 17,
            color: COLORS.muted,
            font: "Calibri",
          })
        );
      }
      if (cert.expiryDate) {
        certRuns.push(
          new TextRun({
            text: ` (exp. ${cert.expiryDate})`,
            size: 17,
            color: COLORS.muted,
            font: "Calibri",
          })
        );
      }
      children.push(
        new Paragraph({
          children: certRuns,
          spacing: { before: 40, after: 10 },
        })
      );
      if (cert.credentialId) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `ID: ${cert.credentialId}`,
                size: 17,
                color: COLORS.muted,
                font: "Calibri",
              }),
            ],
            spacing: { after: 10 },
          })
        );
      }
    }
  }

  // ── Skills ──
  if (data.skills && Object.keys(data.skills).length > 0) {
    children.push(sectionHeading("Technical Skills"));
    for (const [category, skillList] of Object.entries(data.skills)) {
      if (skillList.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${category.charAt(0).toUpperCase() + category.slice(1)}: `,
                bold: true,
                size: 19,
                color: COLORS.primary,
                font: "Calibri",
              }),
              new TextRun({
                text: skillList.join(", "),
                size: 19,
                color: COLORS.secondary,
                font: "Calibri",
              }),
            ],
            spacing: { after: 20 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter
            margin: {
              top: 720,   // 0.5 inch
              bottom: 720,
              left: 900,   // ~0.625 inch
              right: 900,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
