import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Send, Eye, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { RunDetailDialog } from "@/components/weekly-push/RunDetailDialog";
import {
  adminPassword,
  fmtDate,
  fmtWeek,
  statusBadge,
  triggerLabel,
  type RunsResponse,
} from "@/components/weekly-push/helpers";

function WeeklyPushContent() {
  const { toast } = useToast();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const {
    data: runsData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<RunsResponse>({
    queryKey: ["/api/admin/weekly-push/runs"],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/weekly-push/runs?limit=50&password=${encodeURIComponent(adminPassword())}`,
      );
      if (!res.ok) throw new Error("讀取週推播紀錄失敗");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const enqueueMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await fetch("/api/admin/weekly-push/enqueue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword(),
        },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "排程失敗");
      return { ...data, dryRun };
    },
    onSuccess: (data) => {
      toast({
        title: data.dryRun ? "預覽已排程" : "推播已排程",
        description: data.reused
          ? `沿用既有任務（${data.runId.slice(0, 8)}...）`
          : `新建任務 ${data.runId.slice(0, 8)}... · ${data.recipientsCreated} 位收件人`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/weekly-push/runs"],
      });
      setSelectedRunId(data.runId);
    },
    onError: (err: Error) => {
      toast({
        title: "排程失敗",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const runs = runsData?.runs ?? [];

  const headerRight = (
    <span className="text-sm bg-purple-500 text-white px-3 py-1 rounded-full">
      週推播
    </span>
  );

  return (
    <AdminLayout activeTab="weekly-push" headerRight={headerRight}>
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" />
                週推播管理
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => enqueueMutation.mutate(true)}
                  disabled={enqueueMutation.isPending}
                  data-testid="button-dry-run"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  {enqueueMutation.isPending &&
                  enqueueMutation.variables === true
                    ? "處理中..."
                    : "預覽（不發送）"}
                </Button>
                <Button
                  size="sm"
                  className="h-8 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    if (
                      !confirm("確定要立即向所有教練發送下週課表？此操作不可復原。")
                    )
                      return;
                    enqueueMutation.mutate(false);
                  }}
                  disabled={enqueueMutation.isPending}
                  data-testid="button-send-now"
                >
                  <Send className="h-4 w-4 mr-1" />
                  {enqueueMutation.isPending &&
                  enqueueMutation.variables === false
                    ? "排程中..."
                    : "立即推播"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  data-testid="button-refresh-runs"
                >
                  <RotateCcw
                    className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`}
                  />
                  重新整理
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              點擊任一筆紀錄可查看每位收件人的詳細結果、下載 CSV 報表，或對失敗者重新推播。
            </p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {isLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                載入中...
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                尚無推播紀錄。點擊上方「預覽」或「立即推播」開始第一次任務。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-sm whitespace-nowrap">
                        週次
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap">
                        狀態
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap">
                        類型
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap">
                        觸發來源
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap text-right">
                        成功
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap text-right">
                        失敗
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap text-right">
                        略過
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap text-right">
                        總數
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap">
                        建立時間
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap">
                        完成時間
                      </TableHead>
                      <TableHead className="text-sm whitespace-nowrap"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow
                        key={run.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedRunId(run.id)}
                        data-testid={`row-run-${run.id}`}
                      >
                        <TableCell className="text-sm font-medium whitespace-nowrap">
                          {fmtWeek(
                            String(run.weekStartDate),
                            String(run.weekEndDate),
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(run.status)}</TableCell>
                        <TableCell>
                          {run.dryRun ? (
                            <Badge
                              variant="outline"
                              className="text-purple-700 border-purple-300 whitespace-nowrap"
                            >
                              預覽
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-blue-700 border-blue-300 whitespace-nowrap"
                            >
                              正式
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {triggerLabel(run.triggerSource)}
                        </TableCell>
                        <TableCell className="text-sm text-right text-green-700 font-medium">
                          {run.successCount}
                        </TableCell>
                        <TableCell className="text-sm text-right text-red-600 font-medium">
                          {run.failureCount}
                        </TableCell>
                        <TableCell className="text-sm text-right text-gray-500">
                          {run.skippedCount}
                        </TableCell>
                        <TableCell className="text-sm text-right">
                          {run.totalCount}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(run.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(run.completedAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <button
                            className="text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRunId(run.id);
                            }}
                          >
                            查看詳情 →
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RunDetailDialog
        runId={selectedRunId}
        onClose={() => setSelectedRunId(null)}
      />
    </AdminLayout>
  );
}

export default function WeeklyPush() {
  return <WeeklyPushContent />;
}
