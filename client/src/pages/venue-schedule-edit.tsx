import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addWeeks, subWeeks, startOfWeek, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import CoachAutocomplete from "@/components/coach-autocomplete";
import PasswordProtect from "@/components/password-protect";
import type { Venue, TimeSlot, Schedule } from "@shared/schema";

// 工作日和對應的中文名稱
const WEEKDAYS = [
  { day: 1, name: "週一" },
  { day: 2, name: "週二" },
  { day: 3, name: "週三" },
  { day: 4, name: "週四" },
  { day: 5, name: "週五" },
];

function VenueScheduleEditContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedVenue, setSelectedVenue] = useState<string>("");
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: 1 }); // 週一開始
  });
  const [activeCell, setActiveCell] = useState<{ 
    date: string; 
    timeSlotId: string; 
  } | null>(null);

  // Remove Replit authentication requirement for public access

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

  // 添加保存課程的 mutation
  const saveMutation = useMutation({
    mutationFn: async (scheduleData: {
      date: string;
      venueId: string;
      timeSlotId: string;
      className: string;
      coachName: string;
    }) => {
      if (!scheduleData.className && !scheduleData.coachName) {
        // 如果兩者都空，刪除課程
        const existingSchedule = schedules?.find(s => 
          s.date === scheduleData.date && 
          s.venueId === scheduleData.venueId && 
          s.timeSlotId === scheduleData.timeSlotId
        );
        if (existingSchedule) {
          const response = await apiRequest('DELETE', `/api/schedules/${existingSchedule.id}`);
          return response.json();
        }
        return null;
      }
      
      const response = await apiRequest('POST', '/api/schedules', scheduleData);
      return response.json();
    },
    onSuccess: () => {
      // 刷新當前查詢的數據
      queryClient.invalidateQueries({ 
        queryKey: [`/api/schedules?startDate=${weekStart}&endDate=${weekEnd}&venueId=${selectedVenue}`]
      });
      // 同時刷新整個週期的數據（用於admin schedule頁面）
      queryClient.invalidateQueries({ queryKey: ['/api/schedules'] });
      toast({
        title: "儲存成功",
        description: "課表已更新",
      });
    },
    onError: (error) => {
      toast({
        title: "儲存失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 刪除課程的 mutation
  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const response = await apiRequest('DELETE', `/api/schedules/${scheduleId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/schedules?startDate=${weekStart}&endDate=${weekEnd}&venueId=${selectedVenue}`]
      });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules'] });
      toast({
        title: "刪除成功",
        description: "課表已刪除",
      });
    },
    onError: (error) => {
      toast({
        title: "刪除失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 處理添加課程
  const handleAddClass = (date: string, timeSlotId: string, value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue || !selectedVenue) return;
    
    // 解析輸入格式：班級-教練名
    let className = '';
    let coachName = '';
    
    if (trimmedValue.includes('-')) {
      const parts = trimmedValue.split('-');
      className = parts[0].trim();
      coachName = parts.slice(1).join('-').trim();
    } else {
      className = trimmedValue;
    }

    saveMutation.mutate({
      date,
      venueId: selectedVenue,
      timeSlotId,
      className,
      coachName,
    });
  };

  // 處理刪除課程
  const handleDeleteClass = (scheduleId: string) => {
    deleteMutation.mutate(scheduleId);
  };

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
              <span className="text-sm bg-red-500 text-white px-3 py-1 rounded-full">
                場館課表編輯
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
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/admin/schedule')}
              data-testid="tab-schedule-edit"
            >
              <i className="fas fa-calendar-alt mr-2"></i>課表編輯
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/coach')}
              data-testid="tab-coach-view"
            >
              <i className="fas fa-user-clock mr-2"></i>教練視圖
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/venue-schedule')}
              data-testid="tab-venue-schedule"
            >
              <i className="fas fa-building mr-2"></i>場館課表顯示
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-primary text-primary font-medium text-sm"
              data-testid="tab-venue-schedule-edit"
            >
              <i className="fas fa-edit mr-2"></i>場館課表編輯
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/statistics')}
              data-testid="tab-statistics"
            >
              <i className="fas fa-chart-bar mr-2"></i>堂數統計
            </button>
          </nav>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">場館課表編輯</h2>
          
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
                {selectedVenueData.name} - 週課表編輯
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
                          
                          const isActive = activeCell?.date === date && 
                                           activeCell?.timeSlotId === timeSlot.id;
                          
                          return (
                            <td 
                              key={`${timeSlot.id}-${weekday.day}`} 
                              className="border border-gray-300 p-1 align-top hover:bg-accent/50 cursor-pointer relative"
                              style={{ minHeight: '60px', verticalAlign: 'top' }}
                            >
                              <div className="space-y-1 min-h-[60px]">
                                {daySchedules.map((schedule, index) => (
                                  <div 
                                    key={schedule.id} 
                                    className="flex items-center justify-between bg-background/50 rounded px-1 py-0.5 text-xs group"
                                  >
                                    <span className="flex-1 truncate">
                                      {schedule.className && schedule.coachName 
                                        ? `${schedule.className}-${schedule.coachName}`
                                        : schedule.className || schedule.coachName || '未命名'}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClass(schedule.id);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-1 transition-opacity"
                                      data-testid={`button-delete-${schedule.id}`}
                                    >
                                      <i className="fas fa-times text-xs"></i>
                                    </button>
                                  </div>
                                ))}
                                <input
                                  type="text"
                                  className="w-full bg-transparent text-xs placeholder-muted-foreground border-none outline-none p-1"
                                  placeholder={daySchedules.length === 0 ? "班級-教練" : "新增課程"}
                                  onFocus={() => setActiveCell({ date, timeSlotId: timeSlot.id })}
                                  onBlur={(e) => {
                                    const value = e.target.value.trim();
                                    if (value) {
                                      handleAddClass(date, timeSlot.id, value);
                                      e.target.value = '';
                                    }
                                    setActiveCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const value = e.currentTarget.value.trim();
                                      if (value) {
                                        handleAddClass(date, timeSlot.id, value);
                                        e.currentTarget.value = '';
                                      }
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  data-testid={`input-${date}-${timeSlot.id}`}
                                />
                              </div>
                              {isActive && (
                                <CoachAutocomplete
                                  onSelect={(coachName: string) => {
                                    const input = document.querySelector(`[data-testid="input-${date}-${timeSlot.id}"]`) as HTMLInputElement;
                                    if (input) {
                                      const currentValue = input.value;
                                      const newValue = currentValue ? `${currentValue}-${coachName}` : coachName;
                                      input.value = newValue;
                                    }
                                    setActiveCell(null);
                                  }}
                                />
                              )}
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

export default function VenueScheduleEdit() {
  return (
    <PasswordProtect>
      <VenueScheduleEditContent />
    </PasswordProtect>
  );
}