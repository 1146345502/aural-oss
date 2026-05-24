import assert from "node:assert/strict";
import test from "node:test";

import {
    collapseInternalAsrRepetitions,
    finalizeTurnBudgetResponse,
    isAsrRollingRevision,
    isUserEndRequest,
    isUserSkipRequest,
    mergeAsrSegments,
    mergePendingAsrInterim,
    responseInvitesUserReply,
    shouldHoldBargeInInterimForFinal,
    shouldSuppressAnsweredAsrFinal,
    trimCrossTurnOverlap,
} from "../server/voice-relay-helpers";

test("explicit interview end requests are not treated as skip-to-next requests", () => {
  const text = "No, I cannot. So we end the interview now.";

  assert.equal(isUserEndRequest(text), true);
  assert.equal(isUserSkipRequest(text), false);
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

test("pending ASR interim merge reports unchanged duplicate hypotheses", () => {
  const pending = "So let's focus on the first challenge, which is latency first. So in order to re";

  assert.deepEqual(
    mergePendingAsrInterim(pending, pending),
    { text: pending, changed: false },
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
