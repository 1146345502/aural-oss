import assert from "node:assert/strict";
import test from "node:test";

import { cleanPeriodArtifacts, mergeAsrFinal, mergeClientAsrInterim, stripInterimPunctuation, stripIsolatedCjk, trimCrossTurnOverlap } from "@/lib/voice/asr-interim";

test("client ASR interim keeps earlier speech when a trailing fragment arrives", () => {
  const first =
    "I also finetune the prompt quite a bit, in order to guide the model behavior.";
  const trailing = "Make the ai interview a sound like actual human being.";

  assert.equal(
    mergeClientAsrInterim(first, trailing),
    `${first} ${trailing}`,
  );
});

test("client ASR interim replaces rolling revisions instead of appending them", () => {
  const chunks = [
    "Robot.",
    "Robot and.",
    "Robot and the.",
    "Robot and ai is.",
    "Robot and ai is the same situation.",
  ];

  const merged = chunks.reduce((acc, chunk) => mergeClientAsrInterim(acc, chunk), "");

  assert.equal(merged, "Robot and ai is the same situation.");
});

test("client ASR interim replaces near-identical revisions with inserted article", () => {
  assert.equal(
    mergeClientAsrInterim(
      "Yes, i recently developed ai interview platform.",
      "Yes, i recently developed a ai interview platform.",
    ),
    "Yes, i recently developed a ai interview platform.",
  );
});

test("client ASR interim collapses adjacent sentence revisions", () => {
  assert.equal(
    mergeClientAsrInterim(
      "",
      "We also deployed c d. We also deployed c d n. Service, which allows our users to download media files faster.",
    ),
    "We also deployed c d n. Service, which allows our users to download media files faster.",
  );
});

test("client ASR interim extends overlapping continuations", () => {
  assert.equal(
    mergeClientAsrInterim(
      "I deployed services in the US region",
      "US region and used CDN for media files",
    ),
    "I deployed services in the US region and used CDN for media files",
  );
});

test("mergeAsrFinal replaces messy buffer tail with clean relay text", () => {
  assert.equal(
    mergeAsrFinal(
      "And at the same time, we also deploy. Can. service. which. allows. the. users. to. download. media. files. faster.",
      "Can service, which allows the users to download media files faster.",
    ),
    "And at the same time, we also deploy. Can service, which allows the users to download media files faster.",
  );
});

test("mergeAsrFinal preserves buffer prefix when relay covers only the tail", () => {
  assert.equal(
    mergeAsrFinal(
      "Yeah. So I encounter two major challenges. Number one was to reduce latency, and number two was to make the ai interview sounds naturally like a real human.",
      "Make the ai interview sounds naturally like a real human.",
    ),
    "Yeah. So I encounter two major challenges. Number one was to reduce latency, and number two was to make the ai interview sounds naturally like a real human.",
  );
});

test("mergeAsrFinal uses relay text directly when it covers equal or more content", () => {
  assert.equal(
    mergeAsrFinal(
      "Make the ai interview",
      "Make the ai interview sounds naturally like a real human.",
    ),
    "Make the ai interview sounds naturally like a real human.",
  );
});

test("mergeAsrFinal falls back to buffer when relay is empty", () => {
  assert.equal(
    mergeAsrFinal("Some pending text from interims.", ""),
    "Some pending text from interims.",
  );
});

test("cleanPeriodArtifacts joins 3+ consecutive period-separated short segments", () => {
  assert.equal(
    cleanPeriodArtifacts(
      "And then secondly, i also deploy cdn service. Which. Which allows. the. users. to. download. media. files. faster.",
    ),
    "And then secondly, i also deploy cdn service. Which allows the users to download media files faster.",
  );
});

test("cleanPeriodArtifacts preserves legitimate short sentences", () => {
  assert.equal(
    cleanPeriodArtifacts("I agree. That is correct. Let us proceed with the plan."),
    "I agree. That is correct. Let us proceed with the plan.",
  );
});

test("cleanPeriodArtifacts ignores Chinese sentence boundaries", () => {
  assert.equal(
    cleanPeriodArtifacts("这是晓之以理。第二个正是打用情感上打动他。动之以情。"),
    "这是晓之以理。第二个正是打用情感上打动他。动之以情。",
  );
});

