"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useProject } from "@/components/project-provider";
import { useOrg } from "@/components/org-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useRouter } from "next/navigation";

export default function ProjectSettingsGeneralPage() {
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const router = useRouter();
  const { currentProject } = useProject();
  const { currentOrg } = useOrg();
  const utils = trpc.useUtils();
  const isZh = locale === "zh";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (currentProject) {
      setName(currentProject.name);
      setDescription(currentProject.description ?? "");
    }
  }, [currentProject]);

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "项目已更新" : "Project updated" });
      utils.project.list.invalidate();
      utils.project.getById.invalidate();
    },
    onError: (err) => {
      toast({
        title: isZh ? "错误" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "项目已删除" : "Project deleted" });
      utils.project.list.invalidate();
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

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {isZh ? "尚未选择项目" : "No project selected"}
      </div>
    );
  }

  const isAdmin = currentOrg?.role === "OWNER" || currentOrg?.role === "ADMIN";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">{isZh ? "通用" : "General"}</h2>
        <p className="text-sm text-muted-foreground">
          {isZh ? "管理你的项目设置。" : "Manage your project settings."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? "项目名称" : "Project Name"}</CardTitle>
          <CardDescription>
            {isZh
              ? `你当前的项目名称是“${currentProject.name}”。`
              : `Your project is currently named "${currentProject.name}".`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="projectName">{isZh ? "名称" : "Name"}</Label>
            <Input
              id="projectName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectDesc">
              {isZh ? "描述（可选）" : "Description (optional)"}
            </Label>
            <Textarea
              id="projectDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isZh
                  ? "简要描述这个项目..."
                  : "Brief description of this project..."
              }
              disabled={!isAdmin}
            />
          </div>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() =>
                updateMutation.mutate({
                  id: currentProject.id,
                  name,
                  description: description || undefined,
                })
              }
              disabled={
                updateMutation.isPending ||
                !name.trim() ||
                (name === currentProject.name &&
                  description === (currentProject.description ?? ""))
              }
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isZh ? "保存" : "Save"}
            </Button>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              {isZh ? "危险区域" : "Danger Zone"}
            </CardTitle>
            <CardDescription>
              {isZh
                ? "永久删除此项目。项目中的面试将失去项目归属。"
                : "Permanently delete this project. Interviews will lose their project assignment."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  {isZh ? "删除项目" : "Delete Project"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isZh
                      ? `删除“${currentProject.name}”？`
                      : `Delete "${currentProject.name}"?`}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isZh
                      ? "此操作无法撤销。该项目中的所有面试都将失去项目归属。"
                      : "This action is irreversible. All interviews in this project will lose their project assignment."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {isZh ? "取消" : "Cancel"}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() =>
                      deleteMutation.mutate({ id: currentProject.id })
                    }
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
