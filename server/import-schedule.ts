import { getSchoolDb, initializeSchoolSchema } from './multi-school-db';
import { schedules, timeSlots, venues } from '@shared/schema';
import { format } from 'date-fns';
import { eq, and } from 'drizzle-orm';

// 解析課表資料的工具
export async function importScheduleData() {
  const schoolCode = 'demo';
  
  // 確保學校 schema 已初始化
  await initializeSchoolSchema(schoolCode);
  
  const db = await getSchoolDb(schoolCode);
  
  // 清空現有資料
  console.log('清空現有課表資料...');
  await db.delete(schedules);
  
  // 新北高中的正式課表資料
  const scheduleData = {
    "9/15": {
      "1": { "1": "", "2": "", "3": "", "4": "113張暐承", "5": "115周彥真" },
      "2": { "1": "315周彥真", "2": "301陳潔", "3": "204張暐承", "4": "215周彥真", "5": "317張暐承" },
      "3": { "1": "316張暐承", "2": "205陳潔", "3": "213王慶熙", "4": "115周彥真", "5": "101王慶熙" },
      "4": { "1": "317張暐承", "2": "305陳潔", "3": "212王慶熙", "4": "203張暐承", "5": "102王慶熙" },
      "5": { "1": "101王慶熙", "2": "112張暐承", "3": "209王慶熙", "4": "103王慶熙", "5": "211王慶熙" },
      "6": { "1": "102王慶熙", "2": "110李冠賢", "3": "210王慶熙", "4": "207李冠賢", "5": "111李冠賢" },
      "7": { "1": "103王慶熙", "2": "111李冠賢", "3": "211王慶熙", "4": "208李冠賢", "5": "110李冠賢" }
    },
    "9/16": {
      "2": { "1": "316張暐承", "2": "301陳潔", "3": "315周彥真", "4": "112張暐承", "5": "" },
      "3": { "1": "206張暐承", "2": "210王慶熙", "3": "203張暐承", "4": "215周彥真", "5": "206張暐承" },
      "4": { "1": "114張暐承", "2": "213王慶熙", "3": "204張暐承", "4": "209王慶熙", "5": "113張暐承" },
      "5": { "1": "", "2": "", "3": "", "4": "", "5": "114張暐承" },
      "6": { "1": "", "2": "", "3": "", "4": "", "5": "212王慶熙" },
      "7": { "1": "", "2": "", "3": "", "4": "", "5": "207李冠賢" }
    },
    "9/22": {
      "1": { "1": "", "2": "", "3": "", "4": "113張暐承", "5": "115周彥真" },
      "2": { "1": "315周彥真", "2": "301陳潔", "3": "204張暐承", "4": "215周彥真", "5": "317張暐承" },
      "3": { "1": "316張暐承", "2": "205陳潔", "3": "213王慶熙", "4": "115周彥真", "5": "101王慶熙" },
      "4": { "1": "317張暐承", "2": "305陳潔", "3": "212王慶熙", "4": "203張暐承", "5": "102王慶熙" },
      "5": { "1": "101王慶熙", "2": "112張暐承", "3": "209王慶熙", "4": "103王慶熙", "5": "211王慶熙" },
      "6": { "1": "102王慶熙", "2": "110李冠賢", "3": "210王慶熙", "4": "207李冠賢", "5": "111李冠賢" },
      "7": { "1": "103王慶熙", "2": "111李冠賢", "3": "211王慶熙", "4": "208李冠賢", "5": "110李冠賢" }
    },
    "9/29": {
      "1": { "1": "116邱俊傑", "2": "302邱俊傑", "3": "", "4": "306邱俊傑", "5": "107蔡正雄" },
      "2": { "1": "117邱俊傑", "2": "306邱俊傑", "3": "107蔡正雄", "4": "303邱俊傑", "5": "302邱俊傑" },
      "3": { "1": "311吳育汝", "2": "214邱俊傑", "3": "106蔡正雄", "4": "217邱俊傑", "5": "201吳育汝" },
      "4": { "1": "310吳育汝", "2": "216邱俊傑", "3": "104蔡正雄", "4": "116邱俊傑", "5": "214邱俊傑" },
      "5": { "1": "", "2": "304邱俊傑", "3": "309吳育汝", "4": "307邱俊傑", "5": "314吳育汝" },
      "6": { "1": "108張宇熙", "2": "308吳育汝", "3": "312吳育汝", "4": "310吳育汝", "5": "109張宇熙" },
      "7": { "1": "109張宇熙", "2": "201吳育汝", "3": "202吳育汝", "4": "313吳育汝", "5": "108張宇熙" }
    },
    "10/6": {
      "1": { "1": "217邱俊傑", "2": "314吳育汝", "3": "", "4": "", "5": "" },
      "2": { "1": "106蔡正雄", "2": "304邱俊傑", "3": "202吳育汝", "4": "", "5": "" },
      "3": { "1": "216邱俊傑", "2": "311吳育汝", "3": "303邱俊傑", "4": "312吳育汝", "5": "" },
      "4": { "1": "308吳育汝", "2": "307邱俊傑", "3": "313吳育汝", "4": "", "5": "" },
      "5": { "1": "117邱俊傑", "2": "104蔡正雄", "3": "", "4": "", "5": "" },
      "6": { "1": "309吳育汝", "2": "", "3": "", "4": "", "5": "" },
      "7": { "1": "", "2": "", "3": "", "4": "", "5": "" }
    }
  };

  // 獲取時段和場館資料
  const [timeSlotData, venueData] = await Promise.all([
    db.select().from(timeSlots),
    db.select().from(venues)
  ]);

  // 找到新北高中場館
  const venue = venueData.find((v: any) => v.name === '新北高中');
  if (!venue) {
    throw new Error('找不到新北高中場館');
  }

  console.log('開始匯入課表資料...');
  let importCount = 0;

  // 處理每個日期的資料
  for (const [dateStr, periods] of Object.entries(scheduleData)) {
    // 解析日期 (如 "9/15" -> "2024-09-15")
    const year = 2024; // 假設是2024年
    const [month, day] = dateStr.split('/');
    const date = new Date(year, parseInt(month) - 1, parseInt(day));
    const formattedDate = format(date, 'yyyy-MM-dd');

    // 處理每個節次的資料
    for (const [period, dayData] of Object.entries(periods)) {
      const timeSlot = timeSlotData.find((ts: any) => ts.period === `第${period}節`);
      if (!timeSlot) continue;

      // 處理週一到週五的資料
      for (const [dayIndex, classInfo] of Object.entries(dayData)) {
        if (!classInfo || classInfo.trim() === '') continue;

        // 計算正確的日期 (dayIndex: 1=週一, 2=週二, ..., 5=週五)
        const dayOffset = parseInt(dayIndex) - 1;
        const actualDate = new Date(date);
        actualDate.setDate(actualDate.getDate() + dayOffset);
        const actualFormattedDate = format(actualDate, 'yyyy-MM-dd');

        // 解析班級和老師資訊 (如 "315周彥真" -> 班級:"315", 老師:"周彥真")
        let className = '';
        let coachName = '';
        
        if (classInfo.includes('邱俊傑')) {
          const match = classInfo.match(/^(\d+)(.+)$/);
          if (match) {
            className = match[1];
            coachName = match[2];
          }
        } else if (classInfo.includes('張暐承') || classInfo.includes('周彥真') || classInfo.includes('王慶熙') || 
                   classInfo.includes('陳潔') || classInfo.includes('李冠賢') || classInfo.includes('吳育汝') || 
                   classInfo.includes('蔡正雄') || classInfo.includes('張宇熙')) {
          const match = classInfo.match(/^(\d+)(.+)$/);
          if (match) {
            className = match[1];
            coachName = match[2];
          }
        }

        if (className && coachName) {
          try {
            console.log(`匯入資料 - 日期: ${actualFormattedDate}, 節次: ${period}, 班級: ${className}, 老師: ${coachName}`);
            await db.insert(schedules).values({
              date: actualFormattedDate,
              venueId: venue.id,
              timeSlotId: timeSlot.id,
              className: className,
              coachName: coachName,
              notes: '新北高中第二學期體育課程'
            });
            importCount++;
            
            // 不進行即時驗證，以免影響 transaction
          } catch (error) {
            console.error(`❌ 匯入失敗 - 日期: ${actualFormattedDate}, 班級: ${className}, 老師: ${coachName}`, error);
          }
        }
      }
    }
  }

  console.log(`✅ 成功匯入 ${importCount} 筆課表資料`);
  return importCount;
}

// 如果直接執行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  importScheduleData()
    .then((count) => {
      console.log(`匯入完成，共 ${count} 筆資料`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('匯入失敗:', error);
      process.exit(1);
    });
}