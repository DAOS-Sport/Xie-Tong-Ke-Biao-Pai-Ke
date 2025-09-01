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
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);

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

  const getCellSchedules = (date: string, venueId: string, timeSlotId: string) => {
    return schedules?.filter(s => 
      s.date === date && s.venueId === venueId && s.timeSlotId === timeSlotId
    ) || [];
  };

  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const response = await apiRequest('DELETE', `/api/schedules/${scheduleId}`);
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
        title: "刪除成功",
        description: "課表已刪除",
      });
    },
    onError: (error) => {
      toast({
        title: "刪除失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddClass = (date: string, venueId: string, timeSlotId: string, value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;
    
    // Parse the input - format: 班級-教練名
    let className = '';
    let coachName = '';
    
    if (trimmedValue.includes('-')) {
      // Split by dash
      const parts = trimmedValue.split('-');
      className = parts[0].trim();
      coachName = parts.slice(1).join('-').trim(); // In case there are multiple dashes
    } else {
      // No dash - treat as class name only
      className = trimmedValue;
    }

    saveMutation.mutate({
      date,
      venueId,
      timeSlotId,
      className,
      coachName,
    });
  };

  const handleDeleteClass = (scheduleId: string) => {
    deleteMutation.mutate(scheduleId);
  };
  
  const updateMutation = useMutation({
    mutationFn: async (updateData: {
      scheduleId: string;
      className: string;
      coachName: string;
    }) => {
      const response = await apiRequest('PUT', `/api/schedules/${updateData.scheduleId}`, {
        className: updateData.className,
        coachName: updateData.coachName,
      });
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
        title: "更新成功",
        description: "課表已更新",
      });
      setEditingSchedule(null);
    },
    onError: (error) => {
      toast({
        title: "更新失敗",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleEditSchedule = (schedule: any) => {
    const displayValue = schedule.className && schedule.coachName 
      ? `${schedule.className}-${schedule.coachName}`
      : schedule.className || schedule.coachName || '';
    setEditingSchedule(schedule.id);
    setEditingValues({ ...editingValues, [schedule.id]: displayValue });
  };
  
  const handleUpdateSchedule = (scheduleId: string, value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      // If empty, delete the schedule
      deleteMutation.mutate(scheduleId);
      return;
    }
    
    // Parse the input - format: 班級-教練名
    let className = '';
    let coachName = '';
    
    if (trimmedValue.includes('-')) {
      const parts = trimmedValue.split('-');
      className = parts[0].trim();
      coachName = parts.slice(1).join('-').trim();
    } else {
      className = trimmedValue;
    }

    updateMutation.mutate({
      scheduleId,
      className,
      coachName,
    });
  };

  const getVenueHeaderClass = (color: string) => {
    switch (color) {
      case 'blue': return 'bg-blue-500';
      case 'green': return 'bg-green-500';
      case 'purple': return 'bg-purple-500';
      case 'yellow': return 'bg-yellow-500';
      case 'orange': return 'bg-orange-500';
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
                        const cellSchedules = getCellSchedules(dateStr, venue.id, timeSlot.id);
                        const isActive = activeCell?.date === dateStr && 
                                        activeCell?.venueId === venue.id && 
                                        activeCell?.timeSlotId === timeSlot.id;
                        
                        return (
                          <td
                            key={cellKey}
                            className="schedule-cell p-2 border border-border hover:bg-accent/50 cursor-pointer relative align-top"
                            data-testid={`cell-${dayIndex}-${venue.name}-${timeSlot.period}`}
                            style={{ minHeight: '60px', verticalAlign: 'top' }}
                          >
                            <div className="space-y-1 min-h-full">
                              {cellSchedules.map((schedule, index) => {
                                const isEditing = editingSchedule === schedule.id;
                                return (
                                  <div 
                                    key={schedule.id} 
                                    className="flex items-center justify-between bg-background/50 rounded px-1 py-0.5 text-xs group"
                                    data-testid={`schedule-item-${dayIndex}-${venue.name}-${timeSlot.period}-${index}`}
                                  >
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={editingValues[schedule.id] || ''}
                                        onChange={(e) => setEditingValues({ ...editingValues, [schedule.id]: e.target.value })}
                                        onBlur={() => {
                                          handleUpdateSchedule(schedule.id, editingValues[schedule.id] || '');
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleUpdateSchedule(schedule.id, editingValues[schedule.id] || '');
                                          } else if (e.key === 'Escape') {
                                            setEditingSchedule(null);
                                            const { [schedule.id]: _, ...rest } = editingValues;
                                            setEditingValues(rest);
                                          }
                                        }}
                                        autoFocus
                                        className="flex-1 bg-transparent border-none outline-none text-xs"
                                        data-testid={`input-edit-${dayIndex}-${venue.name}-${timeSlot.period}-${index}`}
                                      />
                                    ) : (
                                      <span 
                                        className="flex-1 truncate cursor-pointer hover:bg-accent/30 rounded px-1"
                                        onClick={() => handleEditSchedule(schedule)}
                                        data-testid={`span-edit-${dayIndex}-${venue.name}-${timeSlot.period}-${index}`}
                                      >
                                        {schedule.className && schedule.coachName 
                                          ? `${schedule.className}-${schedule.coachName}`
                                          : schedule.className || schedule.coachName || '未命名'}
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClass(schedule.id);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-1 transition-opacity"
                                      data-testid={`button-delete-${dayIndex}-${venue.name}-${timeSlot.period}-${index}`}
                                    >
                                      <i className="fas fa-times text-xs"></i>
                                    </button>
                                  </div>
                                );
                              })}
                              <input
                                type="text"
                                className="w-full bg-transparent text-xs placeholder-muted-foreground border-none outline-none p-1"
                                placeholder={cellSchedules.length === 0 ? "班級-教練" : "新增課程"}
                                onFocus={() => setActiveCell({ date: dateStr, venueId: venue.id, timeSlotId: timeSlot.id })}
                                onBlur={(e) => {
                                  const value = e.target.value.trim();
                                  if (value) {
                                    handleAddClass(dateStr, venue.id, timeSlot.id, value);
                                    e.target.value = '';
                                  }
                                  setActiveCell(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const value = e.currentTarget.value.trim();
                                    if (value) {
                                      handleAddClass(dateStr, venue.id, timeSlot.id, value);
                                      e.currentTarget.value = '';
                                    }
                                    e.currentTarget.blur();
                                  }
                                }}
                                data-testid={`input-${dayIndex}-${venue.name}-${timeSlot.period}`}
                              />
                            </div>
                            {isActive && (
                              <CoachAutocomplete
                                onSelect={(coachName: string) => {
                                  const input = document.querySelector(`[data-testid="input-${dayIndex}-${venue.name}-${timeSlot.period}"]`) as HTMLInputElement;
                                  if (input) {
                                    const currentValue = input.value;
                                    const newValue = currentValue ? `${currentValue}-${coachName}` : coachName;
                                    input.value = newValue;
                                  }
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