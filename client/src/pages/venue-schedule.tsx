import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import type { Venue, TimeSlot, Schedule } from "@shared/schema";

// 工作日和對應的中文名稱
const WEEKDAYS = [
  { day: 1, name: "週一" },
  { day: 2, name: "週二" },
  { day: 3, name: "週三" },
  { day: 4, name: "週四" },
  { day: 5, name: "週五" },
];

export default function VenueSchedule() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedVenue, setSelectedVenue] = useState<string>("");
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: 1 }); // 週一開始
  });

  // Remove authentication requirement for public access

  // 獲取場館列表
  const { data: venues } = useQuery<Venue[]>({
    queryKey: ["/api/venues"],
  });

  // 獲取時間段列表
  const { data: timeSlots } = useQuery<TimeSlot[]>({
    queryKey: ["/api/time-slots"],
  });

  // 獲取週課表資料
  const weekStart = format(currentWeek, "yyyy-MM-dd");
  const weekEnd = format(addDays(currentWeek, 4), "yyyy-MM-dd"); // 只到週五

  const { data: schedules = [] } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: [`/api/schedules?startDate=${weekStart}&endDate=${weekEnd}&venueId=${selectedVenue}`],
    enabled: !!selectedVenue,
  });

  // 設定預設選中第一個場館
  useEffect(() => {
    if (venues && venues.length > 0 && !selectedVenue) {
      setSelectedVenue(venues[0].id);
    }
  }, [venues, selectedVenue]);

  // 按日期和時間段組織課表資料
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

  const selectedVenueData = venues?.find(v => v.id === selectedVenue);

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
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <i className="fas fa-swimming-pool text-primary text-2xl"></i>
              <h1 className="text-xl font-bold text-primary">五泳池課表整合系統</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm bg-green-500 text-white px-3 py-1 rounded-full">
                場館課表顯示
              </span>
              {user && (
                <>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      <i className="fas fa-user text-primary-foreground text-sm"></i>
                    </div>
                    <span className="text-sm font-medium">{user.firstName || user.email}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = '/api/logout'}
                    data-testid="button-logout"
                  >
                    登出
                  </Button>
                </>
              )}
              {!user && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/api/login'}
                  data-testid="button-login"
                >
                  管理員登入
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            {user?.role === 'admin' && (
              <button 
                className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
                onClick={() => setLocation('/admin/schedule')}
                data-testid="tab-schedule-edit"
              >
                <i className="fas fa-calendar-alt mr-2"></i>課表編輯
              </button>
            )}
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/coach')}
              data-testid="tab-coach-view"
            >
              <i className="fas fa-user-clock mr-2"></i>教練視圖
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-primary text-primary font-medium text-sm"
              data-testid="tab-venue-schedule"
            >
              <i className="fas fa-building mr-2"></i>場館課表顯示
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/venue-schedule-edit')}
              data-testid="tab-venue-schedule-edit"
            >
              <i className="fas fa-edit mr-2"></i>場館課表編輯
            </button>
            {user?.role === 'admin' && (
              <button 
                className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
                onClick={() => setLocation('/statistics')}
                data-testid="tab-statistics"
              >
                <i className="fas fa-chart-bar mr-2"></i>堂數統計
              </button>
            )}
          </nav>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">場館課表顯示</h2>
          
          {/* 場館選擇 */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">選擇場館：</label>
            <Select value={selectedVenue} onValueChange={setSelectedVenue}>
              <SelectTrigger className="w-64">
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

          {/* 週次導航 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeek(prev => subWeeks(prev, 1))}
                data-testid="button-prev-week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <h2 className="text-xl font-semibold">
                {format(currentWeek, "yyyy年MM月dd日", { locale: zhTW })} - {format(addDays(currentWeek, 4), "MM月dd日", { locale: zhTW })}
              </h2>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentWeek(prev => addWeeks(prev, 1))}
                data-testid="button-next-week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            <Button
              variant="outline"
              onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              data-testid="button-current-week"
            >
              本週
            </Button>
          </div>
        </div>

        {/* 場館課表網格 */}
        {selectedVenueData && (
          <Card>
            <CardHeader>
              <CardTitle 
                className={`text-center text-lg venue-${selectedVenueData.color}`}
                style={{ 
                  backgroundColor: `var(--venue-${selectedVenueData.color})`,
                  color: 'white',
                  padding: '8px',
                  borderRadius: '6px'
                }}
              >
                {selectedVenueData.name} - 週課表
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 p-2 bg-gray-50 w-20">節次/時間</th>
                      {WEEKDAYS.map((weekday) => {
                        const date = addDays(currentWeek, weekday.day - 1);
                        return (
                          <th key={weekday.day} className="border border-gray-300 p-2 bg-gray-50 min-w-32">
                            <div className="text-center">
                              <div className="font-semibold">{weekday.name}</div>
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
                        <td className="border border-gray-300 p-2 bg-gray-50 text-center">
                          <div className="font-medium">{timeSlot.period}</div>
                          <div className="text-xs text-gray-600">
                            {timeSlot.startTime}-{timeSlot.endTime}
                          </div>
                        </td>
                        {WEEKDAYS.map((weekday) => {
                          const date = format(addDays(currentWeek, weekday.day - 1), "yyyy-MM-dd");
                          const daySchedules = schedulesByDateAndTime[date]?.[timeSlot.id] || [];
                          
                          return (
                            <td key={`${timeSlot.id}-${weekday.day}`} className="border border-gray-300 p-1 align-top">
                              <div className="space-y-1 min-h-[60px]">
                                {daySchedules.map((schedule, index) => (
                                  <div
                                    key={`${schedule.id}-${index}`}
                                    className="text-xs p-1 rounded bg-blue-100 border border-blue-200"
                                  >
                                    <div className="font-medium text-blue-800">
                                      {schedule.className || '游泳課'}
                                    </div>
                                    {schedule.coachName && (
                                      <div className="text-blue-600">
                                        {schedule.coachName}
                                      </div>
                                    )}
                                    {schedule.notes && (
                                      <div className="text-gray-600 mt-1">
                                        {schedule.notes}
                                      </div>
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
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}