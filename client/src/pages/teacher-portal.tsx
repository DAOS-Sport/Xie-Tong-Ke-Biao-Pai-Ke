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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, RotateCcw, Users, User } from 'lucide-react';
import type { Schedule, Teacher, TeacherFeedback, TimeSlot, Venue } from '@shared/schema';

// 使用者前台：老師協作回覆系統（新北高中）
export default function TeacherPortal() {
  // 固定連接新北高中資料
  const schoolCode = 'demo';
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [currentWeek, setCurrentWeek] = useState(() => {
    // 設定為新北高中課表資料的週期（2024年9月16日週）
    const targetDate = new Date('2024-09-16');
    return startOfWeek(targetDate, { weekStartsOn: 1 });
  });
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 獲取教師列表（從課表中提取）
  const { data: teachers = [] } = useQuery<string[]>({
    queryKey: [`/api/${schoolCode}/teachers`],
    queryFn: async () => {
      const response = await fetch(`/api/${schoolCode}/schedules`);
      const schedules: Schedule[] = await response.json();
      const uniqueTeachers = Array.from(new Set(schedules.map((s: Schedule) => s.coachName))).filter(Boolean) as string[];
      return uniqueTeachers.sort();
    },
  });

  // 獲取所有課表（用於整週視圖）
  const { data: allSchedules = [] } = useQuery<Schedule[]>({
    queryKey: [`/api/${schoolCode}/schedules`, 'all', currentWeek],
    queryFn: async () => {
      const startDate = format(currentWeek, 'yyyy-MM-dd');
      const endDate = format(addDays(currentWeek, 4), 'yyyy-MM-dd'); // 週一到週五
      const response = await fetch(`/api/${schoolCode}/schedules?startDate=${startDate}&endDate=${endDate}`);
      const data = await response.json();
      console.log(`教師協作系統查詢 ${startDate} 到 ${endDate}:`, data.length, '筆課表');
      return data;
    },
  });

  // 獲取選定教師的課表
  const { data: teacherSchedules = [] } = useQuery<Schedule[]>({
    queryKey: [`/api/${schoolCode}/schedules`, selectedTeacher, currentWeek],
    queryFn: async () => {
      if (!selectedTeacher) return [];
      const startDate = format(currentWeek, 'yyyy-MM-dd');
      const endDate = format(addDays(currentWeek, 4), 'yyyy-MM-dd'); // 週一到週五
      const response = await fetch(`/api/${schoolCode}/schedules?teacher=${encodeURIComponent(selectedTeacher)}&startDate=${startDate}&endDate=${endDate}`);
      return response.json();
    },
    enabled: !!selectedTeacher,
  });

  // 獲取時間段資料
  const { data: timeSlots = [] } = useQuery<TimeSlot[]>({
    queryKey: [`/api/${schoolCode}/time-slots`],
    queryFn: async () => {
      const response = await fetch(`/api/${schoolCode}/time-slots`);
      return response.json();
    },
  });

  // 獲取場館資料
  const { data: venues = [] } = useQuery<Venue[]>({
    queryKey: [`/api/${schoolCode}/venues`],
    queryFn: async () => {
      const response = await fetch(`/api/${schoolCode}/venues`);
      return response.json();
    },
  });

  // 獲取所有回覆狀態
  const { data: allFeedbacks = [] } = useQuery<any[]>({
    queryKey: [`/api/${schoolCode}/feedbacks`, 'all'],
    queryFn: async () => {
      const response = await fetch(`/api/${schoolCode}/feedbacks`);
      return response.json();
    },
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
      // 設置10秒超時，適合生產環境
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(`/api/${schoolCode}/feedbacks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          let detail = await response.text();
          try {
            const jsonError = JSON.parse(detail);
            detail = jsonError.message || detail;
          } catch {}
          throw new Error(`儲存失敗：${detail}`);
        }
        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('請求超時，請檢查網路連接');
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/${schoolCode}/feedbacks`] });
      toast({ title: "✅ 已儲存", description: "回覆已成功送出" });
    },
    onError: (error) => {
      console.error('提交錯誤:', error);
      const message = error instanceof Error ? error.message : '請稍後再試';
      toast({ 
        title: "❌ 儲存失敗", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  // 獲取回覆狀態
  const getFeedbackForSchedule = (scheduleId: string) => {
    // 確保 allFeedbacks 是數組
    if (!Array.isArray(allFeedbacks)) {
      console.warn('allFeedbacks is not an array:', allFeedbacks);
      return undefined;
    }
    // 支援 camelCase 和 snake_case
    return allFeedbacks.find(f => f.schedule_id === scheduleId || f.scheduleId === scheduleId);
  };

  // 生成週內日期（週一到週五）
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeek, i));

  // 根據時間段和日期組織課程數據
  const getScheduleForDayAndSlot = (date: Date, timeSlotId: string) => {
    const schedules = viewMode === 'all' ? allSchedules : teacherSchedules;
    const dateStr = format(date, 'yyyy-MM-dd');
    return schedules.filter(s => 
      format(new Date(s.date), 'yyyy-MM-dd') === dateStr && s.timeSlotId === timeSlotId
    );
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                  {teachers.map((teacher, index) => (
                    <SelectItem key={index} value={teacher}>
                      {teacher}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* 週導航 */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-32 text-center">
            {format(currentWeek, 'MM/dd', { locale: zhTW })} - {format(addDays(currentWeek, 4), 'MM/dd', { locale: zhTW })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 課表主標題 */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">
            新北高中 {format(currentWeek, 'MM.dd', { locale: zhTW })}-{format(addDays(currentWeek, 4), 'MM.dd', { locale: zhTW })}
          </h2>
        </div>

        {/* 條件檢查：單一教師模式需要選擇教師 */}
        {viewMode === 'single' && !selectedTeacher ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">請先選擇教師</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 課表表格 */}
            <div className="bg-white border-2 border-gray-800 overflow-hidden">
              <Table className="w-full border-collapse">
                <TableHeader>
                  <TableRow className="border-b-2 border-gray-800">
                    <TableHead className="border-r-2 border-gray-800 text-center font-bold text-black bg-gray-100 w-20">
                      星期<br />節次
                    </TableHead>
                    {weekDays.map((day, index) => (
                      <TableHead 
                        key={index}
                        className="border-r-2 border-gray-800 text-center font-bold text-black bg-gray-100 min-w-32"
                      >
                        {['一', '二', '三', '四', '五'][index]}<br />
                        {format(day, 'MM/dd')}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeSlots.slice(0, 7).map((timeSlot, periodIndex) => (
                    <TableRow key={timeSlot.id} className="border-b border-gray-800">
                      <TableCell className="border-r-2 border-gray-800 text-center font-bold bg-gray-50 text-black">
                        {periodIndex + 1}
                      </TableCell>
                      {weekDays.map((day, dayIndex) => {
                        const daySchedules = getScheduleForDayAndSlot(day, timeSlot.id);
                        return (
                          <TableCell 
                            key={dayIndex}
                            className="border-r border-gray-800 p-1 align-top min-h-16"
                          >
                            {daySchedules.length > 0 ? (
                              <div className="space-y-1">
                                {daySchedules.map((schedule, idx) => {
                                  const feedback = getFeedbackForSchedule(schedule.id);
                                  
                                  return (
                                    <div key={idx} className="bg-blue-50 p-2 rounded border border-blue-200 text-xs">
                                      <div className="font-semibold text-blue-600">{schedule.className}</div>
                                      <div className="text-blue-500">{schedule.coachName}</div>
                                      {feedback && (
                                        <div className="mt-1">
                                          {getStatusBadge(feedback.status)}
                                        </div>
                                      )}
                                      {(!feedback || feedback.status === '') && (
                                        <div className="mt-1">
                                          <FeedbackButtons
                                            schedule={schedule}
                                            onSubmitFeedback={(data) => submitFeedback.mutate({
                                              ...data,
                                              teacherName: viewMode === 'single' ? selectedTeacher : schedule.coachName || '',
                                              scheduleId: schedule.id,
                                            })}
                                            isSubmitting={submitFeedback.isPending}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="h-12"></div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 回覆按鈕組件
function FeedbackButtons({ 
  schedule, 
  onSubmitFeedback, 
  isSubmitting
}: {
  schedule: Schedule;
  onSubmitFeedback: (data: any) => void;
  isSubmitting: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [status, setStatus] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [reschedulePeriod, setReschedulePeriod] = useState('');
  const [comment, setComment] = useState('');

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
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs h-6"
        onClick={() => setShowDetails(!showDetails)}
      >
        {showDetails ? '收起' : '回覆'}
      </Button>

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