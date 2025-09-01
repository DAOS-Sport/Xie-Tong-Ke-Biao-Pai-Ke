import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ConflictAlertProps {
  date: string;
}

export default function ConflictAlert({ date }: ConflictAlertProps) {
  const { data: conflicts } = useQuery<{ coachName: string; timeSlotId: string; venues: string[] }[]>({
    queryKey: ['/api/conflicts', date],
  });

  const { data: timeSlots } = useQuery<{ id: string; period: string }[]>({
    queryKey: ['/api/time-slots'],
  });

  if (!conflicts || conflicts.length === 0) {
    return null;
  }

  const getTimePeriod = (timeSlotId: string) => {
    const timeSlot = timeSlots?.find(ts => ts.id === timeSlotId);
    return timeSlot?.period || '未知時段';
  };

  return (
    <Alert className="mb-6 bg-destructive/10 border-destructive/20" data-testid="alert-conflicts">
      <div className="flex items-start">
        <i className="fas fa-exclamation-triangle text-destructive mr-3 mt-1"></i>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-destructive mb-2">發現衝突</h3>
          <AlertDescription>
            <ul className="text-sm text-destructive space-y-1">
              {conflicts.map((conflict, index) => (
                <li 
                  key={index}
                  className="cursor-pointer hover:underline"
                  data-testid={`conflict-item-${index}`}
                >
                  • {getTimePeriod(conflict.timeSlotId)}：{conflict.coachName}同時出現在{conflict.venues.join('和')}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
