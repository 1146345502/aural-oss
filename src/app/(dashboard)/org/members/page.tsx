"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";
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

export default function MembersPage() {
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const { currentOrg } = useOrg();
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

  const inviteMutation = trpc.orgMember.invite.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "成员邀请已发送" : "Member invited" });
      setInviteOpen(false);
      setInviteEmail("");
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

  const updateRoleMutation = trpc.orgMember.updateRole.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "角色已更新" : "Role updated" });
      setEditingRoleUserId(null);
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

  const removeMutation = trpc.orgMember.remove.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "成员已移除" : "Member removed" });
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

  const isOwner = currentOrg.role === "OWNER";
  const isAdmin = isOwner || currentOrg.role === "ADMIN";
  const members = membersQuery.data ?? [];

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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {isZh ? "团队成员" : "Team Members"}
          </h1>
          <p className="text-muted-foreground">
            {isZh
              ? `管理谁可以访问“${currentOrg.name}”。`
              : `Manage who has access to "${currentOrg.name}".`}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {isZh ? "邀请成员" : "Invite Member"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isZh ? "邀请成员" : "Invite Member"}</DialogTitle>
                <DialogDescription>
                  {isZh
                    ? "被邀请人必须先拥有账户。"
                    : "They must have an account to be invited."}
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
                    inviteMutation.mutate({
                      organizationId: currentOrg.id,
                      email: inviteEmail,
                      role: inviteRole,
                    })
                  }
                  disabled={
                    inviteMutation.isPending || !inviteEmail.includes("@")
                  }
                >
                  {inviteMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isZh ? "邀请" : "Invite"}
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
                <TableHead>{isZh ? "角色" : "Role"}</TableHead>
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
                          <div className="font-medium">
                            {m.profile?.name ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.profile?.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingRoleUserId === m.userId && m.role !== "OWNER" ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) =>
                            updateRoleMutation.mutate({
                              organizationId: currentOrg.id,
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
                            {isOwner && (
                              <SelectItem value="ADMIN">
                                {isZh ? "管理员" : "ADMIN"}
                              </SelectItem>
                            )}
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
                          <Badge variant={roleVariant(m.role)}>
                            {roleLabel(
                              m.role as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER",
                            )}
                          </Badge>
                          {isAdmin && m.role !== "OWNER" && (
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
                        {m.role !== "OWNER" && (
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
                                  {isZh ? "移除成员" : "Remove Member"}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {isZh
                                    ? "确认要将 "
                                    : "Are you sure you want to remove "}
                                  <span className="font-medium text-foreground">
                                    {m.profile?.name ?? m.profile?.email}
                                  </span>{" "}
                                  {isZh
                                    ? ` 从“${currentOrg.name}”中移除吗？移除后其将失去该组织下所有项目的访问权限。`
                                    : `from "${currentOrg.name}"? They will lose access to all projects in this organization.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {isZh ? "取消" : "Cancel"}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() =>
                                    removeMutation.mutate({
                                      organizationId: currentOrg.id,
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
