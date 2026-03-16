"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function OrgSettingsGeneralPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const { currentOrg } = useOrg();
  const utils = trpc.useUtils();
  const isZh = locale === "zh";

  const [name, setName] = useState(currentOrg?.name ?? "");

  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "组织已更新" : "Organization updated" });
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

  const deleteMutation = trpc.organization.delete.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "组织已删除" : "Organization deleted" });
      utils.organization.list.invalidate();
      router.push("/organizations");
    },
    onError: (err) => {
      toast({
        title: isZh ? "错误" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {isZh ? "尚未选择组织" : "No organization selected"}
      </div>
    );
  }

  const isOwner = currentOrg.role === "OWNER";
  const isAdmin = isOwner || currentOrg.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{isZh ? "通用" : "General"}</h2>
        <p className="text-sm text-muted-foreground">
          {isZh ? "管理你的组织设置。" : "Manage your organization settings."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? "组织名称" : "Organization Name"}</CardTitle>
          <CardDescription>
            {isZh
              ? `你当前的组织名称是“${currentOrg.name}”。`
              : `Your organization is currently named "${currentOrg.name}".`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">{isZh ? "名称" : "Name"}</Label>
            <Input
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <Button
            onClick={() => updateMutation.mutate({ id: currentOrg.id, name })}
            disabled={
              updateMutation.isPending ||
              !name.trim() ||
              name === currentOrg.name
            }
          >
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isZh ? "保存" : "Save"}
          </Button>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              {isZh ? "危险区域" : "Danger Zone"}
            </CardTitle>
            <CardDescription>
              {isZh
                ? "永久删除此组织及其所有数据。"
                : "Permanently delete this organization and all its data."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  {isZh ? "删除组织" : "Delete Organization"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isZh
                      ? `删除“${currentOrg.name}”？`
                      : `Delete "${currentOrg.name}"?`}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isZh
                      ? "此操作无法撤销。所有项目、面试、会话和成员数据都将被永久删除。"
                      : "This action is irreversible. All projects, interviews, sessions, and member data will be permanently deleted."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {isZh ? "取消" : "Cancel"}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate({ id: currentOrg.id })}
                  >
                    {deleteMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {isZh ? "永久删除" : "Delete permanently"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
