"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { AuralLogo } from "@/components/ui/aural-logo";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function RegisterForm() {
  const { toast } = useToast();
  const { t } = useAppLocale();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const defaultName = email.split("@")[0].replace(/[._-]+/g, " ");
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: defaultName },
        },
      });

      if (error) {
        toast({
          title: t("auth.registrationFailed"),
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data.user?.identities?.length === 0) {
        toast({
          title: t("auth.accountExists"),
          description: t("auth.accountExistsDescription"),
          variant: "destructive",
        });
        return;
      }

      if (data.session) {
        window.location.href = "/organizations";
        return;
      }

      // Fallback: if no session returned, sign in explicitly
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        toast({
          title: t("auth.registrationFailed"),
          description: signInError.message,
          variant: "destructive",
        });
        return;
      }

      window.location.href = "/organizations";
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <AuralLogo size={64} className="mx-auto mb-2" />
        <CardTitle className="font-heading text-2xl">
          {t("auth.createAccount")}
        </CardTitle>
        <CardDescription>{t("auth.createAccountSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("auth.passwordHint")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button className="w-full" type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("auth.createAccount")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("auth.signIn")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
