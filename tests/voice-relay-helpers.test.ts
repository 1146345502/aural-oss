import assert from "node:assert/strict";
import test from "node:test";

import {
    activeSpeechHoldAction,
    collapseInternalAsrRepetitions,
    countFollowUpsSpent,
    finalizeTurnBudgetResponse,
    hasAnsweredCurrentQuestion,
    isAsrRollingRevision,
    isUserEndRequest,
    isUserSkipRequest,
    mergeAsrSegments,
    playbackAckFallbackMs,
    questionAwaitingSummary,
    responseInvitesUserReply,
    shouldHoldBargeInInterimForFinal,
    shouldSuppressAnsweredAsrFinal,
    trimCrossTurnOverlap,
} from "../server/voice-relay-helpers";
import { maxFollowUpsForDepth } from "../src/lib/follow-up-depth";

/** Replays a question the way the relay sees it: the announcement is untracked,
 *  then user finals and the interviewer replies the participant heard in full. */
function turnBudgetAfter(
  depth: string,
  transcript: Array<{ role: "user" | "assistant"; text: string }>,
  userTurns: number,
): number {
  return (
    maxFollowUpsForDepth(depth) -
    countFollowUpsSpent({ transcript, userTurns })
  );
}

test("explicit interview end requests are not treated as skip-to-next requests", () => {
  const text = "No, I cannot. So we end the interview now.";

  assert.equal(isUserEndRequest(text), true);
  assert.equal(isUserSkipRequest(text), false);
});

test("active speech rotates a stale ASR session instead of committing a partial utterance", () => {
  assert.equal(
    activeSpeechHoldAction({
      micStillActive: true,
      heldForMs: 60_000,
      maxHoldMs: 60_000,
    }),
    "rotate",
  );
  assert.equal(
    activeSpeechHoldAction({
      micStillActive: false,
      heldForMs: 60_000,
      maxHoldMs: 60_000,
    }),
    "release",
  );
});

test("ASR rotation recovery keeps a carried turn open through a brief activity gap", () => {
  assert.equal(
    activeSpeechHoldAction({
      micStillActive: false,
      heldForMs: 600,
      maxHoldMs: 60_000,
      rotationRecoveryActive: true,
    }),
    "hold",
  );
  assert.equal(
    activeSpeechHoldAction({
      micStillActive: false,
      heldForMs: 3_000,
      maxHoldMs: 60_000,
      rotationRecoveryActive: false,
    }),
    "release",
  );
});

test("legacy playback fallback excludes TTS time-to-first-byte", () => {
  const sixteenSecondsOfPcm = 16 * 48_000;

  assert.equal(playbackAckFallbackMs(sixteenSecondsOfPcm, 15_000), 2_000);
  assert.equal(playbackAckFallbackMs(sixteenSecondsOfPcm, 0), 17_000);
  assert.equal(playbackAckFallbackMs(0, 0), 1_500);
});

test("long answers mentioning 'interview' as a topic are not treated as end requests", () => {
  const answers = [
    "Yeah. So i had two challenges. Number one was to reduce latency and number two was to finish the interview process faster.",
    "The main challenge was to end the interview session gracefully when the user disconnects unexpectedly from the platform.",
    "I built a system that can automatically stop the interview if the candidate leaves and then resume it later.",
    "Yes, i recently built a ai interview platform and had some technical challenges. The hard part was to terminate the interview cleanly.",
  ];

  for (const text of answers) {
    assert.equal(isUserEndRequest(text), false, `should not end on: "${text.slice(0, 60)}..."`);
  }
});

test("genuine end requests at the tail of longer utterances are still detected", () => {
  assert.equal(
    isUserEndRequest("I think I covered everything about the latency and NLP challenges. That's all."),
    true,
  );
  assert.equal(
    isUserEndRequest("I discussed the two main issues with the platform architecture. I'm done."),
    true,
  );
});

test("explicit next-question requests still count as skip intent", () => {
  assert.equal(isUserSkipRequest("Let's move on to the next question."), true);
  assert.equal(isUserEndRequest("Let's move on to the next question."), false);
});

