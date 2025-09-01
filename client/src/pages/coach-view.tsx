import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import { format, startOfWeek, addDays, addWeeks, subWeeks } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Schedule, Venue, TimeSlot } from "@shared/schema";

export default function CoachView() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "未授權",
        description: "您已登出，正在重新登入...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const weekStart = format(currentWeek, 'yyyy-MM-dd');
  const weekEnd = format(addDays(currentWeek, 4), 'yyyy-MM-dd');

  const { data: schedules, isLoading: schedulesLoading } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: ['/api/coach-schedules', { startDate: weekStart, endDate: weekEnd }],
    enabled: !!user && (user.role === 'coach' || user.role === 'admin'),
  });

  if (isLoading || schedulesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeek, i));

  const getSchedulesForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return schedules?.filter(s => s.date === dateStr) || [];
  };

  const getVenueColorClass = (color: string) => {
    switch (color) {
      case 'blue': return 'venue-blue';
      case 'green': return 'venue-green';
      case 'purple': return 'venue-purple';
      case 'yellow': return 'venue-yellow';
      case 'pink': return 'venue-pink';
      default: return 'bg-muted';
    }
  };

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
                教練模式
              </span>
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
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            {user.role === 'admin' && (
              <button 
                className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
                onClick={() => setLocation('/admin/schedule')}
                data-testid="tab-schedule-edit"
              >
                <i className="fas fa-calendar-alt mr-2"></i>課表編輯
              </button>
            )}
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-primary text-primary font-medium text-sm"
              data-testid="tab-coach-view"
            >
              <i className="fas fa-user-clock mr-2"></i>教練視圖
            </button>
            {user.role === 'admin' && (
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

        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold" data-testid="text-coach-name">
              {user.coachName || user.firstName || '教練'} - 本週課表
            </h2>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentWeek(prev => subWeeks(prev, 1))}
                data-testid="button-prev-week"
              >
                <i className="fas fa-chevron-left"></i>
              </Button>
              <span className="text-sm font-medium" data-testid="text-week-range">
                {format(currentWeek, 'yyyy年M月d日', { locale: zhTW })} - {format(addDays(currentWeek, 4), 'M月d日', { locale: zhTW })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentWeek(prev => addWeeks(prev, 1))}
                data-testid="button-next-week"
              >
                <i className="fas fa-chevron-right"></i>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {weekDays.map((day, index) => {
              const daySchedules = getSchedulesForDay(day);
              const weekDayNames = ['星期一', '星期二', '星期三', '星期四', '星期五'];
              
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
