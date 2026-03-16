"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useAppLocale();
  const isZh = locale === "zh";

  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <h2 className="text-lg font-semibold">
        {isZh ? "页面出现错误" : "Something went wrong"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {isZh
          ? "加载当前页面时发生了意外错误。"
          : "An unexpected error occurred while loading this page."}
      </p>
      <Button onClick={reset} variant="outline">
        {isZh ? "重试" : "Try again"}
      </Button>
    </div>
  );
}
