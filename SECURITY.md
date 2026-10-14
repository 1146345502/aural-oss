# Security Policy

## Supported Versions

The following versions of Aural are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | Yes                |
| < 0.1   | No                 |

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities. Public disclosure of vulnerabilities may put users at risk.

### How to Report

Report security vulnerabilities by emailing **security@aural-ai.com**.

### What to Include in Your Report

- Description of the vulnerability and its impact
- Steps to reproduce the issue
- Affected versions
- Any suggested remediation (if applicable)
- Your name or handle for acknowledgment (optional)

### Response Timeline

- **48 hours**: We will acknowledge receipt of your report
- **7 days**: We will provide an initial assessment and communicate next steps

We appreciate the security research community's efforts to responsibly disclose vulnerabilities.

## Dependency Security

Install with `npm ci` to use the reviewed lockfile. The DOMPurify, KaTeX, and
PostCSS selector-parser overrides in `package.json` keep transitive dependencies
on patched versions while their parent packages still request older versions.
Browser tests cover the whiteboard, Mermaid conversion, and Mermaid math rendering
to check compatibility with these overrides.

### Unpatched build-tool dependency

As of October 14, 2026, `braces@3.0.3` is affected by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested
brace patterns can exhaust the JavaScript stack. The advisory and npm registry
currently list no patched release.

This dependency comes from the Tailwind, Sass, and ESLint globbing/file-watching
toolchain. Aural does not import these globbing utilities in its application or
voice-relay request handlers; its Tailwind content patterns are repository-owned.
Do not feed untrusted glob patterns or build configuration into this toolchain.
This limits exposure but does not patch the dependency.

Keep the Dependabot alert open until a compatible upstream fix or replacement is
available. `npm audit` still reports this advisory and the parent packages that
depend on it; the repository is not audit-clean. Do not use `npm audit fix --force`
to remove it by downgrading Next.js or Excalidraw, since that would undo reviewed
security fixes or functionality.
