"use client";

import {
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  useEffect,
  useRef,
} from "react";

import "@excalidraw/excalidraw/index.css";
import "./whiteboard-overrides.css";

// Minimal type for the Excalidraw imperative API (avoids deep import path issues)
interface ExcalidrawAPI {
  getSceneElements: () => readonly Record<string, unknown>[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: Record<string, unknown>) => void;
  resetScene: () => void;
}

export interface WhiteboardCanvasRef {
  /** Returns true if the whiteboard has any shapes drawn. */
  hasContent: () => boolean;
  /** Returns a serialised JSON string of the scene (or null if empty). */
  getSnapshotData: () => string | null;
  /** Exports the drawing as an SVG data-URL (or null if empty). */
  getImageDataUrl: () => Promise<string | null>;
  /** Exports an SVG data-URL from arbitrary snapshot JSON (doesn't need to be on canvas). */
  exportImageFromData: (snapshotData: string) => Promise<string | null>;
  /** Clears the canvas completely. */
  resetScene: () => void;
  /** Loads a previously saved scene from a JSON string. */
  loadScene: (data: string) => void;
}

interface WhiteboardCanvasProps {
  /** If true, the canvas is not editable. */
  readOnly?: boolean;
  /** JSON string of a previously saved scene to preload. */
  initialData?: string;
  /** Called on every meaningful change (debounced). Use for auto-save. */
  onAutoSave?: (snapshotData: string) => void;
  /** Auto-save debounce interval in ms. Default 3 000. */
  autoSaveInterval?: number;
  /** If true, fill the parent container instead of using a fixed height. */
  fillParent?: boolean;
  /** Called immediately on any canvas change (before debounce). Use for dirty-state tracking. */
  onDirty?: () => void;
  /** If true, use dark theme for the whiteboard. Default false. */
  dark?: boolean;
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasRef, WhiteboardCanvasProps>(
  function WhiteboardCanvas(
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
    // Dynamically loaded Excalidraw component + utilities
    const [Excalidraw, setExcalidraw] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
    const [MainMenu, setMainMenu] = useState<React.ComponentType<Record<string, unknown>> & { DefaultItems: Record<string, React.ComponentType> } | null>(null);
    const [exportToSvg, setExportToSvg] = useState<((...args: unknown[]) => Promise<SVGSVGElement>) | null>(null);

    const apiRef = useRef<ExcalidrawAPI | null>(null);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onAutoSaveRef = useRef(onAutoSave);
    onAutoSaveRef.current = onAutoSave;
    const onDirtyRef = useRef(onDirty);
    onDirtyRef.current = onDirty;

    // ── Dynamic import (Excalidraw cannot be SSR'd) ───────────────
    useEffect(() => {
      let cancelled = false;
      import("@excalidraw/excalidraw").then((mod) => {
        if (cancelled) return;
        setExcalidraw(() => mod.Excalidraw as unknown as React.ComponentType<Record<string, unknown>>);
        setMainMenu(() => mod.MainMenu as unknown as React.ComponentType<Record<string, unknown>> & { DefaultItems: Record<string, React.ComponentType> });
        setExportToSvg(() => mod.exportToSvg as unknown as (...args: unknown[]) => Promise<SVGSVGElement>);
      });
      return () => { cancelled = true; };
    }, []);

    // ── Parse initial data ────────────────────────────────────────
    const parsedInitial = useRef<Record<string, unknown> | null>(null);
    if (initialData && !parsedInitial.current) {
      try {
        const raw = JSON.parse(initialData);
        // Strip collaborators — serialised as plain object but Excalidraw needs a Map
        if (raw?.appState) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { collaborators: _c, ...safeAppState } = raw.appState as Record<string, unknown>;
          raw.appState = safeAppState;
        }
        parsedInitial.current = raw;
      } catch {
        // ignore bad data
      }
    }

    // ── Auto-save on scene changes ────────────────────────────────
    // Track element versions so we only fire onDirty for real content changes
    // (Excalidraw's onChange fires for selections, cursor moves, etc.)
    const lastElementsSnapshot = useRef<string>("");

    const handleChange = useCallback(() => {
      if (readOnly || !apiRef.current) return;

      const elements = apiRef.current.getSceneElements();
      const snapshot = JSON.stringify(elements);

      // Only notify dirty and schedule auto-save when elements actually change
      if (snapshot === lastElementsSnapshot.current) return;
      lastElementsSnapshot.current = snapshot;

      onDirtyRef.current?.();

      if (!onAutoSaveRef.current) return;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        if (!onAutoSaveRef.current || !apiRef.current) return;
        if (elements.length === 0) return;

        const data = JSON.stringify({
          elements,
          appState: apiRef.current.getAppState(),
        });
        onAutoSaveRef.current(data);
      }, autoSaveInterval);
    }, [readOnly, autoSaveInterval]);

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
          if (!apiRef.current) return false;
          return apiRef.current.getSceneElements().length > 0;
        },

        getSnapshotData() {
          if (!apiRef.current) return null;
          const elements = apiRef.current.getSceneElements();
          if (elements.length === 0) return null;
          return JSON.stringify({
            elements,
            appState: apiRef.current.getAppState(),
          });
        },

        async getImageDataUrl() {
          if (!apiRef.current || !exportToSvg) return null;
          const elements = apiRef.current.getSceneElements();
          if (elements.length === 0) return null;

          try {
            const svg = await exportToSvg({
              elements,
              appState: {
                exportBackground: true,
                viewBackgroundColor: apiRef.current.getAppState().viewBackgroundColor,
              },
              exportPadding: 10,
              files: apiRef.current.getFiles(),
            });
            const svgString = new XMLSerializer().serializeToString(svg);
            return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
          } catch {
            return null;
          }
        },

        async exportImageFromData(snapshotData: string) {
          if (!exportToSvg) return null;
          try {
            const parsed = JSON.parse(snapshotData);
            const elements = parsed.elements ?? [];
            if (elements.length === 0) return null;
            const svg = await exportToSvg({
              elements,
              appState: { exportBackground: true },
              exportPadding: 10,
              files: {},
            });
            const svgString = new XMLSerializer().serializeToString(svg);
            return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
          } catch {
            return null;
          }
        },

        resetScene() {
          apiRef.current?.resetScene();
        },

        loadScene(data: string) {
          if (!apiRef.current) return;
          try {
            const parsed = JSON.parse(data);
            // Strip collaborators — it's a Map internally but gets
            // serialised as a plain object, which Excalidraw can't iterate.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { collaborators: _c, ...safeAppState } = (parsed.appState ?? {}) as Record<string, unknown>;
            apiRef.current.updateScene({
              elements: parsed.elements ?? [],
              appState: safeAppState,
            });
          } catch {
            // ignore bad data
          }
        },
      }),
      [exportToSvg],
    );

    // ── Render ────────────────────────────────────────────────────
    if (!Excalidraw) {
      return (
        <div
          className={`flex items-center justify-center text-muted-foreground ${
            fillParent ? "h-full w-full" : "h-[400px] w-full rounded-lg border"
          }`}
        >
          Loading whiteboard...
        </div>
      );
    }

    return (
      <div
        className={
          fillParent
            ? "h-full w-full overflow-hidden"
            : "h-[400px] w-full rounded-lg border overflow-hidden"
        }
      >
        <Excalidraw
          excalidrawAPI={(api: unknown) => {
            apiRef.current = api as ExcalidrawAPI;
          }}
          initialData={parsedInitial.current ?? undefined}
          viewModeEnabled={readOnly}
          onChange={handleChange}
          aiEnabled={false}
          theme={dark ? "dark" : "light"}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
              export: false,
            },
            tools: {
              image: false,
            },
          }}
        >
          {MainMenu && (
            <MainMenu>
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          )}
        </Excalidraw>
      </div>
    );
  },
);
