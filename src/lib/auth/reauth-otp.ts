/** Supabase `reauthenticate()` emails a 6-digit nonce (`.Token` in the template). */
export const REAUTH_OTP_LENGTH = 6;

export function createEmptyReauthOtp(): string[] {
  return Array.from({ length: REAUTH_OTP_LENGTH }, () => "");
}
