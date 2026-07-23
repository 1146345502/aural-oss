"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Bold,
    Italic,
    List,
    ListOrdered,
    RemoveFormatting,
    Underline,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Minimal dependency-free rich text editor (contentEditable + toolbar).
 * Values are HTML strings; always pass them through sanitizeRichHtml
 * before persisting or rendering.
 */

/** Formatting tags we keep; everything else is unwrapped or dropped. */
const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "del",
  "p",
  "div",
  "br",
  "ul",
  "ol",
  "li",
  "span",
  "blockquote",
]);

/** Tags removed together with their content. */
const DROP_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "svg",
  "math",
  "form",
  "input",
  "textarea",
  "button",
  "audio",
  "video",
  "img",
]);

/** Shared list/paragraph styling for editable and rendered rich text. */
export const RICH_TEXT_STYLES =
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1 first:[&_p]:mt-0 last:[&_p]:mb-0";

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value);
}

/**
 * Server rendering does not have a DOM parser. Reduce markup to plain text with
 * a small state machine so nested angle brackets cannot defeat tag stripping.
 */
function stripMarkupForSsr(html: string): string {
  let text = "";
  let insideTag = false;

  for (const character of html) {
    if (character === "<") {
      insideTag = true;
      continue;
    }
    if (character === ">") {
      insideTag = false;
      continue;
    }
    if (!insideTag) text += character;
  }

  return text;
}

/** Allowlist sanitizer: strips attributes, unwraps unknown tags, drops dangerous ones. */
export function sanitizeRichHtml(html: string): string {
  if (typeof window === "undefined") {
    // SSR fallback: never emit markup we could not sanitize.
    return stripMarkupForSsr(html);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      walk(child);
      if (!ALLOWED_TAGS.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
      } else {
        for (const attr of Array.from(child.attributes)) {
          child.removeAttribute(attr.name);
        }
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** Plain-text version of a stored answer (for previews and search). */
export function richTextToPlain(value: string): string {
  if (!looksLikeHtml(value)) return value;
  // Keep a separator where block elements / line breaks end, otherwise
  // textContent runs adjacent blocks together ("item oneitem two").
  const spaced = value.replace(
    /<\/(p|div|li|ul|ol|blockquote)>|<br\s*\/?>/gi,
    " ",
  );
  if (typeof window === "undefined") {
    return spaced.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(spaced, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Convert legacy plain-text values into editable HTML. */
export function plainToRichHtml(text: string): string {
  if (looksLikeHtml(text)) return text;
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split("\n")
    .map((line) => (line.trim() ? `<div>${line}</div>` : "<div><br></div>"))
    .join("");
}

const TOOLBAR = [
  { command: "bold", icon: Bold, label: "Bold" },
  { command: "italic", icon: Italic, label: "Italic" },
  { command: "underline", icon: Underline, label: "Underline" },
  { command: "insertUnorderedList", icon: List, label: "Bullet list" },
  { command: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  { command: "removeFormat", icon: RemoveFormatting, label: "Clear formatting" },
] as const;

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  autoFocus = false,
  resizable = false,
}: {
  /** HTML content. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  resizable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external value without clobbering the caret while typing.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  }, [onChange]);

  const exec = useCallback(
    (command: string) => {
      ref.current?.focus();
      document.execCommand(command);
      emit();
    },
    [emit],
  );

  return (
    <div
      className={cn(
        "rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring",
        resizable
          ? "flex h-80 min-h-[180px] max-h-[70vh] resize-y flex-col overflow-hidden"
          : "overflow-hidden",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        {TOOLBAR.map(({ command, icon: Icon, label }) => (
          <Button
            key={command}
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onMouseDown={(event) => {
              // preventDefault keeps the text selection inside the editor.
              event.preventDefault();
              exec(command);
            }}
            aria-label={label}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? ""}
        onInput={emit}
        onBlur={emit}
        onPaste={(event) => {
          // Paste as plain text so external markup never enters the editor.
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        className={cn(
          resizable
            ? "min-h-[120px] flex-1 overflow-y-auto"
            : "max-h-72 min-h-[120px] overflow-y-auto",
          "px-3 py-2 text-sm leading-relaxed outline-none",
          RICH_TEXT_STYLES,
          "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
        )}
        suppressContentEditableWarning
      />
    </div>
  );
}

/** Renders stored answer text: sanitized HTML when rich, plain text otherwise. */
export function RichTextContent({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const html = useMemo(
    () => (looksLikeHtml(value) ? sanitizeRichHtml(value) : null),
    [value],
  );

  if (html === null) {
    return <p className={cn("whitespace-pre-wrap", className)}>{value}</p>;
  }
  return (
    <div
      className={cn(RICH_TEXT_STYLES, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
