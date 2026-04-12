"use client";

import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(() => {
    const grammar = Prism.languages[language] || Prism.languages.plain || {};
    return Prism.highlight(code, grammar, language);
  }, [language, code]);

  const lineCount = code.split("\n").length;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded border border-border overflow-hidden" style={{ maxWidth: "42rem" }}>
      {/* Header bar — always visible, acts as toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between bg-muted/60 px-4 py-1.5 border-b border-border hover:bg-muted/80 transition-colors text-left"
      >
        <span className="flex items-center gap-2">
          <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
          <span className="label-mono text-muted-foreground">{language}</span>
          {!expanded && <span className="label-mono text-muted-foreground/50">{lineCount} lines</span>}
        </span>
        {expanded && (
          <span
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className="label-mono text-muted-foreground hover:text-primary transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </span>
        )}
      </button>
      {/* Code block — collapsible */}
      <div className={`grid transition-all duration-200 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
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
      </div>
    </div>
  );
}
