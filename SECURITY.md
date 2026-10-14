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

### Local fix for the unpatched upstream braces advisory

Upstream `braces@3.0.3` is affected by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested
brace patterns can exhaust the JavaScript stack. As of October 14, 2026, there is
no patched upstream release.

Aural carries a private local fork, `@aural/braces@3.0.3-aural.1`, in
[`vendor/braces`](vendor/braces/README.md). It contains the original MIT-licensed
runtime plus the reviewed depth guards proposed in upstream PR #87. The root
`braces` dependency and override route every globbing/watcher consumer to this
patched copy. The fork has a distinct name and version, with recorded source
integrity and patch provenance.

The patch limits brace/parenthesis nesting and AST traversal to 100 containers,
rejects cyclic parent references during expansion, and prevents options from
raising or disabling the depth cap. Regression tests exercise the installed
module, malicious patterns and ASTs, transitive consumers, normal filesystem
globs, and a process with a smaller JavaScript stack. Clean installs use the
repository's `install-links=true` npm setting.

Run `npm run audit:dependencies` against the official npm registry; CI also runs
this audit. The local fork is not covered by the public registry advisory feed,
so the attack regression tests remain required even when the registry audit is
clean. Do not remove the fork until an upstream fixed release passes those same
tests. See the vendor README for source integrity, patch provenance, and the
removal procedure.
