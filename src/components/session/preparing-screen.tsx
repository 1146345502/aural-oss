import { Loader2 } from "lucide-react";
import { AuralLogo } from "@/components/ui/aural-logo";
import { useTranslations } from "@/locales";

export function PreparingScreen({
  title,
  description,
  language,
}: {
  title?: string;
  description?: string;
  language?: string;
}) {
  const t = useTranslations(language);
  const resolvedTitle = title ?? t.preparingScreen.title;
  const resolvedDescription = description ?? t.preparingScreen.description;
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-card px-6">
        <div className="flex items-center gap-1">
          <AuralLogo size={28} className="shrink-0" />
          <span className="font-heading text-base font-bold tracking-[2px]">AURAL</span>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-lg font-medium">{resolvedTitle}</p>
        <p className="text-sm text-muted-foreground">
          {resolvedDescription}
        </p>
      </div>
    </div>
  );
}
