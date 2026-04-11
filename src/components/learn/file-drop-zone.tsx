"use client";

import { useState, useRef, useCallback } from "react";
import { Upload } from "lucide-react";

interface FileResult {
  name: string;
  base64: string;
  type: string; // "pdf" or "docx"
}

interface FileDropZoneProps {
  onFile: (file: FileResult) => void;
  accept?: string;
  disabled?: boolean;
}

const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

function getFileType(name: string): "pdf" | "docx" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

export function FileDropZone({ onFile, accept = ".pdf,.docx", disabled }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const fileType = getFileType(file.name);
    if (!fileType) {
      setError(`Invalid file type. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }
    setError(null);
    setSelectedName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      setSelectedName(null);
      onFile({ name: file.name, base64, type: fileType });
    };
    reader.readAsArrayBuffer(file);
  }, [onFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [disabled, processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }, [processFile]);

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded p-6 text-center transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" :
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
        }`}
      >
        <Upload className={`w-5 h-5 mx-auto mb-2 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
        {selectedName ? (
          <div className="label-mono text-muted-foreground">Reading {selectedName}...</div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-2" style={{ fontFamily: "var(--font-geist-sans)" }}>
              Drop PDF or DOCX here
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="label-mono text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
            >
              Browse files
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>
      {error && (
        <div className="label-mono text-destructive mt-2">{error}</div>
      )}
    </div>
  );
}
