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

type RelayMessage = {
  path: string;
  message: Record<string, unknown>;
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
  const child = spawn(
    process.execPath,
    [
      resolve(APP_CWD, "node_modules/next/dist/bin/next"),
      "dev",
      "--port",
      String(port),
    ],
    {
      cwd: APP_CWD,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_FUNCTIONAL_TEST_PAGES: "1",
        NEXT_PUBLIC_VOICE_RELAY_URL: `ws://127.0.0.1:${port}/ws/voice`,
        NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL: `ws://127.0.0.1:${port}/ws/openai-voice`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

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

async function readRelayMessages(page: Page): Promise<RelayMessage[]> {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem("__functionalRelayMessages");
    return raw ? (JSON.parse(raw) as RelayMessage[]) : [];
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

test("the arbitrary recording URL proxy is not exposed", async () => {
  const response = await fetch(
    `${baseUrl}/api/download/recording?url=${encodeURIComponent(`${baseUrl}/login`)}`,
  );

  assert.equal(response.status, 404);
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

test("code editor loads Monaco with the secured DOMPurify dependency", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/functional-tests/code-editor`);
  await page.locator(".monaco-editor").waitFor({ state: "visible", timeout: 20_000 });

  assert.equal(await page.locator("select").inputValue(), "typescript");
  assert.equal(
    ((await page.locator(".view-lines").textContent()) ?? "").includes("secureEditor"),
    true,
  );
  assert.deepEqual(pageErrors, []);

  await context.close();
});

test("whiteboard renders and Mermaid conversion works with patched dependencies", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/functional-tests/whiteboard`);
  await page.locator(".excalidraw").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await waitForCondition(
    async () =>
      Number(
        await page.getByTestId("mermaid-element-count").textContent(),
      ) > 0,
    20_000,
    "Expected Mermaid to produce Excalidraw elements",
  );

  assert.equal(await page.getByTestId("mermaid-error").textContent(), "");
  assert.deepEqual(pageErrors, []);

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

test("voice interview shows Thinking after user speech finalizes", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();

  await page.goto(
    `${baseUrl}/functional-tests/voice?language=en&scenario=thinking-after-asr`,
  );
  await waitForCondition(
    async () =>
      (await page.getByTestId("harness-ready").textContent()) === "true",
    5_000,
    "Expected functional voice harness mocks to be ready",
  );
  await page.getByRole("button", { name: "Start Voice Interview" }).click();

  await waitForText(page, "Thinking...", 8_000);
  const bodyText = (await page.locator("body").textContent()) ?? "";
  assert.equal(bodyText.includes("I led a reporting dashboard project"), true);
  assert.equal(
    bodyText.includes("Speak naturally — AI will respond automatically"),
    false,
  );

  await context.close();
});

test("voice interview keeps Thinking visible until the agent response returns", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();

  await page.goto(
    `${baseUrl}/functional-tests/voice?language=en&scenario=thinking-until-response`,
  );
  await waitForCondition(
    async () =>
      (await page.getByTestId("harness-ready").textContent()) === "true",
    5_000,
    "Expected functional voice harness mocks to be ready",
  );
  await page.getByRole("button", { name: "Start Voice Interview" }).click();

  await waitForText(page, "Thinking...", 8_000);
  await delay(500);
  assert.equal(
    await page.getByText("Thinking...", { exact: true }).first().isVisible(),
    true,
  );
  let bodyText = (await page.locator("body").textContent()) ?? "";
  assert.equal(
    bodyText.includes("Speak naturally — AI will respond automatically"),
    false,
  );

  await waitForText(page, "Thanks for explaining that project.", 8_000);
  await waitForCondition(
    async () =>
      !(await page
        .getByText("Thinking...", { exact: true })
        .first()
        .isVisible()
        .catch(() => false)),
    5_000,
    "Expected Thinking to clear once the agent response is visible",
  );
  bodyText = (await page.locator("body").textContent()) ?? "";
  assert.equal(bodyText.includes("Thanks for explaining that project."), true);

  await context.close();
});

test("discarded ASR finals clear the voice processing state", async () => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto(
    `${baseUrl}/functional-tests/voice?language=en&scenario=asr-cancelled`,
  );
  await waitForCondition(
    async () =>
      (await page.getByTestId("harness-ready").textContent()) === "true",
    5_000,
    "Expected functional voice harness mocks to be ready",
  );
  await page.getByRole("button", { name: "Start Voice Interview" }).click();

  const voiceStatus = page.getByTestId("voice-status-scroll");
  await waitForCondition(
    async () =>
      (await voiceStatus.getByText("Thinking...", { exact: true }).count()) > 0,
    8_000,
    "Expected the pending ASR final to show the processing indicator",
  );
  await waitForCondition(
    async () =>
      (await voiceStatus.getByText("Thinking...", { exact: true }).count()) === 0,
    3_000,
    "Expected the cancelled ASR final to clear the processing indicator",
  );
  assert.equal(
    ((await voiceStatus.textContent()) ?? "").includes(
      "Yes. And so I think communication is critical.",
    ),
    false,
  );

  await context.close();
});

test("long live transcripts scroll inside the voice panel without moving the controls", async () => {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.goto(
    `${baseUrl}/functional-tests/voice?language=en&scenario=long-transcript-layout`,
  );
  await waitForCondition(
    async () =>
      (await page.getByTestId("harness-ready").textContent()) === "true",
    5_000,
    "Expected functional voice harness mocks to be ready",
  );
  await page.getByRole("button", { name: "Start Voice Interview" }).click();

  const voiceStatusScroll = page.getByTestId("voice-status-scroll");
  await waitForCondition(
    async () =>
      voiceStatusScroll.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    10_000,
    "Expected the long transcript to overflow inside the voice panel",
  );

  const scrollMetrics = await voiceStatusScroll.evaluate((element) => ({
    clientHeight: element.clientHeight,
    contentTop:
      element.firstElementChild?.getBoundingClientRect().top ?? 0,
    panelTop: element.getBoundingClientRect().top,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  assert.equal(scrollMetrics.overflowY, "auto");
  assert.ok(scrollMetrics.clientHeight > 0);
  assert.ok(scrollMetrics.scrollHeight > scrollMetrics.clientHeight);
  assert.ok(scrollMetrics.contentTop >= scrollMetrics.panelTop);

  const controls = await page.locator('[data-tour="voice-progress"]').boundingBox();
  assert.ok(controls);
  assert.ok(controls.y + controls.height <= 720);

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
  const relayMessages = await readRelayMessages(page);
  assert.equal(
    relayMessages.some(
      ({ path, message }) =>
        path === "/ws/voice" &&
        message.type === "playback_ended" &&
        message.utteranceId === "functional-farewell-1",
    ),
    true,
    "Expected the browser to acknowledge the completed relay utterance",
  );

  await context.close();
});
