"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const { currentOrg } = useOrg();
  const utils = trpc.useUtils();
  const projectId = params.id as string;
  const isZh = locale === "zh";

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");

  const projectQuery = trpc.project.getById.useQuery(
    { id: projectId },
    {
      onSuccess: (data) => {
        if (!editingName) setName(data.name);
      },
    },
  );

  const interviewsQuery = trpc.interview.list.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "项目已更新" : "Project updated" });
      setEditingName(false);
      utils.project.getById.invalidate({ id: projectId });
      utils.project.list.invalidate();
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
      router.push("/projects");
    },
    onError: (err) => {
      toast({
        title: isZh ? "错误" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const project = projectQuery.data;
  const isAdmin = currentOrg?.role === "OWNER" || currentOrg?.role === "ADMIN";

  if (!project && projectQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {isZh ? "未找到项目" : "Project not found"}
      </div>
    );
  }

  const interviews = interviewsQuery.data?.interviews ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/projects")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="max-w-xs"
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => updateMutation.mutate({ id: projectId, name })}
                disabled={updateMutation.isPending || !name.trim()}
              >
                {isZh ? "保存" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(project.name);
                  setEditingName(false);
                }}
              >
                {isZh ? "取消" : "Cancel"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setName(project.name);
                    setEditingName(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/interviews/new?projectId=${projectId}`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {isZh ? "新建面试" : "New Interview"}
            </Button>
          </Link>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isZh ? "删除项目？" : "Delete project?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isZh
                      ? "该项目中的所有面试都将失去项目归属。"
                      : "All interviews in this project will lose their project assignment."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {isZh ? "取消" : "Cancel"}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate({ id: projectId })}
                  >
                    {isZh ? "删除" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isZh ? "面试" : "Interviews"}</CardTitle>
          <CardDescription>
            {interviews.length}{" "}
            {isZh
              ? "场属于该项目的面试"
              : `${interviews.length === 1 ? "interview" : "interviews"} in this project`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {interviews.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              {isZh
                ? "还没有面试。创建一个开始使用。"
                : "No interviews yet. Create one to get started."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isZh ? "标题" : "Title"}</TableHead>
                  <TableHead>{isZh ? "题目数" : "Questions"}</TableHead>
                  <TableHead>{isZh ? "会话数" : "Sessions"}</TableHead>
                  <TableHead>{isZh ? "更新时间" : "Updated"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((interview) => (
                  <TableRow key={interview.id}>
                    <TableCell>
                      <Link
                        href={`/interviews/${interview.id}/edit`}
                        className="font-medium hover:underline"
                      >
                        {interview.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {interview._count.questions}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {interview._count.sessions}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(interview.updatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
