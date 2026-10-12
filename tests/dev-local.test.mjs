import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { localDevelopmentEnvironment } from "../scripts/dev-local.mjs";

const localConfig = [
  "SUPABASE_URL=http://127.0.0.1:54321",
  "NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321",
  "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  "NEXT_PUBLIC_VOICE_RELAY_URL=ws://localhost:8766",
  "NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL=ws://localhost:8767",
  "VOICE_ASR_PROVIDER=seed",
  "SUPABASE_SERVICE_ROLE_KEY=local-test-key",
].join("\n");

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "aural-local-env-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("local launcher masks inherited credentials and env files without modifying them", (t) => {
  const root = fixture(t);
  const original = "SUPABASE_SERVICE_ROLE_KEY=production-placeholder\nGEMINI_API_KEY=production-placeholder\nCUSTOM_APP_SECRET=production-placeholder";
  writeFileSync(join(root, ".env.local"), original);
  writeFileSync(join(root, ".env.development.local"), "KIMI_API_KEY=production-placeholder");
  writeFileSync(join(root, ".env.testing.local"), localConfig);
  const inherited = { PATH: "/local/bin", QWEN_ASR_API_KEY: "inherited-placeholder", OPENAI_API_KEY: "inherited-placeholder", VOICE_ASR_PROVIDER: "qwen", NEXT_PUBLIC_VOICE_RELAY_PRIMARY: "openai" };
  const env = localDevelopmentEnvironment(root, inherited);
  assert.equal(env.PATH, inherited.PATH);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "local-test-key");
  for (const key of ["QWEN_ASR_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "KIMI_API_KEY", "CUSTOM_APP_SECRET", "NEXT_PUBLIC_VOICE_RELAY_PRIMARY"]) assert.equal(env[key], "");
  assert.equal(env.VOICE_ASR_PROVIDER, "seed");
  assert.equal(env.VOICE_RELAY_HOST, "127.0.0.1");
  assert.equal(env.AURAL_ENV_FILE, join(root, ".env.testing.local"));
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.__NEXT_PROCESSED_ENV, "true");
  assert.equal(inherited.QWEN_ASR_API_KEY, "inherited-placeholder");
  assert.equal(readFileSync(join(root, ".env.local"), "utf8"), original);
  assert.equal(readFileSync(join(root, ".env.testing.local"), "utf8"), localConfig);
});

test("local launcher rejects remote or malformed endpoints before starting either service", (t) => {
  const root = fixture(t);
  assert.throws(() => localDevelopmentEnvironment(root, {}), /Missing .env.testing.local/);
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_VOICE_RELAY_URL", "NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL"]) {
    for (const endpoint of ["https://remote.example", "not-a-url", "file://localhost/tmp"]) {
      const config = localConfig.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${endpoint}`);
      writeFileSync(join(root, ".env.testing.local"), config);
      assert.throws(() => localDevelopmentEnvironment(root, {}), new RegExp(`${key} must use a loopback URL`));
    }
  }
  writeFileSync(join(root, ".env.testing.local"), `${localConfig}\nVOICE_RELAY_HOST=0.0.0.0`);
  assert.throws(() => localDevelopmentEnvironment(root, {}), /VOICE_RELAY_HOST must be 127.0.0.1/);
});

test("Qwen is enabled only through explicit local configuration", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".env.testing.local"), localConfig.replace("VOICE_ASR_PROVIDER=seed", "VOICE_ASR_PROVIDER=qwen-audio\nQWEN_ASR_API_KEY=explicit-test-key"));
  const env = localDevelopmentEnvironment(root, {});
  assert.equal(env.VOICE_ASR_PROVIDER, "qwen-audio");
  assert.equal(env.QWEN_ASR_API_KEY, "explicit-test-key");
});
