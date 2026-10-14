# Aural's local braces security patch

This private package is a patched copy of `braces@3.0.3`, installed as `braces`
through the root dependency and `$braces` override. It is named `@aural/braces`
with version `3.0.3-aural.1` to distinguish this local fork from the vulnerable
upstream release. Installs use the source in this repository.

The runtime guards are backported from
[micromatch/braces PR #87](https://github.com/micromatch/braces/pull/87), commit
`d44b9b1ee12e7804d4232d5a47a4a0c61d2fbefe`. That proposal has not been merged or
released upstream. The reviewed changes:

- Bound combined brace/parenthesis nesting to 100 containers while parsing.
- Bound `compile`, `expand`, and `stringify` recursion for supplied ASTs, too.
- Detect cyclic parent references before expansion follows them.
- Permit a stricter `maxDepth` option; callers cannot raise or disable the cap.

These guards address
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
They do not make arbitrary brace expansion resource-free; existing character and
range limits still apply, and callers must handle rejected input.

## Provenance

The original runtime files and MIT license come from
`https://registry.npmjs.org/braces/-/braces-3.0.3.tgz` with integrity:

```text
sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==
```

`index.js`, `lib/utils.js`, and `LICENSE` are unchanged. The depth guards modify
`lib/constants.js`, `lib/parse.js`, `lib/compile.js`, `lib/expand.js`, and
`lib/stringify.js`. Retain the upstream license and attribution.

The root `.npmrc` sets `install-links=true` so clean installs pack this local
dependency into `node_modules` consistently. Run `npm ci` after changing these
files.

The application's unit tests exercise the installed module and its transitive
consumers, including stack-exhaustion inputs, AST cycles, normal expansions,
filesystem globs, and a process with a smaller JavaScript stack.

## Retiring the fork

Once an upstream release fixes this advisory, verify the same regression tests
against that release. Then replace the local dependency with the fixed release,
remove the override and this directory, regenerate the lockfile, and run the
audit, unit tests, browser tests, and build. Do not drop the guards solely because
an advisory no longer matches a version number.
