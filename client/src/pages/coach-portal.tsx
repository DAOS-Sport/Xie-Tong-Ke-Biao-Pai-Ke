import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfWeek, addWeeks, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Phone, User, Clock, MapPin, LogOut, BookOpen, Video, Calendar, CheckSquare, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { CoachUser, Schedule, Venue, TimeSlot, VenueInfo, CoachAvailability } from "@shared/schema";

type ScheduleWithDetails = Schedule & { venue: Venue; timeSlot: TimeSlot };

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function getWeekdayName(date: Date): string {
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  return `週${names[date.getDay()]}`;
}

function useLineLoginParams() {
  const [params, setParams] = useState<{
    lineLogin?: string;
    userId?: string;
    token?: string;
    error?: string;
  }>({});

  useEffect(() => {
    const url = new URL(window.location.href);
    const lineLogin = url.searchParams.get("lineLogin");
    const userId = url.searchParams.get("userId");
    const token = url.searchParams.get("token");
    const error = url.searchParams.get("error");

    if (lineLogin || error) {
      setParams({
        lineLogin: lineLogin || undefined,
        userId: userId || undefined,
        token: token || undefined,
        error: error || undefined,
      });
      window.history.replaceState({}, "", "/coach-portal");
    }
  }, []);

  return params;
}

