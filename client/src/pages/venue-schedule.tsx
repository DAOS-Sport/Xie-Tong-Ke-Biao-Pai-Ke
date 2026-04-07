import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import type { Venue, TimeSlot, Schedule } from "@shared/schema";
import { getExtendedWeekDays, getExtendedWeekdayNames, getExtendedWeekEnd } from "@/utils/special-workdays";
import FloatingConflictAlert from "@/components/floating-conflict-alert";
import AdminLayout from "@/components/admin-layout";

export default function VenueSchedule() {
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

  const { data: schedules = [] } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: [`/api/schedules?startDate=${weekStart}&endDate=${weekEnd}&venueId=${selectedVenue}`],
    enabled: !!selectedVenue,
  });

  useEffect(() => {
    if (venues && venues.length > 0 && !selectedVenue) {
      setSelectedVenue(venues[0].id);
    }
  }, [venues, selectedVenue]);

  const schedulesByDateAndTime: Record<string, Record<string, (Schedule & { venue: Venue; timeSlot: TimeSlot })[]>> = {};
  schedules.forEach(schedule => {
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

  const weekDateLabel = `${format(currentWeek, "yyyy/MM/dd")} - ${format(addDays(currentWeek, 4), "MM/dd")}`;

  const headerCenter = (
    <div className="flex items-center gap-2 flex-wrap justify-center">
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
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setCurrentWeek(prev => subWeeks(prev, 1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold whitespace-nowrap">{weekDateLabel}</span>
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setCurrentWeek(prev => addWeeks(prev, 1))}>
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
      <span className="text-sm bg-green-500 text-white px-3 py-1 rounded-full">場館課表顯示</span>
      <Button variant="outline" size="sm" onClick={() => setLocation("/mgt-x9k7p2/class-edit")}>
        管理員功能
      </Button>
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
    <AdminLayout activeTab="venue-schedule" headerCenter={headerCenter} headerRight={headerRight}>
      <div className="p-4">
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
                      <div className="text-xs text-gray-600">{timeSlot.startTime}-{timeSlot.endTime}</div>
                    </td>
                    {getExtendedWeekDays(currentWeek).map((date, index) => {
                      const dateStr = format(date, "yyyy-MM-dd");
                      const daySchedules = schedulesByDateAndTime[dateStr]?.[timeSlot.id] || [];
                      return (
                        <td key={`${timeSlot.id}-${index}`} className="border border-gray-300 p-1 align-top">
                          <div className="flex flex-col gap-1 min-h-[60px]">
                            {daySchedules.map((schedule, idx) => (
                              <div
                                key={`${schedule.id}-${idx}`}
                                className="p-1.5 rounded bg-blue-100 border border-blue-200"
                              >
                                <div className="text-base font-bold text-blue-800 leading-tight">
                                  {schedule.className || "游泳課"}
                                </div>
                                {schedule.coachName && (
                                  <div className="text-sm text-blue-600 whitespace-normal leading-snug mt-0.5">
                                    {schedule.coachName}
                                    {schedule.coachName2 && ` / ${schedule.coachName2}`}
                                  </div>
                                )}
                                {schedule.notes && (
                                  <div className="text-xs text-gray-600 mt-1">{schedule.notes}</div>
                                )}
                              </div>
                            ))}
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
