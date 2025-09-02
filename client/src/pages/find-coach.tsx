import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format, addDays, startOfWeek } from "date-fns";
import { zhTW } from "date-fns/locale";
import type { Venue, TimeSlot, Schedule } from "@shared/schema";

interface ScheduleWithRegistrations extends Schedule {
  venue: Venue;
  timeSlot: TimeSlot;
  registrations: Array<{
    id: string;
    coachName: string;
    registeredAt: string;
  }>;
}

export default function FindCoach() {
  const [, setLocation] = useLocation();
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithRegistrations | null>(null);
  const [coachName, setCoachName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { toast } = useToast();

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeek, i));
  const weekEnd = addDays(currentWeek, 4);

  // 獲取場館和時段
  const { data: venues } = useQuery<Venue[]>({
    queryKey: ['/api/venues'],
  });

  const { data: timeSlots } = useQuery<TimeSlot[]>({
    queryKey: ['/api/time-slots'],
  });

  // 獲取沒有教練的課程（週為單位）
  const { data: schedulesWithoutCoach, isLoading } = useQuery<ScheduleWithRegistrations[]>({
    queryKey: ['/api/schedules-without-coach', format(currentWeek, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch('/api/schedules-without-coach');
      if (!response.ok) throw new Error('Failed to fetch schedules');
      const allSchedules = await response.json();
      // 過濾出當週的課程
      return allSchedules.filter((schedule: ScheduleWithRegistrations) => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate >= currentWeek && scheduleDate <= weekEnd;
      });
    },
  });

  // 教練登記 mutation
  const registerMutation = useMutation({
    mutationFn: async ({ scheduleId, coachName }: { scheduleId: string; coachName: string }) => {
      const response = await fetch('/api/coach-registrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scheduleId, coachName }),
      });
      if (!response.ok) throw new Error('Failed to register coach');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedules-without-coach'] });
      setDialogOpen(false);
      setCoachName("");
      setSelectedSchedule(null);
      toast({
        title: "登記成功",
        description: "教練已成功登記此課程",
      });
    },
    onError: (error) => {
      console.error('Registration error:', error);
      toast({
        title: "登記失敗",
        description: error.message || '網路連線問題，請稍後再試',
        variant: "destructive",
      });
    },
  });

  const handleRegister = () => {
    if (!selectedSchedule || !coachName.trim()) {
      toast({
        title: "請填寫教練姓名",
        variant: "destructive",
      });
      return;
    }

    registerMutation.mutate({
      scheduleId: selectedSchedule.id,
      coachName: coachName.trim(),
    });
  };

  const navigateToPrevWeek = () => {
    setCurrentWeek(prev => addDays(prev, -7));
  };

  const navigateToNextWeek = () => {
    setCurrentWeek(prev => addDays(prev, 7));
  };

  const navigateToThisWeek = () => {
    setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }));
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

  // 獲取特定日期和時段的課程
  const getScheduleForSlot = (date: Date, venueId: string, timeSlotId: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return schedulesWithoutCoach?.find(s => 
      s.date === dateStr && 
      s.venueId === venueId && 
      s.timeSlotId === timeSlotId
    );
  };

  if (isLoading) {
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
              <h1 className="text-lg sm:text-xl font-bold text-primary">五泳池課表整合系統</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm bg-green-500 text-white px-3 py-1 rounded-full">
                尋找教練
              </span>
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
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/coach')}
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
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-primary text-primary font-medium text-xs sm:text-sm rounded-t sm:rounded-none bg-accent sm:bg-transparent"
              data-testid="tab-find-coach"
            >
              <i className="fas fa-search mr-1 sm:mr-2"></i>尋找教練
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateToPrevWeek}
                data-testid="button-prev-week"
                className="h-8 w-8 p-0 sm:h-9 sm:w-9"
              >
                <i className="fas fa-chevron-left text-xs sm:text-sm"></i>
              </Button>
              <h2 className="text-sm sm:text-lg font-semibold text-center flex-1 sm:flex-none" data-testid="text-current-week">
                {format(currentWeek, 'yyyy年M月d日', { locale: zhTW })} - {format(addDays(currentWeek, 4), 'M月d日', { locale: zhTW })}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateToNextWeek}
                data-testid="button-next-week"
                className="h-8 w-8 p-0 sm:h-9 sm:w-9"
              >
                <i className="fas fa-chevron-right text-xs sm:text-sm"></i>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToThisWeek}
                data-testid="button-this-week"
                className="text-xs sm:text-sm px-2 sm:px-3"
              >
                本週
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              灰色虛線邊框代表缺教練課程，點擊「我可以教」進行登記
            </div>
          </div>

          {!venues || !timeSlots ? (
            <div className="text-center py-8">
              <div className="text-muted-foreground">載入中...</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border border-border p-2 bg-muted text-center text-sm font-medium min-w-20">
                      節次/時間
                    </th>
                    {weekDays.map((day) => (
                      <th key={format(day, 'yyyy-MM-dd')} className="border border-border p-2 bg-muted text-center text-sm font-medium min-w-32">
                        <div>{format(day, 'M月d日', { locale: zhTW })}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(day, 'EEE', { locale: zhTW })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots?.map((timeSlot) => (
                    <tr key={timeSlot.id}>
                      <td className="border border-border p-2 bg-muted text-center text-sm font-medium">
                        <div>{timeSlot.period}</div>
                        <div className="text-xs text-muted-foreground">
                          {timeSlot.startTime}-{timeSlot.endTime}
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        return (
                          <td key={`${dateStr}-${timeSlot.id}`} className="border border-border p-1">
                            <div className="grid gap-1">
                              {venues?.map((venue) => {
                                const schedule = getScheduleForSlot(day, venue.id, timeSlot.id);
                                if (!schedule) return null;
                                
                                return (
                                  <div key={venue.id} className="relative">
                                    <div className={`p-2 rounded text-xs ${getVenueColorClass(venue.color)} bg-gray-100 border-2 border-dashed border-gray-400`}>
                                      <div className="font-medium mb-1">{schedule.className}</div>
                                      <div className="text-xs text-gray-600 mb-2">{venue.name}</div>
                                      
                                      {schedule.registrations.length > 0 ? (
                                        <div className="mb-2">
                                          <div className="text-xs text-gray-600 mb-1">登記教練：</div>
                                          <div className="flex flex-wrap gap-1">
                                            {schedule.registrations.map((reg) => (
                                              <Badge key={reg.id} variant="secondary" className="text-xs px-1 py-0">
                                                {reg.coachName}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-xs text-red-600 mb-2">缺教練</div>
                                      )}
                                      
                                      <Dialog open={dialogOpen && selectedSchedule?.id === schedule.id} 
                                             onOpenChange={(open) => {
                                               setDialogOpen(open);
                                               if (!open) {
                                                 setSelectedSchedule(null);
                                                 setCoachName("");
                                               }
                                             }}>
                                        <DialogTrigger asChild>
                                          <Button 
                                            size="sm"
                                            onClick={() => setSelectedSchedule(schedule)}
                                            className="w-full bg-green-600 hover:bg-green-700 text-white text-xs h-6"
                                            data-testid={`button-register-${schedule.id}`}
                                          >
                                            我可以教
                                          </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                          <DialogHeader>
                                            <DialogTitle>教練登記</DialogTitle>
                                          </DialogHeader>
                                          <div className="space-y-4">
                                            <div>
                                              <p className="text-sm text-muted-foreground mb-2">課程資訊：</p>
                                              <p className="font-medium">{schedule.className}</p>
                                              <p className="text-sm text-muted-foreground">
                                                {schedule.venue.name} - {schedule.timeSlot.period} 
                                                ({schedule.timeSlot.startTime}-{schedule.timeSlot.endTime})
                                              </p>
                                              <p className="text-sm text-muted-foreground">
                                                {format(new Date(schedule.date), 'yyyy/MM/dd (EEE)', { locale: zhTW })}
                                              </p>
                                            </div>
                                            
                                            <div>
                                              <Label htmlFor="coachName">教練姓名</Label>
                                              <Input
                                                id="coachName"
                                                value={coachName}
                                                onChange={(e) => setCoachName(e.target.value)}
                                                placeholder="請輸入您的姓名"
                                                data-testid="input-coach-name"
                                              />
                                            </div>

                                            <div className="flex justify-end space-x-2">
                                              <Button 
                                                variant="outline" 
                                                onClick={() => {
                                                  setDialogOpen(false);
                                                  setSelectedSchedule(null);
                                                  setCoachName("");
                                                }}
                                                data-testid="button-cancel"
                                              >
                                                取消
                                              </Button>
                                              <Button 
                                                onClick={handleRegister}
                                                disabled={registerMutation.isPending || !coachName.trim()}
                                                data-testid="button-confirm-register"
                                              >
                                                {registerMutation.isPending ? '登記中...' : '確認登記'}
                                              </Button>
                                            </div>
                                          </div>
                                        </DialogContent>
                                      </Dialog>
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
          )}
        </div>
      </main>
    </div>
  );
}