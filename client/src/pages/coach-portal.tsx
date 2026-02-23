import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addWeeks, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Phone, User, Clock, MapPin, LogOut, BookOpen, Video, Calendar } from "lucide-react";
import type { CoachUser, Schedule, Venue, TimeSlot, VenueInfo } from "@shared/schema";

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
    return <CoachSelectScreen onSuccess={(user) => {
      setCoachUser(user);
      setSessionId(user.id);
      sessionStorage.setItem("coach_portal_id", user.id);
    }} />;
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

function CoachSelectScreen({ onSuccess }: { onSuccess: (user: CoachUser) => void }) {
  const { data: approvedCoaches = [], isLoading } = useQuery<CoachUser[]>({
    queryKey: ["/api/coach-portal/approved-coaches"],
    queryFn: async () => {
      const res = await fetch("/api/coach-portal/approved-coaches");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-xl">教練入口</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            請選擇您的姓名以查看個人課表
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">載入中...</div>
          ) : approvedCoaches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              目前尚無已審核通過的教練帳號
            </div>
          ) : (
            <div className="space-y-2">
              {approvedCoaches.map((coach) => (
                <Button
                  key={coach.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3 px-4 hover:bg-green-50 hover:border-green-300"
                  onClick={() => onSuccess(coach)}
                >
                  <User className="h-4 w-4 mr-3 text-green-500 shrink-0" />
                  <span className="font-medium">{coach.name}</span>
                </Button>
              ))}
            </div>
          )}
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

        <CoachRulesCard />

        <VenueInfoCard />

        <GoogleCalendarCard schedules={mySchedules} coachName={coachName} />
      </main>
    </div>
  );
}

function CoachRulesCard() {
  const { data } = useQuery<{ content: string }>({
    queryKey: ["/api/settings/coach-rules"],
    queryFn: async () => {
      const res = await fetch("/api/settings/coach-rules");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          教練守則
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data?.content ? (
          <div className="text-sm whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900">
            {data.content}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">尚未設定教練守則</p>
        )}
      </CardContent>
    </Card>
  );
}

function VenueInfoCard() {
  const { data: venueInfos = [] } = useQuery<VenueInfo[]>({
    queryKey: ["/api/venue-infos"],
    queryFn: async () => {
      const res = await fetch("/api/venue-infos");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: venues = [] } = useQuery<Venue[]>({
    queryKey: ["/api/venues"],
  });

  const infosWithData = venueInfos.filter((v) => v.videoUrl || v.description);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4" />
          場館資訊
        </CardTitle>
      </CardHeader>
      <CardContent>
        {infosWithData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">尚未設定場館資訊</p>
        ) : (
        <div className="space-y-3">
          {infosWithData.map((info) => {
            const venue = venues.find((v) => v.name === info.venueName);
            return (
              <div key={info.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: venue ? `var(--venue-${venue.color})` : '#666' }}
                  />
                  <span className="font-medium text-sm">{info.venueName}</span>
                </div>
                {info.description && (
                  <p className="text-sm text-muted-foreground mb-2">{info.description}</p>
                )}
                {info.videoUrl && (
                  <a
                    href={info.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    <Video className="h-3 w-3" />
                    觀看場館影片
                  </a>
                )}
              </div>
            );
          })}
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleCalendarCard({
  schedules: mySchedules,
  coachName,
}: {
  schedules: ScheduleWithDetails[];
  coachName: string;
}) {
  const generateGoogleCalendarUrl = (schedule: ScheduleWithDetails) => {
    const dateStr = typeof schedule.date === "string"
      ? schedule.date
      : format(new Date(schedule.date), "yyyy-MM-dd");
    const startTime = schedule.timeSlot?.startTime?.replace(":", "") + "00";
    const endTime = schedule.timeSlot?.endTime?.replace(":", "") + "00";
    const dateFormatted = dateStr.replace(/-/g, "");

    const title = encodeURIComponent(`${schedule.venue?.name} - ${schedule.className || "游泳課"}`);
    const location = encodeURIComponent(schedule.venue?.name || "");
    const details = encodeURIComponent(`教練：${coachName}\n節次：${schedule.timeSlot?.period}\n時間：${schedule.timeSlot?.startTime}-${schedule.timeSlot?.endTime}`);

    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateFormatted}T${startTime}/${dateFormatted}T${endTime}&location=${location}&details=${details}`;
  };

  const exportAllToICS = () => {
    let icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SwimCoach//Schedule//TW\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n`;

    for (const schedule of mySchedules) {
      const dateStr = typeof schedule.date === "string"
        ? schedule.date
        : format(new Date(schedule.date), "yyyy-MM-dd");
      const startTime = schedule.timeSlot?.startTime?.replace(":", "") + "00";
      const endTime = schedule.timeSlot?.endTime?.replace(":", "") + "00";
      const dateFormatted = dateStr.replace(/-/g, "");

      icsContent += `BEGIN:VEVENT\n`;
      icsContent += `DTSTART:${dateFormatted}T${startTime}\n`;
      icsContent += `DTEND:${dateFormatted}T${endTime}\n`;
      icsContent += `SUMMARY:${schedule.venue?.name} - ${schedule.className || "游泳課"}\n`;
      icsContent += `LOCATION:${schedule.venue?.name || ""}\n`;
      icsContent += `DESCRIPTION:教練：${coachName}\\n節次：${schedule.timeSlot?.period}\\n時間：${schedule.timeSlot?.startTime}-${schedule.timeSlot?.endTime}\n`;
      icsContent += `END:VEVENT\n`;
    }

    icsContent += `END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${coachName}_課表.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          匯入 Google 日曆
        </CardTitle>
      </CardHeader>
      <CardContent>
        {mySchedules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">本週無課程，無法匯出日曆</p>
        ) : (
        <div className="space-y-3">
          <Button
            onClick={exportAllToICS}
            className="w-full bg-blue-500 hover:bg-blue-600"
          >
            <Calendar className="h-4 w-4 mr-2" />
            下載本週全部課表 (.ics)
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            下載 .ics 檔後可匯入 Google 日曆、Apple 日曆等
          </p>
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">或逐堂加入 Google 日曆：</p>
            <div className="space-y-1">
              {mySchedules.map((s) => {
                const dateStr = typeof s.date === "string"
                  ? s.date
                  : format(new Date(s.date), "yyyy-MM-dd");
                return (
                  <a
                    key={s.id}
                    href={generateGoogleCalendarUrl(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-blue-50 rounded px-3 py-2 transition-colors"
                  >
                    <Calendar className="h-3 w-3 text-blue-500 shrink-0" />
                    <span className="text-muted-foreground w-16 shrink-0">{dateStr.slice(5)}</span>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: `var(--venue-${s.venue?.color})` }}
                    />
                    <span className="font-medium">{s.venue?.name}</span>
                    <span className="text-muted-foreground">{s.timeSlot?.startTime}-{s.timeSlot?.endTime}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </CardContent>
    </Card>
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
