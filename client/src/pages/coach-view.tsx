import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Schedule, Venue, TimeSlot } from "@shared/schema";
import { getExtendedWeekDays, getExtendedWeekdayNames, getExtendedWeekEnd } from "@/utils/special-workdays";

export default function CoachView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedCoach, setSelectedCoach] = useState<string>('');

  // Remove authentication requirement for public access

  const weekStart = format(currentWeek, 'yyyy-MM-dd');
  const weekEnd = format(getExtendedWeekEnd(currentWeek), 'yyyy-MM-dd'); // 支援特殊工作日

  // Get list of all coaches
  const { data: coaches } = useQuery<string[]>({
    queryKey: ['/api/coaches'],
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: ['/api/coach-schedules', { startDate: weekStart, endDate: weekEnd, coachName: selectedCoach }],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: weekStart,
        endDate: weekEnd,
      });
      
      if (selectedCoach) {
        params.append('coachName', selectedCoach);
      }
      
      const response = await fetch(`/api/coach-schedules?${params}`);
      if (!response.ok) throw new Error('Failed to fetch schedules');
      return response.json();
    },
    enabled: !!selectedCoach,
  });

  // 移除不再需要的課表字串解析函式，因為教練信息直接從 coachName 欄位獲取

  // 直接使用後端返回的教練名單，不從課程名稱中提取
  const derivedCoaches = useMemo(() => {
    return coaches ? [...coaches].sort() : [];
  }, [coaches]);

  // Set default coach when data loads (使用完整的教練列表)
  useEffect(() => {
    if (!selectedCoach && derivedCoaches && derivedCoaches.length > 0) {
      if (user?.role === 'admin') {
        setSelectedCoach(derivedCoaches[0]);
      } else if (user?.coachName) {
        setSelectedCoach(user.coachName);
      } else {
        setSelectedCoach(derivedCoaches[0]); // Default to first coach for public access
      }
    }
  }, [user, derivedCoaches, selectedCoach]);

  if (schedulesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  const weekDays = getExtendedWeekDays(currentWeek); // 支援特殊工作日

  // 課表篩選邏輯：直接使用 coachName 欄位比對
  const getSchedulesForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const todays = schedules?.filter(s => s.date === dateStr) || [];

    if (!selectedCoach) return todays;

    // 直接使用 coachName 欄位進行比對，支援多教練格式
    return todays.filter(s => {
      if (!s.coachName) return false;
      
      // 完全匹配
      if (s.coachName === selectedCoach) return true;
      
      // 多教練格式匹配（如：陳柏榮-張哲瑋）
      const coaches = s.coachName.split('-').map(c => c.trim());
      return coaches.includes(selectedCoach);
    });
  };

  const getVenueColorClass = (color: string) => {
    switch (color) {
      case 'blue': return 'venue-blue';
      case 'green': return 'venue-green';
      case 'purple': return 'venue-purple';
      case 'yellow': return 'venue-yellow';
      case 'pink': return 'venue-pink';
      case 'orange': return 'venue-orange';
      default: return 'bg-muted';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center h-auto sm:h-16 py-4 gap-4">
            <div className="flex items-center space-x-4">
              <i className="fas fa-swimming-pool text-primary text-xl sm:text-2xl"></i>
              <h1 className="text-lg sm:text-xl font-bold text-primary">五泳池課表整合系統</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm bg-green-500 text-white px-3 py-1 rounded-full">
                教練模式
              </span>
              {user && (
                <>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      <i className="fas fa-user text-primary-foreground text-sm"></i>
                    </div>
                    <span className="text-sm font-medium">{user.coachName || user.firstName || user.email || '教練'}</span>
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
                  onClick={() => setLocation('/admin/schedule')}
                  data-testid="button-admin-access"
                >
                  管理員功能
                </Button>
              )}
            </div>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap gap-2 sm:space-x-8 sm:gap-0" aria-label="Tabs">
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/admin/schedule')}
              data-testid="tab-schedule-edit"
            >
              <i className="fas fa-calendar-alt mr-1 sm:mr-2"></i>課表編輯
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-primary text-primary font-medium text-xs sm:text-sm rounded-t sm:rounded-none bg-accent sm:bg-transparent"
              data-testid="tab-coach-view"
            >
              <i className="fas fa-user-clock mr-1 sm:mr-2"></i>教練視圖
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/venue-schedule')}
              data-testid="tab-venue-schedule"
            >
              <i className="fas fa-building mr-1 sm:mr-2"></i>場館課表顯示
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/venue-schedule-edit')}
              data-testid="tab-venue-schedule-edit"
            >
              <i className="fas fa-edit mr-1 sm:mr-2"></i>場館課表編輯
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/statistics')}
              data-testid="tab-statistics"
            >
              <i className="fas fa-chart-bar mr-1 sm:mr-2"></i>堂數統計
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/find-coach')}
              data-testid="tab-find-coach"
            >
              <i className="fas fa-search mr-1 sm:mr-2"></i>尋找教練
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/multi-school-admin')}
              data-testid="tab-multi-school"
            >
              <i className="fas fa-school mr-1 sm:mr-2"></i>多學校管理
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/coach-approval")}
              data-testid="tab-coach-approval"
            >
              <i className="fas fa-user-check mr-1 sm:mr-2"></i>教練審核
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
              <h2 className="text-base sm:text-lg font-semibold" data-testid="text-coach-name">
                教練課表查詢
              </h2>
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <span className="text-sm font-medium">選擇教練：</span>
                <Select value={selectedCoach} onValueChange={setSelectedCoach}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-coach">
                    <SelectValue placeholder="選擇教練" />
                  </SelectTrigger>
                  <SelectContent>
                    {derivedCoaches?.map((coach) => (
                      <SelectItem key={coach} value={coach} data-testid={`option-${coach}`}>
                        {coach}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentWeek(prev => subWeeks(prev, 1))}
                data-testid="button-prev-week"
                className="h-8 w-8 p-0 sm:h-9 sm:w-9"
              >
                <i className="fas fa-chevron-left text-xs sm:text-sm"></i>
              </Button>
              <span className="text-xs sm:text-sm font-medium text-center flex-1 sm:flex-none" data-testid="text-week-range">
                {format(currentWeek, 'yyyy年M月d日', { locale: zhTW })} - {format(getExtendedWeekEnd(currentWeek), 'M月d日', { locale: zhTW })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentWeek(prev => addWeeks(prev, 1))}
                data-testid="button-next-week"
                className="h-8 w-8 p-0 sm:h-9 sm:w-9"
              >
                <i className="fas fa-chevron-right text-xs sm:text-sm"></i>
              </Button>
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${weekDays.length === 6 ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
            {weekDays.map((day, index) => {
              const daySchedules = getSchedulesForDay(day);
              const weekDayNames = getExtendedWeekdayNames(currentWeek);
              
              return (
                <div key={index} className="text-center">
                  <div className="text-sm font-medium text-muted-foreground mb-3" data-testid={`text-day-${index}`}>
                    {weekDayNames[index]}
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
      </main>
    </div>
  );
}