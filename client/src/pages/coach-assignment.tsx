import { useState, useEffect } from "react";
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
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import PasswordProtect from "@/components/password-protect";
import FloatingConflictAlert from "@/components/floating-conflict-alert";
import type { Venue, TimeSlot, Schedule } from "@shared/schema";
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

  const { data: lockStatusData } = useQuery<{ isLocked: boolean }>({
    queryKey: ["lock-status", selectedVenue, weekStart, weekEnd],
    queryFn: async () => {
      const res = await fetch(
        `/api/schedules/lock-status?venueId=${selectedVenue}&startDate=${weekStart}&endDate=${weekEnd}`,
      );
      if (!res.ok) return { isLocked: false };
      return res.json();
    },
    enabled: !!selectedVenue,
  });

  const isLocked = lockStatusData?.isLocked ?? false;

  const { data: coaches = [] } = useQuery<string[]>({
    queryKey: ["/api/unique-coaches"],
  });

  const assignCoachMutation = useMutation({
    mutationFn: async ({
      scheduleId,
      coachName,
    }: {
      scheduleId: string;
      coachName: string;
    }) => {
      const adminPassword = sessionStorage.getItem("admin-password") || "";
      const res = await fetch(`/api/schedules/${scheduleId}/assign-coach`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ coachName }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/schedules?startDate=${weekStart}&endDate=${weekEnd}&venueId=${selectedVenue}`,
        ],
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].includes("/api/schedules"),
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].includes("/api/conflicts"),
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

  const selectedVenueData = venues?.find((v) => v.id === selectedVenue);

  if (!venues || !timeSlots) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

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
              onClick={() => setLocation("/admin/schedule")}
            >
              <i className="fas fa-calendar-alt mr-1 sm:mr-2"></i>課表編輯
            </button>
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
              onClick={() => setLocation("/find-coach")}
            >
              <i className="fas fa-search mr-1 sm:mr-2"></i>尋找教練
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

        {selectedVenue && !isLocked && (
          <Card className="mb-6 border-orange-300 bg-orange-50">
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <i className="fas fa-lock text-orange-500 text-3xl"></i>
                <p className="text-orange-700 font-medium">
                  此場館本週課表尚未鎖定，請先至「學校課表編輯」完成第一階段並鎖定課表。
                </p>
                <Button
                  variant="outline"
                  className="border-orange-500 text-orange-600 hover:bg-orange-100"
                  onClick={() => setLocation("/venue-schedule-edit")}
                >
                  <i className="fas fa-edit mr-2"></i>前往學校課表編輯
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedVenueData && isLocked && (
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
                <span className="ml-2 inline-block bg-yellow-400 text-yellow-900 text-xs px-2 py-0.5 rounded">
                  已鎖定
                </span>
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

                          return (
                            <td
                              key={`${timeSlot.id}-${index}`}
                              className="border border-gray-300 p-1 align-top"
                              style={{
                                minHeight: "80px",
                                verticalAlign: "top",
                              }}
                            >
                              <div className="space-y-1 min-h-[80px]">
                                {daySchedules.map((schedule) => {
                                  if (!schedule.className) return null;
                                  const hasCoach = !!schedule.coachName;
                                  return (
                                    <div
                                      key={schedule.id}
                                      className="rounded p-1.5 space-y-1"
                                    >
                                      <div className="bg-gray-700 text-white text-xs font-bold px-2 py-1 rounded text-center truncate">
                                        {schedule.className}
                                      </div>
                                      <div className="relative">
                                        <Select
                                          value={schedule.coachName || "__none__"}
                                          onValueChange={(value) => {
                                            assignCoachMutation.mutate({
                                              scheduleId: schedule.id,
                                              coachName: value === "__none__" ? "" : value,
                                            });
                                          }}
                                        >
                                          <SelectTrigger
                                            className={`h-7 text-xs ${
                                              hasCoach
                                                ? "border-green-400 bg-green-50"
                                                : "border-orange-400 bg-orange-50"
                                            }`}
                                          >
                                            <div className="flex items-center gap-1 w-full">
                                              {hasCoach && (
                                                <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                                              )}
                                              <SelectValue placeholder="選擇教練" />
                                            </div>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="__none__">
                                              <span className="text-gray-400">清除教練</span>
                                            </SelectItem>
                                            {coaches.map((coach) => (
                                              <SelectItem key={coach} value={coach}>
                                                {coach}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
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