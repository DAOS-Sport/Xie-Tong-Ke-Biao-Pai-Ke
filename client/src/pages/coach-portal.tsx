import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, startOfWeek, addWeeks, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Phone, User, Clock, MapPin, LogOut } from "lucide-react";
import type { CoachUser, Schedule, Venue, TimeSlot } from "@shared/schema";

type ScheduleWithDetails = Schedule & { venue: Venue; timeSlot: TimeSlot };

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function getWeekdayName(date: Date): string {
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  return `週${names[date.getDay()]}`;
}

export default function CoachPortal() {
  const [coachUser, setCoachUser] = useState<CoachUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  useEffect(() => {
    const savedId = sessionStorage.getItem("coach_portal_id");
    if (savedId) {
      setSessionId(savedId);
    }
  }, []);

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

  if (!coachUser || !sessionId) {
    return <RegistrationForm onSuccess={(user) => {
      setCoachUser(user);
      setSessionId(user.id);
      sessionStorage.setItem("coach_portal_id", user.id);
    }} />;
  }

  if (coachUser.status === "pending") {
    return <PendingApproval user={coachUser} onLogout={handleLogout} />;
  }

  if (coachUser.status === "rejected") {
    return <RejectedNotice user={coachUser} onLogout={handleLogout} />;
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

function RegistrationForm({ onSuccess }: { onSuccess: (user: CoachUser) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach-portal/register", {
        lineId: `line_${Date.now()}`,
        name,
        phone,
        email,
      });
      return res.json();
    },
    onSuccess: (user: CoachUser) => {
      onSuccess(user);
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-xl">教練註冊</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            請填寫您的基本資料以進行身份審核
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              registerMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">姓名 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="請輸入您的姓名"
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">聯絡電話</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="請輸入聯絡電話"
                type="tel"
              />
            </div>
            <div>
              <Label htmlFor="email">電子信箱</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="請輸入電子信箱"
                type="email"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-green-500 hover:bg-green-600"
              disabled={!name || registerMutation.isPending}
            >
              {registerMutation.isPending ? "提交中..." : "提交註冊"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PendingApproval({ user, onLogout }: { user: CoachUser; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-xl">資料審核中</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            您好，{user.name}！您的教練資料已提交，目前正在等待管理員審核。
          </p>
          <p className="text-sm text-muted-foreground">
            審核通過後，您即可查看個人專屬課表。
          </p>
          <Badge variant="outline" className="text-yellow-600 border-yellow-400">
            待審核
          </Badge>
          <div className="pt-4">
            <Button variant="outline" onClick={onLogout} size="sm">
              <LogOut className="h-4 w-4 mr-1" />
              登出
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RejectedNotice({ user, onLogout }: { user: CoachUser; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-xl text-red-600">審核未通過</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            您好，{user.name}。很抱歉，您的教練資料審核未通過。
          </p>
          <p className="text-sm text-muted-foreground">
            如有疑問，請聯繫管理員。
          </p>
          <div className="pt-4">
            <Button variant="outline" onClick={onLogout} size="sm">
              <LogOut className="h-4 w-4 mr-1" />
              登出
            </Button>
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
  const coachName = user.linkedCoachName || user.name;
  const weekDays = getWeekDays(currentWeek);
  const startDate = format(weekDays[0], "yyyy-MM-dd");
  const endDate = format(weekDays[6], "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");

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
      map[key].sort((a, b) => (a.timeSlot?.order || 0) - (b.timeSlot?.order || 0));
    }
    return map;
  }, [mySchedules]);

  const todaySchedules = schedulesByDate[today] || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm">{user.name}</div>
            <div className="text-xs text-muted-foreground">教練</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* 今日課表摘要 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              今日課表 - {format(new Date(), "MM/dd (EEEE)", { locale: zhTW })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaySchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">今日無課程安排</p>
            ) : (
              <div className="space-y-2">
                {todaySchedules.map((s) => (
                  <TodayScheduleCard key={s.id} schedule={s} coachName={coachName} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 週課表 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">個人週課表</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentWeek((prev) => addWeeks(prev, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[120px] text-center">
                  {format(weekDays[0], "MM/dd")} - {format(weekDays[6], "MM/dd")}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentWeek((prev) => addWeeks(prev, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() =>
                    setCurrentWeek(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
                  }
                >
                  本週
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">載入中...</div>
            ) : (
              <div className="space-y-1">
                {weekDays.map((date) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const daySchedules = schedulesByDate[dateStr] || [];
                  const isToday = dateStr === today;
                  return (
                    <div
                      key={dateStr}
                      className={`rounded-lg p-3 ${
                        isToday ? "bg-green-50 border border-green-200" : "bg-white border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold ${isToday ? "text-green-700" : ""}`}>
                          {format(date, "MM/dd")} ({getWeekdayName(date)})
                          {isToday && (
                            <Badge className="ml-2 bg-green-500 text-xs">今天</Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {daySchedules.length} 堂課
                        </span>
                      </div>
                      {daySchedules.length === 0 ? (
                        <p className="text-xs text-muted-foreground">無課程</p>
                      ) : (
                        <div className="space-y-1">
                          {daySchedules.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1"
                            >
                              <span className="text-muted-foreground w-20 shrink-0">
                                {s.timeSlot?.period} {s.timeSlot?.startTime}-{s.timeSlot?.endTime}
                              </span>
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: `var(--venue-${s.venue?.color})`,
                                }}
                              ></span>
                              <span className="font-medium">{s.venue?.name}</span>
                              {s.className && (
                                <span className="text-muted-foreground">| {s.className}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function TodayScheduleCard({
  schedule,
  coachName,
}: {
  schedule: ScheduleWithDetails;
  coachName: string;
}) {
  const dateStr = typeof schedule.date === "string"
    ? schedule.date
    : format(new Date(schedule.date), "yyyy-MM-dd");

  const { data: colleagues = [] } = useQuery<{ name: string; phone: string | null }[]>({
    queryKey: [
      "/api/coach-portal/colleagues",
      coachName,
      dateStr,
      schedule.venueId,
      schedule.timeSlotId,
    ],
    queryFn: async () => {
      const res = await fetch(
        `/api/coach-portal/colleagues?coachName=${encodeURIComponent(coachName)}&date=${dateStr}&venueId=${schedule.venueId}&timeSlotId=${schedule.timeSlotId}`
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: `var(--venue-${schedule.venue?.color})` }}
        />
        <span className="font-medium text-sm">{schedule.venue?.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {schedule.timeSlot?.period} | {schedule.timeSlot?.startTime}-{schedule.timeSlot?.endTime}
        </span>
      </div>
      {schedule.className && (
        <div className="text-xs text-muted-foreground mb-2">班級：{schedule.className}</div>
      )}
      {colleagues.length > 0 && (
        <div className="border-t pt-2 mt-2">
          <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            同場教練
          </div>
          <div className="space-y-1">
            {colleagues.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span>{c.name}</span>
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="flex items-center gap-1 text-green-600 hover:text-green-700"
                  >
                    <Phone className="h-3 w-3" />
                    {c.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
