/**
 * Bilingual prompt templates for the voice relay server.
 *
 * All zh/en strings are centralized here for easy maintenance
 * and future multi-language support. To add a new language,
 * extend BiText in src/lib/i18n.ts and add translations to
 * each template below.
 */
import {
    AI_TONE_ZH,
    AI_TONE_ZH_DEFAULT,
    type BiText,
    bt,
    INTERVIEW_MESSAGES,
    QUESTION_TYPE_HINT,
    QUESTION_TYPE_LABEL,
    ROLE_LABELS,
    SCREEN_PROMPT,
} from "../src/lib/i18n";

// ── Types ───────────────────────────────────────────────────────────

export interface ResponsePromptParams {
  aiName: string;
  title: string;
  qNum: number;
  totalQs: number;
  qText: string;
  qDescription?: string | null;
  qType: string;
  choiceInstruction: string;
  history: string;
  followUpInstruction: string;
  nextToken: string;
  prevToken: string;
  userTurns: number;
  previousContext?: string;
  codeContent?: string;
  codeLanguage?: string;
  whiteboardDescription?: string;
  whiteboardLoading?: boolean;
  correctionGuard?: string;
  antiRepetition?: string;
  recentInterviewerResponses?: string[];
  latestInterviewerPrompt?: string;
  latestParticipantAnswer?: string;
  forceLanguage?: string;
}

/** For follow-up budget lines: mid-interview vs last question use different closing language */
export interface FollowUpBudgetContext {
  isLastQuestion: boolean;
}

// ── Spoken text templates ───────────────────────────────────────────
// These are spoken aloud by the S2S model via SayHello.

export const SPOKEN = {
  wrapUp: INTERVIEW_MESSAGES.wrapUp,
  farewell: INTERVIEW_MESSAGES.farewell,
  defaultQuestion: INTERVIEW_MESSAGES.defaultQuestion,

  systemText(aiName: string, toneKey: string): BiText {
    return {
      zh: `你是${aiName}，一位${AI_TONE_ZH[toneKey] || AI_TONE_ZH_DEFAULT}的面试官。你只负责朗读系统提供给你的内容。不要自己编造任何回复。`,
      en: `You are ${aiName}, a ${toneKey} interviewer. You only read aloud what the system provides via SayHello. Do not generate your own responses.`,
    };
  },

  codingWbIntro(type: string, variant: "start" | "continue" = "start"): BiText {
    return {
      zh: `这是一道${QUESTION_TYPE_LABEL[type].zh}，${SCREEN_PROMPT.zh}${QUESTION_TYPE_HINT[type][variant].zh}`,
      en: `this is a ${QUESTION_TYPE_LABEL[type].en} question. ${SCREEN_PROMPT.en} ${QUESTION_TYPE_HINT[type][variant].en}`,
    };
  },

  singleChoiceSuffix(labels: string): BiText {
    return {
      zh: ` 选项有：${labels}。请选择一个选项并说明你的理由。`,
      en: ` Your options are: ${labels}. Please pick one and explain your reasoning.`,
    };
  },

  multipleChoiceSuffix(labels: string): BiText {
    return {
      zh: ` 选项有：${labels}。这道题可以选择多个选项，请选择并说明你的理由。`,
      en: ` Your options are: ${labels}. You may select more than one. Please pick and explain your reasoning.`,
    };
  },

  optionsList(labels: string): BiText {
    return {
      zh: ` 选项有：${labels}。`,
      en: ` Your options are: ${labels}.`,
    };
  },

  greeting(aiName: string, title: string, count: number, spokenQuestion: string): BiText {
    return {
      zh: `你好，我是${aiName}，今天由我来和你聊聊"${title}"这个话题，一共${count}个问题。我们开始吧！第一个问题：${spokenQuestion}`,
      en: `Hi, I'm ${aiName}. Today we'll chat about "${title}" — I have ${count} questions. Let's begin! Here is the first question: ${spokenQuestion}`,
    };
  },

  transition: {
    codingWb(qNum: number, intro: string): BiText {
      return {
        zh: `接下来第${qNum}个问题，${intro}`,
        en: `Next, question ${qNum} — ${intro}`,
      };
    },
    normal(qNum: number, qText: string, optionsSuffix: string): BiText {
      return {
        zh: `接下来第${qNum}个问题：${qText}${optionsSuffix}`,
        en: `Next, question ${qNum}: ${qText}${optionsSuffix}`,
      };
    },
  },

  resume: {
    codingWb(qNum: number, intro: string): BiText {
      return {
        zh: `欢迎回来！我们继续之前的面试。接下来是第${qNum}个问题，${intro}`,
        en: `Welcome back! Let's continue where we left off. Question ${qNum} — ${intro}`,
      };
    },
    normal(qNum: number, qText: string, optionsSuffix: string): BiText {
      return {
        zh: `欢迎回来！我们继续之前的面试。接下来是第${qNum}个问题：${qText}${optionsSuffix}`,
        en: `Welcome back! Let's continue where we left off. Here's question ${qNum}: ${qText}${optionsSuffix}`,
      };
    },
  },

  returnTo: {
    codingWb(qNum: number, intro: string): BiText {
      return {
        zh: `好的，我们回到第${qNum}个问题，${intro}`,
        en: `Sure, let's go back to question ${qNum} — ${intro}`,
      };
    },
    normal(qNum: number, qText: string, optionsSuffix: string): BiText {
      return {
        zh: `好的，我们回到第${qNum}个问题：${qText}${optionsSuffix} 请继续补充你的回答。`,
        en: `Sure, let's go back to question ${qNum}: ${qText}${optionsSuffix} Please feel free to add to your previous answer.`,
      };
    },
  },
};