test("done with this question is next-question intent, not end interview", () => {
  const text =
    "Ok. I think i'm done with this question. Let's move on to the next one.";

  assert.equal(isUserEndRequest(text), false);
  assert.equal(isUserSkipRequest(text), true);
});

test("done with the interview still ends the session", () => {
  assert.equal(isUserEndRequest("I'm done with the interview."), true);
  assert.equal(isUserSkipRequest("I'm done with the interview."), false);
});

test("Chinese end requests from real relay transcripts are not treated as skip", () => {
  const phrases = [
    "这道题目我不会，我们结束答题吧。",
    "我们结束题吧。",
    "没有了，结束。",
  ];

  for (const text of phrases) {
    assert.equal(isUserEndRequest(text), true, `${text} should count as end intent`);
    assert.equal(isUserSkipRequest(text), false, `${text} should not count as skip intent`);
  }
});

test("indirect English invitations to continue keep the conversational floor open", () => {
  assert.equal(
    responseInvitesUserReply(
      "Thank you for sharing. If you have any other experiences or examples that showcase your communication skills, I would appreciate hearing about them.",
      false,
    ),
    true,
  );
});

test("Chinese invitations to continue are also detected", () => {
  assert.equal(
    responseInvitesUserReply("如果你愿意，也可以继续分享更多相关的例子。", true),
    true,
  );
});

test("invitation with 'bring it up' or 'if there is anything' is detected", () => {
  assert.equal(
    responseInvitesUserReply(
      "I understand that you've shared all you can about your recent projects. If there's anything else you'd like to discuss regarding your experience or skills, please feel free to bring it up.",
      false,
    ),
    true,
  );
});

test("short wrap-up acknowledgements do not look like reply invitations", () => {
  assert.equal(
    responseInvitesUserReply("Thank you for sharing. Let's move on to the next question.", false),
    false,
  );
});

test("turn budget finalizer replaces over-limit follow-up questions with transition", () => {
  assert.deepEqual(
    finalizeTurnBudgetResponse({
      response: "好的，我了解了。那么，你认为自己对美妆产品有哪些了解？ [NEXT]",
      nextToken: "[NEXT]",
      mustAdvance: true,
      keepsConversationOpen: true,
      transitionResponse: "好的，谢谢你的分享。",
    }),
    {
      response: "好的，谢谢你的分享。 [NEXT]",
      changed: true,
    },
  );
});

test("turn budget finalizer leaves normal follow-ups untouched before limit", () => {
  assert.deepEqual(
    finalizeTurnBudgetResponse({
      response: "能具体举一个例子吗？",
      nextToken: "[NEXT]",
      mustAdvance: false,
      keepsConversationOpen: true,
      transitionResponse: "好的，谢谢你的分享。",
    }),
    {
      response: "能具体举一个例子吗？",
      changed: false,
    },
  );
});

test("moderate depth runs out of follow-ups after the second one, not the seventh", () => {
  const transcript: Array<{ role: "user" | "assistant"; text: string }> = [];

  transcript.push({ role: "user", text: "Here is my answer to the first question." });
  assert.equal(turnBudgetAfter("MODERATE", transcript, 1), 2);

  transcript.push({ role: "assistant", text: "Can you give a concrete example?" });
  transcript.push({ role: "user", text: "Sure, at my last company we..." });
  assert.equal(turnBudgetAfter("MODERATE", transcript, 2), 1);

  transcript.push({ role: "assistant", text: "How did you measure the impact?" });
  transcript.push({ role: "user", text: "We tracked adoption weekly." });
  assert.equal(turnBudgetAfter("MODERATE", transcript, 3), 0);
});

test("light depth allows no follow-ups and deep depth allows five", () => {
  assert.equal(maxFollowUpsForDepth("LIGHT"), 0);
  assert.equal(maxFollowUpsForDepth("DEEP"), 5);
});

test("research questions get more headroom but still rank by configured depth", () => {
  assert.ok(
    maxFollowUpsForDepth("MODERATE", "RESEARCH") > maxFollowUpsForDepth("MODERATE"),
  );
  assert.ok(
    maxFollowUpsForDepth("MODERATE", "RESEARCH") <
      maxFollowUpsForDepth("DEEP", "RESEARCH"),
  );
});

