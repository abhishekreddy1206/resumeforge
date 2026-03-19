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

/** Escape URL for use inside \href{} — braces and backslashes break LaTeX */
function escUrl(url: string): string {
  return url
    .replace(/\\/g, "/")
    .replace(/[{}]/g, "")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#");
}

/** Convert URL to clickable hyperref, truncating display text */
function href(url: string, display?: string): string {
  return `\\href{${escUrl(url)}}{${esc(display || url)}}`;
}

/** Clean display URL */
function cleanUrl(url: string): string {
  return url
    .replace(/https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "");
}

export async function generateLatex(data: ResumeData): Promise<Buffer> {
  const L: string[] = [];

  // ── Preamble ──
  L.push(String.raw`\documentclass[10pt,letterpaper]{article}`);
  L.push(String.raw`\usepackage[utf8]{inputenc}`);
  L.push(String.raw`\usepackage[T1]{fontenc}`);
  L.push(String.raw`\usepackage{lmodern}`);
  L.push(String.raw`\usepackage[margin=0.55in,top=0.45in,bottom=0.45in]{geometry}`);
  L.push(String.raw`\usepackage{enumitem}`);
  L.push(String.raw`\usepackage{titlesec}`);
  L.push(String.raw`\usepackage{hyperref}`);
  L.push(String.raw`\usepackage{xcolor}`);
  L.push(String.raw`\usepackage{fontawesome5}`);
  L.push(String.raw`\usepackage{tabularx}`);
  L.push("");
  L.push(String.raw`% Colors`);
  L.push(String.raw`\definecolor{primary}{HTML}{1A1A1A}`);
  L.push(String.raw`\definecolor{secondary}{HTML}{4A4A4A}`);
  L.push(String.raw`\definecolor{muted}{HTML}{6B7280}`);
  L.push(String.raw`\definecolor{accent}{HTML}{2563EB}`);
  L.push(String.raw`\definecolor{rule}{HTML}{D1D5DB}`);
  L.push("");
  L.push(String.raw`% Hyperref setup`);
  L.push(String.raw`\hypersetup{colorlinks=true,linkcolor=accent,urlcolor=accent,pdfborder={0 0 0}}`);
  L.push("");
  L.push(String.raw`% Section formatting — clean with thin rule`);
  L.push(String.raw`\titleformat{\section}{\normalsize\bfseries\color{primary}\uppercase}{}{0em}{}[\vspace{-3pt}\textcolor{rule}{\rule{\textwidth}{0.4pt}}]`);
  L.push(String.raw`\titlespacing*{\section}{0pt}{10pt}{4pt}`);
  L.push("");
  L.push(String.raw`% Tight lists`);
  L.push(String.raw`\setlist[itemize]{nosep,left=0pt..1.2em,label=\textcolor{muted}{\textbullet},itemsep=1pt}`);
  L.push("");
  L.push(String.raw`% No page numbers`);
  L.push(String.raw`\pagestyle{empty}`);
  L.push("");
  L.push(String.raw`% Paragraph spacing`);
  L.push(String.raw`\setlength{\parindent}{0pt}`);
  L.push(String.raw`\setlength{\parskip}{0pt}`);
  L.push("");
  L.push(String.raw`\begin{document}`);
  L.push("");

  // ── Header ──
  L.push(String.raw`\begin{center}`);
  L.push(String.raw`  {\Large\bfseries\color{primary} ${esc(data.name)}}\\[5pt]`);

  const contactParts: string[] = [];
  if (data.email) contactParts.push(`\\faEnvelope\\ ${esc(data.email)}`);
  if (data.phone) contactParts.push(`\\faPhone\\ ${esc(data.phone)}`);
  if (data.location) contactParts.push(`\\faMapMarker*\\ ${esc(data.location)}`);
  if (data.linkedin)
    contactParts.push(`\\faLinkedin\\ ${href(data.linkedin, cleanUrl(data.linkedin))}`);
  if (data.github)
    contactParts.push(`\\faGithub\\ ${href(data.github, cleanUrl(data.github))}`);
  if (data.website)
    contactParts.push(`\\faGlobe\\ ${href(data.website, cleanUrl(data.website))}`);

  if (contactParts.length > 0) {
    L.push(`  {\\small\\color{muted} ${contactParts.join(" \\enspace{\\color{rule}\\textbar}\\enspace ")}}`);
  }
  L.push(String.raw`\end{center}`);
  L.push(String.raw`\vspace{-2pt}`);
  L.push(String.raw`{\color{primary}\hrule height 1pt}`);
  L.push(String.raw`\vspace{4pt}`);
  L.push("");

  // ── Summary ──
  if (data.summary) {
    L.push(String.raw`\section*{\normalsize\textbf{SUMMARY}}`);
    L.push(String.raw`\vspace{-3pt}\textcolor{rule}{\rule{\textwidth}{0.4pt}}\vspace{3pt}`);
    L.push(String.raw`{\color{secondary} ${esc(data.summary)}}`);
    L.push("");
  }

  // ── Experience ──
  if (data.experiences && data.experiences.length > 0) {
    L.push(String.raw`\section{Experience}`);
    for (const exp of data.experiences) {
      L.push(String.raw`\textbf{${esc(exp.title)}} \enspace{\color{muted}\textbar}\enspace \textit{${esc(exp.company)}} \hfill {\small\color{muted} ${esc(exp.startDate)} -- ${esc(exp.endDate || "Present")}}\\[-2pt]`);
      if (exp.bullets && exp.bullets.length > 0) {
        L.push(String.raw`\begin{itemize}`);
        for (const bullet of exp.bullets) {
          L.push(`  \\item ${esc(bullet)}`);
        }
        L.push(String.raw`\end{itemize}`);
      }
      L.push(String.raw`\vspace{3pt}`);
    }
    L.push("");
  }

  // ── Projects ──
  if (data.projects && data.projects.length > 0) {
    L.push(String.raw`\section{Projects}`);
    for (const proj of data.projects) {
      const projTitle = proj.url
        ? `\\textbf{${href(proj.url, proj.name)}}`
        : `\\textbf{${esc(proj.name)}}`;
      L.push(`${projTitle}\\\\[-2pt]`);
      if (proj.description) {
        L.push(String.raw`\begin{itemize}`);
        L.push(`  \\item ${esc(proj.description)}`);
        L.push(String.raw`\end{itemize}`);
      }
      L.push(String.raw`\vspace{2pt}`);
    }
    L.push("");
  }

  // ── Education ──
  if (data.educations && data.educations.length > 0) {
    L.push(String.raw`\section{Education}`);
    for (const edu of data.educations) {
      const degreeText = edu.field
        ? `${edu.degree}, ${edu.field}`
        : edu.degree;
      L.push(String.raw`\textbf{${esc(degreeText)}} \hfill {\small\color{muted} ${esc(edu.endDate || "")}}\\[-2pt]`);
      const gpaText = edu.gpa
        ? ` \\enspace{\\color{muted}\\textbar}\\enspace {\\small\\color{muted} GPA: ${esc(edu.gpa)}}`
        : "";
      L.push(String.raw`\textit{\color{secondary} ${esc(edu.school)}}${gpaText}\\[2pt]`);
    }
    L.push("");
  }

  // ── Skills ──
  if (data.skills && Object.keys(data.skills).length > 0) {
    L.push(String.raw`\section{Technical Skills}`);
    for (const [category, skillList] of Object.entries(data.skills)) {
      if (skillList.length > 0) {
        const label = category.charAt(0).toUpperCase() + category.slice(1);
        L.push(
          `\\textbf{${esc(label)}:} {\\color{secondary} ${skillList.map(esc).join(", ")}}\\\\[2pt]`
        );
      }
    }
    L.push("");
  }

  L.push(String.raw`\end{document}`);

  const latex = L.join("\n");
  return Buffer.from(latex, "utf-8");
}
