import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { format, addMonths, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordProtect from "@/components/password-protect";

const VENUE_COLORS: Record<string, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  yellow: "#eab308",
  pink: "#ec4899",
  red: "#ef4444",
  orange: "#f97316",
  teal: "#14b8a6",
  indigo: "#6366f1",
  cyan: "#06b6d4",
};

export default function Statistics() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [searchCoach, setSearchCoach] = useState("");

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
    teachingClasses: number;
    assistClasses: number;
    venueBreakdown: { venueName: string; count: number; color: string }[];
  }[]>({
    queryKey: [`/api/statistics?startDate=${currentPeriod.startDate}&endDate=${currentPeriod.endDate}`],
  });

  const filteredStatistics = useMemo(() => {
    if (!statistics) return [];
    if (!searchCoach) return statistics;
    return statistics.filter(stat => stat.coachName.includes(searchCoach));
  }, [statistics, searchCoach]);

  const allVenues = useMemo(() => {
    if (!statistics) return [];
    const venueMap = new Map<string, string>();
    statistics.forEach(stat => {
      stat.venueBreakdown.forEach(v => {
        if (!venueMap.has(v.venueName)) {
          venueMap.set(v.venueName, v.color);
        }
      });
    });
    return Array.from(venueMap.entries()).map(([name, color]) => ({ name, color }));
  }, [statistics]);

  const totalClasses = useMemo(() => {
    return filteredStatistics.reduce((sum, s) => sum + s.totalClasses, 0);
  }, [filteredStatistics]);

  const getVenueBg = (color: string) => VENUE_COLORS[color] || "#6b7280";

  const exportToExcel = () => {
    if (!filteredStatistics.length) {
      toast({ title: "無資料可匯出", variant: "destructive" });
      return;
    }

    const venueNames = allVenues.map(v => v.name);
    const headers = ["教練姓名", "總堂數", "當班", "偕同", ...venueNames];
    const rows = filteredStatistics.map(stat => {
      const venueCountMap = new Map(stat.venueBreakdown.map(v => [v.venueName, v.count]));
      return [
        stat.coachName,
        stat.totalClasses.toString(),
        (stat.teachingClasses || 0).toString(),
        (stat.assistClasses || 0).toString(),
        ...venueNames.map(vn => (venueCountMap.get(vn) || 0).toString())
      ];
    });

    const totalRow = [
      "合計",
      totalClasses.toString(),
      filteredStatistics.reduce((sum, s) => sum + (s.teachingClasses || 0), 0).toString(),
      filteredStatistics.reduce((sum, s) => sum + (s.assistClasses || 0), 0).toString(),
      ...venueNames.map(vn => {
        const sum = filteredStatistics.reduce((acc, stat) => {
          const venue = stat.venueBreakdown.find(v => v.venueName === vn);
          return acc + (venue?.count || 0);
        }, 0);
        return sum.toString();
      })
    ];

    const BOM = "\uFEFF";
    const csvContent = BOM + [headers, ...rows, totalRow].map(row =>
      row.map(cell => `"${cell}"`).join(",")
    ).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `堂數統計_${currentPeriod.startDate}_${currentPeriod.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "匯出成功", description: "CSV 檔案已下載，可用 Excel 開啟" });
  };

  if (statsLoading) {
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
              <span className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded-full">
                管理員模式
              </span>
              {user && (
                <>
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
          <nav className="flex flex-wrap gap-2 sm:space-x-8 sm:gap-0" aria-label="Tabs">
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/coach')}
            >
              <i className="fas fa-user-clock mr-1 sm:mr-2"></i>教練視圖
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/venue-schedule')}
            >
              <i className="fas fa-building mr-1 sm:mr-2"></i>場館課表顯示
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation('/mgt-x9k7p2/class-edit')}
            >
              <i className="fas fa-edit mr-1 sm:mr-2"></i>學校課表編輯 (第一階段)
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/mgt-x9k7p2/assign")}
            >
              <i className="fas fa-user-plus mr-1 sm:mr-2"></i>教練指派 (第二階段)
            </button>
            <button 
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-primary text-primary font-medium text-xs sm:text-sm rounded-t sm:rounded-none bg-accent sm:bg-transparent"
            >
              <i className="fas fa-chart-bar mr-1 sm:mr-2"></i>堂數統計
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-accent sm:hover:bg-transparent"
              onClick={() => setLocation("/mgt-x9k7p2/approval")}
            >
              <i className="fas fa-user-check mr-1 sm:mr-2"></i>教練審核
            </button>
            <button
              className="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 border-transparent text-green-600 hover:text-green-700 hover:border-green-400 font-medium text-xs sm:text-sm rounded-t sm:rounded-none hover:bg-green-50 sm:hover:bg-transparent"
              onClick={() => setLocation("/coach-portal")}
            >
              <i className="fas fa-door-open mr-1 sm:mr-2"></i>教練前台
            </button>
          </nav>
        </div>

        <PasswordProtect>
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <h2 className="text-base sm:text-lg font-semibold">堂數統計</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
                    className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                  >
                    <i className="fas fa-chevron-left text-xs sm:text-sm"></i>
                  </Button>
                  <span className="text-xs sm:text-sm font-medium text-center flex-1 sm:min-w-48">
                    {currentPeriod.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
                    className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                  >
                    <i className="fas fa-chevron-right text-xs sm:text-sm"></i>
                  </Button>
                </div>
                <Button size="sm" onClick={exportToExcel} className="w-full sm:w-auto text-xs sm:text-sm">
                  <i className="fas fa-download mr-1 sm:mr-2"></i>匯出 Excel
                </Button>
              </div>
            </div>

            <div className="mb-4">
              <Input
                type="text"
                placeholder="搜尋教練姓名..."
                value={searchCoach}
                onChange={(e) => setSearchCoach(e.target.value)}
                className="w-full sm:max-w-md text-sm"
              />
            </div>

            {filteredStatistics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{filteredStatistics.length}</div>
                  <div className="text-xs text-blue-600">教練人數</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{totalClasses}</div>
                  <div className="text-xs text-green-600">總堂數</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-purple-600">{allVenues.length}</div>
                  <div className="text-xs text-purple-600">場館數</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {filteredStatistics.length > 0 ? (totalClasses / filteredStatistics.length).toFixed(1) : 0}
                  </div>
                  <div className="text-xs text-amber-600">平均堂數</div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-center p-3 text-sm font-medium text-muted-foreground w-12">#</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">教練姓名</th>
                    <th className="text-center p-3 text-sm font-medium text-muted-foreground w-20">總堂數</th>
                    <th className="text-center p-3 text-sm font-medium text-muted-foreground w-20">當班</th>
                    <th className="text-center p-3 text-sm font-medium text-muted-foreground w-20">偕同</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">各場館分布</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredStatistics.length > 0 ? (
                    <>
                      {filteredStatistics.map((stat, index) => (
                        <tr key={index} className="hover:bg-muted/50">
                          <td className="p-3 text-sm text-center text-muted-foreground">{index + 1}</td>
                          <td className="p-3 text-sm font-medium">{stat.coachName}</td>
                          <td className="p-3 text-sm text-center font-bold text-primary">{stat.totalClasses}</td>
                          <td className="p-3 text-sm text-center font-medium text-orange-600">{stat.teachingClasses || 0}</td>
                          <td className="p-3 text-sm text-center font-medium text-blue-500">{stat.assistClasses || 0}</td>
                          <td className="p-3 text-sm">
                            <div className="flex flex-wrap gap-1.5">
                              {stat.venueBreakdown.map((venue, vIndex) => (
                                <span
                                  key={vIndex}
                                  className="text-white px-2 py-0.5 rounded text-xs font-medium"
                                  style={{ backgroundColor: getVenueBg(venue.color) }}
                                >
                                  {venue.venueName} {venue.count}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted/70 font-semibold">
                        <td className="p-3 text-sm text-center"></td>
                        <td className="p-3 text-sm">合計 ({filteredStatistics.length} 位教練)</td>
                        <td className="p-3 text-sm text-center font-bold text-primary">{totalClasses}</td>
                        <td className="p-3 text-sm text-center font-medium text-orange-600">{filteredStatistics.reduce((sum, s) => sum + (s.teachingClasses || 0), 0)}</td>
                        <td className="p-3 text-sm text-center font-medium text-blue-500">{filteredStatistics.reduce((sum, s) => sum + (s.assistClasses || 0), 0)}</td>
                        <td className="p-3 text-sm">
                          <div className="flex flex-wrap gap-1.5">
                            {allVenues.map((venue, vIndex) => {
                              const sum = filteredStatistics.reduce((acc, stat) => {
                                const v = stat.venueBreakdown.find(b => b.venueName === venue.name);
                                return acc + (v?.count || 0);
                              }, 0);
                              if (sum === 0) return null;
                              return (
                                <span
                                  key={vIndex}
                                  className="text-white px-2 py-0.5 rounded text-xs font-medium"
                                  style={{ backgroundColor: getVenueBg(venue.color) }}
                                >
                                  {venue.name} {sum}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {searchCoach ? '未找到符合條件的教練' : '本期間無課程記錄'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </PasswordProtect>
      </main>
    </div>
  );
}
