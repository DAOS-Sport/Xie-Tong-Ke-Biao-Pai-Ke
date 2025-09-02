import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface Schedule {
  id: string;
  date: string;
  className: string;
  venue: {
    id: string;
    name: string;
    color: string;
  };
  timeSlot: {
    id: string;
    period: string;
    startTime: string;
    endTime: string;
  };
  registrations: Array<{
    id: string;
    coachName: string;
    registeredAt: string;
  }>;
}

export default function FindCoach() {
  const [, setLocation] = useLocation();
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [coachName, setCoachName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  // 獲取沒有教練的課程
  const { data: schedules, isLoading } = useQuery<Schedule[]>({
    queryKey: ['/api/schedules-without-coach'],
    queryFn: async () => {
      const response = await fetch('/api/schedules-without-coach');
      if (!response.ok) throw new Error('Failed to fetch schedules');
      return response.json();
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

  const getVenueColorClass = (color: string) => {
    switch (color) {
      case 'blue': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'green': return 'bg-green-100 text-green-800 border-green-200';
      case 'purple': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'pink': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'orange': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
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
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation('/admin/schedule')}
                data-testid="button-back-admin"
              >
                返回管理員
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">尋找教練</h2>
          <p className="text-muted-foreground">以下課程目前沒有指派教練，點擊「我可以教」按鈕進行登記</p>
        </div>

        {!schedules || schedules.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <i className="fas fa-check-circle text-4xl text-green-500 mb-4"></i>
              <h3 className="text-lg font-semibold mb-2">太好了！</h3>
              <p className="text-muted-foreground">目前所有課程都已安排教練</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {schedules.map((schedule) => (
              <Card key={schedule.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {schedule.className}
                        </h3>
                        <Badge variant="outline" className={getVenueColorClass(schedule.venue.color)}>
                          {schedule.venue.name}
                        </Badge>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <i className="fas fa-calendar"></i>
                          {format(new Date(schedule.date), 'yyyy/MM/dd (EEE)', { locale: require('date-fns/locale/zh-TW') })}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="fas fa-clock"></i>
                          {schedule.timeSlot.period} ({schedule.timeSlot.startTime}-{schedule.timeSlot.endTime})
                        </span>
                      </div>

                      {schedule.registrations.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm text-muted-foreground mb-2">已登記教練：</p>
                          <div className="flex flex-wrap gap-2">
                            {schedule.registrations.map((reg) => (
                              <Badge key={reg.id} variant="secondary">
                                {reg.coachName}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0">
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
                            onClick={() => setSelectedSchedule(schedule)}
                            className="bg-green-600 hover:bg-green-700 text-white"
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
                                {format(new Date(schedule.date), 'yyyy/MM/dd (EEE)', { locale: require('date-fns/locale/zh-TW') })}
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}