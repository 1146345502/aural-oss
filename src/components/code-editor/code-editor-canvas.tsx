"use client";

import {
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useRef,
} from "react";

export interface CodeEditorCanvasRef {
  /** Returns true if the editor has any non-empty code. */
  hasContent: () => boolean;
  /** Returns the current code string (or null if empty). */
  getSnapshotData: () => string | null;
  /** Loads previously saved code + language into the editor. */
  loadScene: (data: string) => void;
  /** Clears the editor. */
  resetScene: () => void;
  /** Returns the current language. */
  getLanguage: () => string;
}

interface CodeEditorCanvasProps {
  /** If true, the editor is read-only. */
  readOnly?: boolean;
  /** JSON string of previously saved state to preload: { code, language } */
  initialData?: string;
  /** Called on every meaningful change (debounced). Use for auto-save. */
  onAutoSave?: (snapshotData: string) => void;
  /** Auto-save debounce interval in ms. Default 3000. */
  autoSaveInterval?: number;
  /** If true, fill the parent container instead of using a fixed height. */
  fillParent?: boolean;
  /** Called immediately on any change (before debounce). Use for dirty-state tracking. */
  onDirty?: () => void;
  /** If true, use dark theme for the editor. Default false. */
  dark?: boolean;
}

const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "markdown", label: "Markdown" },
  { value: "shell", label: "Shell" },
] as const;

export { SUPPORTED_LANGUAGES };

export const CodeEditorCanvas = forwardRef<CodeEditorCanvasRef, CodeEditorCanvasProps>(
  function CodeEditorCanvas(
    {
      readOnly = false,
      initialData,
      onAutoSave,
      autoSaveInterval = 3000,
      fillParent = false,
      onDirty,
      dark = false,
    },
    ref,
  ) {
    // Dynamically loaded Monaco Editor component
    const [Editor, setEditor] = useState<React.ComponentType<Record<string, unknown>> | null>(null);

    const codeRef = useRef("");
    const languageRef = useRef("javascript");
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onAutoSaveRef = useRef(onAutoSave);
    onAutoSaveRef.current = onAutoSave;
    const onDirtyRef = useRef(onDirty);
    onDirtyRef.current = onDirty;
    const lastSnapshot = useRef("");

    // ── Parse initial data ────────────────────────────────────────
    const parsedInitial = useRef<{ code: string; language: string } | null>(null);
    if (initialData && !parsedInitial.current) {
      try {
        const raw = JSON.parse(initialData);
        parsedInitial.current = {
          code: raw.code ?? "",
          language: raw.language ?? "javascript",
        };
        codeRef.current = parsedInitial.current.code;
        languageRef.current = parsedInitial.current.language;
      } catch {
        // ignore bad data
      }
    }

    const [language, setLanguage] = useState(parsedInitial.current?.language ?? "javascript");

    // ── Dynamic import (Monaco cannot be SSR'd) ───────────────────
    useEffect(() => {
      let cancelled = false;
      import("@monaco-editor/react").then((mod) => {
        if (cancelled) return;
        setEditor(() => mod.default as unknown as React.ComponentType<Record<string, unknown>>);
      });
      return () => { cancelled = true; };
    }, []);

    // ── Handle code changes ───────────────────────────────────────
    const handleChange = useCallback((value: string | undefined) => {
      const code = value ?? "";
      codeRef.current = code;

      const snapshot = JSON.stringify({ code, language: languageRef.current });
      if (snapshot === lastSnapshot.current) return;
      lastSnapshot.current = snapshot;

      onDirtyRef.current?.();

      if (!onAutoSaveRef.current) return;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        if (!onAutoSaveRef.current) return;
        if (!codeRef.current.trim()) return;
        onAutoSaveRef.current(JSON.stringify({ code: codeRef.current, language: languageRef.current }));
      }, autoSaveInterval);
    }, [autoSaveInterval]);

    // ── Handle language changes ───────────────────────────────────
    const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLang = e.target.value;
      setLanguage(newLang);
      languageRef.current = newLang;

      const snapshot = JSON.stringify({ code: codeRef.current, language: newLang });
      if (snapshot === lastSnapshot.current) return;
      lastSnapshot.current = snapshot;

      onDirtyRef.current?.();

      if (!onAutoSaveRef.current) return;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        if (!onAutoSaveRef.current || !codeRef.current.trim()) return;
        onAutoSaveRef.current(JSON.stringify({ code: codeRef.current, language: languageRef.current }));
      }, autoSaveInterval);
    }, [autoSaveInterval]);

    // Cleanup timer on unmount
    useEffect(() => {
      return () => {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      };
    }, []);

    // ── Imperative ref for parent components ──────────────────────
    useImperativeHandle(
      ref,
      () => ({
        hasContent() {
          return codeRef.current.trim().length > 0;
        },

        getSnapshotData() {
          if (!codeRef.current.trim()) return null;
          return JSON.stringify({ code: codeRef.current, language: languageRef.current });
        },

        loadScene(data: string) {
          try {
            const parsed = JSON.parse(data);
            codeRef.current = parsed.code ?? "";
            languageRef.current = parsed.language ?? "javascript";
            setLanguage(parsed.language ?? "javascript");
            // Force re-render by updating state
            setEditorKey((k) => k + 1);
          } catch {
            // ignore bad data
          }
        },

        resetScene() {
          codeRef.current = "";
          languageRef.current = "javascript";
          setLanguage("javascript");
          setEditorKey((k) => k + 1);
        },

        getLanguage() {
          return languageRef.current;
        },
      }),
      [],
    );

    // Key to force re-mount Monaco when loading new content
    const [editorKey, setEditorKey] = useState(0);

    // ── Render ────────────────────────────────────────────────────
    if (!Editor) {
      return (
        <div
          className={`flex items-center justify-center text-muted-foreground ${
            fillParent ? "h-full w-full" : "h-[400px] w-full rounded-lg border"
          }`}
        >
          Loading code editor...
        </div>
      );
    }

    return (
      <div
        className={
          fillParent
            ? "flex h-full w-full flex-col overflow-hidden"
            : "flex h-[400px] w-full flex-col rounded-lg border overflow-hidden"
        }
      >
        {/* Language selector toolbar */}
        <div
          className={
            dark
              ? "flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5"
              : "flex items-center gap-2 border-b bg-card px-3 py-1.5"
          }
        >
          <select
            value={language}
            onChange={handleLanguageChange}
            disabled={readOnly}
            className={
              dark
                ? "rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 outline-none transition-colors focus:ring-1 focus:ring-zinc-500 hover:bg-zinc-700"
                : "rounded-md border bg-background px-2.5 py-1 text-xs font-medium shadow-sm outline-none transition-colors focus:ring-1 focus:ring-ring hover:bg-muted/50"
            }
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 min-h-0">
          <Editor
            key={editorKey}
            defaultLanguage={language}
            language={language}
            defaultValue={codeRef.current}
            onChange={handleChange}
            theme={dark ? "vs-dark" : "vs-light"}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on" as const,
              scrollBeyondLastLine: false,
              wordWrap: "on" as const,
              tabSize: 2,
              automaticLayout: true,
              padding: { top: 8 },
              scrollbar: {
                vertical: "auto" as const,
                horizontal: "auto" as const,
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
                useShadows: false,
              },
              overviewRulerLanes: 0,
            }}
          />
        </div>
      </div>
    );
  },
);
