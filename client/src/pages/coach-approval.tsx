import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { CheckCircle, XCircle, Users, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import type { CoachUser } from "@shared/schema";
import PasswordProtect from "@/components/password-protect";

function CoachApprovalContent() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<string>("all");

  const adminPassword = "dream28559983";

  const { data: coachUsers = [], isLoading } = useQuery<CoachUser[]>({
    queryKey: ["/api/admin/coach-users", filter],
    queryFn: async () => {
      const url = filter === "pending"
        ? `/api/admin/coach-users?status=pending&password=${adminPassword}`
        : `/api/admin/coach-users?password=${adminPassword}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/admin/coach-users/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coach-users"] });
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-400">待審核</Badge>;
      case "approved":
        return <Badge className="bg-green-500">已通過</Badge>;
      case "rejected":
        return <Badge variant="destructive">已拒絕</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredUsers = filter === "all"
    ? coachUsers
    : coachUsers.filter((u) => u.status === filter);

  const pendingCount = coachUsers.filter((u) => u.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/venue-schedule-edit")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回排課
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5" />
              教練帳號審核
              {pendingCount > 0 && (
                <Badge className="bg-red-500 text-xs">{pendingCount} 待審</Badge>
              )}
            </h1>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">教練列表</CardTitle>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="pending">待審核</SelectItem>
                  <SelectItem value="approved">已通過</SelectItem>
                  <SelectItem value="rejected">已拒絕</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">載入中...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">目前無教練資料</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>電話</TableHead>
                      <TableHead>信箱</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>註冊時間</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.phone || "-"}</TableCell>
                        <TableCell>{user.email || "-"}</TableCell>
                        <TableCell>{statusBadge(user.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {user.createdAt
                            ? format(new Date(user.createdAt), "yyyy/MM/dd HH:mm")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {user.status !== "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                                onClick={() =>
                                  approveMutation.mutate({ id: user.id, status: "approved" })
                                }
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                通過
                              </Button>
                            )}
                            {user.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() =>
                                  approveMutation.mutate({ id: user.id, status: "rejected" })
                                }
                                disabled={approveMutation.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                拒絕
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function CoachApproval() {
  return (
    <PasswordProtect>
      <CoachApprovalContent />
    </PasswordProtect>
  );
}
