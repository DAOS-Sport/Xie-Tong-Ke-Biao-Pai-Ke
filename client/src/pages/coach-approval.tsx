import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { CheckCircle, XCircle, Users, ArrowLeft, BookOpen, MapPin, Save, Bell, Send, Copy, ExternalLink, Link } from "lucide-react";
import { useLocation } from "wouter";
import type { CoachUser, Venue, VenueInfo } from "@shared/schema";
import PasswordProtect from "@/components/password-protect";

const adminPassword = "dream0935314711";

function CoachApprovalContent() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"users" | "rules" | "venues" | "notify">("users");

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/mgt-x9k7p2/class-edit")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              學校課表編輯
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/mgt-x9k7p2/assign")}>
              <Users className="h-4 w-4 mr-1" />
              教練指派
            </Button>
            <h1 className="text-lg font-bold">教練管理後台</h1>
          </div>
        </div>

        <div className="flex gap-2 border-b pb-2">
          <Button
            variant={activeTab === "users" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("users")}
          >
            <Users className="h-4 w-4 mr-1" />
            教練審核
          </Button>
          <Button
            variant={activeTab === "rules" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("rules")}
          >
            <BookOpen className="h-4 w-4 mr-1" />
            教練守則
          </Button>
          <Button
            variant={activeTab === "venues" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("venues")}
          >
            <MapPin className="h-4 w-4 mr-1" />
            場館資訊
          </Button>
          <Button
            variant={activeTab === "notify" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("notify")}
          >
            <Bell className="h-4 w-4 mr-1" />
            推播通知
          </Button>
        </div>

        {activeTab === "users" && <CoachUsersSection />}
        {activeTab === "rules" && <CoachRulesSection />}
        {activeTab === "venues" && <VenueInfoSection />}
        {activeTab === "notify" && <NotificationSection />}
      </main>
    </div>
  );
}

function CoachUsersSection() {
  const [filter, setFilter] = useState<string>("all");

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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            教練列表
            {pendingCount > 0 && (
              <Badge className="bg-red-500 text-xs">{pendingCount} 待審</Badge>
            )}
          </CardTitle>
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
  );
}

function CoachRulesSection() {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/settings/coach-rules"],
    queryFn: async () => {
      const res = await fetch("/api/settings/coach-rules");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.content !== undefined) {
      setContent(data.content);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/settings/coach-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/coach-rules"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          教練守則編輯
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          編輯教練守則內容，教練在前台可以查看
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">載入中...</div>
        ) : (
          <div className="space-y-4">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="請輸入教練守則內容...&#10;&#10;例如：&#10;1. 請於上課前15分鐘到達場館&#10;2. 穿著整齊的教練服裝&#10;3. 確保學生安全..."
              className="min-h-[300px] font-mono text-sm"
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-green-500 hover:bg-green-600"
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "儲存中..." : "儲存守則"}
              </Button>
              {saved && (
                <span className="text-sm text-green-600">已儲存</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VenueInfoSection() {
  const { data: venues = [] } = useQuery<Venue[]>({
    queryKey: ["/api/venues"],
  });

  const { data: venueInfos = [] } = useQuery<VenueInfo[]>({
    queryKey: ["/api/venue-infos"],
    queryFn: async () => {
      const res = await fetch("/api/venue-infos");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const baseUrl = window.location.origin;

  const handleCopy = (venue: Venue) => {
    const url = `${baseUrl}/school/${encodeURIComponent(venue.name)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(venue.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="h-4 w-4" />
            各學校專屬課表連結
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            每個學校有獨立的網址，可以直接分享給學校查看自己的課表
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {venues.map((venue) => {
              const url = `${baseUrl}/school/${encodeURIComponent(venue.name)}`;
              return (
                <div
                  key={venue.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: `var(--venue-${venue.color})` }}
                  />
                  <span className="font-medium text-sm w-20 shrink-0">{venue.name}</span>
                  <code className="flex-1 text-xs bg-gray-100 px-2 py-1.5 rounded font-mono text-gray-600 truncate">
                    {url}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleCopy(venue)}
                  >
                    {copiedId === venue.id ? (
                      <><CheckCircle className="h-3 w-3 mr-1 text-green-500" />已複製</>
                    ) : (
                      <><Copy className="h-3 w-3 mr-1" />複製</>
                    )}
                  </Button>
                  <a
                    href={`/school/${encodeURIComponent(venue.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="sm" className="shrink-0">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            場館資訊管理
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            為每個場館設定進入方式說明、影片連結和導航，教練在前台可以查看
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {venues.map((venue) => {
              const info = venueInfos.find((v) => v.venueName === venue.name);
              return (
                <VenueInfoEditor
                  key={venue.id}
                  venueName={venue.name}
                  venueColor={venue.color}
                  existingInfo={info}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function VenueInfoEditor({
  venueName,
  venueColor,
  existingInfo,
}: {
  venueName: string;
  venueColor: string;
  existingInfo?: VenueInfo;
}) {
  const [videoUrl, setVideoUrl] = useState(existingInfo?.videoUrl || "");
  const [description, setDescription] = useState(existingInfo?.description || "");
  const [mapUrl, setMapUrl] = useState(existingInfo?.mapUrl || "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setVideoUrl(existingInfo?.videoUrl || "");
    setDescription(existingInfo?.description || "");
    setMapUrl(existingInfo?.mapUrl || "");
  }, [existingInfo]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/venue-infos/${encodeURIComponent(venueName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ videoUrl, description, mapUrl }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/venue-infos"] });
    },
  });

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: `var(--venue-${venueColor})` }}
        />
        <span className="font-medium text-sm">{venueName}</span>
        {saved && <span className="text-xs text-green-600 ml-auto">已儲存</span>}
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground">影片連結 (YouTube 等)</label>
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Google 導航連結</label>
          <Input
            value={mapUrl}
            onChange={(e) => setMapUrl(e.target.value)}
            placeholder="https://maps.google.com/..."
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">進入方式說明</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：從正門進入，右轉到底即可到達游泳池..."
            className="text-sm min-h-[60px]"
          />
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="bg-green-500 hover:bg-green-600"
        >
          <Save className="h-3 w-3 mr-1" />
          {saveMutation.isPending ? "儲存中..." : "儲存"}
        </Button>
      </div>
    </div>
  );
}

function NotificationSection() {
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sendNotification = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/send-weekly-notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult("推播已成功發送！");
      } else {
        setSendResult(`發送失敗：${data.message || "未知錯誤"}`);
      }
    } catch {
      setSendResult("發送失敗：網路錯誤");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" />
          LINE 推播通知
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-blue-800">自動推播排程</p>
          <p className="text-blue-700">
            系統會在每週日晚上 20:00（台灣時間）自動發送 LINE 推播，通知每位教練下週排定的課程。
          </p>
          <p className="text-blue-600 text-xs">
            條件：教練需已核准、已綁定 LINE 帳號、且帳號已連結排課系統中的教練名稱。
          </p>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="font-medium">手動發送推播</p>
          <p className="text-sm text-muted-foreground">
            點擊下方按鈕立即發送下週課程通知給所有符合條件的教練。
          </p>
          <Button
            onClick={sendNotification}
            disabled={isSending}
            className="bg-green-500 hover:bg-green-600"
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending ? "發送中..." : "立即發送下週課程通知"}
          </Button>
          {sendResult && (
            <p className={`text-sm mt-2 ${sendResult.includes("成功") ? "text-green-600" : "text-red-600"}`}>
              {sendResult}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CoachApproval() {
  return (
    <PasswordProtect>
      <CoachApprovalContent />
    </PasswordProtect>
  );
}
