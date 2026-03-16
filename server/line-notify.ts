import cron from 'node-cron';
import { storage } from './storage';
import { format, addDays, startOfWeek } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

const DAY_NAMES = ['', '一', '二', '三', '四', '五', '六', '日'];

interface ScheduleItem {
  date: string;
  venueName: string;
  timeSlotLabel: string;
  className: string | null;
  timeSlotOrder: number;
}

async function sendLinePushMessage(lineId: string, message: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN not configured');
    return false;
  }

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineId,
        messages: [{ type: 'text', text: message }],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`LINE push failed for ${lineId}: ${res.status} ${errorBody}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`LINE push error for ${lineId}:`, error);
    return false;
  }
}

async function sendWeeklyScheduleNotifications(): Promise<void> {
  console.log('[LINE Notify] Starting weekly schedule notifications...');

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.log('[LINE Notify] LINE_CHANNEL_ACCESS_TOKEN not configured, skipping notifications');
    return;
  }

  try {
    const approvedCoaches = await storage.getApprovedCoachUsers();
    // 優先用 linkedCoachName，沒有則用 name 作為比對鍵
    const coachesWithLine = approvedCoaches.filter(c => c.lineId && (c.linkedCoachName || c.name));

    if (coachesWithLine.length === 0) {
      console.log('[LINE Notify] No approved coaches with LINE accounts found');
      return;
    }

    const today = new Date();
    // addDays(today, 1) 確保：週日 cron 看下週，週一~週六手動觸發看本週
    const nextMonday = startOfWeek(addDays(today, 1), { weekStartsOn: 1 });
    const nextSunday = addDays(nextMonday, 6);
    const startDate = format(nextMonday, 'yyyy-MM-dd');
    const endDate = format(nextSunday, 'yyyy-MM-dd');

    const weekSchedules = await storage.getSchedulesByDateRange(startDate, endDate);

    let sentCount = 0;
    let failCount = 0;

    for (const coach of coachesWithLine) {
      const coachName = (coach.linkedCoachName || coach.name)!;
      const lineId = coach.lineId!;

      const mySchedules = weekSchedules.filter(
        s => s.coachName === coachName || s.coachName2 === coachName
      );

      if (mySchedules.length === 0) continue;

      const schedulesByDay = new Map<string, ScheduleItem[]>();
      for (const s of mySchedules) {
        const dateKey = s.date;
        if (!schedulesByDay.has(dateKey)) {
          schedulesByDay.set(dateKey, []);
        }
        schedulesByDay.get(dateKey)!.push({
          date: s.date,
          venueName: s.venue.name,
          timeSlotLabel: `${s.timeSlot.startTime}-${s.timeSlot.endTime}`,
          className: s.className,
          timeSlotOrder: s.timeSlot.order,
        });
      }

      const sortedDates = Array.from(schedulesByDay.keys()).sort();

      let message = `📋 下週課程通知\n`;
      message += `${format(nextMonday, 'M/d', { locale: zhTW })}(一) ~ ${format(nextSunday, 'M/d', { locale: zhTW })}(日)\n\n`;
      message += `${coachName} 老師，您好！\n`;
      message += `您下週共有 ${mySchedules.length} 堂課：\n`;

      for (const dateKey of sortedDates) {
        const d = new Date(dateKey + 'T00:00:00');
        const dayOfWeek = d.getDay();
        const dayName = DAY_NAMES[dayOfWeek === 0 ? 7 : dayOfWeek];
        message += `\n📅 ${format(d, 'M/d')}(${dayName})\n`;

        const items = schedulesByDay.get(dateKey)!.sort((a, b) => a.timeSlotOrder - b.timeSlotOrder);
        for (const item of items) {
          message += `  🏊 ${item.venueName}\n`;
          message += `  ⏰ ${item.timeSlotLabel}`;
          if (item.className) {
            message += ` - ${item.className}`;
          }
          message += `\n`;
        }
      }

      message += `\n---\n請教練務必於課前準時抵達場館，主動向授課老師致意，並請確實熟悉「教練守則」。\n\n自本學期起，協同課程費用修正如下：\n• 單節課 250元\n• 兩節課合併 500元`;

      const success = await sendLinePushMessage(lineId, message);
      if (success) {
        sentCount++;
        console.log(`[LINE Notify] Sent to ${coachName}`);
      } else {
        failCount++;
      }
    }

    console.log(`[LINE Notify] Done. Sent: ${sentCount}, Failed: ${failCount}`);
  } catch (error) {
    console.error('[LINE Notify] Error sending weekly notifications:', error);
  }
}

export function setupWeeklyNotificationCron(): void {
  cron.schedule('0 12 * * 0', () => {
    console.log('[LINE Notify] Cron triggered: Sunday 20:00 TST (12:00 UTC)');
    sendWeeklyScheduleNotifications();
  });

  console.log('[LINE Notify] Weekly notification cron scheduled (Sunday 20:00 TST = 12:00 UTC)');
}

async function sendDailyTomorrowNotifications(): Promise<void> {
  console.log('[LINE Notify] Starting daily tomorrow notifications...');

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.log('[LINE Notify] LINE_CHANNEL_ACCESS_TOKEN not configured, skipping');
    return;
  }

  try {
    const now = new Date();
    const tomorrowDate = addDays(now, 1);
    const tomorrowStr = format(tomorrowDate, 'yyyy-MM-dd');
    const tomorrowDisplay = format(tomorrowDate, 'M/d', { locale: zhTW });
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const tomorrowDayName = dayNames[tomorrowDate.getDay()];

    const tomorrowSchedules = await storage.getSchedulesByDateRange(tomorrowStr, tomorrowStr);

    if (tomorrowSchedules.length === 0) {
      console.log(`[LINE Notify] No schedules for tomorrow (${tomorrowStr}), skipping`);
      return;
    }

    const approvedCoaches = await storage.getApprovedCoachUsers();
    const withLine = approvedCoaches.filter(c => c.lineId && (c.linkedCoachName || c.name));
    console.log(`[LINE Notify] Approved coaches total: ${approvedCoaches.length}, with LINE ID: ${withLine.length}`);
    const tomorrowCoaches = [...new Set(tomorrowSchedules.flatMap(s => [s.coachName, s.coachName2]).filter(Boolean))];
    console.log(`[LINE Notify] Tomorrow schedules: ${tomorrowSchedules.length} classes, coaches: ${tomorrowCoaches.join(', ')}`);
    // 優先用 linkedCoachName，沒有則用 name 作為比對鍵
    const coachMap = new Map<string, typeof approvedCoaches[0]>();
    withLine.forEach(c => {
      const matchName = c.linkedCoachName || c.name;
      if (matchName) coachMap.set(matchName, c);
    });
    console.log(`[LINE Notify] LINE-bound coach names: ${[...coachMap.keys()].join(', ')}`);
    const matched = tomorrowCoaches.filter(n => coachMap.has(n!));
    const unmatched = tomorrowCoaches.filter(n => !coachMap.has(n!));
    console.log(`[LINE Notify] Matched: ${matched.join(', ') || '(無)'}, Unmatched: ${unmatched.join(', ') || '(無)'}`);

    let sentCount = 0;
    let failCount = 0;

    for (const [coachName, coach] of coachMap) {
      const mySchedules = tomorrowSchedules.filter(
        s => s.coachName === coachName || s.coachName2 === coachName
      );

      if (mySchedules.length === 0) continue;

      const sorted = [...mySchedules].sort((a, b) => (a.timeSlot?.order ?? 0) - (b.timeSlot?.order ?? 0));

      let message = `📋 明日課程提醒\n`;
      message += `${tomorrowDisplay}(${tomorrowDayName})\n\n`;
      message += `${coachName} 教練，您好！\n`;
      message += `明天共有 ${sorted.length} 堂課：\n`;

      for (const s of sorted) {
        message += `\n🏊 ${s.venue.name}\n`;
        message += `⏰ ${s.timeSlot.startTime}-${s.timeSlot.endTime}`;
        if (s.className) {
          message += ` - ${s.className}`;
        }
        message += `\n`;
      }

      message += `\n請教練務必準時抵達場館！`;

      const success = await sendLinePushMessage(coach.lineId!, message);
      if (success) {
        sentCount++;
        console.log(`[LINE Notify] Daily: sent to ${coachName}`);
      } else {
        failCount++;
      }
    }

    console.log(`[LINE Notify] Daily done. Sent: ${sentCount}, Failed: ${failCount}, Date: ${tomorrowStr}`);
  } catch (error) {
    console.error('[LINE Notify] Error sending daily notifications:', error);
  }
}

export function setupDailyNotificationCron(): void {
  cron.schedule('0 11 * * *', () => {
    console.log('[LINE Notify] Cron triggered: daily 19:00 TST (11:00 UTC)');
    sendDailyTomorrowNotifications();
  });

  console.log('[LINE Notify] Daily notify cron scheduled (19:00 TST = 11:00 UTC)');
}

export { sendWeeklyScheduleNotifications, sendDailyTomorrowNotifications };
