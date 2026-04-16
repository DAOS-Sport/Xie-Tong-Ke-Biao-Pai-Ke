import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Check, Users, Zap, BarChart3, AlertTriangle, ChevronDown, X, Search } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek } from "date-fns";
import { zhTW } from "date-fns/locale";
import PasswordProtect from "@/components/password-protect";
import FloatingConflictAlert from "@/components/floating-conflict-alert";
import AdminLayout from "@/components/admin-layout";
import type { Venue, TimeSlot, Schedule, CoachAvailability } from "@shared/schema";
import {
  getExtendedWeekDays,
  getExtendedWeekdayNames,
  getExtendedWeekEnd,
} from "@/utils/special-workdays";

interface CoachSearchSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  coaches: string[];       // 場館教練（已篩選）
  allCoaches: string[];    // 全部教練（代班模式用）
  available: Set<string>;
  conflicts: Set<string>;
  placeholder: string;
  triggerClassName?: string;
  hasValue?: boolean;
}

function CoachSearchSelect({
  value,
  onValueChange,
  coaches,
  allCoaches,
  available,
  conflicts,
  placeholder,
  triggerClassName = "",
  hasValue = false,
}: CoachSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [substituteMode, setSubstituteMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSubstituteMode(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const normalize = (s: string) => s.toLowerCase().replace(/[\s\(\)\（\）\-_]/g, "");
  const activeList = substituteMode ? allCoaches : coaches;
  const filtered = (list: string[]) =>
    search.trim() === ""
      ? list
      : list.filter((c) => {
          const q = search.toLowerCase().trim();
          return c.toLowerCase().includes(q) || normalize(c).includes(normalize(q));
        });

  const availableList = filtered(activeList.filter((c) => available.has(c)));
  const otherList = filtered(activeList.filter((c) => !available.has(c)));
  const noResults = availableList.length === 0 && otherList.length === 0;

  const handleSelect = (coach: string) => {
    onValueChange(coach);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange("__clear__");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-7 text-xs px-2 rounded border flex items-center justify-between gap-1 ${triggerClassName}`}
      >
        <div className="flex items-center gap-1 min-w-0">
          {hasValue && <Check className="h-3 w-3 flex-shrink-0 text-green-600" />}
          <span className={`flex-1 min-w-0 truncate ${value ? "" : "text-gray-400"}`}>
            {value || placeholder}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {value && (
            <span onClick={handleClear} className="rounded hover:bg-gray-200 p-0.5 cursor-pointer">
              <X className="h-2.5 w-2.5 text-gray-400" />
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-0.5 min-w-[220px] w-max max-w-[320px] bg-white border border-gray-200 rounded shadow-lg">
          {substituteMode && (
            <div className="px-2 py-1 text-[10px] text-orange-600 font-medium bg-orange-50 border-b border-orange-100 flex items-center justify-between">
              <span>代班模式：顯示全部教練</span>
              <button
                type="button"
                onClick={() => { setSubstituteMode(false); setSearch(""); }}
                className="text-orange-400 hover:text-orange-600 ml-1"
              >✕</button>
            </div>
          )}
          <div className="p-1.5 border-b flex items-center gap-1">
            <Search className="h-3 w-3 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={substituteMode ? "搜尋全部教練..." : "搜尋場館教練..."}
              className="flex-1 text-xs outline-none bg-transparent"
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {availableList.length > 0 && (
              <>
                <div className="px-2 py-0.5 text-[10px] text-green-600 font-medium bg-green-50">✅ 可用教練</div>
                {availableList.map((coach) => {
                  const isConflict = conflicts.has(coach);
                  return (
                    <button
                      key={coach}
                      type="button"
                      disabled={isConflict}
                      onClick={() => !isConflict && handleSelect(coach)}
                      className={`w-full text-left px-2 py-1 text-xs hover:bg-gray-100 flex items-center gap-1 ${
                        isConflict ? "opacity-40 line-through cursor-not-allowed" : ""
                      } ${value === coach ? "bg-blue-50 font-medium" : ""}`}
                    >
                      ✅ {coach}{isConflict ? " (衝突)" : ""}
                    </button>
                  );
                })}
              </>
            )}
            {otherList.length > 0 && (
              <>
                <div className="px-2 py-0.5 text-[10px] text-gray-400 font-medium bg-gray-50 border-t">
                  {substituteMode ? "全部教練" : "場館教練"}
                </div>
                {otherList.map((coach) => {
                  const isConflict = conflicts.has(coach);
                  return (
                    <button
                      key={coach}
                      type="button"
                      disabled={isConflict}
                      onClick={() => !isConflict && handleSelect(coach)}
                      className={`w-full text-left px-2 py-1 text-xs hover:bg-gray-100 text-gray-500 ${
                        isConflict ? "opacity-40 line-through cursor-not-allowed" : ""
                      } ${value === coach ? "bg-blue-50 font-medium" : ""}`}
                    >
                      {coach}{isConflict ? " (衝突)" : ""}
                    </button>
                  );
                })}
              </>
            )}
            {noResults && search.trim() === "" && (
              <div className="px-2 py-2 text-xs text-gray-400 text-center">請輸入姓名搜尋</div>
            )}
            {noResults && search.trim() !== "" && (
              <>
                <div className="px-2 py-2 text-xs text-gray-400 text-center">無符合結果</div>
                <button
                  type="button"
                  onClick={() => handleSelect(search.trim())}
                  className="w-full text-left px-2 py-1.5 text-xs text-orange-600 hover:bg-orange-50 border-t border-orange-100 flex items-center gap-1 font-medium"
                >
                  <span className="flex-shrink-0">＋</span>
                  <span>直接使用「{search.trim()}」</span>
                </button>
              </>
            )}
          </div>
          {!substituteMode && (
            <div className="border-t border-orange-100">
              <button
                type="button"
                onClick={() => { setSubstituteMode(true); setSearch(""); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="w-full text-left px-2 py-1.5 text-xs text-orange-600 hover:bg-orange-50 flex items-center gap-1 font-medium"
              >
                <span className="flex-shrink-0">＋</span>
                <span>指派代班教練（顯示全部）</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CoachAssignmentContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedVenue, setSelectedVenue] = useState<string>("");
  const [currentWeek, setCurrentWeek] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedCell, setSelectedCell] = useState<{
    date: string;
    timeSlotId: string;
    timeSlotOrder: number;
  } | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(false);

  const { data: venues } = useQuery<Venue[]>({ queryKey: ["/api/venues"] });
  const { data: timeSlots } = useQuery<TimeSlot[]>({ queryKey: ["/api/time-slots"] });

  const weekStart = format(currentWeek, "yyyy-MM-dd");
  const weekEnd = format(getExtendedWeekEnd(currentWeek), "yyyy-MM-dd");

  const { data: schedules = [] } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: [`/api/schedules?startDate=${weekStart}&endDate=${weekEnd}&venueId=${selectedVenue}`],
    enabled: !!selectedVenue,
  });

  const { data: allSchedules = [] } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: [`/api/schedules?startDate=${weekStart}&endDate=${weekEnd}`],
  });

  const { data: coaches = [] } = useQuery<string[]>({ queryKey: ["/api/approved-coaches"] });

  const { data: availability = [] } = useQuery<CoachAvailability[]>({
    queryKey: ["/api/coach-availability", weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/coach-availability?weekStart=${weekStart}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: venuePrefsMap = {} } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/admin/coach-venue-preferences"],
    queryFn: async () => {
      const password = sessionStorage.getItem("admin-password") || "";
      const res = await fetch(`/api/admin/coach-venue-preferences?password=${password}`);
      if (!res.ok) return {};
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

  const getAvailableCoaches = (dayOfWeek: number, timeSlotOrder: number, venueName?: string): Set<string> => {
    const timeAvailable = availabilityMap.get(`${dayOfWeek}-${timeSlotOrder}`) || new Set<string>();
    if (!venueName) return timeAvailable;
    const result = new Set<string>();
    for (const coach of timeAvailable) {
      const prefs = venuePrefsMap[coach];
      if (!prefs || prefs.length === 0) result.add(coach);
      else if (prefs.includes(venueName)) result.add(coach);
    }
    return result;
  };

  const getConflictingCoaches = (date: string, timeSlotId: string, currentScheduleId: string): Set<string> => {
    const conflicting = new Set<string>();
    allSchedules.forEach((s) => {
      if (s.id === currentScheduleId || s.date !== date || s.timeSlotId !== timeSlotId) return;
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
      scheduleId, coachName, coachName2, coach1IsTeaching, coach2IsTeaching,
    }: {
      scheduleId: string;
      coachName?: string;
      coachName2?: string;
      coach1IsTeaching?: boolean;
      coach2IsTeaching?: boolean;
    }) => {
      const adminPassword = sessionStorage.getItem("admin-password") || "";
      const body: any = {};
      if (coachName !== undefined) body.coachName = coachName;
      if (coachName2 !== undefined) body.coachName2 = coachName2;
      if (coach1IsTeaching !== undefined) body.coach1IsTeaching = coach1IsTeaching;
      if (coach2IsTeaching !== undefined) body.coach2IsTeaching = coach2IsTeaching;
      const res = await fetch(`/api/schedules/${scheduleId}/assign-coach`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          (query.queryKey[0].includes("/api/schedules") || query.queryKey[0].includes("/api/conflicts")),
      });
      localStorage.setItem("scheduleLastModified", Date.now().toString());
      const notified: string[] = data?.lineNotified || [];
      const noLineId: string[] = data?.lineNoId || [];
      if (notified.length > 0) {
        toast({
          title: "指派成功",
          description: `已推播 LINE 通知給：${notified.join("、")}`,
        });
      } else if (noLineId.length > 0) {
        toast({
          title: "指派成功",
          description: `${noLineId.join("、")} 尚未綁定 LINE，未發送通知`,
        });
      } else {
        toast({ title: "指派成功", description: "教練已更新" });
      }
    },
    onError: (error) => {
      toast({ title: "指派失敗", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (venues && venues.length > 0 && !selectedVenue) {
      setSelectedVenue(venues[0].id);
    }
  }, [venues, selectedVenue]);

  const schedulesByDateAndTime: Record<string, Record<string, (Schedule & { venue: Venue; timeSlot: TimeSlot })[]>> = {};
  schedules.forEach((schedule) => {
    if (schedule.venue.id === selectedVenue) {
      if (!schedulesByDateAndTime[schedule.date]) schedulesByDateAndTime[schedule.date] = {};
      if (!schedulesByDateAndTime[schedule.date][schedule.timeSlotId])
        schedulesByDateAndTime[schedule.date][schedule.timeSlotId] = [];
      schedulesByDateAndTime[schedule.date][schedule.timeSlotId].push(schedule);
    }
  });

  const weeklyStats = useMemo(() => {
    const stats: Record<string, { assigned: number; available: number }> = {};
    for (const coach of coaches) stats[coach] = { assigned: 0, available: 0 };
    for (const a of availability) {
      if (stats[a.coachName]) stats[a.coachName].available++;
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
      if (!s.className || s.venue.id !== selectedVenue) continue;
      if (!s.coachName) missing++;
      if ((s.coachCount || 1) >= 2 && !s.coachName2) missing++;
    }
    return missing;
  }, [schedules, selectedVenue]);

  const selectedVenueData = venues?.find((v) => v.id === selectedVenue);

  // 場館教練：有填偏好且包含此場館，或尚未填任何偏好者
  const venueEligibleCoaches = useMemo(() => {
    const venueName = selectedVenueData?.name;
    if (!venueName) return coaches;
    return coaches.filter((coach) => {
      const prefs = venuePrefsMap[coach];
      return !prefs || prefs.length === 0 || prefs.includes(venueName);
    });
  }, [coaches, selectedVenueData, venuePrefsMap]);

  // SWIM-05: 依 (isAvailable, prefersVenue) 評分，優先指派最合適教練
  const scoredCandidates = (dayOfWeek: number, timeSlotOrder: number, venueName: string, excludeSet: Set<string>): string[] => {
    const timeAvailSet = availabilityMap.get(`${dayOfWeek}-${timeSlotOrder}`) || new Set<string>();
    const scored: { coach: string; score: number }[] = [];
    for (const coach of venueEligibleCoaches) {
      if (excludeSet.has(coach)) continue;
      const isAvailable = timeAvailSet.has(coach);
      const prefs = venuePrefsMap[coach];
      const prefersVenue = !!(prefs && prefs.length > 0 && prefs.includes(venueName));
      const noPrefsSet = !prefs || prefs.length === 0;
      let score = 0;
      if (isAvailable && prefersVenue) score = 3;
      else if (isAvailable && noPrefsSet) score = 2;
      else if (isAvailable) score = 2;
      else if (prefersVenue) score = 1;
      else continue; // neither: exclude
      scored.push({ coach, score });
    }
    return scored.sort((a, b) => b.score - a.score).map((x) => x.coach);
  };

  const handleAutoFill = () => {
    const unfilled = schedules.filter(
      (s) => s.className && s.venue.id === selectedVenue && (!s.coachName || ((s.coachCount || 1) >= 2 && !s.coachName2))
    );
    let filled = 0;
    const localCounts: Record<string, number> = {};
    for (const coach of coaches) localCounts[coach] = weeklyStats[coach]?.assigned || 0;
    const venueName = selectedVenueData?.name || "";

    const pickBest = (candidates: string[], timeAvailSet: Set<string>): string | undefined => {
      return candidates.sort((a, b) => {
        const scoreOf = (c: string) => {
          const prefs = venuePrefsMap[c];
          const inAvail = timeAvailSet.has(c);
          const prefV = !!(prefs && prefs.length > 0 && prefs.includes(venueName));
          return inAvail && prefV ? 3 : inAvail ? 2 : 1;
        };
        const diff = scoreOf(b) - scoreOf(a);
        return diff !== 0 ? diff : (localCounts[a] || 0) - (localCounts[b] || 0);
      })[0];
    };

    for (const schedule of unfilled) {
      const date = new Date(schedule.date);
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      const timeSlotOrder = schedule.timeSlot?.order || 0;
      const timeAvailSet = availabilityMap.get(`${dayOfWeek}-${timeSlotOrder}`) || new Set<string>();
      const conflicting = getConflictingCoaches(schedule.date, schedule.timeSlotId, schedule.id);
      let assignedCoach1 = schedule.coachName || "";
      if (!schedule.coachName) {
        const candidates = scoredCandidates(dayOfWeek, timeSlotOrder, venueName, conflicting);
        if (candidates.length > 0) {
          const best = pickBest(candidates, timeAvailSet)!;
          assignCoachMutation.mutate({ scheduleId: schedule.id, coachName: best });
          localCounts[best] = (localCounts[best] || 0) + 1;
          assignedCoach1 = best;
          filled++;
        }
      }
      if ((schedule.coachCount || 1) >= 2 && !schedule.coachName2) {
        const exclude2 = new Set(conflicting);
        if (assignedCoach1) exclude2.add(assignedCoach1);
        const candidates2 = scoredCandidates(dayOfWeek, timeSlotOrder, venueName, exclude2);
        if (candidates2.length > 0) {
          const best2 = pickBest(candidates2, timeAvailSet)!;
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

  const sidebarAvailableCoaches = selectedCell
    ? (() => {
        const d = new Date(selectedCell.date);
        const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
        const available = getAvailableCoaches(dayOfWeek, selectedCell.timeSlotOrder, selectedVenueData?.name);
        const assigned = getAssignedCoachesForSlot(selectedCell.date, selectedCell.timeSlotId);
        return {
          available: Array.from(available).filter((c) => !assigned.has(c)),
          assigned: Array.from(assigned),
        };
      })()
    : null;

  const weekDateLabel = `${format(currentWeek, "yyyy/MM/dd")} - ${format(
    new Date(currentWeek.getTime() + 4 * 86400000),
    "MM/dd"
  )}`;

  const headerCenter = (
    <div className="flex items-center gap-2 flex-nowrap">
      <span className="text-sm font-medium whitespace-nowrap">選擇場館：</span>
      <Select value={selectedVenue} onValueChange={setSelectedVenue}>
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue placeholder="請選擇場館" />
        </SelectTrigger>
        <SelectContent>
          {venues?.map((venue) => (
            <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setCurrentWeek((prev) => subWeeks(prev, 1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold whitespace-nowrap">{weekDateLabel}</span>
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setCurrentWeek((prev) => addWeeks(prev, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" className="h-8 text-sm px-3"
        onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
        本週
      </Button>
    </div>
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowRightPanel(v => !v)}
        title={showRightPanel ? "隱藏本週統計" : "顯示本週統計"}
        className={`flex items-center gap-1 h-8 px-2 rounded-md border text-xs transition-colors ${
          showRightPanel
            ? "bg-blue-100 border-blue-300 text-blue-700"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
        }`}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">本週統計</span>
      </button>
      <span className="text-sm bg-blue-500 text-white px-3 py-1 rounded-full">教練指派</span>
    </div>
  );

  /* Right panel: available coaches + weekly stats */
  const rightPanelContent = (
    <div className="p-3 space-y-4">
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
                <div className="text-[10px] text-green-600 font-medium">
                  可指派 ({sidebarAvailableCoaches.available.length})
                </div>
                {sidebarAvailableCoaches.available.map((c) => (
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
                <div className="text-[10px] text-blue-600 font-medium">
                  已指派 ({sidebarAvailableCoaches.assigned.length})
                </div>
                {sidebarAvailableCoaches.assigned.map((c) => (
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
            {coaches.map((coach) => {
              const stats = weeklyStats[coach];
              if (!stats) return null;
              return (
                <div key={coach} className="flex items-center justify-between text-xs py-0.5">
                  <span className="truncate mr-2">{coach}</span>
                  <Badge variant="outline" className="text-[10px] h-5 px-1 flex-shrink-0">
                    {stats.assigned}/{stats.available}
                  </Badge>
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
  );

  if (!venues || !timeSlots) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  return (
    <AdminLayout
      activeTab="assign"
      headerCenter={headerCenter}
      headerRight={headerRight}
      rightPanel={showRightPanel ? rightPanelContent : undefined}
    >
      <div className="p-4">
        {/* Missing coach alert */}
        {missingCoachCount > 0 && (
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-700">
                尚有 <strong>{missingCoachCount}</strong> 個教練缺口未指派
              </span>
            </div>
            {/* 自動指派按鈕 — 暫時隱藏 */}
            {false && (
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
            )}
          </div>
        )}

        {/* Schedule table */}
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
                      <th key={index} className="border border-gray-300 p-2 bg-gray-50 min-w-36">
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
                      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
                      const isSelected =
                        selectedCell?.date === dateStr && selectedCell?.timeSlotId === timeSlot.id;

                      return (
                        <td
                          key={`${timeSlot.id}-${index}`}
                          className={`border border-gray-300 p-1 align-top cursor-pointer transition-colors ${
                            isSelected ? "ring-2 ring-inset ring-blue-400 bg-blue-50/30" : ""
                          }`}
                          style={{ minHeight: "80px", verticalAlign: "top" }}
                          onClick={() =>
                            setSelectedCell({
                              date: dateStr,
                              timeSlotId: timeSlot.id,
                              timeSlotOrder: timeSlot.order,
                            })
                          }
                        >
                          {/* Schedule cards: single col on mobile, 2-col grid on md+ when 2+ classes */}
                          <div className={`min-h-[80px] gap-1 ${daySchedules.length >= 2 ? "flex flex-col md:grid md:grid-cols-2" : "flex flex-col"}`}>
                            {daySchedules.map((schedule) => {
                              if (!schedule.className) return null;
                              const hasCoach = !!schedule.coachName;
                              const hasCoach2 = !!schedule.coachName2;
                              const needsTwo = (schedule.coachCount || 1) >= 2;
                              const coach1Conflicts = getCoach1Conflicts(schedule);
                              const coach2Conflicts = getCoach2Conflicts(schedule);
                              const available = getAvailableCoaches(
                                dayOfWeek,
                                timeSlot.order,
                                selectedVenueData?.name
                              );
                              const isMissing = !hasCoach || (needsTwo && !hasCoach2);
                              const isCardSelected = selectedScheduleId === schedule.id;
                              const missingBg = isMissing
                                ? !hasCoach
                                  ? "bg-red-50 border border-red-200"
                                  : "bg-amber-50 border border-amber-200"
                                : "bg-white border border-gray-200";

                              return (
                                <div
                                  key={schedule.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCell({ date: dateStr, timeSlotId: timeSlot.id, timeSlotOrder: timeSlot.order });
                                    setSelectedScheduleId(isCardSelected ? null : schedule.id);
                                  }}
                                  className={`rounded p-1.5 space-y-1 cursor-pointer transition-all ${missingBg} ${
                                    isCardSelected ? "ring-2 ring-blue-500 shadow-md" : "hover:shadow-sm"
                                  }`}
                                >
                                  <div className="bg-gray-700 text-white text-xs font-bold px-2 py-1 rounded text-center truncate flex items-center justify-center gap-1">
                                    {schedule.className}
                                    {needsTwo && <span className="text-[9px] opacity-75">(2位)</span>}
                                  </div>
                                  <CoachSearchSelect
                                    value={schedule.coachName || ""}
                                    onValueChange={(value) => {
                                      assignCoachMutation.mutate({
                                        scheduleId: schedule.id,
                                        coachName: value === "__clear__" ? "" : value,
                                      });
                                    }}
                                    coaches={venueEligibleCoaches}
                                    allCoaches={coaches}
                                    available={available}
                                    conflicts={coach1Conflicts}
                                    placeholder="教練1"
                                    hasValue={hasCoach}
                                    triggerClassName={
                                      hasCoach ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
                                    }
                                  />
                                  {hasCoach && (
                                    <label
                                      className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!schedule.coach1IsTeaching}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          assignCoachMutation.mutate({
                                            scheduleId: schedule.id,
                                            coach1IsTeaching: e.target.checked,
                                          });
                                        }}
                                        className="h-3 w-3 rounded border-gray-300"
                                      />
                                      <span
                                        className={`text-[10px] ${
                                          schedule.coach1IsTeaching
                                            ? "text-blue-600 font-semibold"
                                            : "text-gray-400"
                                        }`}
                                      >
                                        當班教學
                                      </span>
                                    </label>
                                  )}
                                  {needsTwo && (
                                    <>
                                      <CoachSearchSelect
                                        value={schedule.coachName2 || ""}
                                        onValueChange={(value) => {
                                          assignCoachMutation.mutate({
                                            scheduleId: schedule.id,
                                            coachName2: value === "__clear__" ? "" : value,
                                          });
                                        }}
                                        coaches={venueEligibleCoaches}
                                        allCoaches={coaches}
                                        available={available}
                                        conflicts={coach2Conflicts}
                                        placeholder="教練2"
                                        hasValue={hasCoach2}
                                        triggerClassName={
                                          hasCoach2
                                            ? "border-blue-400 bg-blue-50"
                                            : "border-amber-400 bg-amber-50"
                                        }
                                      />
                                      {hasCoach2 && (
                                        <label
                                          className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={!!schedule.coach2IsTeaching}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              assignCoachMutation.mutate({
                                                scheduleId: schedule.id,
                                                coach2IsTeaching: e.target.checked,
                                              });
                                            }}
                                            className="h-3 w-3 rounded border-gray-300"
                                          />
                                          <span
                                            className={`text-[10px] ${
                                              schedule.coach2IsTeaching
                                                ? "text-blue-600 font-semibold"
                                                : "text-gray-400"
                                            }`}
                                          >
                                            當班教學
                                          </span>
                                        </label>
                                      )}
                                    </>
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

export default function CoachAssignment() {
  return (
    <PasswordProtect>
      <CoachAssignmentContent />
    </PasswordProtect>
  );
}
