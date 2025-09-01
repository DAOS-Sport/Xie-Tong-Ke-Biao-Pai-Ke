import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { format, addMonths, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Statistics() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [searchCoach, setSearchCoach] = useState("");

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

    if (!isLoading && user && user.role !== 'admin') {
      toast({
        title: "權限不足",
        description: "此功能僅限管理員使用",
        variant: "destructive",
      });
      setLocation('/');
      return;
    }
  }, [isAuthenticated, isLoading, user, toast, setLocation]);

  // Calculate statistics period (14th to 15th of next month)
  const getStatisticsPeriod = (baseDate: Date) => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const startDate = new Date(year, month, 14);
    const endDate = new Date(year, month + 1, 15);
    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      label: `${format(startDate, 'yyyy年M月', { locale: zhTW })} (14日-${format(endDate, 'M月15日', { locale: zhTW })})`
    };
  };

  const currentPeriod = getStatisticsPeriod(selectedMonth);

  const { data: statistics, isLoading: statsLoading } = useQuery<{
    coachName: string;
    totalClasses: number;
    venueBreakdown: { venueName: string; count: number; color: string }[];
  }[]>({
    queryKey: ['/api/statistics', { 
      startDate: currentPeriod.startDate, 
      endDate: currentPeriod.endDate,
      ...(searchCoach && { coachName: searchCoach })
    }],
    enabled: !!user && user.role === 'admin',
  });

  if (isLoading || statsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

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

  const filteredStatistics = statistics?.filter(stat => 
    !searchCoach || stat.coachName.includes(searchCoach)
  ) || [];

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
              <span className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-full">
                管理員模式
              </span>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <i className="fas fa-user text-primary-foreground text-sm"></i>
                </div>
                <span className="text-sm font-medium">{user.firstName || user.email || '管理員'}</span>
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
              className="whitespace-nowrap py-2 px-1 border-b-2 border-primary text-primary font-medium text-sm"
              data-testid="tab-statistics"
            >
              <i className="fas fa-chart-bar mr-2"></i>堂數統計
            </button>
          </nav>
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">堂數統計</h2>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
                data-testid="button-prev-month"
              >
                <i className="fas fa-chevron-left"></i>
              </Button>
              <span className="text-sm font-medium min-w-48 text-center" data-testid="text-period">
                {currentPeriod.label}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
                data-testid="button-next-month"
              >
                <i className="fas fa-chevron-right"></i>
              </Button>
              <Button size="sm" data-testid="button-export-excel">
                <i className="fas fa-download mr-2"></i>匯出 Excel
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <Input
              type="text"
              placeholder="搜尋教練姓名..."
              value={searchCoach}
              onChange={(e) => setSearchCoach(e.target.value)}
              className="w-full max-w-md"
              data-testid="input-coach-search"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">教練姓名</th>
                  <th className="text-center p-3 text-sm font-medium text-muted-foreground">總堂數</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">各場館分布</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStatistics.length > 0 ? (
                  filteredStatistics.map((stat, index) => (
                    <tr key={index} data-testid={`row-coach-${index}`}>
                      <td className="p-3 text-sm">{stat.coachName}</td>
                      <td className="p-3 text-sm text-center font-semibold">{stat.totalClasses}</td>
                      <td className="p-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          {stat.venueBreakdown.map((venue, vIndex) => (
                            <span 
                              key={vIndex}
                              className={`${getVenueColorClass(venue.color)} text-white px-2 py-1 rounded text-xs`}
                              data-testid={`venue-badge-${venue.venueName}-${vIndex}`}
                            >
                              {venue.venueName} {venue.count}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-muted-foreground">
                      {searchCoach ? '未找到符合條件的教練' : '本期間無課程記錄'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
