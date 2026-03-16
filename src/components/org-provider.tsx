"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuth } from "@/components/auth-provider";

const STORAGE_KEY = "aural:currentOrgId";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: string;
}

interface OrgContextValue {
  orgs: OrgInfo[];
  currentOrg: OrgInfo | null;
  setCurrentOrg: (orgId: string) => void;
  isLoading: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  currentOrg: null,
  setCurrentOrg: () => {},
  isLoading: true,
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { data: orgs = [], isLoading } = trpc.organization.list.useQuery(
    undefined,
    { staleTime: 30_000, enabled: !!user && !authLoading },
  );

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  const currentOrg = useMemo(() => {
    if (orgs.length === 0) return null;
    const found = orgs.find((o) => o.id === selectedOrgId);
    return found ?? orgs[0];
  }, [orgs, selectedOrgId]);

  useEffect(() => {
    if (currentOrg && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, currentOrg.id);
    }
  }, [currentOrg]);

  const setCurrentOrg = useCallback((orgId: string) => {
    setSelectedOrgId(orgId);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, orgId);
    }
  }, []);

  const value = useMemo<OrgContextValue>(
    () => ({
      orgs: orgs as OrgInfo[],
      currentOrg: currentOrg as OrgInfo | null,
      setCurrentOrg,
      isLoading,
    }),
    [orgs, currentOrg, setCurrentOrg, isLoading],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  return useContext(OrgContext);
}
