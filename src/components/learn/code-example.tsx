"use client";

import { useState, useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-go";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";

interface CodeExampleProps {
  language: string;
  code: string;
  caption: string;
}

export function CodeExample({ language, code, caption }: CodeExampleProps) {
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(() => {
    const grammar = Prism.languages[language] || Prism.languages.plain || {};
    return Prism.highlight(code, grammar, language);
  }, [language, code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded border border-border overflow-hidden" style={{ maxWidth: "42rem" }}>
      {/* Header bar — monospaced label with copy */}
      <div className="flex items-center justify-between bg-muted/60 px-4 py-1.5 border-b border-border">
        <span className="label-mono text-muted-foreground">{language}</span>
        <button
          onClick={handleCopy}
          className="label-mono text-muted-foreground hover:text-primary transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Code block — darker bg for contrast */}
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed bg-card">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      {/* Caption — understated footnote */}
      {caption && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30 italic">
          {caption}
        </div>
      )}
    </div>
  );
}
