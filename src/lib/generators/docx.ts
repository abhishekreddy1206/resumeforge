import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Packer,
  TabStopPosition,
  TabStopType,
} from "docx";
import type { ResumeData } from "@/lib/types";

const ACCENT = "2E4057";

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 22,
        color: ACCENT,
        font: "Calibri",
      }),
    ],
    spacing: { before: 240, after: 120 },
    border: {
      bottom: {
        color: ACCENT,
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
  });
}

export async function generateDocx(data: ResumeData): Promise<Buffer> {
  const sections: Paragraph[] = [];

  // Name — large, bold, centered
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: data.name,
          bold: true,
          size: 28,
          color: ACCENT,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    })
  );

  // Contact info — single line, pipe separated, centered
  const contactParts = [
    data.email,
    data.phone,
    data.location,
    data.linkedin,
    data.github,
    data.website,
  ].filter(Boolean);

  if (contactParts.length > 0) {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactParts.join("  |  "),
            size: 18,
            color: "555555",
            font: "Calibri",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
      })
    );
  }

  // Professional Summary
  if (data.summary) {
    sections.push(sectionHeading("Professional Summary"));
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: data.summary,
            size: 20,
            font: "Calibri",
          }),
        ],
        spacing: { after: 80 },
      })
    );
  }

  // Experience — tab stops for right-aligned dates
  if (data.experiences && data.experiences.length > 0) {
    sections.push(sectionHeading("Experience"));
    for (const exp of data.experiences) {
      // Title | Company \t Date
      sections.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          children: [
            new TextRun({
              text: `${exp.title} | ${exp.company}`,
              bold: true,
              size: 21,
              font: "Calibri",
            }),
            new TextRun({ text: "\t" }),
            new TextRun({
              text: `${exp.startDate} – ${exp.endDate || "Present"}`,
              italics: true,
              size: 19,
              color: "666666",
              font: "Calibri",
            }),
          ],
          spacing: { before: 100, after: 40 },
        })
      );
      // Bullets — action verb first, quantified impact
      for (const bullet of exp.bullets || []) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: bullet,
                size: 20,
                font: "Calibri",
              }),
            ],
            bullet: { level: 0 },
            spacing: { after: 20 },
          })
        );
      }
    }
  }

  // Projects
  if (data.projects && data.projects.length > 0) {
    sections.push(sectionHeading("Projects"));
    for (const proj of data.projects) {
      const children: TextRun[] = [
        new TextRun({
          text: proj.name,
          bold: true,
          size: 20,
          font: "Calibri",
        }),
      ];
      if (proj.url) {
        children.push(
          new TextRun({
            text: ` — ${proj.url}`,
            size: 18,
            color: "666666",
            font: "Calibri",
          })
        );
      }
      sections.push(
        new Paragraph({
          children,
          spacing: { before: 60 },
        })
      );
      if (proj.description) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: proj.description,
                size: 20,
                font: "Calibri",
              }),
            ],
            bullet: { level: 0 },
            spacing: { after: 20 },
          })
        );
      }
    }
  }

  // Education — degree | institution \t year
  if (data.educations && data.educations.length > 0) {
    sections.push(sectionHeading("Education"));
    for (const edu of data.educations) {
      const degreeText = `${edu.degree}${edu.field ? `, ${edu.field}` : ""} | ${edu.school}`;
      sections.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
          children: [
            new TextRun({
              text: degreeText,
              bold: true,
              size: 20,
              font: "Calibri",
            }),
            new TextRun({ text: "\t" }),
            new TextRun({
              text: edu.endDate || "",
              italics: true,
              size: 19,
              color: "666666",
              font: "Calibri",
            }),
          ],
          spacing: { before: 60, after: 20 },
        })
      );
      if (edu.gpa) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `GPA: ${edu.gpa}`,
                size: 19,
                color: "666666",
                font: "Calibri",
              }),
            ],
            spacing: { after: 40 },
          })
        );
      }
    }
  }

  // Skills — grouped by category, JD-required first
  if (data.skills && Object.keys(data.skills).length > 0) {
    sections.push(sectionHeading("Skills"));
    for (const [category, skillList] of Object.entries(data.skills)) {
      if (skillList.length > 0) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${category.charAt(0).toUpperCase() + category.slice(1)}: `,
                bold: true,
                size: 20,
                font: "Calibri",
              }),
              new TextRun({
                text: skillList.join(", "),
                size: 20,
                font: "Calibri",
              }),
            ],
            spacing: { after: 30 },
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
              top: 1080, // 0.75 inch — tighter fit per skill guidelines
              bottom: 1080,
              left: 1080,
              right: 1080,
            },
          },
        },
        children: sections,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
