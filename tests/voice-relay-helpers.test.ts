import assert from "node:assert/strict";
import test from "node:test";

import {
  isUserEndRequest,
  isUserSkipRequest,
  responseInvitesUserReply,
} from "../server/voice-relay-helpers";

test("explicit interview end requests are not treated as skip-to-next requests", () => {
  const text = "No, I cannot. So we end the interview now.";

  assert.equal(isUserEndRequest(text), true);
  assert.equal(isUserSkipRequest(text), false);
});

test("explicit next-question requests still count as skip intent", () => {
  assert.equal(isUserSkipRequest("Let's move on to the next question."), true);
  assert.equal(isUserEndRequest("Let's move on to the next question."), false);
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

test("short wrap-up acknowledgements do not look like reply invitations", () => {
  assert.equal(
    responseInvitesUserReply("Thank you for sharing. Let's move on to the next question.", false),
    false,
  );
});
