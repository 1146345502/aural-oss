"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useAuth } from "@/components/auth-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  REAUTH_OTP_LENGTH,
  createEmptyReauthOtp,
} from "@/lib/auth/reauth-otp";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export default function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { t } = useAppLocale();

  const [displayName, setDisplayName] = useState(profile?.name ?? "");

  useEffect(() => {
    if (profile?.name != null) {
      setDisplayName(profile.name);
    }
  }, [profile?.name]);

  // Password change state
  const [passwordStep, setPasswordStep] = useState<"idle" | "form" | "verify">(
    "idle",
  );
  // Delete account state
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "verify">(
    "idle",
  );
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOtp, setDeleteOtp] = useState(createEmptyReauthOtp);
  const deleteOtpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [deleteResendCooldown, setDeleteResendCooldown] = useState(0);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [otp, setOtp] = useState(createEmptyReauthOtp);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  const supabase = createClient();

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const chars = value.replace(/\D/g, "").slice(0, REAUTH_OTP_LENGTH).split("");
      const next = [...otp];
      chars.forEach((c, i) => {
        if (index + i < REAUTH_OTP_LENGTH) next[index + i] = c;
      });
      setOtp(next);
      otpRefs.current[
        Math.min(index + chars.length, REAUTH_OTP_LENGTH - 1)
      ]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, "");
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < REAUTH_OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const resetPasswordState = () => {
    setPasswordStep("idle");
    setNewPassword("");
    setConfirmPassword("");
    setOtp(createEmptyReauthOtp());
    setResendCooldown(0);
  };

  const sendVerificationCode = async (): Promise<boolean> => {
    const res = await fetch("/api/auth/send-verification", { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      toast({
        title: t("account.failedToSendCode"),
        description: data.error ?? t("account.somethingWentWrong"),
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSendCode = async () => {
    if (newPassword.length < 8) {
      toast({
        title: t("auth.passwordTooShort"),
        description: t("auth.passwordTooShortDescription"),
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t("auth.passwordMismatch"), variant: "destructive" });
      return;
    }

    setPasswordLoading(true);
    try {
      const ok = await sendVerificationCode();
      if (ok) {
        setPasswordStep("verify");
        startCooldown();
        toast({
          title: t("account.verificationSent"),
          description: t("account.verificationSentDescription", {
            email: user?.email ?? "",
          }),
        });
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleVerifyAndUpdate = async () => {
    const nonce = otp.join("");
    if (nonce.length !== REAUTH_OTP_LENGTH) return;

    setPasswordLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: t("account.failedToUpdatePassword"),
          description: data.error ?? t("account.somethingWentWrong"),
          variant: "destructive",
        });
      } else {
        toast({ title: t("account.passwordUpdated") });
        resetPasswordState();
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleResend = async () => {
    setPasswordLoading(true);
    try {
      const ok = await sendVerificationCode();
      if (ok) {
        startCooldown();
        toast({
          title: t("account.codeResent"),
          description: t("account.codeResentDescription", {
            email: user?.email ?? "",
          }),
        });
        setOtp(createEmptyReauthOtp());
        otpRefs.current[0]?.focus();
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // Delete account cooldown timer
  useEffect(() => {
    if (deleteResendCooldown <= 0) return;
    const timer = setTimeout(() => setDeleteResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [deleteResendCooldown]);

  const handleDeleteOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const chars = value.replace(/\D/g, "").slice(0, REAUTH_OTP_LENGTH).split("");
      const next = [...deleteOtp];
      chars.forEach((c, i) => {
        if (index + i < REAUTH_OTP_LENGTH) next[index + i] = c;
      });
      setDeleteOtp(next);
      deleteOtpRefs.current[
        Math.min(index + chars.length, REAUTH_OTP_LENGTH - 1)
      ]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, "");
    const next = [...deleteOtp];
    next[index] = digit;
    setDeleteOtp(next);
    if (digit && index < REAUTH_OTP_LENGTH - 1) {
      deleteOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleDeleteOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !deleteOtp[index] && index > 0) {
      deleteOtpRefs.current[index - 1]?.focus();
    }
  };

  const resetDeleteState = () => {
    setDeleteStep("idle");
    setDeleteOtp(createEmptyReauthOtp());
    setDeleteResendCooldown(0);
  };

  const handleDeleteSendCode = async () => {
    setDeleteLoading(true);
    try {
      const ok = await sendVerificationCode();
      if (ok) {
        setDeleteStep("verify");
        setDeleteResendCooldown(60);
        toast({
          title: t("account.verificationSent"),
          description: t("account.verificationSentDescription", {
            email: user?.email ?? "",
          }),
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    const nonce = deleteOtp.join("");
    if (nonce.length !== REAUTH_OTP_LENGTH) return;

    setDeleteLoading(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: t("account.failedToUpdate"),
          description: data.error ?? t("account.somethingWentWrong"),
          variant: "destructive",
        });
      } else {
        // Account already deleted server-side; signOut may fail so don't await
        supabase.auth.signOut().catch(() => {});
        window.location.href = "/login";
        return;
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteResend = async () => {
    setDeleteLoading(true);
    try {
      const ok = await sendVerificationCode();
      if (ok) {
        setDeleteResendCooldown(60);
        toast({
          title: "Code resent",
          description: `A new code was sent to ${user?.email}`,
        });
        setDeleteOtp(createEmptyReauthOtp());
        deleteOtpRefs.current[0]?.focus();
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || !user) return;

    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, email: user.email!, name: trimmed },
          { onConflict: "id" },
        );

      if (error) {
        toast({
          title: t("account.failedToUpdate"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        await refreshProfile();
        toast({ title: t("account.displayNameUpdated") });
      }
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("account.title")}</h1>
        <p className="text-muted-foreground">{t("account.subtitle")}</p>
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">{t("common.language")}</h2>
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              {t("common.language")}
            </p>
            <LanguageSwitcher />
          </CardContent>
        </Card>
      </section>

      <div className="space-y-8">
        {/* Email */}
        <section>
          <h2 className="text-base font-semibold mb-2">{t("account.email")}</h2>
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-sm">
                {t("account.emailValue", { email: user?.email ?? "—" })}
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Display Name */}
        <section>
          <h2 className="text-base font-semibold mb-2">
            {t("account.displayName")}
          </h2>
          <Card>
            <CardContent className="py-3 px-4 space-y-3">
              <p className="text-sm">
                {t("account.displayNameCurrent", {
                  name: profile?.name ?? "—",
                })}
              </p>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("account.displayNamePlaceholder")}
                className="w-full"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveName}
                disabled={savingName}
              >
                {savingName ? t("account.saving") : t("account.save")}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Password */}
        <section>
          <h2 className="text-base font-semibold mb-2">
            {t("account.password")}
          </h2>
          <Card>
            <CardContent className="py-3 px-4 space-y-3">
              {passwordStep === "idle" && (
                <>
                  <p className="text-sm">{t("account.passwordDescription")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPasswordStep("form")}
                  >
                    {t("account.changePassword")}
                  </Button>
                </>
              )}

              {passwordStep === "form" && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("auth.newPassword")}
                    </label>
                    <Input
                      type="password"
                      placeholder={t("auth.passwordHint")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("account.confirmPassword")}
                    </label>
                    <Input
                      type="password"
                      placeholder={t("auth.repeatPassword")}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={passwordLoading}
                      onClick={handleSendCode}
                    >
                      {passwordLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t("common.continue")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={passwordLoading}
                      onClick={resetPasswordState}
                    >
                      {t("account.cancel")}
                    </Button>
                  </div>
                </>
              )}

              {passwordStep === "verify" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t("account.verifyCodeDescription", {
                      email: user?.email ?? "",
                    })}
                  </p>
                  <div className="flex justify-center gap-1.5">
                    {otp.map((digit, i) => (
                      <Input
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={REAUTH_OTP_LENGTH}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        className="h-11 w-10 text-center text-lg font-semibold"
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={
                        passwordLoading ||
                        otp.join("").length !== REAUTH_OTP_LENGTH
                      }
                      onClick={handleVerifyAndUpdate}
                    >
                      {passwordLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t("account.verifyAndUpdate")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={passwordLoading}
                      onClick={resetPasswordState}
                    >
                      {t("account.cancel")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {t("auth.didntReceiveCode")}{" "}
                    {resendCooldown > 0 ? (
                      <span>
                        {t("auth.resendIn", { seconds: resendCooldown })}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={passwordLoading}
                        className="text-primary hover:underline font-medium"
                      >
                        {t("auth.resend")}
                      </button>
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Danger Zone */}
        <section>
          <h2 className="text-base font-semibold mb-2 text-destructive">
            {t("account.deleteStep")}
          </h2>
          <Card className="border-destructive/40">
            <CardContent className="py-3 px-4 space-y-3">
              {deleteStep === "idle" && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {t("account.deleteStep")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("account.deleteDescription")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="shrink-0"
                    onClick={() => setDeleteStep("confirm")}
                  >
                    {t("account.deleteAccount")}
                  </Button>
                </div>
              )}

              {deleteStep === "confirm" && (
                <>
                  <div className="rounded-md bg-destructive/10 p-3">
                    <p className="text-sm font-medium text-destructive">
                      {t("account.deleteConfirmTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("account.deleteConfirmBody")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleteLoading}
                      onClick={handleDeleteSendCode}
                    >
                      {deleteLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t("account.deleteSendCode")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteLoading}
                      onClick={resetDeleteState}
                    >
                      {t("account.cancel")}
                    </Button>
                  </div>
                </>
              )}

              {deleteStep === "verify" && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t("account.deleteVerifyDescription", {
                      email: user?.email ?? "",
                    })}
                  </p>
                  <div className="flex justify-center gap-1.5">
                    {deleteOtp.map((digit, i) => (
                      <Input
                        key={i}
                        ref={(el) => {
                          deleteOtpRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={REAUTH_OTP_LENGTH}
                        value={digit}
                        onChange={(e) =>
                          handleDeleteOtpChange(i, e.target.value)
                        }
                        onKeyDown={(e) => handleDeleteOtpKeyDown(i, e)}
                        className="h-11 w-10 text-center text-lg font-semibold"
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={
                        deleteLoading ||
                        deleteOtp.join("").length !== REAUTH_OTP_LENGTH
                      }
                      onClick={handleDeleteConfirm}
                    >
                      {deleteLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t("account.verifyAndDelete")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteLoading}
                      onClick={resetDeleteState}
                    >
                      {t("account.cancel")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {t("auth.didntReceiveCode")}{" "}
                    {deleteResendCooldown > 0 ? (
                      <span>
                        {t("auth.resendIn", { seconds: deleteResendCooldown })}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleDeleteResend}
                        disabled={deleteLoading}
                        className="text-primary hover:underline font-medium"
                      >
                        {t("auth.resend")}
                      </button>
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