test("unrecognized follow-up depths fall back to the column default", () => {
  assert.equal(maxFollowUpsForDepth("medium"), maxFollowUpsForDepth("MODERATE"));
  assert.equal(maxFollowUpsForDepth(undefined), maxFollowUpsForDepth("MODERATE"));
});

test("ASR finals split from one answer do not each burn a follow-up", () => {
  // One spoken answer arriving as three finals, with the interviewer's replies
  // to the first two cut short by the participant continuing to talk.
  const transcript = [
    { role: "user" as const, text: "So the main challenge was latency." },
    { role: "user" as const, text: "Reliability." },
    { role: "user" as const, text: "And graceful degradation when infra is down." },
    { role: "assistant" as const, text: "How did you address the latency?" },
  ];

  assert.equal(countFollowUpsSpent({ transcript, userTurns: 3 }), 1);
});

test("a question still advances when every follow-up gets barged in on", () => {
  const transcript = Array.from({ length: 8 }, () => ({ role: "user" as const }));

  assert.ok(countFollowUpsSpent({ transcript, userTurns: 8 }) >= 2);
});

test("greetings and repeat requests do not count as answering the question", () => {
  assert.equal(
    hasAnsweredCurrentQuestion({
      transcript: [{ role: "user", text: "Hi, can you hear me?" }],
      userTurns: 1,
      isZh: false,
    }),
    false,
  );

  assert.equal(
    hasAnsweredCurrentQuestion({
      transcript: [
        { role: "user", text: "Hi, can you hear me?" },
        { role: "assistant", text: "Yes, I can hear you clearly." },
        {
          role: "user",
          text: "Great. I led the deployment team at my last company for about three years.",
        },
      ],
      userTurns: 2,
      isZh: false,
    }),
    true,
  );
});

test("terse answers still let the interview move on after a couple of turns", () => {
  assert.equal(
    hasAnsweredCurrentQuestion({
      transcript: [
        { role: "user", text: "Not really." },
        { role: "user", text: "No." },
        { role: "user", text: "Nope." },
      ],
      userTurns: 3,
      isZh: false,
    }),
    true,
  );
});

test("ASR merge treats punctuation-only hypothesis revisions as duplicates", () => {
  assert.equal(
    mergeAsrSegments(
      "I deployed a CDN service.",
      "I deployed a c d n service",
    ),
    "I deployed a CDN service.",
  );
});

test("ASR merge replaces overlapping rolling hypotheses instead of appending them", () => {
  assert.equal(
    mergeAsrSegments(
      "So, um, in terms of latency issue, what i did was, um, i, uh, first i hosted all",
      "So um in terms of latency issue what I did was I first hosted all of my services within the US region",
    ),
    "So um in terms of latency issue what I did was I first hosted all of my services within the US region",
  );
});

test("ASR merge appends true continuations", () => {
  assert.equal(
    mergeAsrSegments(
      "I first hosted all of my services",
      "within the US region because most users are there",
    ),
    "I first hosted all of my services within the US region because most users are there",
  );
});

test("ASR merge replaces short rolling revisions instead of accumulating false branches", () => {
  const chunks = [
    "Robot.",
    "Robot and.",
    "Robot and the.",
    "Robot and ai is.",
    "Robot and ai is the same situation.",
    "Robot and ai is the same situation regarding the.",
  ];

  const merged = chunks.reduce((acc, chunk) => mergeAsrSegments(acc, chunk), "");

  assert.equal(merged, "Robot and ai is the same situation regarding the.");
});

test("ASR merge replaces near-identical revisions with inserted article", () => {
  assert.equal(
    mergeAsrSegments(
      "Yes, i recently developed ai interview platform.",
      "Yes, i recently developed a ai interview platform.",
    ),
    "Yes, i recently developed a ai interview platform.",
  );
});

test("ASR merge collapses adjacent repeated sentence revisions", () => {
  assert.equal(
    mergeAsrSegments(
      "",
      "We also deployed c d. We also deployed c d n. Service, which allows our users to download media files faster.",
    ),
    "We also deployed c d n. Service, which allows our users to download media files faster.",
  );
});