export default function CoachPortal() {
  const [coachUser, setCoachUser] = useState<CoachUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const lineParams = useLineLoginParams();

  useEffect(() => {
    const savedId = sessionStorage.getItem("coach_portal_id");
    if (savedId) {
      setSessionId(savedId);
    }
  }, []);

  useEffect(() => {
    if (lineParams.lineLogin === "existing" && lineParams.userId) {
      setSessionId(lineParams.userId);
      sessionStorage.setItem("coach_portal_id", lineParams.userId);
    }
  }, [lineParams]);

  const { data: currentUser, isLoading: userLoading } = useQuery<CoachUser>({
    queryKey: ["/api/coach-portal/me", sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error("No session");
      const res = await fetch(`/api/coach-portal/me/${sessionId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!sessionId,
    retry: false,
  });

  useEffect(() => {
    if (currentUser) {
      setCoachUser(currentUser);
    }
  }, [currentUser]);

  const handleLogout = () => {
    sessionStorage.removeItem("coach_portal_id");
    setSessionId(null);
    setCoachUser(null);
  };

  if (userLoading && sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  if (lineParams.lineLogin === "new" && lineParams.token) {
    return (
      <LineLinkNameForm
        lineToken={lineParams.token}
        onSuccess={(user) => {
          setCoachUser(user);
          setSessionId(user.id);
          sessionStorage.setItem("coach_portal_id", user.id);
        }}
      />
    );
  }

  if (new URLSearchParams(window.location.search).get("demo") === "warning") {
    return (
      <LineLinkNameForm
        lineToken="__demo__"
        demoMode={{ lineName: "少文", linePicture: "" }}
        onSuccess={() => {}}
      />
    );
  }

  if (!coachUser || !sessionId) {
    return <CoachSelectScreen onSuccess={(user) => {
      setCoachUser(user);
      setSessionId(user.id);
      sessionStorage.setItem("coach_portal_id", user.id);
    }} lineError={lineParams.error} />;
  }

  return (
    <ApprovedDashboard
      user={coachUser}
      currentWeek={currentWeek}
      setCurrentWeek={setCurrentWeek}
      onLogout={handleLogout}
    />
  );
}

function LineLinkNameForm({
  lineToken,
  onSuccess,
  demoMode,
}: {
  lineToken: string;
  onSuccess: (user: CoachUser) => void;
  demoMode?: { lineName: string; linePicture: string };
}) {
  const { toast } = useToast();
  const [inputName, setInputName] = useState("");
  const [confirming, setConfirming] = useState(false);

  const { data: tokenInfoRaw } = useQuery<{ lineName: string; linePicture: string }>({
    queryKey: ["/api/auth/line/token-info", lineToken],
    queryFn: async () => {
      const res = await fetch(`/api/auth/line/token-info/${lineToken}`);
      if (!res.ok) throw new Error("Token expired");
      return res.json();
    },
    retry: false,
    enabled: !demoMode,
  });

  const tokenInfo = demoMode ?? tokenInfoRaw;

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (demoMode) throw new Error("示範模式，無法實際連結");
      const res = await fetch("/api/coach-portal/link-by-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineToken, name: inputName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "連結失敗");
      }
      return res.json();
    },
    onSuccess: (user) => {
      toast({ title: "連結成功", description: "歡迎回來！" });
      onSuccess(user);
    },
    onError: (error: Error) => {
      setConfirming(false);
      toast({ title: "找不到教練資料", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {tokenInfo?.linePicture ? (
            <img src={tokenInfo.linePicture} alt="LINE 頭像"
              className="mx-auto w-16 h-16 rounded-full mb-4 border-2 border-green-500" />
          ) : (
            <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-white" />
            </div>
          )}
          <CardTitle className="text-xl">請輸入您的姓名</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">LINE 登入成功！請輸入您的本名以完成身分綁定</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-3 text-center text-sm text-green-700">
              <i className="fab fa-line mr-1"></i>
              您的 LINE 名稱：<strong>{tokenInfo?.lineName || "載入中..."}</strong>
            </div>

            <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-800">
              <div className="flex items-start gap-2">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <div>
                  <p className="font-bold">務必核對身分證姓名，請不要有錯字</p>
                  <p className="mt-1">若有輸入失誤，請再聯繫管理員協助更正。</p>
                  <p className="mt-1 font-medium">請使用本人的姓名（戶籍全名），否則將無法領取薪資。</p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="real-name">您的真實姓名</Label>
              <Input
                id="real-name"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="請輸入您的戶籍全名..."
                className="mt-1 text-base"
                onKeyDown={(e) => { if (e.key === "Enter" && inputName.trim().length >= 2) setConfirming(true); }}
              />
            </div>

            <Button
              className="w-full bg-green-500 hover:bg-green-600"
              onClick={() => setConfirming(true)}
              disabled={inputName.trim().length < 2}
            >
              下一步：確認姓名
            </Button>
            <p className="text-xs text-center text-gray-400">若無法登入，請聯繫管理員陳柏榮</p>
          </div>
        </CardContent>
      </Card>

      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg">確認您的姓名</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500 mb-1">您輸入的姓名是：</p>
                <p className="text-2xl font-bold text-gray-800">{inputName.trim()}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                <p>⚠️ 請仔細核對您的身分證姓名，確認無誤後再送出。若姓名有誤將無法領取薪資。</p>
              </div>
              <p className="text-sm text-center text-gray-600">這是您的本人姓名嗎？</p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirming(false)}
                  disabled={linkMutation.isPending}
                >
                  返回修改
                </Button>
                <Button
                  className="flex-1 bg-green-500 hover:bg-green-600"
                  onClick={() => linkMutation.mutate()}
                  disabled={linkMutation.isPending}
                >
                  {linkMutation.isPending ? "驗證中..." : "確認，這是我"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function CoachSelectScreen({ onSuccess, lineError }: { onSuccess: (user: CoachUser) => void; lineError?: string }) {
  const { toast } = useToast();
  const { data: lineStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/line/status"],
  });

  useEffect(() => {
    if (lineError) {
      const errorMessages: Record<string, string> = {
        line_denied: "您取消了 LINE 登入",
        no_code: "LINE 登入未完成",
        line_not_configured: "LINE 登入尚未設定",
        token_failed: "LINE 登入驗證失敗，請重試",
        profile_failed: "無法取得 LINE 資料，請重試",
        callback_failed: "LINE 登入過程發生錯誤，請重試",
      };
      toast({
        title: "LINE 登入失敗",
        description: errorMessages[lineError] || "未知錯誤，請重試",
        variant: "destructive",
      });
    }
  }, [lineError]);

  const handleLineLogin = () => {
    window.location.href = "/api/auth/line";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-xl">教練入口</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            請使用 LINE 帳號登入
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {lineStatus?.configured ? (
              <Button
                className="w-full h-12 text-base font-medium text-white"
                style={{ backgroundColor: "#06C755" }}
                onClick={handleLineLogin}
              >
                <i className="fab fa-line mr-2 text-xl"></i>
                使用 LINE 帳號註冊 / 登入
              </Button>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center text-sm text-amber-700">
                <i className="fas fa-info-circle mr-1"></i>
                LINE 登入尚未設定，請聯繫管理員
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApprovedDashboard({
  user,
  currentWeek,
  setCurrentWeek,
  onLogout,
}: {
  user: CoachUser;
  currentWeek: Date;
  setCurrentWeek: (fn: (d: Date) => Date) => void;
  onLogout: () => void;
}) {
  const coachName = user.name;
  const weekDays = getWeekDays(currentWeek);
  const startDate = format(weekDays[0], "yyyy-MM-dd");
  const endDate = format(weekDays[6], "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");

  const [availWeek, setAvailWeek] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const availWeekDays = getWeekDays(availWeek);
  const availStartDate = format(availWeekDays[0], "yyyy-MM-dd");
  const availEndDate = format(availWeekDays[6], "yyyy-MM-dd");

  const { data: mySchedules = [], isLoading } = useQuery<ScheduleWithDetails[]>({
    queryKey: ["/api/coach-portal/my-schedule", coachName, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach-portal/my-schedule?coachName=${encodeURIComponent(coachName)}&startDate=${startDate}&endDate=${endDate}`
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: venues = [] } = useQuery<Venue[]>({
    queryKey: ["/api/venues"],
  });

  const schedulesByDate = useMemo(() => {
    const map: Record<string, ScheduleWithDetails[]> = {};
    for (const s of mySchedules) {
      const d = typeof s.date === "string" ? s.date : format(new Date(s.date), "yyyy-MM-dd");
      if (!map[d]) map[d] = [];
      map[d].push(s);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.timeSlot?.order ?? 0) - (b.timeSlot?.order ?? 0));
    }
    return map;
  }, [mySchedules]);

  const todaySchedules = schedulesByDate[today] || [];

  const { data: colleagues = [] } = useQuery<{
    coachName: string;
    phone: string;
    venueName: string;
  }[]>({
    queryKey: ["/api/coach-portal/colleagues", coachName, today],
    queryFn: async () => {
      const venueIds = todaySchedules.map(s => s.venueId);
      if (!venueIds.length) return [];
      const res = await fetch(
        `/api/coach-portal/colleagues?coachName=${encodeURIComponent(coachName)}&date=${today}&venueIds=${venueIds.join(",")}`
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: todaySchedules.length > 0,
  });

  const { data: coachRules } = useQuery<{ content: string }>({
    queryKey: ["/api/settings/coach-rules"],
  });

  const { data: venueInfos = [] } = useQuery<VenueInfo[]>({
    queryKey: ["/api/venue-infos"],
    queryFn: async () => {
      const res = await fetch("/api/venue-infos");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: availability = [] } = useQuery<CoachAvailability[]>({
    queryKey: ["/api/coach-portal/availability", coachName, format(availWeek, "yyyy-MM-dd")],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach-portal/availability?coachName=${encodeURIComponent(coachName)}&weekStart=${format(availWeek, "yyyy-MM-dd")}`
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: assignedSlots = [] } = useQuery<{ dayOfWeek: number; timeSlotOrder: number }[]>({
    queryKey: ["/api/coach-portal/assigned-slots", coachName, availStartDate, availEndDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach-portal/assigned-slots?coachName=${encodeURIComponent(coachName)}&startDate=${availStartDate}&endDate=${availEndDate}`
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const assignedSet = useMemo(() => {
    const set = new Set<string>();
    assignedSlots.forEach(s => set.add(`${s.dayOfWeek}-${s.timeSlotOrder}`));
    return set;
  }, [assignedSlots]);

  const { data: venuePreferences = [] } = useQuery<string[]>({
    queryKey: ["/api/coach-portal/venue-preferences", coachName],
    queryFn: async () => {
      const res = await fetch(`/api/coach-portal/venue-preferences?coachName=${encodeURIComponent(coachName)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!coachName,
  });

  const scheduleLastModified = useMemo(() => {
    if (!mySchedules.length) return null;
    const maxTime = Math.max(...mySchedules.map(s => s.updatedAt ? new Date(s.updatedAt).getTime() : 0));
    return maxTime > 0 ? new Date(maxTime) : null;
  }, [mySchedules]);

  const { data: fillStatus } = useQuery<{ hasAvailability: boolean; hasVenuePrefs: boolean }>({
    queryKey: ["/api/coach-portal/fill-status", coachName],
    queryFn: async () => {
      const res = await fetch(`/api/coach-portal/fill-status?coachName=${encodeURIComponent(coachName)}`);
      if (!res.ok) return { hasAvailability: false, hasVenuePrefs: false };
      return res.json();
    },
    enabled: !!coachName,
  });

  const { toast } = useToast();

  const [localVenuePrefs, setLocalVenuePrefs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalVenuePrefs(new Set(venuePreferences));
  }, [venuePreferences]);

  const venuePrefDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveVenuePreferences = useCallback((newSet: Set<string>) => {
    if (venuePrefDebounceRef.current) clearTimeout(venuePrefDebounceRef.current);
    venuePrefDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/coach-portal/venue-preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coachName, venueNames: Array.from(newSet) }),
        });
        if (!res.ok) throw new Error("Failed");
        queryClient.invalidateQueries({ queryKey: ["/api/coach-portal/venue-preferences", coachName] });
      } catch {
        toast({ title: "儲存失敗，請重試", variant: "destructive" });
      }
    }, 600);
  }, [coachName, toast]);

  const toggleVenuePreference = (venueName: string) => {
    setLocalVenuePrefs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(venueName)) {
        newSet.delete(venueName);
      } else {
        newSet.add(venueName);
      }
      saveVenuePreferences(newSet);
      return newSet;
    });
  };
  const [localAvailSet, setLocalAvailSet] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const set = new Set<string>();
    availability.forEach(a => set.add(`${a.dayOfWeek}-${a.timeSlotOrder}`));
    assignedSlots.forEach(s => set.add(`${s.dayOfWeek}-${s.timeSlotOrder}`));
    setLocalAvailSet(set);
  }, [availability, assignedSlots]);

  const saveAvailability = useCallback((newSet: Set<string>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const slots: { dayOfWeek: number; timeSlotOrder: number; available: boolean }[] = [];
      for (let d = 1; d <= 7; d++) {
        for (let t = 1; t <= 7; t++) {
          slots.push({ dayOfWeek: d, timeSlotOrder: t, available: newSet.has(`${d}-${t}`) });
        }
      }
      try {
        const res = await fetch("/api/coach-portal/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coachName,
            weekStart: format(availWeek, "yyyy-MM-dd"),
            slots,
          }),
        });
        if (!res.ok) throw new Error("Failed");
        queryClient.invalidateQueries({ queryKey: ["/api/coach-portal/availability", coachName] });
        toast({ title: "可用時段已更新" });
      } catch {
        toast({ title: "儲存失敗，請重試", variant: "destructive" });
      }
    }, 600);
  }, [coachName, availWeek, toast]);

  const toggleAvailability = (dayOfWeek: number, timeSlotOrder: number) => {
    const key = `${dayOfWeek}-${timeSlotOrder}`;
    if (assignedSet.has(key)) {
      toast({ title: "此時段已被排課，無法取消", variant: "destructive" });
      return;
    }
    setLocalAvailSet(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      saveAvailability(newSet);
      return newSet;
    });
  };

  const getVenueColor = (venueId: string | number) => {
    const venue = venues.find(v => String(v.id) === String(venueId));
    return venue?.color || "blue";
  };

  const getVenueBgClass = (color: string) => {
    const map: Record<string, string> = {
      blue: "bg-blue-100 border-blue-300 text-blue-800",
      green: "bg-green-100 border-green-300 text-green-800",
      purple: "bg-purple-100 border-purple-300 text-purple-800",
      yellow: "bg-yellow-100 border-yellow-300 text-yellow-800",
      pink: "bg-pink-100 border-pink-300 text-pink-800",
      red: "bg-red-100 border-red-300 text-red-800",
      orange: "bg-orange-100 border-orange-300 text-orange-800",
      teal: "bg-teal-100 border-teal-300 text-teal-800",
    };
    return map[color] || "bg-gray-100 border-gray-300 text-gray-800";
  };

  const generateGoogleCalendarUrl = (schedule: ScheduleWithDetails) => {
    const dateStr = typeof schedule.date === "string" ? schedule.date : format(new Date(schedule.date), "yyyy-MM-dd");
    const startTime = schedule.timeSlot?.startTime || "08:00";
    const endTime = schedule.timeSlot?.endTime || "09:00";
    const [sy, sm, sd] = dateStr.split("-");
    const [sh, smin] = startTime.split(":");
    const [eh, emin] = endTime.split(":");
    const dtStart = `${sy}${sm}${sd}T${sh}${smin}00`;
    const dtEnd = `${sy}${sm}${sd}T${eh}${emin}00`;

    const title = encodeURIComponent(`${schedule.className || "游泳課"} - ${schedule.venue?.name || ""}`);
    const location = encodeURIComponent(schedule.venue?.name || "");
    const details = encodeURIComponent(`教練: ${coachName}\n場館: ${schedule.venue?.name || ""}`);

    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dtStart}/${dtEnd}&ctz=Asia/Taipei&location=${location}&details=${details}`;
  };

  const dayNames = ["一", "二", "三", "四", "五", "六", "日"];
  const periodLabels = ["第1節 08-09", "第2節 09-10", "第3節 10-11", "第4節 11-12", "第5節 13-14", "第6節 14-15", "第7節 15-16"];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-600 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-6 w-6" />
              <div>
                <h1 className="font-bold text-lg">{coachName} 教練</h1>
                <p className="text-green-100 text-xs">
                  {user.status === "approved" ? "已審核" : user.status === "pending" ? "待審核" : ""}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-green-700"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4 mr-1" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {user.status === "pending" && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="py-4 text-center">
              <p className="text-amber-700 font-medium">
                <i className="fas fa-clock mr-2"></i>
                您的帳號正在等待管理員審核，審核通過後即可使用完整功能
              </p>
            </CardContent>
          </Card>
        )}

        {/* SWIM-04: 填寫進度自我檢視 */}
        {fillStatus && (
          <div className="flex gap-2 flex-wrap">
            {!fillStatus.hasAvailability && (
              <button
                className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors"
                onClick={() => document.getElementById('availability-section')?.scrollIntoView({ behavior: 'smooth' })}
              >
                ⚠ 尚未填寫可用時段，請點此前往填寫
              </button>
            )}
            {fillStatus.hasAvailability && (
              <span className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full">
                ✓ 可用時段已填寫
              </span>
            )}
          </div>
        )}

        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                我的課表
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(w => addWeeks(w, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-32 text-center">
                  {format(weekDays[0], "M/d", { locale: zhTW })} - {format(weekDays[6], "M/d", { locale: zhTW })}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(w => addWeeks(w, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {scheduleLastModified && (
              <p className="text-xs text-gray-400 mt-1">
                課表最後更新：{format(scheduleLastModified, 'M/d HH:mm')}
              </p>
            )}
          </CardHeader>
          <CardContent className="py-2">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">載入中...</div>
            ) : mySchedules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">本週無排課</div>
            ) : (
              <div className="space-y-3">
                {weekDays.map(day => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const daySchedules = schedulesByDate[dayStr] || [];
                  if (!daySchedules.length) return null;
                  const isToday = dayStr === today;
                  return (
                    <div key={dayStr} className={`rounded-lg border p-3 ${isToday ? "border-green-400 bg-green-50" : ""}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-sm font-bold ${isToday ? "text-green-600" : ""}`}>
                          {format(day, "M/d")} ({getWeekdayName(day)})
                        </span>
                        {isToday && <Badge className="bg-green-500 text-xs">今天</Badge>}
                        <Badge variant="outline" className="text-xs">{daySchedules.length} 堂</Badge>
                      </div>
                      <div className="space-y-1.5">
                        {daySchedules.map(s => (
                          <div key={s.id} className={`flex items-center gap-2 p-2 rounded border ${getVenueBgClass(getVenueColor(s.venueId))}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium">{s.timeSlot?.startTime}-{s.timeSlot?.endTime}</span>
                                <span className="font-medium text-sm truncate">{s.className || "游泳課"}</span>
                                <Badge variant="secondary" className="text-xs">{s.venue?.name}</Badge>
                              </div>
                            </div>
                            <a
                              href={generateGoogleCalendarUrl(s)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <Calendar className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              本週統計
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex items-center gap-4 mb-3">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-center">
                <div className="text-2xl font-bold text-green-600">{mySchedules.length}</div>
                <div className="text-xs text-green-700">總堂數</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {new Set(mySchedules.map(s => s.venueId)).size}
                </div>
                <div className="text-xs text-blue-700">場館數</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {Object.keys(schedulesByDate).filter(d => (schedulesByDate[d]?.length || 0) > 0).length}
                </div>
                <div className="text-xs text-purple-700">上課天數</div>
              </div>
            </div>
            {mySchedules.length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(
                  mySchedules.reduce<Record<string, number>>((acc, s) => {
                    const name = s.venue?.name || "未知";
                    acc[name] = (acc[name] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([venueName, count]) => (
                  <div key={venueName} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
                    <span className="font-medium">{venueName}</span>
                    <Badge variant="secondary">{count} 堂</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-2">本週尚無排課</div>
            )}
          </CardContent>
        </Card>

        {todaySchedules.length > 0 && colleagues.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4" />
                今日同場館教練
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="space-y-2">
                {colleagues.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-sm">{c.coachName}</span>
                      <Badge variant="outline" className="text-xs">{c.venueName}</Badge>
                    </div>
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="text-green-600 text-sm flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}


        <Card id="availability-section">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                可用時段
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAvailWeek(w => addWeeks(w, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-32 text-center">
                  {format(availWeekDays[0], "M/d", { locale: zhTW })} - {format(availWeekDays[6], "M/d", { locale: zhTW })}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setAvailWeek(w => addWeeks(w, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-2">
            {assignedSet.size > 0 && (
              <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-500 border border-green-600"></span> 可用</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-500 border border-blue-600"></span> 已排課 (不可取消)</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs">
                <thead>
                  <tr>
                    <th className="p-1 text-muted-foreground"></th>
                    {dayNames.map((d, i) => (
                      <th key={i} className="p-1 font-medium">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodLabels.map((label, ti) => (
                    <tr key={ti}>
                      <td className="p-1 text-muted-foreground text-xs">{label}</td>
                      {dayNames.map((_, di) => {
                        const dayOfWeek = di + 1;
                        const timeSlotOrder = ti + 1;
                        const key = `${dayOfWeek}-${timeSlotOrder}`;
                        const isAvailable = localAvailSet.has(key);
                        const isAssigned = assignedSet.has(key);
                        return (
                          <td key={di} className="p-0.5">
                            <button
                              onClick={() => toggleAvailability(dayOfWeek, timeSlotOrder)}
                              disabled={isAssigned}
                              className={`w-8 h-8 rounded border transition-colors ${
                                isAssigned
                                  ? "bg-blue-500 border-blue-600 text-white cursor-not-allowed"
                                  : isAvailable
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-gray-100 border-gray-200 hover:bg-gray-200"
                              }`}
                              title={isAssigned ? "已排課，不可取消" : ""}
                            >
                              {isAssigned ? "🔒" : isAvailable ? "✓" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              教練守則
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {coachRules?.content ? (
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">{coachRules.content}</div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-2">尚未設定教練守則</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              場館資訊
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {venueInfos.length > 0 ? (
              <div className="space-y-3">
                {venueInfos.map((info, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-sm mb-1">{info.venueName}</h4>
                    {info.description && (
                      <p className="text-xs text-muted-foreground mb-2">{info.description}</p>
                    )}
                    <div className="flex gap-3 flex-wrap">
                      {info.videoUrl && (
                        <a
                          href={info.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 flex items-center gap-1"
                        >
                          <Video className="h-3 w-3" />
                          觀看場館影片
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {info.mapUrl && (
                        <a
                          href={info.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-600 flex items-center gap-1"
                        >
                          <MapPin className="h-3 w-3" />
                          Google 導航
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-2">尚未設定場館資訊</div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
