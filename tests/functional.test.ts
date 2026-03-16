import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page, type Route } from "playwright";

const APP_CWD = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type RelayConnection = {
  url: string;
  path: string;
};

let browser: Browser;
let serverProcess: ChildProcess;
let baseUrl = "";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine free port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function waitForHttp(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return;
    } catch {
      // server still starting
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startAppServer(port: number): ChildProcess {
  const child = spawn("npx", ["next", "dev", "--port", String(port)], {
    cwd: APP_CWD,
    env: {
      ...process.env,
      NODE_ENV: "development",
      ENABLE_FUNCTIONAL_TEST_PAGES: "1",
      NEXT_PUBLIC_VOICE_RELAY_URL: `ws://127.0.0.1:${port}/ws/voice`,
      NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL: `ws://127.0.0.1:${port}/ws/openai-voice`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[functional-next] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[functional-next] ${chunk}`);
  });

  return child;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    delay(10_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

async function readRelayConnections(page: Page): Promise<RelayConnection[]> {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem("__functionalRelayConnections");
    return raw ? (JSON.parse(raw) as RelayConnection[]) : [];
  });
}

async function waitForText(
  page: Page,
  text: string,
  timeoutMs = 10_000,
  exact = false,
): Promise<void> {
  const locator = page.getByText(text, { exact });
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (
      await locator
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  timeoutMs = 10_000,
  message = "Timed out waiting for condition",
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(message);
}

before(async () => {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = startAppServer(port);
  await waitForHttp(`${baseUrl}/login`);
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await stopProcess(serverProcess);
});

test("login defaults to English and no longer shows a language toggle", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`);

  await waitForText(page, "Welcome back");
  assert.equal(await page.getByText("English", { exact: true }).count(), 0);
  assert.equal(await page.getByText("中文", { exact: true }).count(), 0);

  await context.close();
});

test("login honors browser locale and persisted locale cache", async () => {
  const zhContext = await browser.newContext({ locale: "zh-CN" });
  const zhPage = await zhContext.newPage();
  await zhPage.goto(`${baseUrl}/login`);
  await waitForText(zhPage, "欢迎回来");
  await zhContext.close();

  const cachedContext = await browser.newContext({ locale: "en-US" });
  const cachedPage = await cachedContext.newPage();
  await cachedPage.addInitScript(() => {
    window.localStorage.setItem("aural.app.locale", "zh");
  });
  await cachedPage.goto(`${baseUrl}/login`);
  await waitForText(cachedPage, "欢迎回来");
  await cachedContext.close();
});

test("mobile auth callback page hands OAuth params back to the app", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/mobile-auth/callback?code=oauth-code&state=xyz`, {
    waitUntil: "domcontentloaded",
  });
  await waitForText(page, "Returning you to Aural");

  const expected =
    "com.aural.mobile://login-callback?code=oauth-code&state=xyz";

  await waitForCondition(async () => {
    const href = await page
      .getByRole("link", { name: "Open Aural" })
      .getAttribute("href");
    return href === expected;
  });
  assert.equal(
    await page.getByRole("link", { name: "Open Aural" }).getAttribute("href"),
    expected,
  );

  await context.close();
});

test("marketing landing page falls back to the same mobile auth handoff", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?code=oauth-code&state=xyz`, {
    waitUntil: "domcontentloaded",
  });
  await waitForText(page, "Returning you to Aural");

  const expected =
    "com.aural.mobile://login-callback?code=oauth-code&state=xyz";

  await waitForCondition(async () => {
    const href = await page
      .getByRole("link", { name: "Open Aural" })
      .getAttribute("href");
    return href === expected;
  });
  assert.equal(
    await page.getByRole("link", { name: "Open Aural" }).getAttribute("href"),
    expected,
  );

  await context.close();
});

test("English interviews try the voice relay first and fail over to OpenAI", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto(
    `${baseUrl}/functional-tests/voice?language=en&scenario=english-failover`,
  );
  await waitForCondition(
    async () =>
      (await page.getByTestId("harness-ready").textContent()) === "true",
    5_000,
    "Expected functional voice harness mocks to be ready",
  );
  await page.getByRole("button", { name: "Start Voice Interview" }).click();

  await delay(3_500);

  const connections = await readRelayConnections(page);
  assert.deepEqual(
    connections.map((entry) => entry.path),
    ["/ws/voice", "/ws/openai-voice"],
  );

  await context.close();
});

test("Chinese interviews also try the voice relay first and fail over to OpenAI", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto(
    `${baseUrl}/functional-tests/voice?language=zh-CN&scenario=chinese-failover`,
  );
  await waitForCondition(
    async () =>
      (await page.getByTestId("harness-ready").textContent()) === "true",
    5_000,
    "Expected functional voice harness mocks to be ready",
  );
  await page.getByRole("button", { name: "Start Voice Interview" }).click();

  await delay(3_500);

  const connections = await readRelayConnections(page);
  assert.deepEqual(
    connections.map((entry) => entry.path),
    ["/ws/voice", "/ws/openai-voice"],
  );

  await context.close();
});

test("voice completion shows the farewell, waits for final save, and only then notifies the parent", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  let resolveSave: (() => void) | null = null;
  const saveBodies: unknown[] = [];

  await page.route("**/api/voice/save", async (route: Route) => {
    saveBodies.push(JSON.parse(route.request().postData() || "{}"));
    await new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(
    `${baseUrl}/functional-tests/voice?language=en&scenario=farewell-complete`,
  );
  await waitForCondition(
    async () =>
      (await page.getByTestId("harness-ready").textContent()) === "true",
    5_000,
    "Expected functional voice harness mocks to be ready",
  );
  await page.getByRole("button", { name: "Start Voice Interview" }).click();

  await delay(1_500);
  const earlyBodyText = (await page.locator("body").textContent()) ?? "";
  assert.equal(
    earlyBodyText.includes(
      "Understood, we're all set. Thanks for your time today and take care.",
    ),
    true,
  );
  assert.equal(earlyBodyText.includes("Thank you!"), false);
  assert.equal(
    await page.getByTestId("parent-complete").textContent(),
    "false",
  );

  await waitForCondition(
    async () => saveBodies.length === 1,
    6_000,
    "Expected final voice save to be sent once",
  );

  const [savePayload] = saveBodies as Array<Record<string, unknown>>;
  assert.equal(savePayload.complete, true);
  assert.equal(
    await page.getByTestId("parent-complete").textContent(),
    "false",
  );

  const fn = resolveSave as (() => void) | null;
  if (fn) fn();

  await delay(500);
  assert.equal(await page.getByTestId("parent-complete").textContent(), "true");
  assert.equal(
    ((await page.locator("body").textContent()) ?? "").includes("Thank you!"),
    true,
  );

  await context.close();
});