test("ASR merge extends mixed Chinese rolling hypotheses without repeating prefixes", () => {
  const chunks = [
    "我觉得首先好的产品呢？第一个它需要有一定的功能性。",
    "那相当于",
    "那相当于，比如说你",
    "那相当于，比如说你整个 package",
    "那相当于，比如说你整个 package，以及你整个产品的 texture 的这个设定的话",
    "那相当于，比如说你整个 package，以及你整个产品的 texture 的这个设定的话，可以让消费者有一种 luxury premium 的 experience 的话，是非常好的。",
  ];

  const merged = chunks.reduce((acc, chunk) => mergeAsrSegments(acc, chunk), "");

  assert.equal(
    merged,
    "我觉得首先好的产品呢？第一个它需要有一定的功能性。那相当于，比如说你整个 package，以及你整个产品的 texture 的这个设定的话，可以让消费者有一种 luxury premium 的 experience 的话，是非常好的。",
  );
});

test("ASR merge extends hypotheses that restart from an earlier middle span", () => {
  assert.equal(
    mergeAsrSegments(
      "店铺的店。面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店那转化率这一块的话就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者，这个需求可以满足",
      "面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店，那转化率这一块的话，就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者这个需求。可以满足他们啊，去掏钱的这么一个点",
    ),
    "店铺的店。面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店那转化率这一块的话就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者，这个需求可以满足他们啊，去掏钱的这么一个点",
  );
});

test("ASR merge avoids replaying multiple earlier spans in a long Chinese answer", () => {
  const chunks = [
    "率乘以你的转化率，乘以你的客单价来实现的，那首先进店率这一块的话，我们 ba 其实是可以跟总部那边去做一些合作，比如是说我们可以去反馈一下现在市场上面有哪些店面的设计是非常的合理的那我们公司的这个店铺的店。面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店那转化率这一块的话就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者，这个需求可以满足",
    "面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店，那转化率这一块的话，就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者这个需求。可以满足他们啊，去掏钱的这么一个点，然后，嗯，客单价的话其实在于产品的帮助里，比如说我们在做转化沟通过程当中的话，有一些产品是可以去做一些 cross sell，可以去绑定销售的。",
    "可以满足他们啊？去掏钱的这么一个点，然后，嗯，客单价的话其实在于产品的帮助里，比如说我们在做转化沟通过程当中的话，有一些产品是可以去做一些 cross sell，可以去绑定销售的。那这样的话就可以提高产品的一个产品的一个 bundle sales 的一个 rate",
  ];

  const merged = chunks.reduce((acc, chunk) => mergeAsrSegments(acc, chunk), "");

  assert.equal(
    merged,
    "率乘以你的转化率，乘以你的客单价来实现的，那首先进店率这一块的话，我们 ba 其实是可以跟总部那边去做一些合作，比如是说我们可以去反馈一下现在市场上面有哪些店面的设计是非常的合理的那我们公司的这个店铺的店。面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店那转化率这一块的话就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者，这个需求可以满足他们啊，去掏钱的这么一个点，然后，嗯，客单价的话其实在于产品的帮助里，比如说我们在做转化沟通过程当中的话，有一些产品是可以去做一些 cross sell，可以去绑定销售的。那这样的话就可以提高产品的一个产品的一个 bundle sales 的一个 rate",
  );
});

test("ASR merge collapses repeated spans inside a single final", () => {
  assert.equal(
    mergeAsrSegments(
      "",
      "这是晓之以理，让他知道这个是 reasonable 的。第二个，呃，正是打用情感上打动他，就是因为每个女人在不同年龄阶段她肯定有自己的一些困境，但是呢，在每个年龄阶段都不能放弃对美的追求。动之以情，挟之以威，就告诉他是说那再不买这个活动，就他妈的结束了动之以情，挟之以威，就告诉他是说那再不买这个活动就他妈的结束啦。动之以情，挟之以威，就告诉他是说那再不买这个活动就他妈的结束了。",
    ),
    "这是晓之以理，让他知道这个是 reasonable 的。第二个，呃，正是打用情感上打动他，就是因为每个女人在不同年龄阶段她肯定有自己的一些困境，但是呢，在每个年龄阶段都不能放弃对美的追求。动之以情，挟之以威，就告诉他是说那再不买这个活动，就他妈的结束了。",
  );
});

