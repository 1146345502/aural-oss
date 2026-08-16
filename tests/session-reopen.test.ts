import assert from "node:assert/strict";
import test from "node:test";

import {
    buildReopenSessionUrl,
    canReopenSession,
    REOPEN_SESSION_PARAM,
} from "../src/lib/session-reopen";

const published = { publicSlug: "eng-screen", isActive: true };

test("an in-progress session on a published interview can be reopened", () => {
  assert.equal(canReopenSession({ status: "IN_PROGRESS", ...published }), true);
});

test("finished sessions cannot be reopened", () => {
  // COMPLETED renders the ended screen and ABANDONED is rejected when sending messages, so a
  // reopen link to either would strand the owner.
  assert.equal(canReopenSession({ status: "COMPLETED", ...published }), false);
  assert.equal(canReopenSession({ status: "ABANDONED", ...published }), false);
});

test("a row with no session yet cannot be reopened", () => {
  assert.equal(canReopenSession({ status: null, ...published }), false);
  assert.equal(canReopenSession({ status: "Not Started", ...published }), false);
  assert.equal(canReopenSession({ ...published }), false);
});

test("an unpublished or deactivated interview cannot be reopened", () => {
  // The session route resolves the interview by slug and only matches active ones.
  assert.equal(
    canReopenSession({ status: "IN_PROGRESS", publicSlug: null, isActive: true }),
    false,
  );
  assert.equal(
    canReopenSession({ status: "IN_PROGRESS", publicSlug: "", isActive: true }),
    false,
  );
  assert.equal(
    canReopenSession({ status: "IN_PROGRESS", publicSlug: "eng-screen", isActive: false }),
    false,
  );
  assert.equal(
    canReopenSession({ status: "IN_PROGRESS", publicSlug: "eng-screen" }),
    false,
  );
});

test("reopen url targets the existing session under the interview slug", () => {
  const url = buildReopenSessionUrl({
    publicSlug: "eng-screen",
    sessionId: "8f0c9b1e-1111-4222-8333-444455556666",
  });

  const parsed = new URL(url, "https://aural-ai.com");
  assert.equal(parsed.pathname, "/i/eng-screen/session");
  assert.equal(parsed.searchParams.get("sid"), "8f0c9b1e-1111-4222-8333-444455556666");
});

test("reopen url skips onboarding and the preview tour", () => {
  const parsed = new URL(
    buildReopenSessionUrl({ publicSlug: "eng-screen", sessionId: "s1" }),
    "https://aural-ai.com",
  );

  // preview=true mirrors how "Test as candidate" opened the session; resume=true additionally
  // suppresses the tour, which the session page keys off both params together.
  assert.equal(parsed.searchParams.get("preview"), "true");
  assert.equal(parsed.searchParams.get(REOPEN_SESSION_PARAM), "true");
});

test("reopen url is relative by default and absolute when given an origin", () => {
  assert.ok(
    buildReopenSessionUrl({ publicSlug: "eng-screen", sessionId: "s1" }).startsWith("/i/"),
  );
  assert.ok(
    buildReopenSessionUrl({
      publicSlug: "eng-screen",
      sessionId: "s1",
      origin: "https://aural-ai.com",
    }).startsWith("https://aural-ai.com/i/"),
  );
});

test("slugs and session ids needing escaping stay intact", () => {
  const parsed = new URL(
    buildReopenSessionUrl({ publicSlug: "a b/c", sessionId: "s 1&x=2" }),
    "https://aural-ai.com",
  );

  assert.equal(parsed.pathname, "/i/a%20b%2Fc/session");
  assert.equal(parsed.searchParams.get("sid"), "s 1&x=2");
});
