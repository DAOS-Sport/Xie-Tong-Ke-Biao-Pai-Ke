import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLocation } from 'wouter';
import { format, addDays, startOfWeek, addWeeks } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { School, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Schedule, TimeSlot, Venue } from '@shared/schema';

// 多學校管理後台
export default function MultiSchoolAdmin() {
  const [, setLocation] = useLocation();
  const [selectedSchool, setSelectedSchool] = useState<string>('demo');
  const [currentWeek, setCurrentWeek] = useState(() => 
    startOfWeek(new Date('2024-09-22'), { weekStartsOn: 1 })
  );

  // 可用學校列表（實際環境中可能從API獲取）
  const availableSchools = [
    { code: 'demo', name: '新北高中' }
  ];

  // 獲取選定學校的數據
  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: [`/api/${selectedSchool}/schedules`, 'all'],
    queryFn: async () => {
      const response = await fetch(`/api/${selectedSchool}/schedules`);
      if (!response.ok) {
        console.error('API 錯誤:', response.status, response.statusText);
        throw new Error('Failed to fetch schedules');
      }
      const data = await response.json();
      return data;
    },
    enabled: !!selectedSchool,
  });

  const { data: timeSlots = [] } = useQuery<TimeSlot[]>({
    queryKey: [`/api/${selectedSchool}/time-slots`],
    queryFn: async () => {
      const response = await fetch(`/api/${selectedSchool}/time-slots`);
      if (!response.ok) {
        console.error('時間段 API 錯誤:', response.status, response.statusText);
        throw new Error('Failed to fetch time slots');
      }
      const data = await response.json();
      console.log('時間段資料載入:', data.length, '個');
      return data;
    },
    enabled: !!selectedSchool,
  });

  const { data: venues = [] } = useQuery<Venue[]>({
    queryKey: [`/api/${selectedSchool}/venues`],
    enabled: !!selectedSchool,
  });

  // 週期導航
  const navigateToPrevWeek = () => setCurrentWeek(prev => addWeeks(prev, -1));
  const navigateToNextWeek = () => setCurrentWeek(prev => addWeeks(prev, 1));
  
  // 生成週內日期
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeek, i));
  
  // 根據時間段和日期組織課程數據
  const getScheduleForDayAndSlot = (date: Date, timeSlotId: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const filtered = schedules.filter(s => 
      format(new Date(s.date), 'yyyy-MM-dd') === dateStr && s.timeSlotId === timeSlotId
    );
    
    // 調試日誌
    if (dateStr === '2024-09-16' && filtered.length > 0) {
      console.log(`${dateStr} 找到課程:`, filtered.map(f => `${f.className}${f.coachName}`));
    }
    return filtered;
  };

  // 獲取選中學校的資訊
  const selectedSchoolInfo = availableSchools.find(s => s.code === selectedSchool);

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
        {/* 學校選擇和週期導航 */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Select value={selectedSchool} onValueChange={setSelectedSchool}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="請選擇學校..." />
              </SelectTrigger>
              <SelectContent>
                {availableSchools.map((school) => (
                  <SelectItem key={school.code} value={school.code}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToPrevWeek}
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
              onClick={navigateToNextWeek}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 學校課表主標題 */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">
            {selectedSchoolInfo?.name} {format(currentWeek, 'MM.dd', { locale: zhTW })}-{format(addDays(currentWeek, 4), 'MM.dd', { locale: zhTW })}
          </h2>
        </div>

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
                        className="border-r border-gray-800 p-2 align-top min-h-16"
                      >
                        {daySchedules.length > 0 ? (
                          <div className="space-y-1">
                            {daySchedules.map((schedule, idx) => (
                              <div key={idx} className="text-blue-600 text-sm leading-tight">
                                <div>{schedule.className}</div>
                                <div>{schedule.coachName}</div>
                              </div>
                            ))}
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
      </div>
    </div>
  );
}