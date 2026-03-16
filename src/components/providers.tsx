"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc/client";
import { AuthProvider } from "@/components/auth-provider";
import { AppLocaleProvider } from "@/components/app-locale-provider";
import { OrgProvider } from "@/components/org-provider";
import { ProjectProvider } from "@/components/project-provider";
import { ThemeProvider } from "next-themes";
import superjson from "superjson";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppLocaleProvider>
            <OrgProvider>
              <ProjectProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="system"
                  enableSystem
                >
                  {children}
                </ThemeProvider>
              </ProjectProvider>
            </OrgProvider>
          </AppLocaleProvider>
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