test("cleanPeriodArtifacts collapses rolling revision duplications across any punctuation", () => {
  assert.equal(
    cleanPeriodArtifacts(
      "And then secondly, i also deployed cdn service, which. How's my users? How's my users to download media files as fast as possible?",
    ),
    "And then secondly, i also deployed cdn service, which. How's my users to download media files as fast as possible?",
  );
});

test("cleanPeriodArtifacts removes spurious mid-sentence periods before lowercase words", () => {
  assert.equal(
    cleanPeriodArtifacts(
      "In the short amount. of time and then secondly. I also deployed cd. n service which then allows. the users to download. media files as fast as possible.",
    ),
    "In the short amount of time and then secondly. I also deployed cd n service which then allows the users to download media files as fast as possible.",
  );
});

test("cleanPeriodArtifacts removes spurious question marks before lowercase words", () => {
  assert.equal(
    cleanPeriodArtifacts(
      "From there, i can identify the most. Suitable ai? model service that's the best fit for my user.",
    ),
    "From there, i can identify the most. Suitable ai model service that's the best fit for my user.",
  );
});

test("cleanPeriodArtifacts collapses revisions where ASR changes the first word", () => {
  const result = cleanPeriodArtifacts(
    "Art? Arthur and then second was to improve the natural. Artificial, and then second was to improve the naturalness of the. Arthur, and then second was to improve the naturalness of the.",
  );
  const occurrences = (result.match(/and then second was to improve/g) || []).length;
  assert.equal(occurrences, 1, `Expected single occurrence, got ${occurrences} in: "${result}"`);
});

test("stripIsolatedCjk removes Chinese characters from English text", () => {
  assert.equal(
    stripIsolatedCjk("i also.调应 the ai models for each of the test"),
    "i also the ai models for each of the test",
  );
});

test("stripIsolatedCjk preserves predominantly Chinese text", () => {
  assert.equal(
    stripIsolatedCjk("这是晓之以理。第二个正是打用情感上打动他。"),
    "这是晓之以理。第二个正是打用情感上打动他。",
  );
});

test("stripIsolatedCjk preserves text with no CJK characters", () => {
  assert.equal(
    stripIsolatedCjk("This is a normal English sentence."),
    "This is a normal English sentence.",
  );
});

test("cleanPeriodArtifacts strips isolated CJK before deduplication", () => {
  assert.equal(
    cleanPeriodArtifacts(
      "And then separately, i also.调应 the ai models for each of the test.",
    ),
    "And then separately, i also the ai models for each of the test.",
  );
});

test("client ASR interim collapses short progressive revisions via containment", () => {
  assert.equal(
    mergeClientAsrInterim(
      "",
      "Which. Which allows. Which allows the users to download media files.",
    ),
    "Which allows the users to download media files.",
  );
});

test("trimCrossTurnOverlap trims overlapping prefix from barge-in continuation", () => {
  const prev =
    "Yeah, so regarding the latency issue, i did two things. Number one was to host all of my services within the us region. And then secondly, i also deployed cdn service which allows our users to.";
  const incoming =
    "And service, which allows our users to download the media files. At much faster speed.";
  const result = trimCrossTurnOverlap(prev, incoming);
  assert.ok(!result.toLowerCase().includes("allows our users to"), `should not contain overlapping phrase: "${result}"`);
  assert.ok(result.toLowerCase().includes("download"), `should contain continuation: "${result}"`);
});

test("trimCrossTurnOverlap preserves text with no overlap", () => {
  const prev = "I worked on reducing latency in the system.";
  const incoming = "The second challenge was improving audio quality.";
  assert.equal(trimCrossTurnOverlap(prev, incoming), incoming);
});

test("trimCrossTurnOverlap handles short texts gracefully", () => {
  assert.equal(trimCrossTurnOverlap("Hello", "Yes, I can hear you."), "Yes, I can hear you.");
  assert.equal(trimCrossTurnOverlap("", "Some text"), "Some text");
  assert.equal(trimCrossTurnOverlap("Prev text", ""), "");
});

test("stripInterimPunctuation removes all mid-sentence and trailing periods", () => {
  assert.equal(
    stripInterimPunctuation("Hello. World. Today."),
    "Hello World Today",
  );
  assert.equal(
    stripInterimPunctuation("the interviewer. Performance to rate the."),
    "the interviewer Performance to rate the",
  );
  assert.equal(
    stripInterimPunctuation("word1? word2. word3"),
    "word1 word2 word3",
  );
});
