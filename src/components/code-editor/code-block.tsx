"use client";

import { Highlight, themes, Prism } from "prism-react-renderer";

// ── Register languages missing from the default bundle ────────────
// prism-react-renderer ships a minimal Prism; we extend it inline.

// Java (extends clike)
(Prism.languages as Record<string, unknown>).java = Prism.languages.extend(
  "clike",
  {
    constant: /\b[A-Z][A-Z_\d]+\b/,
    keyword:
      /\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|continue|default|do|double|else|enum|exports|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|module|native|new|null|opens|package|private|protected|provides|public|record|requires|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|to|transient|transitive|try|uses|var|void|volatile|while|with|yield)\b/,
    number:
      /\b0b[01][01_]*L?\b|\b0x(?:\.[\da-f_p+-]+|[\da-f_]+(?:\.[\da-f_p+-]+)?)\b|(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.[\d_]+)(?:e[+-]?\d[\d_]*)?[dfl]?/i,
    operator: {
      pattern:
        /(^|[^.])(?:<<=?|>>>?=?|->|--|\+\+|&&|\|\||::|[?:~]|[-+*/%&|^!=<>]=?)/m,
      lookbehind: true,
    },
    "class-name": [
      /\b[A-Z](?:\w|\$)*\b/,
      {
        pattern: /(^|[^.])(?:\b[a-z]\w*\s*\.\s*)*\b[A-Z]\w*(?=\s+\w)/,
        lookbehind: true,
      },
    ],
    annotation: {
      pattern: /(^|[^.])@\w+/,
      lookbehind: true,
      alias: "punctuation",
    },
  }
);

// Bash / Shell (standalone)
(Prism.languages as Record<string, unknown>).bash = {
  comment: { pattern: /(^|[^\\])#.*/, lookbehind: true },
  string: [
    { pattern: /(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/, greedy: true },
    { pattern: /\$'(?:[^'\\]|\\[\s\S])*'/, greedy: true },
  ],
  variable: /\$(?:\w+|[!#?*@$]|\{[^}]+\})/,
  keyword:
    /\b(?:if|then|else|elif|fi|for|while|until|do|done|in|case|esac|function|select|return|exit|break|continue|declare|local|export|readonly|unset|shift|exec|eval|source|trap)\b/,
  builtin:
    /\b(?:echo|printf|read|cd|pwd|pushd|popd|dirs|let|test|set|shopt|alias|unalias|type|hash|bind|help|true|false|command|enable|disable|builtin|caller|getopts|jobs|kill|wait|fg|bg|disown|suspend|logout|times|umask|ulimit)\b/,
  boolean: /\b(?:true|false)\b/,
  number: /\b0x[\dA-Fa-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
  operator:
    /&&|\|\||<<-?|>>|[!=<>]=?|[-+*/%]=?|[~^]|&>|[|&]|\.{1,2}/,
  function: /\b\w+(?=\s*\()/,
  punctuation: /[{}[\];(),.:]/,
};
(Prism.languages as Record<string, unknown>).shell = Prism.languages.bash;
(Prism.languages as Record<string, unknown>).sh = Prism.languages.bash;

/** Map language values used in our app to Prism language identifiers. */
const LANG_MAP: Record<string, string> = {
  cpp: "cpp",
  c: "c",
  shell: "bash",
  markdown: "markdown",
};

function toPrismLang(language: string): string {
  return LANG_MAP[language] ?? language;
}

interface CodeBlockProps {
  code: string;
  language: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  return (
    <Highlight theme={themes.oneDark} code={code} language={toPrismLang(language)}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre
          className={`code-scrollbar overflow-auto px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${className ?? ""}`}
          style={{ background: "transparent" }}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
