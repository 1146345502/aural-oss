"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, LogOut, Pencil } from "lucide-react";

export default function ProjectMembersPage() {
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const { currentOrg } = useOrg();
  const { currentProject } = useProject();
  useAuth();
  const utils = trpc.useUtils();
  const isZh = locale === "zh";
  const roleLabel = (role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER") =>
    isZh
      ? {
          OWNER: "所有者",
          ADMIN: "管理员",
          MEMBER: "成员",
          VIEWER: "查看者",
        }[role]
      : role;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">(
    "MEMBER",
  );
  const [editingRoleUserId, setEditingRoleUserId] = useState<string | null>(
    null,
  );

  const membersQuery = trpc.orgMember.list.useQuery(
    { organizationId: currentOrg?.id ?? "" },
    { enabled: !!currentOrg },
  );

  const addProjectMemberMutation = trpc.orgMember.addProjectMember.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "成员已加入项目" : "Member added to project" });
      setInviteOpen(false);
      setInviteEmail("");
      utils.orgMember.listProjectRoles.invalidate();
      utils.orgMember.list.invalidate();
    },
    onError: (err) => {
      toast({
        title: isZh ? "错误" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const removeProjectMemberMutation =
    trpc.orgMember.removeProjectMember.useMutation({
      onSuccess: () => {
        toast({
          title: isZh ? "成员已从项目中移除" : "Member removed from project",
        });
        utils.orgMember.listProjectRoles.invalidate();
      },
      onError: (err) => {
        toast({
          title: isZh ? "错误" : "Error",
          description: err.message,
          variant: "destructive",
        });
      },
    });

  const projectRolesQuery = trpc.orgMember.listProjectRoles.useQuery(
    {
      organizationId: currentOrg?.id ?? "",
      projectId: currentProject?.id ?? "",
    },
    { enabled: !!currentOrg && !!currentProject },
  );

  const updateProjectRoleMutation =
    trpc.orgMember.updateProjectRole.useMutation({
      onSuccess: () => {
        toast({ title: isZh ? "项目角色已更新" : "Project role updated" });
        setEditingRoleUserId(null);
        utils.orgMember.listProjectRoles.invalidate();
      },
      onError: (err) => {
        toast({
          title: isZh ? "错误" : "Error",
          description: err.message,
          variant: "destructive",
        });
      },
    });

  const leaveMutation = trpc.orgMember.leave.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "你已离开该组织" : "You left the organization" });
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

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {isZh ? "尚未选择组织" : "No organization selected"}
      </div>
    );
  }

  const isAdmin = currentOrg.role === "OWNER" || currentOrg.role === "ADMIN";

  const allMembers = membersQuery.data ?? [];
  const projectCreatorId = currentProject?.createdBy;
  const projectRoles = projectRolesQuery.data ?? {};
  const hasExplicitProjectMembers = Object.keys(projectRoles).length > 0;
  const members = hasExplicitProjectMembers
    ? allMembers.filter((m) => m.role === "OWNER" || m.userId in projectRoles)
    : allMembers;

  const roleVariant = (role: string) => {
    switch (role) {
      case "OWNER":
        return "default";
      case "ADMIN":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{isZh ? "成员" : "Members"}</h2>
          <p className="text-sm text-muted-foreground">
            {isZh
              ? `“${currentOrg.name}”中有权访问此项目的成员。`
              : `Members of "${currentOrg.name}" who have access to this project.`}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {isZh ? "添加成员" : "Add Member"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isZh ? "向项目添加成员" : "Add Member to Project"}
                </DialogTitle>
                <DialogDescription>
                  {isZh
                    ? "将现有组织成员添加到此项目。"
                    : "Add an existing organization member to this project."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{isZh ? "邮箱" : "Email"}</Label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isZh ? "角色" : "Role"}</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as typeof inviteRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">
                        {isZh ? "管理员" : "Admin"}
                      </SelectItem>
                      <SelectItem value="MEMBER">
                        {isZh ? "成员" : "Member"}
                      </SelectItem>
                      <SelectItem value="VIEWER">
                        {isZh ? "查看者" : "Viewer"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  {isZh ? "取消" : "Cancel"}
                </Button>
                <Button
                  onClick={() =>
                    currentProject &&
                    addProjectMemberMutation.mutate({
                      organizationId: currentOrg.id,
                      projectId: currentProject.id,
                      email: inviteEmail,
                      role: inviteRole,
                    })
                  }
                  disabled={
                    addProjectMemberMutation.isPending ||
                    !inviteEmail.includes("@")
                  }
                >
                  {addProjectMemberMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isZh ? "添加" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isZh ? "成员" : "Member"}</TableHead>
                <TableHead>{isZh ? "组织角色" : "Org Role"}</TableHead>
                <TableHead>{isZh ? "项目角色" : "Project Role"}</TableHead>
                <TableHead>{isZh ? "加入时间" : "Joined"}</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const profileInitials =
                  m.profile?.name
                    ?.split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase() ?? "?";

                const isProjectOwner = projectCreatorId === m.userId;

                return (
                  <TableRow key={m.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={m.profile?.avatar ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {profileInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {m.profile?.name ?? "—"}
                            </span>
                            {isProjectOwner && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {isZh ? "项目所有者" : "Project Owner"}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.profile?.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleVariant(m.role)}>
                        {roleLabel(
                          m.role as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER",
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {m.role === "OWNER" ? (
                        <Badge variant="default">{roleLabel("OWNER")}</Badge>
                      ) : editingRoleUserId === m.userId && currentProject ? (
                        <Select
                          value={projectRoles[m.userId] ?? m.role}
                          onValueChange={(v) =>
                            updateProjectRoleMutation.mutate({
                              organizationId: currentOrg.id,
                              projectId: currentProject.id,
                              userId: m.userId,
                              role: v as "ADMIN" | "MEMBER" | "VIEWER",
                            })
                          }
                          onOpenChange={(open) => {
                            if (!open) setEditingRoleUserId(null);
                          }}
                          defaultOpen
                        >
                          <SelectTrigger className="h-7 w-[110px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">
                              {isZh ? "管理员" : "ADMIN"}
                            </SelectItem>
                            <SelectItem value="MEMBER">
                              {isZh ? "成员" : "MEMBER"}
                            </SelectItem>
                            <SelectItem value="VIEWER">
                              {isZh ? "查看者" : "VIEWER"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={roleVariant(
                              projectRoles[m.userId] ?? m.role,
                            )}
                          >
                            {roleLabel(
                              (projectRoles[m.userId] ?? m.role) as
                                | "OWNER"
                                | "ADMIN"
                                | "MEMBER"
                                | "VIEWER",
                            )}
                          </Badge>
                          {isAdmin && (
                            <button
                              onClick={() => setEditingRoleUserId(m.userId)}
                              className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {m.role !== "OWNER" && currentProject && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {isZh
                                    ? "从项目中移除"
                                    : "Remove from Project"}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {isZh
                                    ? "确认要将 "
                                    : "Are you sure you want to remove "}
                                  <span className="font-medium text-foreground">
                                    {m.profile?.name ?? m.profile?.email}
                                  </span>{" "}
                                  {isZh
                                    ? ` 从“${currentProject?.name}”中移除吗？移除后其仍会保留组织成员身份。`
                                    : `from "${currentProject?.name}"? They will still remain a member of the organization.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {isZh ? "取消" : "Cancel"}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() =>
                                    removeProjectMemberMutation.mutate({
                                      organizationId: currentOrg.id,
                                      projectId: currentProject.id,
                                      userId: m.userId,
                                    })
                                  }
                                >
                                  {isZh ? "移除" : "Remove"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isAdmin && currentOrg.role !== "OWNER" && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={leaveMutation.isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {isZh ? "离开组织" : "Leave Organization"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isZh ? "离开组织" : "Leave Organization"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isZh
                    ? `确认要离开“${currentOrg.name}”吗？离开后你将失去该组织中的所有项目和数据访问权限，此操作无法撤销。`
                    : `Are you sure you want to leave "${currentOrg.name}"? You will lose access to all projects and data in this organization. This action cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {isZh ? "取消" : "Cancel"}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    leaveMutation.mutate({
                      organizationId: currentOrg.id,
                    })
                  }
                >
                  {leaveMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isZh ? "离开组织" : "Leave Organization"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
