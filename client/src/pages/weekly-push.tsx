import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  Eye,
  RefreshCw,
  FileDown,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PasswordProtect from "@/components/password-protect";
import AdminLayout from "@/components/admin-layout";
import type { WeeklyPushRun, WeeklyPushRecipient } from "@shared/schema";

const adminPassword = (): string =>
  (typeof window !== "undefined" &&
    sessionStorage.getItem("admin-password")) ||
  "";

interface RunsResponse {
  runs: WeeklyPushRun[];
}

interface RunDetailResponse {
  run: WeeklyPushRun;
  recipients: WeeklyPushRecipient[];
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return format(new Date(value), "yyyy/MM/dd HH:mm");
  } catch {
    return String(value);
  }
}

function fmtWeek(start: string, end: string): string {
  const s = String(start).slice(0, 10);
  const e = String(end).slice(0, 10);
  return `${s} ~ ${e}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "queued":
      return (
        <Badge
          variant="outline"
          className="text-gray-600 border-gray-300 whitespace-nowrap"
        >
          <Clock className="h-3 w-3 mr-1" />
          排程中
        </Badge>
      );
    case "running":
      return (
        <Badge
          variant="outline"
          className="text-blue-700 border-blue-300 bg-blue-50 whitespace-nowrap"
        >
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          執行中
        </Badge>
      );
    case "success":
      return (
        <Badge className="bg-green-500 hover:bg-green-600 whitespace-nowrap">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          全部成功
        </Badge>
      );
    case "partial_failed":
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600 whitespace-nowrap">
          <AlertTriangle className="h-3 w-3 mr-1" />
          部分失敗
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="whitespace-nowrap">
          <XCircle className="h-3 w-3 mr-1" />
          全部失敗
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function recipientStatusBadge(status: string) {
  switch (status) {
    case "success":
      return <Badge className="bg-green-500 whitespace-nowrap">成功</Badge>;
    case "failed":
      return (
        <Badge variant="destructive" className="whitespace-nowrap">
          失敗
        </Badge>
      );
    case "skipped":
      return (
        <Badge
          variant="outline"
          className="text-gray-500 border-gray-300 whitespace-nowrap"
        >
          略過
        </Badge>
      );
    case "pending":
      return (
        <Badge
          variant="outline"
          className="text-blue-600 border-blue-300 whitespace-nowrap"
        >
          等待中
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function triggerLabel(t: string): string {
  if (t === "cron") return "排程";
  if (t === "manual") return "手動";
  if (t === "retry") return "重送";
  return t;
}

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

function RunDetailDialog({
  runId,
  onClose,
}: {
  runId: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const open = !!runId;

  const { data, isLoading } = useQuery<RunDetailResponse>({
    queryKey: ["/api/admin/weekly-push/runs", runId],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/weekly-push/runs/${runId}?password=${encodeURIComponent(adminPassword())}`,
      );
      if (!res.ok) throw new Error("讀取詳情失敗");
      return res.json();
    },
    enabled: !!runId,
    refetchInterval: open ? 10000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/admin/weekly-push/runs/${runId}/retry-failed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": adminPassword(),
          },
          body: JSON.stringify({}),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "重新推播失敗");
      return body;
    },
    onSuccess: (body) => {
      toast({
        title: "已建立重試任務",
        description: `新任務 ${String(body.newRunId).slice(0, 8)}... · ${body.recipientsCreated} 位收件人`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/weekly-push/runs"],
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: "重試失敗",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const run = data?.run;
  const recipients = data?.recipients ?? [];

  const counts = recipients.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.status === "success") acc.success += 1;
      else if (r.status === "failed") acc.failed += 1;
      else if (r.status === "skipped") acc.skipped += 1;
      else acc.pending += 1;
      return acc;
    },
    { total: 0, success: 0, failed: 0, skipped: 0, pending: 0 },
  );

  const reportUrl = run?.reportPath
    ? `/api/admin/weekly-push/runs/${run.id}/report?password=${encodeURIComponent(adminPassword())}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            推播任務詳情
            {run && (
              <span className="text-xs text-muted-foreground font-mono ml-2">
                {run.id}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !run ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            載入中...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="border rounded p-3">
                <p className="text-xs text-muted-foreground">週次</p>
                <p className="font-medium">
                  {fmtWeek(
                    String(run.weekStartDate),
                    String(run.weekEndDate),
                  )}
                </p>
              </div>
              <div className="border rounded p-3">
                <p className="text-xs text-muted-foreground">狀態</p>
                <div className="mt-1">{statusBadge(run.status)}</div>
              </div>
              <div className="border rounded p-3">
                <p className="text-xs text-muted-foreground">類型 / 觸發</p>
                <p className="font-medium">
                  {run.dryRun ? "預覽" : "正式"} ·{" "}
                  {triggerLabel(run.triggerSource)}
                </p>
              </div>
              <div className="border rounded p-3">
                <p className="text-xs text-muted-foreground">完成時間</p>
                <p className="font-medium">{fmtDate(run.completedAt)}</p>
              </div>
            </div>

            {/* Counts */}
            <div className="flex gap-2 flex-wrap text-xs">
              <span className="bg-gray-50 border rounded px-2.5 py-1">
                總計 <strong>{counts.total}</strong>
              </span>
              <span className="bg-green-50 border border-green-200 text-green-700 rounded px-2.5 py-1">
                成功 <strong>{counts.success}</strong>
              </span>
              <span className="bg-red-50 border border-red-200 text-red-700 rounded px-2.5 py-1">
                失敗 <strong>{counts.failed}</strong>
              </span>
              <span className="bg-gray-50 border border-gray-200 text-gray-600 rounded px-2.5 py-1">
                略過 <strong>{counts.skipped}</strong>
              </span>
              {counts.pending > 0 && (
                <span className="bg-blue-50 border border-blue-200 text-blue-700 rounded px-2.5 py-1">
                  進行中 <strong>{counts.pending}</strong>
                </span>
              )}
            </div>

            {run.errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                <p className="font-medium mb-1">任務錯誤</p>
                <pre className="whitespace-pre-wrap font-mono">
                  {run.errorMessage}
                </pre>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {reportUrl ? (
                <a href={reportUrl} download>
                  <Button size="sm" variant="outline" className="h-8">
                    <FileDown className="h-4 w-4 mr-1" />
                    下載報表（CSV）
                  </Button>
                </a>
              ) : (
                <Button size="sm" variant="outline" className="h-8" disabled>
                  <FileDown className="h-4 w-4 mr-1" />
                  報表尚未產生
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 bg-orange-500 hover:bg-orange-600"
                onClick={() => {
                  if (counts.failed === 0) {
                    toast({
                      title: "無需重試",
                      description: "此任務沒有失敗的收件人。",
                    });
                    return;
                  }
                  if (
                    !confirm(
                      `確定要對 ${counts.failed} 位失敗收件人重新推播？`,
                    )
                  )
                    return;
                  retryMutation.mutate();
                }}
                disabled={retryMutation.isPending || counts.failed === 0}
                data-testid="button-retry-failed"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-1 ${retryMutation.isPending ? "animate-spin" : ""}`}
                />
                {retryMutation.isPending
                  ? "建立中..."
                  : `重新推播失敗（${counts.failed}）`}
              </Button>
            </div>

            {/* Recipient table */}
            <div className="border rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-sm whitespace-nowrap">
                      教練
                    </TableHead>
                    <TableHead className="text-sm whitespace-nowrap">
                      LINE ID
                    </TableHead>
                    <TableHead className="text-sm whitespace-nowrap">
                      狀態
                    </TableHead>
                    <TableHead className="text-sm whitespace-nowrap text-right">
                      嘗試
                    </TableHead>
                    <TableHead className="text-sm whitespace-nowrap">
                      發送時間
                    </TableHead>
                    <TableHead className="text-sm">錯誤訊息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground py-6"
                      >
                        尚無收件人
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...recipients]
                      .sort((a, b) => {
                        const order = {
                          failed: 0,
                          pending: 1,
                          success: 2,
                          skipped: 3,
                        } as Record<string, number>;
                        const oa = order[a.status] ?? 9;
                        const ob = order[b.status] ?? 9;
                        if (oa !== ob) return oa - ob;
                        return a.recipientName.localeCompare(
                          b.recipientName,
                          "zh-TW",
                        );
                      })
                      .map((r) => (
                        <TableRow
                          key={r.id}
                          data-testid={`row-recipient-${r.id}`}
                        >
                          <TableCell className="text-sm font-medium whitespace-nowrap">
                            {r.recipientName}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-gray-500 max-w-[200px] truncate">
                            {r.lineUserId || (
                              <span className="text-gray-300">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {recipientStatusBadge(r.status)}
                          </TableCell>
                          <TableCell className="text-sm text-right">
                            {r.attemptCount}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(r.sentAt)}
                          </TableCell>
                          <TableCell className="text-xs text-red-600 max-w-[280px]">
                            {r.errorMessage ? (
                              <span title={r.errorMessage}>
                                {r.errorCode ? (
                                  <span className="font-mono text-[10px] bg-red-50 border border-red-200 px-1 py-0.5 rounded mr-1">
                                    {r.errorCode}
                                  </span>
                                ) : null}
                                {r.errorMessage}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function WeeklyPush() {
  return (
    <PasswordProtect>
      <WeeklyPushContent />
    </PasswordProtect>
  );
}
