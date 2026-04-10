"use client";

import { useState } from "react";
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

  const highlighted = (() => {
    const grammar = Prism.languages[language] || Prism.languages.plaintext;
    return Prism.highlight(code, grammar, language);
  })();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between bg-muted px-3 py-1.5">
        <span className="text-xs font-mono text-muted-foreground uppercase">{language}</span>
        <button onClick={handleCopy} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm bg-card">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      {caption && <div className="px-3 py-1.5 text-xs text-muted-foreground border-t">{caption}</div>}
    </div>
  );
}
