import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Schedule, Venue, TimeSlot } from "@shared/schema";
import { getExtendedWeekDays, getExtendedWeekdayNames, getExtendedWeekEnd } from "@/utils/special-workdays";
import AdminLayout from "@/components/admin-layout";

export default function CoachView() {
  const { user } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedCoach, setSelectedCoach] = useState<string>("");

  const weekStart = format(currentWeek, "yyyy-MM-dd");
  const weekEnd = format(getExtendedWeekEnd(currentWeek), "yyyy-MM-dd");

  const { data: coaches } = useQuery<string[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: schedules } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: ["/api/coach-schedules", { startDate: weekStart, endDate: weekEnd, coachName: selectedCoach }],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: weekStart, endDate: weekEnd });
      if (selectedCoach) params.append("coachName", selectedCoach);
      const response = await fetch(`/api/coach-schedules?${params}`);
      if (!response.ok) throw new Error("Failed to fetch schedules");
      return response.json();
    },
    enabled: !!selectedCoach,
  });

  const derivedCoaches = useMemo(() => (coaches ? [...coaches].sort() : []), [coaches]);

  useEffect(() => {
    if (!selectedCoach && derivedCoaches.length > 0) {
      if (user?.role === "admin") {
        setSelectedCoach(derivedCoaches[0]);
      } else if (user?.coachName) {
        setSelectedCoach(user.coachName);
      } else {
        setSelectedCoach(derivedCoaches[0]);
      }
    }
  }, [user, derivedCoaches, selectedCoach]);

  const weekDays = getExtendedWeekDays(currentWeek);

  const getSchedulesForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const todays = schedules?.filter((s) => s.date === dateStr) || [];
    if (!selectedCoach) return todays;
    return todays.filter((s) => {
      if (!s.coachName) return false;
      if (s.coachName === selectedCoach) return true;
      const coachList = s.coachName.split("-").map((c) => c.trim());
      return coachList.includes(selectedCoach);
    });
  };

  const getVenueColorClass = (color: string) => {
    const map: Record<string, string> = {
      blue: "venue-blue",
      green: "venue-green",
      purple: "venue-purple",
      yellow: "venue-yellow",
      pink: "venue-pink",
      orange: "venue-orange",
    };
    return map[color] || "bg-muted";
  };

  const weekDateLabel = `${format(currentWeek, "yyyy年M月d日", { locale: zhTW })} - ${format(getExtendedWeekEnd(currentWeek), "M月d日", { locale: zhTW })}`;

  const headerCenter = (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      <span className="text-sm font-medium whitespace-nowrap">選擇教練：</span>
      <Select value={selectedCoach} onValueChange={setSelectedCoach}>
        <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-coach">
          <SelectValue placeholder="選擇教練" />
        </SelectTrigger>
        <SelectContent>
          {derivedCoaches.map((coach) => (
            <SelectItem key={coach} value={coach} data-testid={`option-${coach}`}>
              {coach}
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
      <span className="text-sm font-semibold whitespace-nowrap" data-testid="text-week-range">
        {weekDateLabel}
      </span>
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
      >
        本週
      </Button>
    </div>
  );

  const headerRight = (
    <span className="text-sm bg-green-500 text-white px-3 py-1 rounded-full">教練視圖</span>
  );

  return (
    <AdminLayout activeTab="coach-view" headerCenter={headerCenter} headerRight={headerRight}>
      <div className="p-4">
        <div
          className={`grid grid-cols-1 gap-4 ${weekDays.length === 6 ? "md:grid-cols-6" : "md:grid-cols-5"}`}
          data-testid="text-coach-name"
        >
          {weekDays.map((day, index) => {
            const daySchedules = getSchedulesForDay(day);
            const weekDayNames = getExtendedWeekdayNames(currentWeek);

            return (
              <div key={index} className="text-center">
                <div className="text-sm font-medium text-muted-foreground mb-1" data-testid={`text-day-${index}`}>
                  {weekDayNames[index]}
                </div>
                <div className="text-xs text-gray-400 mb-3">
                  {format(day, "MM/dd")}
                </div>
                <div className="space-y-2">
                  {daySchedules.length > 0 ? (
                    daySchedules.map((schedule) => (
                      <Card
                        key={schedule.id}
                        className={`${getVenueColorClass(schedule.venue.color)} text-white cursor-pointer hover:opacity-90 transition-opacity`}
                        data-testid={`class-card-${schedule.id}`}
                      >
                        <CardContent className="p-3 text-xs">
                          <div className="font-medium">{schedule.venue.name}</div>
                          <div>{schedule.className}</div>
                          <div className="text-xs opacity-80">
                            {schedule.timeSlot.startTime}-{schedule.timeSlot.endTime}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="bg-muted text-muted-foreground">
                      <CardContent className="p-3 text-xs">
                        <div>無課程</div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