test("ASR rolling revision detects late mixed Chinese expansions", () => {
  assert.equal(
    isAsrRollingRevision(
      "我觉得首先好的产品呢？第一个它需要有一定的功能性。那相当于",
      "那相当于，比如说你整个 package，以及你整个产品的 texture 的这个设定的话，可以让消费者有一种 luxury premium 的 experience。",
    ),
    true,
  );

  assert.equal(
    isAsrRollingRevision(
      "我觉得好的产品需要有功能性。",
      "我在沟通和销售方面的优势是理解消费者。",
    ),
    false,
  );
});

test("ASR rolling revision detects approximate contained tails", () => {
  assert.equal(
    isAsrRollingRevision(
      "率乘以你的转化率，乘以你的客单价来实现的，那首先进店率这一块的话，我们 ba 其实是可以跟总部那边去做一些合作，比如是说我们可以去反馈一下现在市场上面有哪些店面的设计是非常的合理的那我们公司的这个店铺的店。面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店那转化率这一块的话就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者，这个需求可以满足面的动向以及说 promotion 活动有哪些可以改进的地方，从而来吸引更多流量入店，那转化率这一块的话，就依赖于我们对于产品的一个 claim，以及说消费者需求的一个精准把控了，就这个点正好能够打动消费者这个需求。可以满足他们啊，去掏钱的这么一个点，然后，嗯，客单价的话，其实在于产品的帮助里，比如说我们在做转化沟通过程当中的话，有一些产品是可以去做一些 cross sell，可以去绑定销售的那这样的话可以满足他们啊？去掏钱的这么一个点，然后，嗯，客单价的话其实在于产品的帮助里，比如说我们在做转化沟通过程当中的话，有一些产品是可以去做一些 cross sell，可以去绑定销售的。那这样的话就可以提高产品的一个产品的一个 bundle sales 的一个 rate",
      "那这样的话就可以提高产品的一个，产品的一个 bond sales 的一个 rate。",
    ),
    true,
  );
});

test("answered ASR final suppresses approximate duplicate tail before publishing", () => {
  assert.equal(
    shouldSuppressAnsweredAsrFinal(
      "嗯，我觉得是一个对比吧？就是别的小，别的 ba 对他的这种傲慢的态度他一定是可以感受得到的，就看到别人对他不尊敬嘛？当然看到我这么一个真诚的小姑娘，然后这么的对待他，他心中肯定是有一些。感动感动的再加上他当时可能确定确实有想买这套珠宝的一个，呃冲动，只是缺少这么一个契机，然后让让人来最终帮他完成这一个转换",
      "感动的，再加上他当时可能确定确实有想买这套珠宝的一个呃，冲动，只是缺少这么一个契机，然后让让人来最终帮他完成这一个转换。",
    ),
    true,
  );
});

test("answered ASR final does not suppress additive continuation after barge-in", () => {
  assert.equal(
    shouldSuppressAnsweredAsrFinal(
      "Yes, i tried. The difference. Um, llm services in a such as the ones from openai cloud, minimax, kimi, et cetera, to identify the best models for um. As for llm and then.",
      "Uh, at the same time, i'll also try out fine tuning the prompts, deploying tools for the models in order to improve the performance.",
    ),
    false,
  );
});

test("short answered acknowledgement does not suppress a later full answer with the same prefix", () => {
  const acknowledgement = "Yes.";
  const fullAnswer =
    "Yes. And so I think communication means communicating technical tradeoffs clearly to people.";

  assert.equal(
    shouldSuppressAnsweredAsrFinal(acknowledgement, fullAnswer),
    false,
  );
  assert.equal(
    isAsrRollingRevision(acknowledgement, fullAnswer),
    true,
    "A pending ASR hypothesis should still expand before the assistant has answered",
  );
});

