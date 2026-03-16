"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useAuth } from "@/components/auth-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

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

  const [passwordStep, setPasswordStep] = useState<"idle" | "form">("idle");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm">("idle");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const supabase = createClient();

  const resetPasswordState = () => {
    setPasswordStep("idle");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePassword = async () => {
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
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
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

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: t("account.failedToUpdate"),
          description: data.error ?? t("account.somethingWentWrong"),
          variant: "destructive",
        });
      } else {
        supabase.auth.signOut().catch(() => {});
        window.location.href = "/login";
        return;
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
                      onClick={handleChangePassword}
                    >
                      {passwordLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t("account.updatePassword")}
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
                      onClick={handleDeleteAccount}
                    >
                      {deleteLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t("account.deleteAccount")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteLoading}
                      onClick={() => setDeleteStep("idle")}
                    >
                      {t("account.cancel")}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
