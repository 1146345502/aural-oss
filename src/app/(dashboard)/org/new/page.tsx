"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewOrgPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const utils = trpc.useUtils();
  const isZh = locale === "zh";

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const createMutation = trpc.organization.create.useMutation({
    onSuccess: () => {
      utils.organization.list.invalidate();
    },
    onError: (err) => {
      toast({
        title: isZh ? "错误" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createMutation.mutateAsync({ name });
      toast({ title: isZh ? "组织已创建" : "Organization created" });
      router.push("/organizations");
    } catch {
      // mutation error already handled by onError
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle>{isZh ? "创建组织" : "Create Organization"}</CardTitle>
          <CardDescription>
            {isZh
              ? "创建一个新组织以与你的团队协作。"
              : "Create a new organization to collaborate with your team."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">
              {isZh ? "组织名称" : "Organization Name"}
            </Label>
            <Input
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isZh ? "例如：Acme Corp" : "e.g. Acme Corp"}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => router.push("/organizations")}
              disabled={loading}
            >
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={loading || !name.trim()}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isZh ? "创建组织" : "Create organization"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