// ── LLM prompt templates ────────────────────────────────────────────

export const PROMPTS = {
  summaryError: INTERVIEW_MESSAGES.summaryError,

  formatHistory(entries: Array<{ role: string; text: string }>, isZh: boolean): string {
    return entries
      .map((m) =>
        `${bt(isZh, m.role === "user" ? ROLE_LABELS.participant : ROLE_LABELS.interviewer)}: ${m.text}`
      )
      .join("\n");
  },

  summarize(questionText: string, transcript: string): BiText {
    return {
      zh: `以下是面试中关于这个问题的对话：\n问题：${questionText}\n\n${transcript}\n\n请用1-2句话简要总结受访者的回答要点。只输出总结内容，不要加任何前缀。`,
      en: `Interview discussion:\nQuestion: ${questionText}\n\n${transcript}\n\nSummarize the participant's key points in 1-2 sentences. Output only the summary.`,
    };
  },

  choiceInstruction: {
    singleChoice(labels: string): BiText {
      return {
        zh: `\n这是一道【单选题】，选项为：${labels}。受访者只能选择一个选项。如果受访者选了多个，请提醒他们只能选一个。确保受访者既给出了选择，也解释了理由，两者都有之后再进入下一题。`,
        en: `\nThis is a SINGLE-CHOICE question with options: ${labels}. The participant must pick exactly one. If they select multiple, remind them to pick only one. Make sure they both select an option AND explain their reasoning before moving on.`,
      };
    },
    multipleChoice(labels: string): BiText {
      return {
        zh: `\n这是一道【多选题】，选项为：${labels}。受访者可以选择一个或多个选项。确保受访者既给出了选择，也解释了理由，两者都有之后再进入下一题。`,
        en: `\nThis is a MULTIPLE-CHOICE question with options: ${labels}. The participant may select one or more options. Make sure they both select their option(s) AND explain their reasoning before moving on.`,
      };
    },
    coding(nextToken: string, prevToken: string): BiText {
      return {
        zh: `\n这是一道【编程题】。受访者正在使用代码编辑器编写代码。
请根据受访者最新的发言内容判断属于以下哪种情况，并严格按对应方式回复：
1. 受访者在向你提问或跟你对话（如问你问题、打招呼、确认你是否在听、讨论解题思路等）→ 正常回应。**绝对不加 ${nextToken}**
2. 受访者说"写完了"/"做好了"/"完成了"等表示完成编码 → 请他们解释解题思路、时间/空间复杂度以及可能的优化方案。**绝对不加 ${nextToken}**（你需要等他们解释完）
3. 受访者在自言自语、念代码、或只是发出思考的声音（如"嗯..."、"让我想想"） → 只用非常简短的回复（如"好的，继续"）。**绝对不加 ${nextToken}**
4. 受访者明确说不会做/要放弃/要跳过/要结束（如"不会"、"跳过"、"下一题"、"结束吧"） → 简短鼓励后加上 ${nextToken}
5. 你之前已经问过解题思路，对方也已经解释完毕，讨论自然结束 → 简短感谢后加上 ${nextToken}
6. 受访者明确要求回到上一个问题（如"上一题"、"回到上一个问题"、"我想回去改一下"） → 简短确认后加上 ${prevToken}
注意：只有第4和第5种情况才能加 ${nextToken}，只有第6种情况才能加 ${prevToken}，其他情况绝对不能加。`,
        en: `\nThis is a CODING question. The participant is using a code editor to write their solution.
Determine which category the participant's latest utterance falls into and respond accordingly:
1. They are talking TO YOU (asking a question, greeting you, discussing their approach, etc.) → Respond naturally. **NEVER add ${nextToken}**
2. They indicate they are DONE coding (e.g. "I'm done", "finished") → Ask about their approach, time/space complexity, and improvements. **NEVER add ${nextToken}** (wait for them to explain first)
3. They are talking to THEMSELVES (thinking aloud, reading code, "hmm" sounds) → Brief encouragement only. **NEVER add ${nextToken}**
4. They explicitly want to SKIP or QUIT (e.g. "I can't do this", "skip", "next question", "let's move on") → Brief encouragement, then add ${nextToken}
5. You already asked about their approach AND they finished explaining AND the discussion has naturally concluded → Brief acknowledgement, then add ${nextToken}
6. They explicitly ask to GO BACK to the previous question (e.g. "previous question", "go back", "I want to revisit the last one") → Briefly acknowledge, then add ${prevToken}
Note: ONLY categories 4 and 5 may include ${nextToken}. ONLY category 6 may include ${prevToken}. All others must NEVER include either token.`,
      };
    },
    whiteboard(nextToken: string, prevToken: string): BiText {
      return {
        zh: `\n这是一道【白板题】。受访者正在使用白板来画出他们的答案。
请根据受访者最新的发言内容判断属于以下哪种情况，并严格按对应方式回复：
1. 受访者在向你提问或跟你对话（如问你问题、打招呼、确认你是否在听、讨论解题思路等）→ 正常回应。**绝对不加 ${nextToken}**
2. 受访者说"画完了"/"做好了"/"完成了"等表示完成绘制 → 请他们解释所画的内容以及背后的思路。**绝对不加 ${nextToken}**（你需要等他们解释完）
3. 受访者在自言自语或只是发出思考的声音（如"嗯..."、"让我想想"） → 只用非常简短的回复（如"好的，继续"）。**绝对不加 ${nextToken}**
4. 受访者明确说不会做/要放弃/要跳过/要结束（如"不会"、"跳过"、"下一题"、"结束吧"） → 简短鼓励后加上 ${nextToken}
5. 你之前已经问过思路，对方也已经解释完毕，讨论自然结束 → 简短感谢后加上 ${nextToken}
6. 受访者明确要求回到上一个问题（如"上一题"、"回到上一个问题"、"我想回去改一下"） → 简短确认后加上 ${prevToken}
注意：只有第4和第5种情况才能加 ${nextToken}，只有第6种情况才能加 ${prevToken}，其他情况绝对不能加。`,
        en: `\nThis is a WHITEBOARD question. The participant is using the whiteboard to draw their answer.
Determine which category the participant's latest utterance falls into and respond accordingly:
1. They are talking TO YOU (asking a question, greeting you, discussing their approach, etc.) → Respond naturally. **NEVER add ${nextToken}**
2. They indicate they are DONE drawing (e.g. "I'm done", "finished") → Ask them to explain what they drew and the reasoning. **NEVER add ${nextToken}** (wait for them to explain first)
3. They are talking to THEMSELVES (thinking aloud, "hmm" sounds) → Brief encouragement only. **NEVER add ${nextToken}**
4. They explicitly want to SKIP or QUIT (e.g. "I can't do this", "skip", "next question", "let's move on") → Brief encouragement, then add ${nextToken}
5. You already asked about their drawing AND they finished explaining AND the discussion has naturally concluded → Brief acknowledgement, then add ${nextToken}
6. They explicitly ask to GO BACK to the previous question (e.g. "previous question", "go back", "I want to revisit the last one") → Briefly acknowledge, then add ${prevToken}
Note: ONLY categories 4 and 5 may include ${nextToken}. ONLY category 6 may include ${prevToken}. All others must NEVER include either token.`,
      };
    },
    research(nextToken: string, prevToken: string): BiText {
      return {
        zh: `\n这是一道【研究型问题】。你的目标是尽可能多地提取关于这个话题的详细信息。
- 深入探索每个角度：询问具体细节、实例、时间线、原因、影响、替代方案和意义
- 当受访者给出表面回答时，追问"为什么"、"具体怎样"、"能详细说说吗"
- 探索受访者提到的相关话题和联系
- 不要轻易结束——继续探索直到话题真正被充分讨论
- 只有在你确信已经从各个角度充分探讨了话题之后，才在回复末尾加上 ${nextToken}
- 如果受访者明确说要跳过或没什么可补充的，简短感谢后加上 ${nextToken}
- 如果受访者明确要求回到上一个问题，简短确认后加上 ${prevToken}`,
        en: `\nThis is a RESEARCH question. Your goal is to extract as much detailed information as possible about this topic.
- Probe deeply into every angle: ask about specifics, examples, timelines, causes, effects, alternatives, and implications
- When the participant gives a surface-level answer, dig deeper with "why", "how specifically", "can you elaborate"
- Explore adjacent topics and connections the participant mentions
- Do NOT move on too quickly — keep probing until the topic is truly exhausted
- Only append ${nextToken} at the end of your response when you are confident the topic has been thoroughly explored from all angles
- If the participant explicitly wants to skip or has nothing more to add, briefly acknowledge and append ${nextToken}
- If the participant explicitly asks to go back to the previous question, briefly acknowledge and append ${prevToken}`,
      };
    },
  },

  followUp: {
    codingWb(nextToken: string): BiText {
      return {
        zh: `关于 ${nextToken} 的使用，严格参照上面的5种情况分类。
重要提醒：当你在请受访者解释思路/做法时（即上面的第2种情况），绝对不能加 ${nextToken}，因为你还需要听他们的解释。`,
        en: `For ${nextToken} usage, strictly follow the 5 categories above.
Important: when you are asking the participant to explain their approach (category 2), you MUST NOT add ${nextToken} because you still need to hear their explanation.`,
      };
    },
    pastLimit(nextToken: string, ctx: FollowUpBudgetContext): BiText {
      if (ctx.isLastQuestion) {
        return {
          zh: `这是整场访谈的最后一道题，本题也讨论很多轮了。请自然收尾本题（简短总结或接住对方最后一点），然后在回复末尾加上 ${nextToken}，以便进入访谈结束流程。`,
          en: `This is the LAST question and it has been discussed thoroughly. Close this topic naturally (brief acknowledgement or summary), then append ${nextToken} at the end to proceed toward wrapping up the interview.`,
        };
      }
      return {
        zh: `你已在本题上追问了非常多轮。请**只结束当前这道题**：简短接住对方的最后一点，然后在回复末尾加上 ${nextToken} 以进入**下一道题**。整场访谈**尚未结束**。禁止使用整场结束用语，例如「感谢你今天的时间」「今天就先到这里」「我们的访谈到此结束」等。如果对方刚才在直接问你问题，先用一两句话正面回答，再过渡。`,
        en: `You have hit the maximum follow-up depth on THIS question only. Close **this topic** briefly, then append ${nextToken} at the end to move to the **next question**. The interview is **NOT over** — more questions remain. Do NOT use whole-session closings such as "thank you for your time today", "great speaking with you today", "that concludes our interview", or similar. If the participant just asked you a direct question, answer it in one or two short sentences first, then transition.`,
      };
    },
    atLimit(nextToken: string, ctx: FollowUpBudgetContext): BiText {
      if (ctx.isLastQuestion) {
        return {
          zh: `这是最后一题。你已经对这道题追问了足够多次。除非对方核心观点仍不清楚，否则简短感谢并在末尾加上 ${nextToken}。若确实还需要一次追问来澄清要点，可以不加 ${nextToken}。`,
          en: `This is the last question. You've had enough follow-ups unless the participant's core point is still unclear — briefly acknowledge and append ${nextToken}. Only skip ${nextToken} if you truly need one more exchange to clarify the key point.`,
        };
      }
      return {
        zh: `你对本题的追问次数快达到上限。除非对方核心观点仍不清楚，否则应简短接住并加上 ${nextToken} **只进入下一题**。不要说整场访谈结束类的话——后面还有题目。若还需一次追问澄清要点，可不加 ${nextToken}。若对方在问你问题，先简短回答。`,
        en: `You are at the follow-up limit for THIS question. Unless the participant's core point is still unclear, briefly acknowledge and append ${nextToken} to advance to the **next question only**. Do NOT imply the entire interview is ending — more questions follow. Skip ${nextToken} only if you truly need one more short exchange to clarify. If they asked you a question, answer briefly first.`,
      };
    },
    oneLeft(nextToken: string): BiText {
      return {
        zh: `你最多还能追问1次。只有在对方确实是在回答当前问题时才应用这个追问预算；如果他们是在和你交流或问你问题，先自然回应。如果回答已经充分和清晰，简短感谢并在末尾加上 ${nextToken}。否则可以追问一个相关细节。`,
        en: `You have at most 1 follow-up left. Apply this follow-up budget only when the participant is actually answering the current question; if they are talking to you or asking a question, respond naturally first. If the answer is already sufficient, briefly acknowledge and append ${nextToken}. Otherwise ask one focused follow-up.`,
      };
    },
    remaining(turnsLeft: number, nextToken: string): BiText {
      return {
        zh: `你还可以追问最多${turnsLeft}次。只有在对方确实是在回答当前问题时才应用这个追问预算；如果他们是在和你交流或问你问题，先自然回应。根据回答内容决定是否需要追问。如果回答已经充分完整，可以简短感谢并在末尾加上 ${nextToken}。`,
        en: `You have up to ${turnsLeft} follow-ups remaining. Apply this follow-up budget only when the participant is actually answering the current question; if they are talking to you or asking a question, respond naturally first. Decide based on the answer content whether to probe further. If the answer is already thorough, acknowledge and append ${nextToken}.`,
      };
    },
  },

  response: {
    codingWb(p: ResponsePromptParams): BiText {
      const descZh = p.qDescription ? `\n问题补充说明：${p.qDescription}` : "";
      const descEn = p.qDescription ? `\nAdditional context: ${p.qDescription}` : "";
      const memZh = p.previousContext ? `\n之前的讨论（仅供参考，不要重复这些话题）：\n${p.previousContext}\n` : "";
      const memEn = p.previousContext ? `\nPrevious discussion (for context only — do NOT re-ask these topics):\n${p.previousContext}\n` : "";
      const recentZh = p.recentInterviewerResponses?.length
        ? `\n最近你已经说过或问过（不要复述或重问）：\n${p.recentInterviewerResponses.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n如果受访者指出你重复提问，先承认他们已经回答过，然后基于已有回答换一个新的、更具体的角度；如果没有必要继续追问，就简短总结并进入下一题。\n`
        : "";
      const recentEn = p.recentInterviewerResponses?.length
        ? `\nRecent things you already said or asked (do NOT repeat or re-ask):\n${p.recentInterviewerResponses.map((r, i) => `${i + 1}. ${r}`).join("\n")}\nIf the participant points out that you repeated yourself, acknowledge that they already answered, then use a new, more specific angle based on their existing answer; if no useful follow-up remains, briefly summarize and move on.\n`
        : "";
      const latestExchangeZh = p.latestInterviewerPrompt && p.latestParticipantAnswer
        ? `\n最近一轮已完成：\n你刚刚问过：${p.latestInterviewerPrompt}\n受访者最新发言：${p.latestParticipantAnswer}\n先判断受访者的发言是在正面回答你的问题，还是在进行元沟通（如确认能否听到、打招呼、问你问题等）。如果是元沟通，先回应它，然后继续之前的讨论方向。如果是正面回答，不要再重问同一个问题。如果已经正面回答了你刚才的问题，默认应简短确认并进入下一题。只有当关键信息仍明显缺失时，才追问新的具体细节。\n`
        : "";
      const latestExchangeEn = p.latestInterviewerPrompt && p.latestParticipantAnswer
        ? `\nLatest exchange:\nYou just asked: ${p.latestInterviewerPrompt}\nThe participant's latest utterance: ${p.latestParticipantAnswer}\nFirst determine if the participant's utterance is a substantive answer to your question, or a meta/interaction comment (e.g. checking if you can hear them, greeting, asking you a question). If it's a meta-comment, respond to it and then continue from the discussion topic you were on. If it's a substantive answer, do not re-ask the same question. If the answer directly addressed your question, default to briefly acknowledging and moving to the next question. Ask one new specific detail only when a key requirement is still clearly missing.\n`
        : "";
      const codeZh = p.codeContent ? `\n受访者当前的代码（${p.codeLanguage || "plaintext"}）：\n\`\`\`\n${p.codeContent}\n\`\`\`\n` : "";
      const codeEn = p.codeContent ? `\nParticipant's current code (${p.codeLanguage || "plaintext"}):\n\`\`\`\n${p.codeContent}\n\`\`\`\n` : "";
      const wbZh = p.whiteboardDescription ? `\n受访者当前的白板内容：${p.whiteboardDescription}\n` : "";
      const wbEn = p.whiteboardDescription ? `\nParticipant's current whiteboard: ${p.whiteboardDescription}\n` : "";

      // Visibility guidance: tell the agent what it can/cannot see
      let visibilityZh = "";
      let visibilityEn = "";
      if (p.qType === "CODING") {
        visibilityZh = p.codeContent
          ? `\n你可以看到受访者的代码（上方已展示）。如果他们问你能否看到，回答"可以"并引用他们代码中的具体内容。\n`
          : `\n你目前无法看到受访者的代码编辑器。如果他们问你能否看到他们的代码，告诉他们你还没收到代码内容，请他们口头描述一下。\n`;
        visibilityEn = p.codeContent
          ? `\nYou CAN see the participant's code (shown above). If they ask whether you can see it, say YES and reference specific parts of their code.\n`
          : `\nYou currently CANNOT see the participant's code editor. If they ask, tell them you haven't received the code yet and ask them to describe it verbally.\n`;
      } else if (p.whiteboardDescription) {
        visibilityZh = `\n你可以看到受访者的白板内容（上方已描述）。如果他们问你能否看到，回答"可以"并引用你看到的内容。\n`;
        visibilityEn = `\nYou CAN see the participant's whiteboard (described above). If they ask whether you can see it, say YES and reference what you see.\n`;
      } else if (p.whiteboardLoading) {
        visibilityZh = `\n你正在加载受访者的白板图像。如果他们问你能否看到，回复类似"让我看看你的白板"或"我正在查看你画的内容，请稍等"。不要说你看不到。\n`;
        visibilityEn = `\nYou are currently loading the participant's whiteboard image. If they ask whether you can see it, respond with something like "Let me take a look at your whiteboard" or "I'm checking what you've drawn, one moment." Do NOT say you cannot see it.\n`;
      } else {
        visibilityZh = `\n你目前无法直接看到受访者的白板。如果他们问你能否看到他们画的内容，告诉他们你暂时还没收到白板的图像，请他们口头描述一下画了什么。\n`;
        visibilityEn = `\nYou currently CANNOT directly see the participant's whiteboard. If they ask, tell them you haven't received the image yet and ask them to describe what they drew.\n`;
      }

      const guardZh = (p.correctionGuard || "") + (p.antiRepetition || "");
      const guardEn = (p.correctionGuard || "") + (p.antiRepetition || "");
      const langInstr = p.forceLanguage
        ? `\n**语言要求：你必须用${p.forceLanguage === "en" ? "英文" : "中文"}回复，无论问题是什么语言。** / **Language: You MUST respond in ${p.forceLanguage === "en" ? "English" : "Chinese"}, regardless of the question language.**\n`
        : "";
      return {
        zh: `你是面试官"${p.aiName}"，正在进行一场关于"${p.title}"的访谈。
${memZh}${recentZh}${latestExchangeZh}${langInstr}
当前问题（第${p.qNum}/${p.totalQs}个）：「${p.qText}」${descZh}${p.choiceInstruction}
${codeZh}${wbZh}${visibilityZh}
对话记录：
${p.history}
${guardZh}
请根据受访者最新的发言，生成一个回应。
**首先判断受访者是否在跟你说话（问问题、打招呼、请求帮助、确认你是否在听等）。如果是，你必须直接回答他们的问题或请求，不能忽视。**
直接输出你要说的话，不要加任何前缀、标签、引号或解释。

${p.followUpInstruction}

导航控制：
- 如果受访者明确要求跳过、放弃、结束当前问题、或表示完全不会做（如"跳过"、"下一题"、"不会"、"放弃"等），在回复末尾加上 ${p.nextToken}
- 如果受访者明确要求回到上一个问题（如"上一题"、"回到上一个"等），在回复末尾加上 ${p.prevToken}
- 注意：只有受访者明确表达了导航意图时才加这些标记。受访者说"我不知道怎么做，能给点提示吗"不是放弃，是在请求帮助

规则：
- **最重要规则**：受访者在跟你说话时（问问题、请求帮助、打招呼），你必须正常回答，不能只说"好的，继续"或重复之前说过的话
- 受访者的发言是问句或在跟你对话时，像正常面试官一样交流
- 只有受访者在自言自语或只是发出简单语气词时，才用简短回复
- 如果你的回复包含问号"？"或任何提问，绝对不能加 ${p.nextToken}
- 如果你的回复是在邀请对方继续补充（例如"你可以继续分享"、"我很想听更多"、"如果你愿意也可以补充"），即使没有问号，也绝对不能加 ${p.nextToken}
- ${p.nextToken} 只能出现在不含任何问题的简短句末尾
- 只能围绕「${p.qText}」这个问题
- 禁止编造不相关的问题或话题
- 如果受访者之前已经讨论过的内容与当前问题相关，可以引用但不要重复追问；如果他们已经回答了你的问题，不要换个措辞再问同一个问题
- 不要重复你之前已经说过的话，每次回复都要有新的内容`,
        en: `You are interviewer "${p.aiName}" conducting an interview about "${p.title}".
${memEn}${recentEn}${latestExchangeEn}${langInstr}
Current question (${p.qNum}/${p.totalQs}): "${p.qText}"${descEn}${p.choiceInstruction}
${codeEn}${wbEn}${visibilityEn}
Conversation so far:
${p.history}
${guardEn}
Generate a response to the participant's latest utterance.
**First, determine if the participant is talking TO YOU (asking a question, requesting help, greeting, confirming you're listening). If so, you MUST directly answer their question or request — do NOT ignore it.**
Output ONLY what you would say — no prefixes, labels, quotes, or explanations.

${p.followUpInstruction}

Navigation control:
- If the participant explicitly asks to skip, give up, or move to the next question (e.g. "skip", "next question", "I give up"), append ${p.nextToken} at the end of your response
- If the participant explicitly asks to go back to the previous question (e.g. "previous question", "go back"), append ${p.prevToken} at the end of your response
- ONLY add these tokens when the participant clearly expresses navigation intent. "I don't know how to do this, can you give me a hint?" is NOT giving up — it's asking for help

Rules:
- **MOST IMPORTANT RULE**: When the participant is talking to you (asking questions, requesting help, greeting), you MUST respond to what they said — do NOT just say "OK, continue" or repeat something you already said
- When the participant is talking to you or asking questions, respond as a normal interviewer would
- Only use brief encouragement when the participant is clearly talking to themselves or making filler sounds
- If your reply contains a question mark "?" or any question, you MUST NOT include ${p.nextToken}
- If your reply invites the participant to continue or share more (for example "feel free to continue", "I'd love to hear more", or "I would appreciate hearing about that"), you MUST NOT include ${p.nextToken} even if there is no question mark
- ${p.nextToken} may ONLY appear at the end of a short statement with NO questions
- Only discuss the question "${p.qText}"
- Never invent unrelated questions or topics
- If something the participant discussed earlier is relevant to the current question, you may reference it but do NOT re-ask about it; if they already answered your question, do not ask the same question with different wording
- Do NOT repeat what you already said — each response must contain new content`,
      };
    },

    normal(p: ResponsePromptParams): BiText {
      const descZh = p.qDescription ? `\n问题补充说明：${p.qDescription}` : "";
      const descEn = p.qDescription ? `\nAdditional context: ${p.qDescription}` : "";
      const memZh = p.previousContext ? `\n之前的讨论（仅供参考，不要重复这些话题）：\n${p.previousContext}\n` : "";
      const memEn = p.previousContext ? `\nPrevious discussion (for context only — do NOT re-ask these topics):\n${p.previousContext}\n` : "";
      const recentZh = p.recentInterviewerResponses?.length
        ? `\n最近你已经说过或问过（不要复述或重问）：\n${p.recentInterviewerResponses.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n如果受访者指出你重复提问，先承认他们已经回答过，然后基于已有回答换一个新的、更具体的角度；如果没有必要继续追问，就简短总结并进入下一题。\n`
        : "";
      const recentEn = p.recentInterviewerResponses?.length
        ? `\nRecent things you already said or asked (do NOT repeat or re-ask):\n${p.recentInterviewerResponses.map((r, i) => `${i + 1}. ${r}`).join("\n")}\nIf the participant points out that you repeated yourself, acknowledge that they already answered, then use a new, more specific angle based on their existing answer; if no useful follow-up remains, briefly summarize and move on.\n`
        : "";
      const latestExchangeZh = p.latestInterviewerPrompt && p.latestParticipantAnswer
        ? `\n最近一轮已完成：\n你刚刚问过：${p.latestInterviewerPrompt}\n受访者最新发言：${p.latestParticipantAnswer}\n先判断受访者的发言是在正面回答你的问题，还是在进行元沟通（如确认能否听到、打招呼、问你问题等）。如果是元沟通，先回应它，然后继续之前的讨论方向。如果是正面回答，不要再重问同一个问题。如果已经正面回答了你刚才的问题，默认应简短确认并进入下一题。只有当关键信息仍明显缺失时，才追问新的具体细节。\n`
        : "";
      const latestExchangeEn = p.latestInterviewerPrompt && p.latestParticipantAnswer
        ? `\nLatest exchange:\nYou just asked: ${p.latestInterviewerPrompt}\nThe participant's latest utterance: ${p.latestParticipantAnswer}\nFirst determine if the participant's utterance is a substantive answer to your question, or a meta/interaction comment (e.g. checking if you can hear them, greeting, asking you a question). If it's a meta-comment, respond to it and then continue from the discussion topic you were on. If it's a substantive answer, do not re-ask the same question. If the answer directly addressed your question, default to briefly acknowledging and moving to the next question. Ask one new specific detail only when a key requirement is still clearly missing.\n`
        : "";
      const noRequestionZh = p.userTurns > 0
        ? `\n**禁止重述原题**：受访者已经回答过原题「${p.qText}」。绝对不要在回复中重新朗读、复述或重新提出原题。如果需要把对方引回当前讨论，请引用你们最近讨论的具体方面，而不是从头开始。\n`
        : "";
      const noRequestionEn = p.userTurns > 0
        ? `\n**NEVER re-state the original question**: The participant has already answered the original question "${p.qText}". Do NOT re-read, re-state, or re-ask the original question text in your response. If you need to redirect the conversation, reference the specific aspect you were most recently discussing, not the original question.\n`
        : "";
      const guardZh = (p.correctionGuard || "") + (p.antiRepetition || "");
      const guardEn = (p.correctionGuard || "") + (p.antiRepetition || "");
      const langInstr = p.forceLanguage
        ? `\n**语言要求：你必须用${p.forceLanguage === "en" ? "英文" : "中文"}回复，无论问题是什么语言。** / **Language: You MUST respond in ${p.forceLanguage === "en" ? "English" : "Chinese"}, regardless of the question language.**\n`
        : "";
      return {
        zh: `你是面试官"${p.aiName}"，正在进行一场关于"${p.title}"的访谈。
${memZh}${recentZh}${latestExchangeZh}${noRequestionZh}${langInstr}
当前问题（第${p.qNum}/${p.totalQs}个）：「${p.qText}」${descZh}${p.choiceInstruction}
对方已发言${p.userTurns}轮。

对话记录：
${p.history}
${guardZh}
请根据受访者最新的发言，生成一个简短的回应（1-3句话）。
在决定是否追问之前，先判断这次发言的真实意图：
- 如果对方是在和你交流、问你问题、确认互动状态、打招呼、请求澄清或寻求帮助，请先自然回应这次发言（如"你好，我能听到你"），然后继续你们之前正在讨论的话题方向；不要把它当成当前面试题的简短回答，也不要因此追问"请展开"之类的问题，更不要从头开始重问原题。
- 如果对方是在回答当前问题，请围绕当前问题判断是否需要追问、总结或进入下一题。
- 如果对方只是在思考、自言自语或表达卡住了，请短暂接住，并给他们继续回答的空间。
直接输出你要说的话，不要加任何前缀、标签、引号或解释。

${p.followUpInstruction}

导航控制：
- 如果受访者明确要求跳过或结束当前问题（如"跳过"、"下一题"、"不会"、"放弃"等），简短感谢并在末尾加上 ${p.nextToken}
- 如果受访者明确要求结束整个面试，不要把它当成进入下一题；只需简短回应，不要自行加 ${p.nextToken}
- 如果受访者明确要求回到上一个问题（如"上一题"、"回到上一个"等），在回复末尾加上 ${p.prevToken}

规则：
- 对话型/元沟通型发言不是"回答太短"。必须先回应它本身；只有在回应后需要把对方带回当前题目时，才轻轻提示继续回答。
- 如果对方问的是和当前题目无关但和面试互动相关的问题（如"你能听到我吗"），要简短回答（如"能听到"），然后自然回到你们最近讨论的具体话题方向；除非对方明确要求导航，否则不要加 ${p.nextToken}。
- 如果对方的回答非常简短或明显不想展开（如"就是喜欢"、"没有理由"、"不知道"等），不要继续追问，直接简短感谢并在末尾加上 ${p.nextToken}
- 不要连续追问同一个角度。如果之前已经追问过但对方没有展开，简短感谢并加上 ${p.nextToken}
- 如果你的回复包含问号"？"或任何提问，绝对不能加 ${p.nextToken}
- 如果你的回复是在邀请对方继续补充（例如"你可以继续分享"、"我很想听更多"、"如果你愿意也可以补充"），即使没有问号，也绝对不能加 ${p.nextToken}
- ${p.nextToken} 只能出现在不含任何问题的简短感谢句末尾（如"好的，谢谢你的分享${p.nextToken}"）
- 只能围绕「${p.qText}」这个问题
- 禁止编造不相关的问题或话题
- 如果受访者之前已经讨论过的内容与当前问题相关，可以引用但不要重复追问；如果他们已经回答了你的问题，不要换个措辞再问同一个问题
- 不要重复你之前已经说过的话，每次回复都要有新的内容`,
        en: `You are interviewer "${p.aiName}" conducting an interview about "${p.title}".
${memEn}${recentEn}${latestExchangeEn}${noRequestionEn}${langInstr}
Current question (${p.qNum}/${p.totalQs}): "${p.qText}"${descEn}${p.choiceInstruction}
The participant has spoken ${p.userTurns} time(s) so far.

Conversation so far:
${p.history}
${guardEn}
Generate a brief response (1-3 sentences) to the participant's latest utterance.
Before deciding whether to probe, infer the intent of the latest utterance:
- If the participant is talking to you, asking a question, checking the interaction state, greeting you, asking for clarification, or seeking help, respond naturally to that utterance first (e.g. "Yes, I can hear you"), then continue from the specific discussion topic you were on. Do not treat it as a short answer to the interview question, do not respond with a generic "please elaborate", and do NOT restart from the original question.
- If the participant is answering the current question, evaluate that answer in the context of the current question and decide whether to probe, summarize, or move on.
- If the participant is thinking aloud, speaking to themselves, or expressing that they are stuck, briefly acknowledge that and give them room to continue.
Output ONLY what you would say — no prefixes, labels, quotes, or explanations.

${p.followUpInstruction}

Navigation control:
- If the participant explicitly asks to skip or move to the next question, briefly acknowledge and append ${p.nextToken}
- If the participant explicitly asks to end the interview, do NOT treat that as a next-question transition or improvise ${p.nextToken}
- If the participant explicitly asks to go back to the previous question, append ${p.prevToken}

Rules:
- Conversation/meta utterances are not "too brief answers." Respond to the utterance itself first; only gently bridge back to the current question if that helps the participant continue.
- If they ask about the interview interaction rather than the interview topic (e.g. "Can you hear me?"), answer briefly (e.g. "Yes, I can hear you"), then return to the specific discussion topic you were on most recently. Do not append ${p.nextToken} unless they clearly ask to navigate.
- If the participant's answer is very brief or clearly shows they don't want to elaborate (e.g. "just because", "no reason", "I don't know"), do NOT keep pressing. Just briefly acknowledge and append ${p.nextToken}
- Do NOT repeatedly ask about the same angle. If you already probed and the participant didn't elaborate, briefly acknowledge and append ${p.nextToken}
- If your reply contains a question mark "?" or any question, you MUST NOT include ${p.nextToken}
- If your reply invites the participant to continue or share more (for example "feel free to continue", "I'd love to hear more", or "I would appreciate hearing about that"), you MUST NOT include ${p.nextToken} even if there is no question mark
- ${p.nextToken} may ONLY appear at the end of a short acknowledgement with NO questions (e.g. "Thank you for sharing${p.nextToken}")
- Only discuss the question "${p.qText}"
- Never invent unrelated questions or topics
- If something the participant discussed earlier is relevant to the current question, you may reference it but do NOT re-ask about it; if they already answered your question, do not ask the same question with different wording
- Do NOT repeat what you already said — each response must contain new content`,
      };
    },
  },
};
