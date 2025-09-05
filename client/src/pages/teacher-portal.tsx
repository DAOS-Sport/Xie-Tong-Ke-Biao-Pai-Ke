import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, RotateCcw, Users, User } from 'lucide-react';
import type { Schedule, Teacher, TeacherFeedback } from '@shared/schema';

// 使用者前台：老師協作回覆系統
export default function TeacherPortal() {
  const { schoolCode } = useParams<{ schoolCode: string }>();
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 獲取教師列表
  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: [`/api/${schoolCode}/teachers`],
    enabled: !!schoolCode,
  });

  // 獲取所有課表（用於整週視圖）
  const { data: allSchedules = [] } = useQuery<Schedule[]>({
    queryKey: [`/api/${schoolCode}/schedules`, 'all', currentWeek],
    queryFn: async () => {
      const startDate = format(currentWeek, 'yyyy-MM-dd');
      const endDate = format(addDays(currentWeek, 6), 'yyyy-MM-dd');
      const response = await fetch(`/api/${schoolCode}/schedules?startDate=${startDate}&endDate=${endDate}`);
      return response.json();
    },
    enabled: !!schoolCode,
  });

  // 獲取選定教師的課表
  const { data: teacherSchedules = [] } = useQuery<Schedule[]>({
    queryKey: [`/api/${schoolCode}/schedules`, selectedTeacher, currentWeek],
    queryFn: async () => {
      if (!selectedTeacher) return [];
      const startDate = format(currentWeek, 'yyyy-MM-dd');
      const endDate = format(addDays(currentWeek, 6), 'yyyy-MM-dd');
      const response = await fetch(`/api/${schoolCode}/schedules?teacher=${encodeURIComponent(selectedTeacher)}&startDate=${startDate}&endDate=${endDate}`);
      return response.json();
    },
    enabled: !!schoolCode && !!selectedTeacher,
  });

  // 獲取所有回覆狀態
  const { data: allFeedbacks = [] } = useQuery<TeacherFeedback[]>({
    queryKey: [`/api/${schoolCode}/feedbacks`, 'all'],
    queryFn: async () => {
      const response = await fetch(`/api/${schoolCode}/feedbacks`);
      return response.json();
    },
    enabled: !!schoolCode,
  });

  // 提交回覆
  const submitFeedback = useMutation({
    mutationFn: async (data: {
      scheduleId: string;
      teacherName: string;
      status: string;
      rescheduleDate?: string;
      reschedulePeriod?: string;
      comment?: string;
    }) => {
      const response = await fetch(`/api/${schoolCode}/feedbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to submit feedback');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/${schoolCode}/feedbacks`] });
      toast({ title: "✅ 已儲存", description: "回覆已成功送出" });
    },
    onError: () => {
      toast({ title: "❌ 儲存失敗", description: "請稍後再試", variant: "destructive" });
    },
  });

  // 獲取回覆狀態
  const getFeedbackForSchedule = (scheduleId: string) => {
    // 確保 allFeedbacks 是數組
    if (!Array.isArray(allFeedbacks)) {
      console.warn('allFeedbacks is not an array:', allFeedbacks);
      return undefined;
    }
    return allFeedbacks.find(f => f.scheduleId === scheduleId);
  };

  // 計算有課程的日子（只顯示有課的日子）
  const getScheduleDays = () => {
    const schedules = viewMode === 'all' ? allSchedules : teacherSchedules;
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));
    
    return weekDays.filter(day => {
      return schedules.some(s => isSameDay(new Date(s.date), day));
    });
  };

  // 獲取指定日期的課程
  const getSchedulesForDay = (day: Date) => {
    const schedules = viewMode === 'all' ? allSchedules : teacherSchedules;
    return schedules.filter(s => isSameDay(new Date(s.date), day));
  };

  // 狀態圖示和顏色
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'need_coop': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'no_coop': return <XCircle className="w-4 h-4 text-green-500" />;
      case 'reschedule': return <RotateCcw className="w-4 h-4 text-orange-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'need_coop': return <Badge variant="default">需要協同</Badge>;
      case 'no_coop': return <Badge variant="secondary">不需要協同</Badge>;
      case 'reschedule': return <Badge variant="destructive">需要調課</Badge>;
      default: return <Badge variant="outline">未填</Badge>;
    }
  };

  if (!schoolCode) {
    return <div className="p-6 text-center">無效的學校代碼</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* 標題區域 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">教師協作回覆系統</h1>
          <p className="text-gray-600">請選擇您的姓名，然後針對每堂課程選擇協作狀態</p>
        </div>

        {/* 視圖模式切換 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'all' | 'single')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="all" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  整週所有老師
                </TabsTrigger>
                <TabsTrigger value="single" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  選擇教師
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* 教師選擇（單一教師模式時顯示） */}
        {viewMode === 'single' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>選擇教師</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="請選擇您的姓名..." />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.teacherName}>
                      {teacher.teacherName} {teacher.subject && `(${teacher.subject})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* 週導航 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                上一週
              </Button>
              
              <h2 className="text-lg font-semibold">
                {format(currentWeek, 'yyyy年MM月dd日', { locale: zhTW })} - {' '}
                {format(addDays(currentWeek, 6), 'MM月dd日', { locale: zhTW })}
              </h2>
              
              <Button
                variant="outline"
                onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
              >
                下一週
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 條件檢查：單一教師模式需要選擇教師 */}
        {viewMode === 'single' && !selectedTeacher ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">請先選擇教師</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 週曆顯示 - 只顯示有課程的日子 */}
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${getScheduleDays().length || 1}, 1fr)` }}>
              {getScheduleDays().map((day, dayIndex) => {
                const daySchedules = getSchedulesForDay(day);
                
                return (
                  <Card key={dayIndex} className="min-h-[400px]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-center">
                        {format(day, 'EEEE', { locale: zhTW })}
                        <br />
                        {format(day, 'MM/dd')}
                        {daySchedules.length > 0 && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {daySchedules.length}堂課
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {daySchedules.map((schedule) => {
                        const feedback = getFeedbackForSchedule(schedule.id);
                        
                        return (
                          <ScheduleCard
                            key={schedule.id}
                            schedule={schedule}
                            feedback={feedback}
                            onSubmitFeedback={(data) => submitFeedback.mutate({
                              ...data,
                              teacherName: viewMode === 'single' ? selectedTeacher : schedule.coachName || '',
                              scheduleId: schedule.id,
                            })}
                            isSubmitting={submitFeedback.isPending}
                            showTeacherName={viewMode === 'all'}
                            currentUser={viewMode === 'single' ? selectedTeacher : ''}
                          />
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
              
              {getScheduleDays().length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-gray-500">本週無課程</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 課程卡片組件
function ScheduleCard({ 
  schedule, 
  feedback, 
  onSubmitFeedback, 
  isSubmitting,
  showTeacherName = false,
  currentUser = ''
}: {
  schedule: Schedule;
  feedback?: TeacherFeedback;
  onSubmitFeedback: (data: any) => void;
  isSubmitting: boolean;
  showTeacherName?: boolean;
  currentUser?: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [status, setStatus] = useState(feedback?.status || '');
  const [rescheduleDate, setRescheduleDate] = useState(feedback?.rescheduleDate || '');
  const [reschedulePeriod, setReschedulePeriod] = useState(feedback?.reschedulePeriod || '');
  const [comment, setComment] = useState(feedback?.comment || '');

  const handleSubmit = () => {
    onSubmitFeedback({
      status,
      rescheduleDate: status === 'reschedule' ? rescheduleDate : undefined,
      reschedulePeriod: status === 'reschedule' ? reschedulePeriod : undefined,
      comment: comment || undefined,
    });
    setShowDetails(false);
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'need_coop': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'no_coop': return <XCircle className="w-4 h-4 text-green-500" />;
      case 'reschedule': return <RotateCcw className="w-4 h-4 text-orange-500" />;
      default: return null;
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="font-medium text-sm">{schedule.className}</p>
          {showTeacherName && <p className="text-xs text-gray-600">{schedule.coachName}</p>}
        </div>
        {getStatusIcon(feedback?.status)}
      </div>
      
      <div className="mb-2">
        {feedback ? (
          <Badge 
            variant={feedback.status === 'need_coop' ? 'default' : 
                    feedback.status === 'no_coop' ? 'secondary' : 'destructive'}
            className="text-xs"
          >
            {feedback.status === 'need_coop' ? '需要協同' :
             feedback.status === 'no_coop' ? '不需要協同' : '需要調課'}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">未填</Badge>
        )}
      </div>

      {/* 只有在整週模式下且是該老師的課，或在單一教師模式下，才顯示回覆按鈕 */}
      {(showTeacherName && schedule.coachName) || currentUser ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => setShowDetails(!showDetails)}
          disabled={showTeacherName && schedule.coachName !== currentUser && currentUser !== ''}
        >
          {showDetails ? '收起' : '回覆'}
        </Button>
      ) : null}

      {showDetails && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <RadioGroup value={status} onValueChange={setStatus}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="need_coop" id="need_coop" />
              <Label htmlFor="need_coop" className="text-sm">需要協同</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no_coop" id="no_coop" />
              <Label htmlFor="no_coop" className="text-sm">不需要協同</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="reschedule" id="reschedule" />
              <Label htmlFor="reschedule" className="text-sm">需要調課</Label>
            </div>
          </RadioGroup>

          {status === 'reschedule' && (
            <div className="space-y-2">
              <Input
                type="date"
                placeholder="調課日期"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="text-sm"
              />
              <Input
                placeholder="調課節次 (例：第3節)"
                value={reschedulePeriod}
                onChange={(e) => setReschedulePeriod(e.target.value)}
                className="text-sm"
              />
            </div>
          )}

          <Textarea
            placeholder="備註 (可選)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="text-sm"
            rows={2}
          />

          <Button
            onClick={handleSubmit}
            disabled={!status || isSubmitting || (status === 'reschedule' && (!rescheduleDate || !reschedulePeriod))}
            className="w-full text-sm"
          >
            {isSubmitting ? '儲存中...' : '儲存回覆'}
          </Button>
        </div>
      )}
    </div>
  );
}