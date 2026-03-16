"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg, type OrgInfo } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { trpc, trpc as trpcClient } from "@/lib/trpc/client";
import { FolderKanban, Loader2, Plus, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function OrgSection({ org, isCurrent }: { org: OrgInfo; isCurrent: boolean }) {
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const router = useRouter();
  const { setCurrentOrg } = useOrg();
  const { setCurrentProject } = useProject();
  const utils = trpc.useUtils();
  const isZh = locale === "zh";

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);

  const projectsQuery = trpc.project.list.useQuery(
    { organizationId: org.id },
    { staleTime: 30_000 },
  );

  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "项目已创建" : "Project created" });
      setNewProjectOpen(false);
      setProjectName("");
      setProjectDesc("");
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

  const handleGoToProject = (projectId: string) => {
    if (loadingProjectId) return;
    setLoadingProjectId(projectId);
    setCurrentOrg(org.id);
    setCurrentProject(projectId);
    router.push("/dashboard");
  };

  const isAdmin = org.role === "OWNER" || org.role === "ADMIN";
  const projects = projectsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{org.name}</h2>
        <Badge variant="outline" className="text-xs">
          {org.role}
        </Badge>
        {isCurrent && (
          <Badge variant="secondary" className="text-xs">
            {isZh ? "当前" : "Current"}
          </Badge>
        )}
        <div className="flex-1" />
        {isAdmin && (
          <>
            <Link href="/org/settings/members">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={isZh ? "成员" : "Members"}
                onClick={() => setCurrentOrg(org.id)}
              >
                <Users className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/org/settings">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={isZh ? "组织设置" : "Organization Settings"}
                onClick={() => setCurrentOrg(org.id)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </>
        )}
        {isAdmin && (
          <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                {isZh ? "新建项目" : "New project"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isZh ? "创建项目" : "Create Project"}
                </DialogTitle>
                <DialogDescription>
                  {isZh
                    ? `在“${org.name}”中创建一个新项目。`
                    : `Create a new project in "${org.name}".`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{isZh ? "名称" : "Name"}</Label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
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
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    placeholder={isZh ? "简要描述..." : "Brief description..."}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setNewProjectOpen(false)}
                >
                  {isZh ? "取消" : "Cancel"}
                </Button>
                <Button
                  onClick={() =>
                    createProjectMutation.mutate({
                      organizationId: org.id,
                      name: projectName,
                      description: projectDesc || undefined,
                    })
                  }
                  disabled={
                    createProjectMutation.isPending || !projectName.trim()
                  }
                >
                  {createProjectMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isZh ? "创建" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            {isZh ? "还没有项目" : "No projects yet"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const isLoading = loadingProjectId === project.id;
            return (
              <Card
                key={project.id}
                data-tour="project-card"
                className={`relative transition-shadow cursor-pointer ${
                  loadingProjectId
                    ? isLoading
                      ? ""
                      : "opacity-50 pointer-events-none"
                    : "hover:shadow-md"
                }`}
                onClick={() => handleGoToProject(project.id)}
              >
                {isLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Link
                      href="/settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGoToProject(project.id);
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={isZh ? "项目设置" : "Project Settings"}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
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
                    {" · "}
                    {project._count.sessions}{" "}
                    {project._count.sessions === 1
                      ? isZh
                        ? "场会话"
                        : "session"
                      : isZh
                        ? "场会话"
                        : "sessions"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrganizationsPage() {
  const { orgs, currentOrg } = useOrg();
  const { locale } = useAppLocale();
  const ownedCount = orgs.filter((o) => o.role === "OWNER").length;
  const { data: orgLimitData } = trpcClient.organization.orgLimit.useQuery();
  const orgLimit = orgLimitData?.limit ?? 10;
  const limitReached = ownedCount >= orgLimit;
  const isZh = locale === "zh";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {isZh ? "组织" : "Organizations"}
          </h1>
          <p className="text-muted-foreground">
            {isZh
              ? "管理你的组织和项目。"
              : "Manage your organizations and projects."}
          </p>
        </div>
        {limitReached ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button disabled>
                    <Plus className="mr-2 h-4 w-4" />
                    {isZh ? "新建组织" : "New Organization"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-center">
                {isZh
                    ? `你已达到 ${orgLimit} 个组织的上限。`
                    : `You\u2019ve reached the limit of ${orgLimit} organizations.`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Link href="/org/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {isZh ? "新建组织" : "New Organization"}
            </Button>
          </Link>
        )}
      </div>

      {orgs.map((org) => (
        <OrgSection
          key={org.id}
          org={org}
          isCurrent={currentOrg?.id === org.id}
        />
      ))}
    </div>
  );
}