test("short answered acknowledgement still suppresses an exact replay", () => {
  assert.equal(
    shouldSuppressAnsweredAsrFinal("Yes.", "Yes."),
    true,
  );
});

test("barge-in interim is held for a final transcript instead of promoted immediately", () => {
  assert.equal(
    shouldHoldBargeInInterimForFinal({
      text: "这种病症",
      definite: false,
      ttsSpeaking: true,
      endingInterview: false,
    }),
    true,
  );

  assert.equal(
    shouldHoldBargeInInterimForFinal({
      text: "我在沟通和销售方面的优势是理解消费者。",
      definite: true,
      ttsSpeaking: true,
      endingInterview: false,
    }),
    false,
  );

  assert.equal(
    shouldHoldBargeInInterimForFinal({
      text: "我在沟通和销售方面的优势是理解消费者。",
      definite: false,
      ttsSpeaking: false,
      endingInterview: false,
    }),
    false,
  );
});

test("questionAwaitingSummary returns the question being answered mid-interview", () => {
  const questions = [{ text: "Q1" }, { text: "Q2" }, { text: "Q3" }];

  assert.deepEqual(questionAwaitingSummary(questions, 0, 2), { text: "Q1" });
  assert.deepEqual(questionAwaitingSummary(questions, 2, 4), { text: "Q3" });
});

test("questionAwaitingSummary has nothing to attribute once the wrap-up starts", () => {
  const questions = [{ text: "Q1" }, { text: "Q2" }];

  // After the last question the relay leaves the index one past the end while
  // "anything else to add?" is answered, and Q2's summary is already recorded.
  assert.equal(questionAwaitingSummary(questions, questions.length, 2), null);
  assert.equal(questionAwaitingSummary(questions, 99, 2), null);
});

test("questionAwaitingSummary skips an empty transcript", () => {
  assert.equal(questionAwaitingSummary([{ text: "Q1" }], 0, 0), null);
});

test("ending the interview from the wrap-up window has no question to summarize", () => {
  // Regression: the participant answering "anything else to add?" with a phrase
  // that reads as an end request used to throw on `currentQ.text`, which
  // stranded the farewell and left the session stuck IN_PROGRESS.
  const questions = [{ text: "Tell me about a tough customer." }];
  const closing = "No, that's all from my side.";
  assert.equal(isUserEndRequest(closing), true);

  const wrapUpTranscript = [
    { role: "assistant" as const, text: "Is there anything else you'd like to add?" },
    { role: "user" as const, text: closing },
  ];

  assert.equal(
    questionAwaitingSummary(questions, questions.length, wrapUpTranscript.length),
    null,
  );
});

test("collapseInternalAsrRepetitions removes rolling revisions with changed first word", () => {
  const garbled =
    "Art? Arthur and then second was to improve the natural. Artificial, and then second was to improve the naturalness of the. Arthur, and then second was to improve the naturalness of the.";
  const cleaned = collapseInternalAsrRepetitions(garbled);
  const occurrences = (cleaned.match(/and then second was to improve/g) || []).length;
  assert.equal(occurrences, 1, `Expected single occurrence, got ${occurrences} in: "${cleaned}"`);
  assert.ok(
    cleaned.includes("second was to improve the naturalness"),
    `Expected cleaned text to keep the best revision, got: "${cleaned}"`,
  );
});

test("trimCrossTurnOverlap trims barge-in that overlaps with previous turn tail", () => {
  const prev =
    "Yeah, so regarding the latency issue, i did two things. Number one was to host all services in the us region. And then secondly, i also deployed cdn service which allows our users to.";
  const incoming =
    "And service which allows our users to download the media files at much faster speed.";
  const result = trimCrossTurnOverlap(prev, incoming);
  assert.ok(!result.toLowerCase().includes("allows our users to"), `should trim overlap: "${result}"`);
  assert.ok(result.toLowerCase().includes("download"), `should keep continuation: "${result}"`);
});

test("trimCrossTurnOverlap preserves non-overlapping text", () => {
  const prev = "I worked on reducing latency in the system.";
  const incoming = "The second challenge was improving audio quality.";
  assert.equal(trimCrossTurnOverlap(prev, incoming), incoming);
});
