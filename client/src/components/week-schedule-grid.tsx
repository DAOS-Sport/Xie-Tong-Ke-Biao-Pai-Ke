import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CoachAutocomplete from "./coach-autocomplete";
import type { Venue, TimeSlot, Schedule } from "@shared/schema";
import { format, addDays, startOfWeek } from "date-fns";

interface WeekScheduleGridProps {
  weekStart: Date;
}

export default function WeekScheduleGrid({ weekStart }: WeekScheduleGridProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCell, setActiveCell] = useState<{ 
    date: string; 
    venueId: string; 
    timeSlotId: string; 
  } | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 4);

  const { data: venues } = useQuery<Venue[]>({
    queryKey: ['/api/venues'],
  });

  const { data: timeSlots } = useQuery<TimeSlot[]>({
    queryKey: ['/api/time-slots'],
  });

  const { data: schedules } = useQuery<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>({
    queryKey: ['/api/schedules', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch(`/api/schedules?startDate=${format(weekStart, 'yyyy-MM-dd')}&endDate=${format(weekEnd, 'yyyy-MM-dd')}`);
      if (!response.ok) throw new Error('Failed to fetch schedules');
      return response.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (scheduleData: {
      date: string;
      venueId: string;
      timeSlotId: string;
      className: string;
      coachName: string;
    }) => {
      if (!scheduleData.className && !scheduleData.coachName) {
        // If both are empty, delete the schedule
        const existingSchedule = schedules?.find(s => 
          s.date === scheduleData.date && 
          s.venueId === scheduleData.venueId && 
          s.timeSlotId === scheduleData.timeSlotId
        );
        if (existingSchedule) {
          const response = await apiRequest('DELETE', `/api/schedules/${existingSchedule.id}`);
          return response.json();
        }
        return null;
      }
      
      const response = await apiRequest('POST', '/api/schedules', scheduleData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/schedules', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')]
      });
      weekDays.forEach(day => {
        queryClient.invalidateQueries({ queryKey: ['/api/conflicts', format(day, 'yyyy-MM-dd')] });
      });
      toast({
        title: "儲存成功",
        description: "課表已更新",
      });
    },
    onError: (error) => {
      toast({
        title: "儲存失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getScheduleValue = (date: string, venueId: string, timeSlotId: string) => {
    const cellKey = `${date}-${venueId}-${timeSlotId}`;
    if (editingValues[cellKey] !== undefined) {
      return editingValues[cellKey];
    }
    
    const schedule = schedules?.find(s => 
      s.date === date && s.venueId === venueId && s.timeSlotId === timeSlotId
    );
    if (!schedule) return '';
    return schedule.className && schedule.coachName 
      ? `${schedule.className} ${schedule.coachName}`
      : schedule.className || schedule.coachName || '';
  };

  const handleCellChange = (date: string, venueId: string, timeSlotId: string, value: string) => {
    const cellKey = `${date}-${venueId}-${timeSlotId}`;
    setEditingValues(prev => ({ ...prev, [cellKey]: value }));
  };

  const handleCellBlur = (date: string, venueId: string, timeSlotId: string) => {
    const cellKey = `${date}-${venueId}-${timeSlotId}`;
    const value = editingValues[cellKey];
    
    // Only save if there was a change
    if (value !== undefined) {
      const trimmedValue = value.trim();
      
      if (trimmedValue === '') {
        // Delete if empty
        saveMutation.mutate({
          date,
          venueId,
          timeSlotId,
          className: '',
          coachName: '',
        });
      } else {
        // Parse the input - last word is coach, rest is class name
        const parts = trimmedValue.split(' ').filter(p => p.length > 0);
        let className = '';
        let coachName = '';
        
        if (parts.length === 1) {
          // Only one word - treat as class name
          className = parts[0];
        } else {
          // Multiple words - last is coach, rest is class
          coachName = parts[parts.length - 1];
          className = parts.slice(0, -1).join(' ');
        }

        saveMutation.mutate({
          date,
          venueId,
          timeSlotId,
          className,
          coachName,
        });
      }
      
      // Clear editing value
      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[cellKey];
        return newValues;
      });
    }
  };

  const getVenueHeaderClass = (color: string) => {
    switch (color) {
      case 'blue': return 'bg-blue-500';
      case 'green': return 'bg-green-500';
      case 'purple': return 'bg-purple-500';
      case 'yellow': return 'bg-yellow-500';
      case 'pink': return 'bg-pink-500';
      default: return 'bg-gray-500';
    }
  };

  if (!venues || !timeSlots) {
    return <div className="text-center py-8">載入中...</div>;
  }

  const weekDayNames = ['星期一', '星期二', '星期三', '星期四', '星期五'];

  return (
    <div className="space-y-8">
      {weekDays.map((day, dayIndex) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        
        return (
          <div key={dayIndex} className="bg-card rounded-lg border border-border p-4">
            <h3 className="text-lg font-semibold mb-4 text-center">
              {format(day, 'M月d日')} {weekDayNames[dayIndex]}
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="time-cell bg-muted text-muted-foreground text-sm font-medium p-3 border border-border">
                      節次/時間
                    </th>
                    {venues.map((venue) => (
                      <th
                        key={venue.id}
                        className={`schedule-cell ${getVenueHeaderClass(venue.color)} text-white text-sm font-medium p-3 border border-border`}
                        data-testid={`header-${dayIndex}-${venue.name}`}
                      >
                        {venue.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((timeSlot) => (
                    <tr key={timeSlot.id}>
                      <td className="time-cell bg-muted text-sm font-medium p-3 border border-border" data-testid={`time-slot-${dayIndex}-${timeSlot.period}`}>
                        {timeSlot.period}<br />
                        <span className="text-xs text-muted-foreground">
                          {timeSlot.startTime}-{timeSlot.endTime}
                        </span>
                      </td>
                      {venues.map((venue) => {
                        const cellKey = `${dateStr}-${venue.id}-${timeSlot.id}`;
                        const value = getScheduleValue(dateStr, venue.id, timeSlot.id);
                        const isActive = activeCell?.date === dateStr && 
                                        activeCell?.venueId === venue.id && 
                                        activeCell?.timeSlotId === timeSlot.id;
                        
                        return (
                          <td
                            key={cellKey}
                            className="schedule-cell p-2 border border-border hover:bg-accent/50 cursor-pointer relative"
                            data-testid={`cell-${dayIndex}-${venue.name}-${timeSlot.period}`}
                          >
                            <input
                              type="text"
                              className="w-full h-full bg-transparent text-xs placeholder-muted-foreground border-none outline-none resize-none"
                              placeholder="班級+教練"
                              value={value}
                              onFocus={() => setActiveCell({ date: dateStr, venueId: venue.id, timeSlotId: timeSlot.id })}
                              onBlur={() => {
                                setActiveCell(null);
                                handleCellBlur(dateStr, venue.id, timeSlot.id);
                              }}
                              onChange={(e) => handleCellChange(dateStr, venue.id, timeSlot.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              data-testid={`input-${dayIndex}-${venue.name}-${timeSlot.period}`}
                            />
                            {isActive && (
                              <CoachAutocomplete
                                onSelect={(coachName: string) => {
                                  const currentValue = value;
                                  const parts = currentValue.split(' ');
                                  const className = parts.slice(0, -1).join(' ') || parts[0] || '';
                                  const newValue = className ? `${className} ${coachName}` : coachName;
                                  handleCellChange(dateStr, venue.id, timeSlot.id, newValue);
                                  setActiveCell(null);
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}