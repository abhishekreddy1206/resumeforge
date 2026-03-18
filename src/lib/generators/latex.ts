import type { ResumeData } from "@/lib/types";

/** Escape special LaTeX characters */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[&%$#_{}]/g, (m) => `\\${m}`)
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/</g, "\\textless{}")
    .replace(/>/g, "\\textgreater{}")
    .replace(/\|/g, "\\textbar{}");
}

/** Convert URL to clickable hyperref, truncating display text */
function href(url: string, display?: string): string {
  return `\\href{${url}}{${esc(display || url)}}`;
}

export async function generateLatex(data: ResumeData): Promise<Buffer> {
  const lines: string[] = [];

  // Preamble — clean, ATS-friendly, single-column
  lines.push(String.raw`\documentclass[10pt,a4paper]{article}`);
  lines.push(String.raw`\usepackage[utf8]{inputenc}`);
  lines.push(String.raw`\usepackage[T1]{fontenc}`);
  lines.push(String.raw`\usepackage{lmodern}`);
  lines.push(String.raw`\usepackage[margin=0.65in]{geometry}`);
  lines.push(String.raw`\usepackage{enumitem}`);
  lines.push(String.raw`\usepackage{titlesec}`);
  lines.push(String.raw`\usepackage{hyperref}`);
  lines.push(String.raw`\usepackage{xcolor}`);
  lines.push(String.raw`\usepackage{fontawesome5}`);
  lines.push("");
  lines.push(String.raw`% Colors`);
  lines.push(String.raw`\definecolor{accent}{HTML}{2E4057}`);
  lines.push(String.raw`\definecolor{subtle}{HTML}{555555}`);
  lines.push("");
  lines.push(String.raw`% Hyperref setup`);
  lines.push(String.raw`\hypersetup{colorlinks=true,linkcolor=accent,urlcolor=accent,pdfborder={0 0 0}}`);
  lines.push("");
  lines.push(String.raw`% Section formatting`);
  lines.push(String.raw`\titleformat{\section}{\large\bfseries\color{accent}\uppercase}{}{0em}{}[\titlerule]`);
  lines.push(String.raw`\titlespacing*{\section}{0pt}{12pt}{6pt}`);
  lines.push("");
  lines.push(String.raw`% Tight lists`);
  lines.push(String.raw`\setlist[itemize]{nosep,left=0pt..1.5em,label=\textcolor{accent}{\textbullet}}`);
  lines.push("");
  lines.push(String.raw`% Remove page numbers for single page`);
  lines.push(String.raw`\pagestyle{empty}`);
  lines.push("");
  lines.push(String.raw`\begin{document}`);
  lines.push("");

  // Header — name centered, contact row below
  lines.push(String.raw`\begin{center}`);
  lines.push(String.raw`  {\LARGE\bfseries ${esc(data.name)}}\\[4pt]`);

  const contactParts: string[] = [];
  if (data.email) contactParts.push(`\\faEnvelope\\ ${esc(data.email)}`);
  if (data.phone) contactParts.push(`\\faPhone\\ ${esc(data.phone)}`);
  if (data.location) contactParts.push(`\\faMapMarker*\\ ${esc(data.location)}`);
  if (data.linkedin)
    contactParts.push(
      `\\faLinkedin\\ ${href(data.linkedin, data.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, ""))}`
    );
  if (data.github)
    contactParts.push(
      `\\faGithub\\ ${href(data.github, data.github.replace(/https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, ""))}`
    );
  if (data.website)
    contactParts.push(
      `\\faGlobe\\ ${href(data.website, data.website.replace(/https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}`
    );

  if (contactParts.length > 0) {
    lines.push(`  {\\small\\color{subtle} ${contactParts.join(" \\enspace\\textbar\\enspace ")}}\\\\`);
  }
  lines.push(String.raw`\end{center}`);
  lines.push(String.raw`\vspace{-8pt}`);
  lines.push("");

  // Summary
  if (data.summary) {
    lines.push(String.raw`\section{Summary}`);
    lines.push(esc(data.summary));
    lines.push("");
  }

  // Experience
  if (data.experiences && data.experiences.length > 0) {
    lines.push(String.raw`\section{Experience}`);
    for (const exp of data.experiences) {
      lines.push(String.raw`\textbf{${esc(exp.title)}} \hfill {\small\color{subtle} ${esc(exp.startDate)} -- ${esc(exp.endDate || "Present")}}\\`);
      lines.push(String.raw`\textit{${esc(exp.company)}}\\[-4pt]`);
      if (exp.bullets && exp.bullets.length > 0) {
        lines.push(String.raw`\begin{itemize}`);
        for (const bullet of exp.bullets) {
          lines.push(`  \\item ${esc(bullet)}`);
        }
        lines.push(String.raw`\end{itemize}`);
      }
      lines.push(String.raw`\vspace{2pt}`);
    }
    lines.push("");
  }

  // Projects
  if (data.projects && data.projects.length > 0) {
    lines.push(String.raw`\section{Projects}`);
    for (const proj of data.projects) {
      const projTitle = proj.url
        ? `\\textbf{${href(proj.url, proj.name)}}`
        : `\\textbf{${esc(proj.name)}}`;
      lines.push(`${projTitle}\\\\`);
      if (proj.description) {
        lines.push(String.raw`\begin{itemize}`);
        lines.push(`  \\item ${esc(proj.description)}`);
        lines.push(String.raw`\end{itemize}`);
      }
      lines.push(String.raw`\vspace{2pt}`);
    }
    lines.push("");
  }

  // Education
  if (data.educations && data.educations.length > 0) {
    lines.push(String.raw`\section{Education}`);
    for (const edu of data.educations) {
      const degreeText = edu.field
        ? `${edu.degree}, ${edu.field}`
        : edu.degree;
      lines.push(String.raw`\textbf{${esc(degreeText)}} \hfill {\small\color{subtle} ${esc(edu.endDate || "")}}\\`);
      lines.push(String.raw`\textit{${esc(edu.school)}}${edu.gpa ? ` \\enspace\\textbar\\enspace GPA: ${esc(edu.gpa)}` : ""}\\[-4pt]`);
      lines.push(String.raw`\vspace{2pt}`);
    }
    lines.push("");
  }

  // Skills — grouped by category on one line each
  if (data.skills && Object.keys(data.skills).length > 0) {
    lines.push(String.raw`\section{Skills}`);
    for (const [category, skillList] of Object.entries(data.skills)) {
      if (skillList.length > 0) {
        const label = category.charAt(0).toUpperCase() + category.slice(1);
        lines.push(
          `\\textbf{${esc(label)}:} ${skillList.map(esc).join(", ")}\\\\[2pt]`
        );
      }
    }
    lines.push("");
  }

  lines.push(String.raw`\end{document}`);

  const latex = lines.join("\n");
  return Buffer.from(latex, "utf-8");
}
