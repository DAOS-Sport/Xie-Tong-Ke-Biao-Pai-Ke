import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { School, Users, Clock, CheckCircle, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import type { Schedule, Teacher, TeacherFeedback } from '@shared/schema';

// 多學校管理後台
export default function MultiSchoolAdmin() {
  const [, setLocation] = useLocation();
  const [selectedSchool, setSelectedSchool] = useState<string>('demo');

  // 可用學校列表（實際環境中可能從API獲取）
  const availableSchools = [
    { code: 'demo', name: '示範學校' },
    { code: 'school1', name: '學校A' },
    { code: 'school2', name: '學校B' }
  ];

  // 獲取選定學校的數據
  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: [`/api/${selectedSchool}/teachers`],
    enabled: !!selectedSchool,
  });

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: [`/api/${selectedSchool}/schedules`, 'all'],
    queryFn: async () => {
      const response = await fetch(`/api/${selectedSchool}/schedules`);
      return response.json();
    },
    enabled: !!selectedSchool,
  });

  const { data: feedbacks = [] } = useQuery<TeacherFeedback[]>({
    queryKey: [`/api/${selectedSchool}/feedbacks`, 'all'],
    queryFn: async () => {
      const response = await fetch(`/api/${selectedSchool}/feedbacks`);
      return response.json();
    },
    enabled: !!selectedSchool,
  });

  // 統計計算
  const stats = {
    totalCourses: schedules.length,
    totalTeachers: teachers.length,
    totalFeedbacks: Array.isArray(feedbacks) ? feedbacks.length : 0,
    needCoop: Array.isArray(feedbacks) ? feedbacks.filter(f => f.status === 'need_coop').length : 0,
    noCoop: Array.isArray(feedbacks) ? feedbacks.filter(f => f.status === 'no_coop').length : 0,
    reschedule: Array.isArray(feedbacks) ? feedbacks.filter(f => f.status === 'reschedule').length : 0,
    pending: schedules.length - (Array.isArray(feedbacks) ? feedbacks.length : 0)
  };

  // 獲取需要協同的課程
  const needCoopCourses = Array.isArray(feedbacks) 
    ? feedbacks.filter(f => f.status === 'need_coop').map(f => {
        const schedule = schedules.find(s => s.id === f.scheduleId);
        return { ...f, schedule };
      }).filter(item => item.schedule)
    : [];

  // 獲取需要調課的課程
  const rescheduleCourses = Array.isArray(feedbacks)
    ? feedbacks.filter(f => f.status === 'reschedule').map(f => {
        const schedule = schedules.find(s => s.id === f.scheduleId);
        return { ...f, schedule };
      }).filter(item => item.schedule)
    : [];

  // 獲取未回覆的課程
  const pendingCourses = schedules.filter(s => 
    !Array.isArray(feedbacks) || !feedbacks.some(f => f.scheduleId === s.id)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <School className="mr-2 h-6 w-6 text-blue-600" />
              多學校協作管理系統
            </h1>
            <Button 
              variant="outline" 
              onClick={() => setLocation('/admin/schedule')}
            >
              返回主控台
            </Button>
          </div>

          {/* 導航欄 */}
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
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/find-coach')}
              data-testid="tab-find-coach"
            >
              <i className="fas fa-search mr-1 sm:mr-2"></i>尋找教練
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-primary text-primary font-medium text-xs sm:text-sm rounded-t sm:rounded-none bg-accent sm:bg-transparent"
              data-testid="tab-multi-school"
            >
              <i className="fas fa-school mr-1 sm:mr-2"></i>多學校管理
            </button>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 學校選擇 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>選擇學校</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedSchool} onValueChange={setSelectedSchool}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="請選擇學校..." />
              </SelectTrigger>
              <SelectContent>
                {availableSchools.map((school) => (
                  <SelectItem key={school.code} value={school.code}>
                    {school.name} ({school.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* 統計卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">總課程數</p>
                  <p className="text-2xl font-bold">{stats.totalCourses}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">總教師數</p>
                  <p className="text-2xl font-bold">{stats.totalTeachers}</p>
                </div>
                <School className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">需要協同</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.needCoop}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">不需協同</p>
                  <p className="text-2xl font-bold text-green-600">{stats.noCoop}</p>
                </div>
                <XCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">需要調課</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.reschedule}</p>
                </div>
                <RotateCcw className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">未回覆</p>
                  <p className="text-2xl font-bold text-red-600">{stats.pending}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 詳細資料標籤 */}
        <Tabs defaultValue="need-coop" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="need-coop">需要協同 ({stats.needCoop})</TabsTrigger>
            <TabsTrigger value="reschedule">需要調課 ({stats.reschedule})</TabsTrigger>
            <TabsTrigger value="pending">未回覆 ({stats.pending})</TabsTrigger>
            <TabsTrigger value="summary">總覽</TabsTrigger>
          </TabsList>

          <TabsContent value="need-coop" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>需要協同的課程</CardTitle>
              </CardHeader>
              <CardContent>
                {needCoopCourses.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>課程名稱</TableHead>
                        <TableHead>教師</TableHead>
                        <TableHead>備註</TableHead>
                        <TableHead>回覆時間</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {needCoopCourses.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.schedule ? format(new Date(item.schedule.date), 'MM/dd', { locale: zhTW }) : '-'}</TableCell>
                          <TableCell>{item.schedule?.className || '-'}</TableCell>
                          <TableCell>{item.teacherName}</TableCell>
                          <TableCell>{item.comment || '-'}</TableCell>
                          <TableCell>{item.updatedAt ? format(new Date(item.updatedAt), 'MM/dd HH:mm', { locale: zhTW }) : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-gray-500">目前沒有需要協同的課程</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reschedule" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>需要調課的課程</CardTitle>
              </CardHeader>
              <CardContent>
                {rescheduleCourses.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>原日期</TableHead>
                        <TableHead>課程名稱</TableHead>
                        <TableHead>教師</TableHead>
                        <TableHead>調課至</TableHead>
                        <TableHead>調課節次</TableHead>
                        <TableHead>備註</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rescheduleCourses.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.schedule ? format(new Date(item.schedule.date), 'MM/dd', { locale: zhTW }) : '-'}</TableCell>
                          <TableCell>{item.schedule?.className || '-'}</TableCell>
                          <TableCell>{item.teacherName}</TableCell>
                          <TableCell>
                            {item.rescheduleDate ? format(new Date(item.rescheduleDate), 'MM/dd', { locale: zhTW }) : '-'}
                          </TableCell>
                          <TableCell>{item.reschedulePeriod || '-'}</TableCell>
                          <TableCell>{item.comment || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-gray-500">目前沒有需要調課的課程</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>未回覆的課程</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingCourses.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>課程名稱</TableHead>
                        <TableHead>教師</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingCourses.map((schedule) => (
                        <TableRow key={schedule.id}>
                          <TableCell>{format(new Date(schedule.date), 'MM/dd', { locale: zhTW })}</TableCell>
                          <TableCell>{schedule.className}</TableCell>
                          <TableCell>{schedule.coachName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">等待回覆</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-8 text-gray-500">所有課程都已回覆</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>回覆狀況總覽</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>總課程數：</span>
                    <Badge variant="outline">{stats.totalCourses}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>已回覆：</span>
                    <Badge variant="secondary">{stats.totalFeedbacks}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>回覆率：</span>
                    <Badge variant="default">
                      {stats.totalCourses > 0 ? Math.round((stats.totalFeedbacks / stats.totalCourses) * 100) : 0}%
                    </Badge>
                  </div>
                  <hr />
                  <div className="flex justify-between items-center">
                    <span>需要協同：</span>
                    <Badge variant="default">{stats.needCoop}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>不需協同：</span>
                    <Badge variant="secondary">{stats.noCoop}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>需要調課：</span>
                    <Badge variant="destructive">{stats.reschedule}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>尚未回覆：</span>
                    <Badge variant="outline">{stats.pending}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}