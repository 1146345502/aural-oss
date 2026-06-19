import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REAUTH_OTP_LENGTH,
  createEmptyReauthOtp,
} from "../src/lib/auth/reauth-otp";

describe("reauth-otp", () => {
  it("uses a 6-digit Supabase reauthentication nonce", () => {
    assert.equal(REAUTH_OTP_LENGTH, 6);
    assert.deepEqual(createEmptyReauthOtp(), ["", "", "", "", "", ""]);
  });
});
