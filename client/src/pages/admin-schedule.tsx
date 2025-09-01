import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { zhTW } from "date-fns/locale";
import WeekScheduleGrid from "@/components/week-schedule-grid";
import WeekConflictAlert from "@/components/week-conflict-alert";
import PasswordProtect from "@/components/password-protect";
import { Button } from "@/components/ui/button";

export default function AdminSchedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Remove Replit authentication requirement for public access

  // Allow public access to admin interface

  const navigateToPrevWeek = () => {
    setCurrentWeek(prev => subWeeks(prev, 1));
  };

  const navigateToNextWeek = () => {
    setCurrentWeek(prev => addWeeks(prev, 1));
  };

  const navigateToThisWeek = () => {
    setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }));
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
                    data-testid="button-logout"
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
          <nav className="flex space-x-8" aria-label="Tabs">
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-primary text-primary font-medium text-sm"
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
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/venue-schedule')}
              data-testid="tab-venue-schedule"
            >
              <i className="fas fa-building mr-2"></i>場館課表顯示
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/venue-schedule-edit')}
              data-testid="tab-venue-schedule-edit"
            >
              <i className="fas fa-edit mr-2"></i>場館課表編輯
            </button>
            <button 
              className="whitespace-nowrap py-2 px-1 border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border font-medium text-sm"
              onClick={() => setLocation('/statistics')}
              data-testid="tab-statistics"
            >
              <i className="fas fa-chart-bar mr-2"></i>堂數統計
            </button>
          </nav>
        </div>

        <WeekConflictAlert weekStart={currentWeek} />

        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateToPrevWeek}
                data-testid="button-prev-week"
              >
                <i className="fas fa-chevron-left"></i>
              </Button>
              <h2 className="text-lg font-semibold" data-testid="text-current-week">
                {format(currentWeek, 'yyyy年M月d日', { locale: zhTW })} - {format(addDays(currentWeek, 4), 'M月d日', { locale: zhTW })}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateToNextWeek}
                data-testid="button-next-week"
              >
                <i className="fas fa-chevron-right"></i>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={navigateToThisWeek}
                data-testid="button-this-week"
              >
                本週
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="secondary" size="sm" data-testid="button-copy-week">
                <i className="fas fa-copy mr-2"></i>複製週課表
              </Button>
              <Button size="sm" data-testid="button-save">
                <i className="fas fa-save mr-2"></i>儲存
              </Button>
            </div>
          </div>

          <PasswordProtect>
            <WeekScheduleGrid weekStart={currentWeek} />
          </PasswordProtect>
        </div>
      </main>
    </div>
  );
}
