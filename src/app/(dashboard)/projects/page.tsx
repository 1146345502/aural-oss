"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";
import Link from "next/link";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FolderKanban, Loader2, Plus } from "lucide-react";

export default function ProjectsPage() {
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const { currentOrg } = useOrg();
  const utils = trpc.useUtils();
  const isZh = locale === "zh";

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectsQuery = trpc.project.list.useQuery(
    { organizationId: currentOrg?.id ?? "" },
    { enabled: !!currentOrg },
  );

  const createMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "项目已创建" : "Project created" });
      setCreateOpen(false);
      setName("");
      setDescription("");
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

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {isZh ? "尚未选择组织" : "No organization selected"}
      </div>
    );
  }

  const isAdmin = currentOrg.role === "OWNER" || currentOrg.role === "ADMIN";
  const projects = projectsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{isZh ? "项目" : "Projects"}</h1>
          <p className="text-muted-foreground">
            {isZh
              ? "将面试归类到不同项目中。"
              : "Organize interviews into projects."}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {isZh ? "新建项目" : "New Project"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isZh ? "创建项目" : "Create Project"}
                </DialogTitle>
                <DialogDescription>
                  {isZh
                    ? "创建一个新项目来组织面试。"
                    : "Create a new project to organize interviews."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{isZh ? "名称" : "Name"}</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      isZh ? "例如：工程招聘 Q1" : "e.g. Engineering Hiring Q1"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    {isZh ? "描述（可选）" : "Description (optional)"}
                  </Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={isZh ? "简要描述..." : "Brief description..."}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {isZh ? "取消" : "Cancel"}
                </Button>
                <Button
                  onClick={() =>
                    createMutation.mutate({
                      organizationId: currentOrg.id,
                      name,
                      description: description || undefined,
                    })
                  }
                  disabled={createMutation.isPending || !name.trim()}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isZh ? "创建" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {projects.length === 0 && !projectsQuery.isLoading ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">
            {isZh ? "还没有项目" : "No projects yet"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isZh
              ? "创建一个项目以开始组织面试。"
              : "Create a project to start organizing interviews."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  {project.description && (
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {project._count.interviews}{" "}
                    {project._count.interviews === 1
                      ? isZh
                        ? "场面试"
                        : "interview"
                      : isZh
                        ? "场面试"
                        : "interviews"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
