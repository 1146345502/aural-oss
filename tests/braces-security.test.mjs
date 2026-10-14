import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const load = createRequire(import.meta.url);
const braces = load("braces");

for (const [open, close] of [["{", "}"], ["(", ")"]]) {
  for (const operation of ["parse", "compile", "expand", "stringify"]) {
    test(`${operation} rejects 4,000 nested ${open}${close} containers below the character limit`, () => {
      const pattern = open.repeat(4000) + "a,b" + close.repeat(4000);
      assert.throws(() => braces[operation](pattern), {
        name: "SyntaxError",
        message: /exceeds max depth/,
      });
    });
  }
}

test("unmatched opening delimiters cannot bypass the nesting limit", () => {
  for (const delimiter of ["{", "("]) {
    assert.throws(() => braces.parse(delimiter.repeat(1000)), /exceeds max depth/);
  }
});

for (const operation of ["compile", "expand", "stringify"]) {
  test(`${operation} bounds externally supplied AST depth`, () => {
    let ast = { type: "text", value: "a" };
    for (let i = 0; i < 12000; i++) ast = { type: "root", nodes: [ast] };
    assert.throws(() => braces[operation](ast), {
      name: "RangeError",
      message: /exceeds max depth/,
    });
  });

  test(`${operation} rejects child cycles without overflowing or hanging`, () => {
    const ast = { type: "root", nodes: [] };
    ast.nodes.push(ast);
    assert.throws(
      () => runInNewContext("invoke(ast)", { invoke: braces[operation], ast }, { timeout: 1000 }),
      { name: "RangeError", message: /exceeds max depth/ },
    );
  });
}

test("expansion rejects cyclic parent metadata without hanging", () => {
  for (const indirect of [false, true]) {
    const ast = { type: "paren", nodes: [{ type: "text", value: "a" }] };
    if (indirect) {
      ast.parent = { type: "paren", parent: ast };
    } else {
      ast.parent = ast;
    }
    assert.throws(
      () => runInNewContext("expand(ast)", { expand: braces.expand, ast }, { timeout: 1000 }),
      { name: "RangeError", message: /parent chain contains a cycle/ },
    );
  }
});

test("options cannot increase or disable the hard depth limit", () => {
  const pattern = "{".repeat(1000) + "a,b" + "}".repeat(1000);
  for (const maxDepth of [1000, Infinity, NaN]) {
    assert.throws(() => braces.compile(pattern, { maxDepth }), /exceeds max depth/);
  }
  assert.throws(() => braces.parse("{{a,b},c}", { maxDepth: 1 }), /exceeds max depth/);
});

test("ordinary ranges, literals, shared nodes and the depth boundary retain their behavior", () => {
  assert.deepEqual(braces.expand("src/**/*.{ts,tsx}"), ["src/**/*.ts", "src/**/*.tsx"]);
  assert.deepEqual(braces.expand("x/{1..3}/{a,b}"), [
    "x/1/a", "x/1/b", "x/2/a", "x/2/b", "x/3/a", "x/3/b",
  ]);
  assert.deepEqual(braces.expand("foo/({a,b})"), ["foo/(a)", "foo/(b)"]);
  const boundary = "{".repeat(100) + "a,b" + "}".repeat(100);
  assert.equal(braces.stringify(boundary), boundary);
  assert.doesNotThrow(() => braces.compile(boundary));
  assert.doesNotThrow(() => braces.expand(boundary));
  assert.doesNotThrow(() => braces.parse('"' + "{".repeat(1000) + '"'));
  assert.doesNotThrow(() => braces.parse("\\{".repeat(1000)));
  const leaf = { type: "text", value: "a" };
  assert.equal(braces.stringify({ type: "root", nodes: [leaf, leaf] }), "aa");
});

test("globbing and watcher dependencies use the protected module", () => {
  const consumers = ["micromatch", "chokidar"];
  for (const consumer of consumers) {
    const dependencyLoad = createRequire(load.resolve(consumer));
    assert.equal(dependencyLoad("braces"), braces);
    assert.throws(
      () => dependencyLoad("braces").expand("{".repeat(4000) + "a,b" + "}".repeat(4000)),
      /exceeds max depth/,
    );
  }
  const nextLoad = createRequire(load.resolve("@next/eslint-plugin-next"));
  const globLoad = createRequire(nextLoad.resolve("fast-glob"));
  const matchLoad = createRequire(globLoad.resolve("micromatch"));
  assert.equal(matchLoad("braces"), braces);
  assert.deepEqual(load("micromatch")(["a.ts", "b.js", "c.tsx"], "*.{ts,tsx}"), ["a.ts", "c.tsx"]);
});

test("filesystem globs still find all configured extensions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aural-braces-glob-"));
  try {
    await mkdir(join(directory, "nested"));
    await Promise.all([
      writeFile(join(directory, "a.ts"), ""),
      writeFile(join(directory, "nested", "b.tsx"), ""),
      writeFile(join(directory, "ignored.js"), ""),
    ]);
    const files = await load("fast-glob")("**/*.{ts,tsx}", { cwd: directory });
    assert.deepEqual(files.sort(), ["a.ts", "nested/b.tsx"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("depth checks work with a smaller JavaScript stack", () => {
  const script = `
    const assert = require('node:assert/strict');
    const braces = require(${JSON.stringify(load.resolve("braces"))});
    for (const method of ['compile', 'expand', 'stringify']) {
      assert.throws(() => braces[method]('{'.repeat(4000) + 'a,b' + '}'.repeat(4000)), /exceeds max depth/);
      assert.doesNotThrow(() => braces[method]('{'.repeat(100) + 'a,b' + '}'.repeat(100)));
    }
  `;
  const child = spawnSync(process.execPath, ["--stack-size=256", "-e", script], {
    timeout: 5000,
    encoding: "utf8",
  });
  assert.equal(child.status, 0, String(child.error || child.stderr));
});
