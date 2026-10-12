/** Launch the app and primary voice relay with isolated local-test configuration. */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "dotenv";

const root = fileURLToPath(new URL("..", import.meta.url));
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function localDevelopmentEnvironment(directory, inherited = process.env) {
  const envFile = resolve(directory, ".env.testing.local");
  if (!existsSync(envFile)) throw new Error("Missing .env.testing.local. Copy .env.example and configure local Supabase and provider credentials there.");
  const local = parse(readFileSync(envFile));
  const endpoints = {
    SUPABASE_URL: ["http:", "https:"],
    NEXT_PUBLIC_SUPABASE_URL: ["http:", "https:"],
    DATABASE_URL: ["postgres:", "postgresql:"],
    NEXT_PUBLIC_APP_URL: ["http:", "https:"],
    NEXT_PUBLIC_VOICE_RELAY_URL: ["ws:", "wss:"],
    NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL: ["ws:", "wss:"],
  };
  for (const [key, protocols] of Object.entries(endpoints)) {
    let url;
    try { url = new URL(local[key]); } catch { /* Report the key without exposing credentials. */ }
    if (!url || !localHosts.has(url.hostname) || !protocols.includes(url.protocol)) {
      throw new Error(`${key} must use a loopback URL with protocol ${protocols.join(" or ")} for local testing`);
    }
  }
  if (local.VOICE_RELAY_HOST && local.VOICE_RELAY_HOST !== "127.0.0.1") {
    throw new Error("VOICE_RELAY_HOST must be 127.0.0.1 for local testing");
  }
  // Mask Next env-file settings and inherited application credentials. Provider
  // calls use only credentials explicitly supplied in the testing file.
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (/^(NEXT_PUBLIC_|SUPABASE_|DATABASE_URL$|OPENAI_|AZURE_OPENAI_|GEMINI_|KIMI_|MINIMAX_|DOUBAO_|QWEN_|RELAY_LLM_|VOICE_|JINA_|AURAL_)/.test(key)) env[key] = "";
  }
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    const path = resolve(directory, name);
    if (existsSync(path)) for (const key of Object.keys(parse(readFileSync(path)))) env[key] = "";
  }
  return Object.assign(env, local, {
    NODE_ENV: "development",
    AURAL_ENV_FILE: envFile,
    VOICE_RELAY_HOST: "127.0.0.1",
    __NEXT_PROCESSED_ENV: "true",
  });
}

function startLocalDevelopment() {
  const env = localDevelopmentEnvironment(root);
  const children = [
    spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3000"], { cwd: root, env, stdio: "inherit" }),
    spawn(process.execPath, ["--import", "tsx", "server/voice-relay.ts"], { cwd: root, env, stdio: "inherit" }),
  ];
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
    process.exitCode = code;
  }
  process.on("SIGINT", () => stop());
  process.on("SIGTERM", () => stop());
  for (const child of children) {
    child.on("error", () => stop(1));
    child.on("exit", code => { if (!stopping) stop(code || 1); });
  }
  console.log("Local app: http://localhost:3000; Supabase Studio: http://127.0.0.1:54323");
  console.log("Using .env.testing.local. The original .env.local is unchanged. Only the primary voice relay is started.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) startLocalDevelopment();
