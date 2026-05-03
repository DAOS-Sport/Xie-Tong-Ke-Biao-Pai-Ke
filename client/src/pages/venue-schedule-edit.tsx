import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FloatingConflictAlert from "@/components/floating-conflict-alert";
import AdminLayout from "@/components/admin-layout";
import type { Venue, TimeSlot, Schedule } from "@shared/schema";
import {
  getExtendedWeekDays,
  getExtendedWeekdayNames,
  getExtendedWeekEnd,
} from "@/utils/special-workdays";

function VenueScheduleEditContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedVenue, setSelectedVenue] = useState<string>("");
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: 1 });
  });
  const [activeCell, setActiveCell] = useState<{
    date: string;
    timeSlotId: string;
  } | null>(null);
  const [showCopyWeek, setShowCopyWeek] = useState(false);
  const [copySourceWeek, setCopySourceWeek] = useState<Date>(() =>
    subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1)
  );

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

  useEffect(() => {
    if (venues && venues.length > 0 && !selectedVenue) {
      setSelectedVenue(venues[0].id);
    }
  }, [venues, selectedVenue]);

  const adminPassword =
    typeof window !== "undefined"
      ? sessionStorage.getItem("admin-password") || ""
      : "";

  const addClassMutation = useMutation({
    mutationFn: async (data: {
      date: string;
      timeSlotId: string;
      className: string;
    }) => {
      const response = await apiRequest("POST", "/api/schedules", {
        date: data.date,
        venueId: selectedVenue,
        timeSlotId: data.timeSlotId,
        className: data.className,
        coachName: null,
        coachName2: null,
        coachCount: 1,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].includes("/api/schedules"),
      });
      toast({ title: "新增成功" });
    },
    onError: (error) => {
      toast({
        title: "新增失敗",
        description: error instanceof Error ? error.message : "未知錯誤",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: {
          "x-admin-password": adminPassword,
        },
      });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].includes("/api/schedules"),
      });
      toast({ title: "已刪除" });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      let description = `刪除失敗：${msg}`;
      if (msg.includes("409") || msg.includes("課表已鎖定")) {
        description = "課表已鎖定，請先解鎖該週才能刪除";
      } else if (msg.includes("401")) {
        description = "密碼驗證失敗，請重新登入";
      }
      toast({
        title: "刪除失敗",
        description,
        variant: "destructive",
      });
    },
  });

  const updateCoachCountMutation = useMutation({
    mutationFn: async ({
      scheduleId,
      coachCount,
    }: {
      scheduleId: string;
      coachCount: number;
    }) => {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ coachCount }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].includes("/api/schedules"),
      });
    },
    onError: (error) => {
      toast({ title: "更新失敗", description: error.message, variant: "destructive" });
    },
  });

  const copyWeekMutation = useMutation({
    mutationFn: async () => {
      const sourceStart = format(copySourceWeek, "yyyy-MM-dd");
      const sourceEnd = format(getExtendedWeekEnd(copySourceWeek), "yyyy-MM-dd");
      const targetStart = format(currentWeek, "yyyy-MM-dd");
      const response = await fetch("/api/schedules/copy-week", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          sourceStartDate: sourceStart,
          sourceEndDate: sourceEnd,
          targetStartDate: targetStart,
          venueId: selectedVenue,
        }),
      });
      if (!response.ok) throw new Error("複製失敗");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "複製成功",
        description: `已複製 ${data.copied} 個班級`,
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].includes("/api/schedules"),
      });
      setShowCopyWeek(false);
    },
    onError: () => {
      toast({ title: "複製失敗", variant: "destructive" });
    },
  });

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

  const handleAddClass = (date: string, timeSlotId: string, className: string) => {
    addClassMutation.mutate({ date, timeSlotId, className });
  };

  const handleDeleteClass = (scheduleId: string) => {
    deleteMutation.mutate(scheduleId);
  };

  const weekDateLabel = `${format(currentWeek, "yyyy/MM/dd")} - ${format(addDays(currentWeek, 4), "MM/dd")}`;

  const headerCenter = (
    <div className="flex items-center gap-2 flex-nowrap">
      <span className="text-sm font-medium whitespace-nowrap">選擇場館：</span>
      <Select value={selectedVenue} onValueChange={setSelectedVenue}>
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue placeholder="請選擇場館" />
        </SelectTrigger>
        <SelectContent>
          {venues?.map((venue) => (
            <SelectItem key={venue.id} value={venue.id}>
              {venue.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => setCurrentWeek((prev) => subWeeks(prev, 1))}
        data-testid="button-prev-week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold whitespace-nowrap">{weekDateLabel}</span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => setCurrentWeek((prev) => addWeeks(prev, 1))}
        data-testid="button-next-week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        className="h-8 text-sm px-3"
        onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        data-testid="button-current-week"
      >
        本週
      </Button>
      <Button
        variant="outline"
        className="h-8 text-sm px-3"
        onClick={() => {
          setCopySourceWeek(subWeeks(currentWeek, 1));
          setShowCopyWeek(!showCopyWeek);
        }}
      >
        <Copy className="h-3.5 w-3.5 mr-1" />
        複製週課表
      </Button>
    </div>
  );

  const headerRight = (
    <span className="text-sm bg-red-500 text-white px-3 py-1 rounded-full">
      學校課表編輯
    </span>
  );

  if (!venues || !timeSlots) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  return (
    <AdminLayout activeTab="class-edit" headerCenter={headerCenter} headerRight={headerRight}>
      <div className="p-4">
        {/* Copy Week Panel */}
        {showCopyWeek && selectedVenue && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <span className="text-sm font-medium whitespace-nowrap">從哪一週複製：</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCopySourceWeek((w) => subWeeks(w, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-48 text-center">
                  {format(copySourceWeek, "yyyy/MM/dd", { locale: zhTW })} -{" "}
                  {format(addDays(copySourceWeek, 4), "MM/dd", { locale: zhTW })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCopySourceWeek((w) => addWeeks(w, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-sm text-muted-foreground">→ 複製到目前顯示的週</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => copyWeekMutation.mutate()}
                  disabled={
                    copyWeekMutation.isPending ||
                    format(copySourceWeek, "yyyy-MM-dd") === format(currentWeek, "yyyy-MM-dd")
                  }
                >
                  {copyWeekMutation.isPending ? "複製中..." : "確認複製"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCopyWeek(false)}>
                  取消
                </Button>
              </div>
            </div>
            {format(copySourceWeek, "yyyy-MM-dd") === format(currentWeek, "yyyy-MM-dd") && (
              <p className="text-xs text-red-500 mt-2">不能複製到同一週</p>
            )}
          </div>
        )}

        {/* Schedule Table */}
        {selectedVenue ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[600px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="border border-gray-300 p-2 bg-gray-50 w-20 sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    節次/時間
                  </th>
                  {getExtendedWeekDays(currentWeek).map((date, index) => {
                    const weekDayNames = getExtendedWeekdayNames(currentWeek);
                    return (
                      <th key={index} className="border border-gray-300 p-2 bg-gray-50 min-w-32">
                        <div className="text-center">
                          <div className="font-semibold">{weekDayNames[index]}</div>
                          <div className="text-sm text-gray-600">{format(date, "MM/dd")}</div>
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
                      const daySchedules = schedulesByDateAndTime[dateStr]?.[timeSlot.id] || [];

                      return (
                        <td
                          key={`${timeSlot.id}-${index}`}
                          className="border border-gray-300 p-1 align-top hover:bg-accent/50 cursor-pointer relative"
                          style={{ minHeight: "60px", verticalAlign: "top" }}
                        >
                          <div className="space-y-1 min-h-[60px]">
                            {daySchedules.map((schedule) => (
                              <div
                                key={schedule.id}
                                className="flex items-center justify-between bg-background/50 rounded px-1 py-0.5 text-xs group"
                              >
                                <span className="flex-1 truncate">{schedule.className || "未命名"}</span>
                                <div className="flex items-center gap-0.5 ml-1">
                                  <select
                                    value={schedule.coachCount || 1}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      updateCoachCountMutation.mutate({
                                        scheduleId: schedule.id,
                                        coachCount: parseInt(e.target.value),
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] bg-blue-50 border border-blue-200 rounded px-0.5 py-0 cursor-pointer hover:bg-blue-100"
                                    title="教練人數"
                                  >
                                    <option value={1}>1位</option>
                                    <option value={2}>2位</option>
                                  </select>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteClass(schedule.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                                    data-testid={`button-delete-${schedule.id}`}
                                  >
                                    <i className="fas fa-times text-xs"></i>
                                  </button>
                                </div>
                              </div>
                            ))}
                            <input
                              type="text"
                              className="w-full bg-transparent text-xs placeholder-muted-foreground border-none outline-none p-1"
                              placeholder={daySchedules.length === 0 ? "輸入班級名稱" : "新增課程"}
                              onFocus={() => setActiveCell({ date: dateStr, timeSlotId: timeSlot.id })}
                              onBlur={(e) => {
                                const value = e.target.value.trim();
                                if (value) {
                                  handleAddClass(dateStr, timeSlot.id, value);
                                  e.target.value = "";
                                }
                                setActiveCell(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const value = e.currentTarget.value.trim();
                                  if (value) {
                                    handleAddClass(dateStr, timeSlot.id, value);
                                    e.currentTarget.value = "";
                                  }
                                  e.currentTarget.blur();
                                }
                              }}
                              data-testid={`input-${dateStr}-${timeSlot.id}`}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            請在上方選擇場館
          </div>
        )}
      </div>
      <FloatingConflictAlert weekStart={currentWeek} />
    </AdminLayout>
  );
}

export default function VenueScheduleEdit() {
  return <VenueScheduleEditContent />;
}
