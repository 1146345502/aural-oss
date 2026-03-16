const USER_END_PATTERNS = [
  /(?:please|let'?s|I\s+want\s+to|can\s+we)\s+end(?:\s+(?:the\s+)?interview)?/i,
  /(?:end|finish|stop|terminate)\s+(?:the\s+)?interview/i,
  /I'?m\s+done(?:\s+(?:with\s+(?:the\s+)?interview|here))?/i,
  /that'?s\s+(?:all|it|everything)\b/i,
  /(?:结束面试|结束吧|我(?:答|做)完了|就这样吧|面试结束)/,
];

const USER_SKIP_PATTERNS = [
  /(?:let'?s|please|can\s+(?:we|you))\s+(?:move\s+on|skip|proceed|go\s+to\s+(?:the\s+)?next)/i,
  /move\s+on(?:\s+to)?/i,
  /continue\s+to\s+(?:the\s+)?next/i,
  /go\s+(?:on\s+)?to\s+(?:the\s+)?next/i,
  /(?:please|let'?s)\s+end(?:\s+(?:this|here|now))?\.?$/i,
  /skip\s+(?:this|the)\s+(?:question|one|problem)/i,
  /I\s+(?:give\s+up|want\s+to\s+skip|'?d\s+like\s+to\s+skip)/i,
  /next\s+question/i,
  /please\s+(?:move\s+on|skip)/i,
  /(?:跳过|下一(?:个问题|题)|不做了|放弃了?|结束吧|请继续(?:下一|到下))/,
  /(?:我不会|不想做了|不想答了|过吧|换下一)/,
];

const REPLY_INVITES_MORE_PATTERNS_EN = [
  /\b(?:please|feel free to)\s+(?:share|continue|tell|describe|walk|talk|elaborate|expand)\b/i,
  /\b(?:i(?:'d| would)\s+love to hear|i(?:'d| would)\s+appreciate hearing)\b/i,
  /\bwhen you'?re ready\b/i,
  /\bi'?m here (?:to listen|if you(?:'d| would)? like to continue)\b/i,
  /\bif you have\b.*\b(?:i(?:'d| would)\s+appreciate hearing|feel free to share)\b/i,
  /\b(?:could|can|would)\s+you\b/i,
];

const REPLY_INVITES_MORE_PATTERNS_ZH = [
  /(?:请|可以|麻烦).{0,4}(?:分享|继续|补充|说明|展开|讲讲|说说)/,
  /(?:我(?:很)?想听|我(?:很)?希望听|欢迎你).{0,6}(?:分享|继续|补充|展开)/,
  /如果你(?:还有|愿意|方便).{0,8}(?:分享|补充|继续)/,
  /你可以.{0,4}(?:继续|分享|补充|展开)/,
  /准备好了?.{0,4}(?:继续|分享|说)/,
];

export function isUserEndRequest(text: string): boolean {
  return USER_END_PATTERNS.some((pattern) => pattern.test(text));
}

export function isUserSkipRequest(text: string): boolean {
  if (isUserEndRequest(text)) return false;
  return USER_SKIP_PATTERNS.some((pattern) => pattern.test(text));
}

export function responseInvitesUserReply(text: string, isZh: boolean): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  const patterns = isZh ? REPLY_INVITES_MORE_PATTERNS_ZH : REPLY_INVITES_MORE_PATTERNS_EN;
  return patterns.some((pattern) => pattern.test(normalized));
}
