import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Check, Users, Zap, BarChart3, AlertTriangle } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import PasswordProtect from "@/components/password-protect";
import FloatingConflictAlert from "@/components/floating-conflict-alert";
import type { Venue, TimeSlot, Schedule, CoachAvailability } from "@shared/schema";
import {
  getExtendedWeekDays,
  getExtendedWeekdayNames,
  getExtendedWeekEnd,
} from "@/utils/special-workdays";

function CoachAssignmentContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedVenue, setSelectedVenue] = useState<string>("");
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: 1 });
  });
  const [selectedCell, setSelectedCell] = useState<{ date: string; timeSlotId: string; timeSlotOrder: number } | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  const { data: venues } = useQuery<Venue[]>({
    queryKey: ["/api/venues"],
  });

  const { data: timeSlots } = useQuery<TimeSlot[]>({
    queryKey: ["/api/time-slots"],
  });

  const weekStart = format(currentWeek, "yyyy-MM-dd");
  const weekEnd = format(getExtendedWeekEnd(currentWeek), "yyyy-MM-dd");

  const { data: schedules = [] } = useQuery<
    (Schedule & { venue: Venue; timeSlot: TimeSlot })[]
  >({
    queryKey: [
      `/api/schedules?startDate=${weekStart}&endDate=${weekEnd}&venueId=${selectedVenue}`,
    ],
    enabled: !!selectedVenue,
  });

  const { data: allSchedules = [] } = useQuery<
    (Schedule & { venue: Venue; timeSlot: TimeSlot })[]
  >({
    queryKey: [`/api/schedules?startDate=${weekStart}&endDate=${weekEnd}`],
  });

  const { data: coaches = [] } = useQuery<string[]>({
    queryKey: ["/api/approved-coaches"],
  });

  const { data: availability = [] } = useQuery<CoachAvailability[]>({
    queryKey: ["/api/coach-availability", weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/coach-availability?weekStart=${weekStart}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const availabilityMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of availability) {
      const key = `${a.dayOfWeek}-${a.timeSlotOrder}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(a.coachName);
    }
    return map;
  }, [availability]);

  const getAvailableCoaches = (dayOfWeek: number, timeSlotOrder: number): Set<string> => {
    return availabilityMap.get(`${dayOfWeek}-${timeSlotOrder}`) || new Set();
  };

  const getConflictingCoaches = (date: string, timeSlotId: string, currentScheduleId: string): Set<string> => {
    const conflicting = new Set<string>();
    allSchedules.forEach((s) => {
      if (s.id === currentScheduleId) return;
      if (s.date !== date || s.timeSlotId !== timeSlotId) return;
      if (s.coachName) conflicting.add(s.coachName);
      if (s.coachName2) conflicting.add(s.coachName2);
    });
    return conflicting;
  };

  const getCoach1Conflicts = (schedule: Schedule & { venue: Venue; timeSlot: TimeSlot }): Set<string> => {
    const conflicts = getConflictingCoaches(schedule.date, schedule.timeSlotId, schedule.id);
    if (schedule.coachName2) conflicts.add(schedule.coachName2);
    return conflicts;
  };

  const getCoach2Conflicts = (schedule: Schedule & { venue: Venue; timeSlot: TimeSlot }): Set<string> => {
    const conflicts = getConflictingCoaches(schedule.date, schedule.timeSlotId, schedule.id);
    if (schedule.coachName) conflicts.add(schedule.coachName);
    return conflicts;
  };

  const getAssignedCoachesForSlot = (date: string, timeSlotId: string): Set<string> => {
    const assigned = new Set<string>();
    allSchedules.forEach((s) => {
      if (s.date !== date || s.timeSlotId !== timeSlotId) return;
      if (s.coachName) assigned.add(s.coachName);
      if (s.coachName2) assigned.add(s.coachName2);
    });
    return assigned;
  };

  const assignCoachMutation = useMutation({
    mutationFn: async ({
      scheduleId,
      coachName,
      coachName2,
    }: {
      scheduleId: string;
      coachName?: string;
      coachName2?: string;
    }) => {
      const adminPassword = sessionStorage.getItem("admin-password") || "";
      const body: any = {};
      if (coachName !== undefined) body.coachName = coachName;
      if (coachName2 !== undefined) body.coachName2 = coachName2;
      const res = await fetch(`/api/schedules/${scheduleId}/assign-coach`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          (query.queryKey[0].includes("/api/schedules") || query.queryKey[0].includes("/api/conflicts")),
      });
      toast({ title: "指派成功", description: "教練已更新" });
    },
    onError: (error) => {
      toast({
        title: "指派失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (venues && venues.length > 0 && !selectedVenue) {
      setSelectedVenue(venues[0].id);
    }
  }, [venues, selectedVenue]);

  const schedulesByDateAndTime: Record<
    string,
    Record<string, (Schedule & { venue: Venue; timeSlot: TimeSlot })[]>
  > = {};

  schedules.forEach((schedule) => {
    if (schedule.venue.id === selectedVenue) {
      if (!schedulesByDateAndTime[schedule.date]) {
        schedulesByDateAndTime[schedule.date] = {};
      }
      if (!schedulesByDateAndTime[schedule.date][schedule.timeSlotId]) {
        schedulesByDateAndTime[schedule.date][schedule.timeSlotId] = [];
      }
      schedulesByDateAndTime[schedule.date][schedule.timeSlotId].push(schedule);
    }
  });

  const weeklyStats = useMemo(() => {
    const stats: Record<string, { assigned: number; available: number }> = {};
    for (const coach of coaches) {
      stats[coach] = { assigned: 0, available: 0 };
    }
    for (const a of availability) {
      if (stats[a.coachName]) {
        stats[a.coachName].available++;
      }
    }
    for (const s of allSchedules) {
      if (s.coachName && stats[s.coachName]) stats[s.coachName].assigned++;
      if (s.coachName2 && stats[s.coachName2]) stats[s.coachName2].assigned++;
    }
    return stats;
  }, [coaches, availability, allSchedules]);

  const missingCoachCount = useMemo(() => {
    let missing = 0;
    for (const s of schedules) {
      if (!s.className) continue;
      if (s.venue.id !== selectedVenue) continue;
      if (!s.coachName) missing++;
      if ((s.coachCount || 1) >= 2 && !s.coachName2) missing++;
    }
    return missing;
  }, [schedules, selectedVenue]);

  const handleAutoFill = () => {
    const unfilled = schedules.filter(s =>
      s.className && s.venue.id === selectedVenue && (!s.coachName || ((s.coachCount || 1) >= 2 && !s.coachName2))
    );
    let filled = 0;
    const localCounts: Record<string, number> = {};
    for (const coach of coaches) {
      localCounts[coach] = weeklyStats[coach]?.assigned || 0;
    }

    for (const schedule of unfilled) {
      const date = new Date(schedule.date);
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      const timeSlotOrder = schedule.timeSlot?.order || 0;
      const available = getAvailableCoaches(dayOfWeek, timeSlotOrder);
      const conflicting = getConflictingCoaches(schedule.date, schedule.timeSlotId, schedule.id);
      const candidates = Array.from(available).filter(c => !conflicting.has(c));

      let assignedCoach1 = schedule.coachName || "";

      if (!schedule.coachName && candidates.length > 0) {
        const best = candidates.sort((a, b) => (localCounts[a] || 0) - (localCounts[b] || 0))[0];
        assignCoachMutation.mutate({ scheduleId: schedule.id, coachName: best });
        localCounts[best] = (localCounts[best] || 0) + 1;
        assignedCoach1 = best;
        filled++;
      }
      if ((schedule.coachCount || 1) >= 2 && !schedule.coachName2) {
        const candidates2 = candidates.filter(c => c !== assignedCoach1);
        if (candidates2.length > 0) {
          const best2 = candidates2.sort((a, b) => (localCounts[a] || 0) - (localCounts[b] || 0))[0];
          assignCoachMutation.mutate({ scheduleId: schedule.id, coachName2: best2 });
          localCounts[best2] = (localCounts[best2] || 0) + 1;
          filled++;
        }
      }
    }
    if (filled === 0) {
      toast({ title: "無可用教練", description: "沒有符合條件的教練可自動指派", variant: "destructive" });
    } else {
      toast({ title: "自動指派完成", description: `已嘗試指派 ${filled} 個教練` });
    }
  };

  const selectedVenueData = venues?.find((v) => v.id === selectedVenue);

  if (!venues || !timeSlots) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  const sidebarAvailableCoaches = selectedCell
    ? (() => {
        const available = getAvailableCoaches(
          (() => {
            const d = new Date(selectedCell.date);
            return d.getDay() === 0 ? 7 : d.getDay();
          })(),
          selectedCell.timeSlotOrder
        );
        const assigned = getAssignedCoachesForSlot(selectedCell.date, selectedCell.timeSlotId);
        const conflicting = new Set<string>();
        allSchedules.forEach(s => {
          if (s.date !== selectedCell.date || s.timeSlotId !== selectedCell.timeSlotId) return;
          if (s.coachName) conflicting.add(s.coachName);
          if (s.coachName2) conflicting.add(s.coachName2);
        });
        return {
          available: Array.from(available).filter(c => !assigned.has(c)),
          assigned: Array.from(assigned),
          conflicting: conflicting,
          total: available.size,
        };
      })()
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center h-auto sm:h-16 py-4 gap-4">
            <div className="flex items-center space-x-4">
              <i className="fas fa-swimming-pool text-primary text-xl sm:text-2xl"></i>
              <h1 className="text-lg sm:text-xl font-bold text-primary">
                五泳池課表整合系統
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm bg-blue-500 text-white px-3 py-1 rounded-full">
                教練指派
              </span>
              {user && (
                <>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      <i className="fas fa-user text-primary-foreground text-sm"></i>
                    </div>
                    <span className="text-sm font-medium">
                      {user.firstName || user.email}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (window.location.href = "/api/logout")}
                  >
                    登出
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <nav
            className="flex flex-wrap gap-2 sm:space-x-8 sm:gap-0"
            aria-label="Tabs"
          >
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/coach")}
            >
              <i className="fas fa-user-clock mr-1 sm:mr-2"></i>教練視圖
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/venue-schedule")}
            >
              <i className="fas fa-building mr-1 sm:mr-2"></i>場館課表顯示
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/venue-schedule-edit")}
            >
              <i className="fas fa-edit mr-1 sm:mr-2"></i>學校課表編輯 (第一階段)
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-primary text-primary font-medium text-xs sm:text-sm rounded-t sm:rounded-none bg-accent sm:bg-transparent"
            >
              <i className="fas fa-user-plus mr-1 sm:mr-2"></i>教練指派 (第二階段)
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/statistics")}
            >
              <i className="fas fa-chart-bar mr-1 sm:mr-2"></i>堂數統計
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/coach-approval")}
            >
              <i className="fas fa-user-check mr-1 sm:mr-2"></i>教練審核
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-green-600 hover:text-green-700 hover:border-green-400 font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-green-50 sm:hover:bg-transparent"
              onClick={() => setLocation("/coach-portal")}
            >
              <i className="fas fa-door-open mr-1 sm:mr-2"></i>教練前台
            </button>
          </nav>
        </div>

        <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium whitespace-nowrap">選擇場館：</label>
            <Select value={selectedVenue} onValueChange={setSelectedVenue}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="請選擇場館" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((venue) => (
                  <SelectItem key={venue.id} value={venue.id}>
                    {venue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 w-full lg:w-auto">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek((prev) => subWeeks(prev, 1))}
              className="h-8 w-8 sm:h-10 sm:w-10"
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>

            <div className="text-sm sm:text-base font-semibold text-center flex-1 lg:flex-none whitespace-nowrap">
              {format(currentWeek, "yyyy年MM月dd日", { locale: zhTW })} - {format(addDays(currentWeek, 4), "MM月dd日", { locale: zhTW })}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek((prev) => addWeeks(prev, 1))}
              className="h-8 w-8 sm:h-10 sm:w-10"
            >
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
              className="text-xs sm:text-sm px-3 sm:px-4"
            >
              本週
            </Button>
          </div>
        </div>

        {missingCoachCount > 0 && (
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-700">
                尚有 <strong>{missingCoachCount}</strong> 個教練缺口未指派
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-purple-300 text-purple-600 hover:bg-purple-50"
              onClick={handleAutoFill}
              disabled={assignCoachMutation.isPending}
            >
              <Zap className="h-3 w-3 mr-1" />
              自動指派
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              <Users className="h-3 w-3 mr-1" />
              {showSidebar ? "隱藏側欄" : "顯示側欄"}
            </Button>
          </div>
        )}

        <div className={`flex gap-4 ${showSidebar ? "" : ""}`}>
          <div className="flex-1 min-w-0">
            {selectedVenueData && (
              <Card>
                <CardHeader>
                  <CardTitle
                    className={`text-center text-lg venue-${selectedVenueData.color}`}
                    style={{
                      backgroundColor: `var(--venue-${selectedVenueData.color})`,
                      color: "white",
                      padding: "8px",
                      borderRadius: "6px",
                    }}
                  >
                    {selectedVenueData.name} - 教練指派
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto mobile-table-container">
                    <table className="w-full border-collapse min-w-[600px]">
                      <thead>
                        <tr>
                          <th className="border border-gray-300 p-2 bg-gray-50 w-20 sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                            節次/時間
                          </th>
                          {getExtendedWeekDays(currentWeek).map((date, index) => {
                            const weekDayNames =
                              getExtendedWeekdayNames(currentWeek);
                            return (
                              <th
                                key={index}
                                className="border border-gray-300 p-2 bg-gray-50 min-w-32"
                              >
                                <div className="text-center">
                                  <div className="font-semibold">
                                    {weekDayNames[index]}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    {format(date, "MM/dd")}
                                  </div>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {timeSlots.map((timeSlot) => (
                          <tr key={timeSlot.id}>
                            <td className="border border-gray-300 p-2 bg-gray-50 text-center sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                              <div className="font-medium">{timeSlot.period}</div>
                              <div className="text-xs text-gray-600">
                                {timeSlot.startTime}-{timeSlot.endTime}
                              </div>
                            </td>
                            {getExtendedWeekDays(currentWeek).map((date, index) => {
                              const dateStr = format(date, "yyyy-MM-dd");
                              const daySchedules =
                                schedulesByDateAndTime[dateStr]?.[timeSlot.id] ||
                                [];
                              const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
                              const isSelected = selectedCell?.date === dateStr && selectedCell?.timeSlotId === timeSlot.id;

                              return (
                                <td
                                  key={`${timeSlot.id}-${index}`}
                                  className={`border border-gray-300 p-1 align-top cursor-pointer transition-colors ${isSelected ? "ring-2 ring-blue-400 bg-blue-50/30" : ""}`}
                                  style={{
                                    minHeight: "80px",
                                    verticalAlign: "top",
                                  }}
                                  onClick={() => setSelectedCell({ date: dateStr, timeSlotId: timeSlot.id, timeSlotOrder: timeSlot.order })}
                                >
                                  <div className="space-y-1 min-h-[80px]">
                                    {daySchedules.map((schedule) => {
                                      if (!schedule.className) return null;
                                      const hasCoach = !!schedule.coachName;
                                      const hasCoach2 = !!schedule.coachName2;
                                      const needsTwo = (schedule.coachCount || 1) >= 2;
                                      const coach1Conflicts = getCoach1Conflicts(schedule);
                                      const coach2Conflicts = getCoach2Conflicts(schedule);
                                      const available = getAvailableCoaches(dayOfWeek, timeSlot.order);

                                      const isMissing = !hasCoach || (needsTwo && !hasCoach2);
                                      const missingBg = isMissing
                                        ? (!hasCoach ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200")
                                        : "";

                                      return (
                                        <div
                                          key={schedule.id}
                                          className={`rounded p-1.5 space-y-1 ${missingBg}`}
                                        >
                                          <div className="bg-gray-700 text-white text-xs font-bold px-2 py-1 rounded text-center truncate flex items-center justify-center gap-1">
                                            {schedule.className}
                                            {needsTwo && <span className="text-[9px] opacity-75">(2位)</span>}
                                          </div>
                                          <div className="relative">
                                            <Select
                                              value={schedule.coachName || ""}
                                              onValueChange={(value) => {
                                                assignCoachMutation.mutate({
                                                  scheduleId: schedule.id,
                                                  coachName: value === "__clear__" ? "" : value,
                                                });
                                              }}
                                            >
                                              <SelectTrigger
                                                className={`h-7 text-xs ${
                                                  hasCoach
                                                    ? "border-green-400 bg-green-50"
                                                    : "border-red-400 bg-red-50"
                                                }`}
                                              >
                                                <div className="flex items-center gap-1 w-full">
                                                  {hasCoach && (
                                                    <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                                                  )}
                                                  <SelectValue placeholder="教練1" />
                                                </div>
                                              </SelectTrigger>
                                              <SelectContent>
                                                {hasCoach && (
                                                  <SelectItem value="__clear__">
                                                    <span className="text-gray-400">清除教練</span>
                                                  </SelectItem>
                                                )}
                                                {available.size > 0 && (
                                                  <div className="px-2 py-1 text-[10px] text-green-600 font-medium border-b">✅ 可用教練</div>
                                                )}
                                                {coaches.filter(c => available.has(c)).map((coach) => {
                                                  const isConflict = coach1Conflicts.has(coach);
                                                  return (
                                                    <SelectItem
                                                      key={coach}
                                                      value={coach}
                                                      disabled={isConflict}
                                                      className={isConflict ? "opacity-40 line-through" : ""}
                                                    >
                                                      ✅ {coach}{isConflict ? " (衝突)" : ""}
                                                    </SelectItem>
                                                  );
                                                })}
                                                {coaches.filter(c => !available.has(c)).length > 0 && (
                                                  <div className="px-2 py-1 text-[10px] text-gray-400 font-medium border-b border-t">其他教練</div>
                                                )}
                                                {coaches.filter(c => !available.has(c)).map((coach) => {
                                                  const isConflict = coach1Conflicts.has(coach);
                                                  return (
                                                    <SelectItem
                                                      key={coach}
                                                      value={coach}
                                                      disabled={isConflict}
                                                      className={isConflict ? "opacity-40 line-through" : "text-gray-500"}
                                                    >
                                                      {coach}{isConflict ? " (衝突)" : ""}
                                                    </SelectItem>
                                                  );
                                                })}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          {needsTwo && (
                                            <div className="relative">
                                              <Select
                                                value={schedule.coachName2 || ""}
                                                onValueChange={(value) => {
                                                  assignCoachMutation.mutate({
                                                    scheduleId: schedule.id,
                                                    coachName2: value === "__clear__" ? "" : value,
                                                  });
                                                }}
                                              >
                                                <SelectTrigger
                                                  className={`h-7 text-xs ${
                                                    hasCoach2
                                                      ? "border-blue-400 bg-blue-50"
                                                      : "border-amber-400 bg-amber-50"
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-1 w-full">
                                                    {hasCoach2 && (
                                                      <Check className="h-3 w-3 text-blue-600 flex-shrink-0" />
                                                    )}
                                                    <SelectValue placeholder="教練2" />
                                                  </div>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {hasCoach2 && (
                                                    <SelectItem value="__clear__">
                                                      <span className="text-gray-400">清除教練</span>
                                                    </SelectItem>
                                                  )}
                                                  {available.size > 0 && (
                                                    <div className="px-2 py-1 text-[10px] text-green-600 font-medium border-b">✅ 可用教練</div>
                                                  )}
                                                  {coaches.filter(c => available.has(c)).map((coach) => {
                                                    const isConflict = coach2Conflicts.has(coach);
                                                    return (
                                                      <SelectItem
                                                        key={coach}
                                                        value={coach}
                                                        disabled={isConflict}
                                                        className={isConflict ? "opacity-40 line-through" : ""}
                                                      >
                                                        ✅ {coach}{isConflict ? " (衝突)" : ""}
                                                      </SelectItem>
                                                    );
                                                  })}
                                                  {coaches.filter(c => !available.has(c)).length > 0 && (
                                                    <div className="px-2 py-1 text-[10px] text-gray-400 font-medium border-b border-t">其他教練</div>
                                                  )}
                                                  {coaches.filter(c => !available.has(c)).map((coach) => {
                                                    const isConflict = coach2Conflicts.has(coach);
                                                    return (
                                                      <SelectItem
                                                        key={coach}
                                                        value={coach}
                                                        disabled={isConflict}
                                                        className={isConflict ? "opacity-40 line-through" : "text-gray-500"}
                                                      >
                                                        {coach}{isConflict ? " (衝突)" : ""}
                                                      </SelectItem>
                                                    );
                                                  })}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
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
            )}
          </div>

          {showSidebar && (
            <div className="hidden lg:block w-64 flex-shrink-0 space-y-4">
              {selectedCell && sidebarAvailableCoaches && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      可用教練
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedCell.date.slice(5)} 第{selectedCell.timeSlotOrder}節
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sidebarAvailableCoaches.available.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-[10px] text-green-600 font-medium">可指派 ({sidebarAvailableCoaches.available.length})</div>
                        {sidebarAvailableCoaches.available.map(c => (
                          <div key={c} className="text-xs bg-green-50 border border-green-200 rounded px-2 py-1 flex items-center gap-1">
                            <Check className="h-3 w-3 text-green-500" />
                            {c}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {weeklyStats[c]?.assigned || 0}堂
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">此時段無可用教練</p>
                    )}
                    {sidebarAvailableCoaches.assigned.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-blue-600 font-medium">已指派 ({sidebarAvailableCoaches.assigned.length})</div>
                        {sidebarAvailableCoaches.assigned.map(c => (
                          <div key={c} className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1">{c}</div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    本週統計
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {coaches.map(coach => {
                      const stats = weeklyStats[coach];
                      if (!stats) return null;
                      return (
                        <div key={coach} className="flex items-center justify-between text-xs py-0.5">
                          <span className="truncate mr-2">{coach}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Badge variant="outline" className="text-[10px] h-5 px-1">
                              {stats.assigned}/{stats.available}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                    指派數 / 可用時段數
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      <FloatingConflictAlert weekStart={currentWeek} />
    </div>
  );
}

export default function CoachAssignment() {
  return (
    <PasswordProtect>
      <CoachAssignmentContent />
    </PasswordProtect>
  );
}
