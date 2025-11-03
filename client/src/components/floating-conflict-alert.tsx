import { useState, useEffect } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FloatingConflictAlertProps {
  weekStart: Date;
}

const DISMISS_KEY = "conflict_alert_dismiss_until";

export default function FloatingConflictAlert({ weekStart }: FloatingConflictAlertProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [suppressToday, setSuppressToday] = useState(false);
  
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  
  const conflictQueries = useQueries({
    queries: weekDays.map(day => ({
      queryKey: [`/api/conflicts/${format(day, 'yyyy-MM-dd')}`],
    })),
  });

  const { data: timeSlots } = useQuery<{ id: string; period: string }[]>({
    queryKey: ['/api/time-slots'],
  });

  const allConflicts = conflictQueries.flatMap((query, dayIndex) => 
    ((query.data as { coachName: string; timeSlotId: string; venues: string[] }[]) || []).map(conflict => ({
      ...conflict,
      dayName: ['星期一', '星期二', '星期三', '星期四', '星期五'][dayIndex],
      date: format(weekDays[dayIndex], 'M月d日')
    }))
  );

  useEffect(() => {
    console.log('[FloatingConflictAlert] 衝突數量:', allConflicts.length);
    console.log('[FloatingConflictAlert] 衝突詳情:', allConflicts);
    
    if (allConflicts.length === 0) {
      setIsVisible(false);
      return;
    }

    const dismissUntil = localStorage.getItem(DISMISS_KEY);
    console.log('[FloatingConflictAlert] dismissUntil:', dismissUntil);
    if (dismissUntil) {
      const dismissTime = new Date(dismissUntil);
      if (new Date() < dismissTime) {
        console.log('[FloatingConflictAlert] 被抑制到:', dismissTime);
        setIsVisible(false);
        return;
      }
    }

    console.log('[FloatingConflictAlert] 設置為可見');
    setIsVisible(true);
  }, [allConflicts.length]);

  const handleClose = () => {
    setIsVisible(false);
  };

  const handleSuppressToday = () => {
    const tomorrow = new Date();
    tomorrow.setHours(23, 59, 59, 999);
    localStorage.setItem(DISMISS_KEY, tomorrow.toISOString());
    setIsVisible(false);
  };

  const getTimePeriod = (timeSlotId: string) => {
    const timeSlot = timeSlots?.find(ts => ts.id === timeSlotId);
    return timeSlot?.period || '未知時段';
  };

  if (!isVisible || allConflicts.length === 0) {
    return null;
  }

  console.log('[FloatingConflictAlert] 正在渲染！isVisible:', isVisible);
  
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="本週臨時異動通知"
      className="fixed top-24 right-6 w-[400px] max-w-[calc(100vw-3rem)] bg-white dark:bg-card rounded-xl shadow-2xl border-2 border-destructive z-[9999] p-5"
      data-testid="floating-conflict-alert"
      style={{ position: 'fixed', top: '96px', right: '24px', zIndex: 9999 }}
    >
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        aria-label="關閉通知"
        data-testid="button-close-notification"
      >
        <X className="w-5 h-5 text-muted-foreground" />
      </button>

      <div className="space-y-3">
        <div className="flex items-center">
          <div className="w-2 h-2 rounded-full bg-destructive mr-2" aria-hidden="true"></div>
          <h3 className="text-base font-medium text-foreground">本週臨時異動</h3>
        </div>

        <div className="pr-8">
          <ul className="text-sm text-destructive space-y-2">
            {allConflicts.map((conflict, index) => (
              <li 
                key={index}
                className="leading-relaxed"
                data-testid={`floating-conflict-item-${index}`}
              >
                • {conflict.date} {conflict.dayName} {getTimePeriod(conflict.timeSlotId)}：
                <span className="font-medium">{conflict.coachName}</span>
                同時出現在{conflict.venues.join('和')}
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-2 border-t border-border flex items-center justify-between">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={suppressToday}
              onChange={(e) => {
                setSuppressToday(e.target.checked);
                if (e.target.checked) {
                  handleSuppressToday();
                }
              }}
              className="w-4 h-4 rounded border-2 border-input text-destructive focus:ring-2 focus:ring-destructive focus:ring-offset-2"
              data-testid="checkbox-suppress-today"
            />
            <span className="text-sm text-muted-foreground">今天不要再顯示</span>
          </label>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs"
            data-testid="button-dismiss"
          >
            知道了
          </Button>
        </div>
      </div>
    </div>
  );
}