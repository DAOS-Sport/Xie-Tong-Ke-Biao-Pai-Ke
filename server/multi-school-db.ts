import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// 連線池快取
const schemaPools = new Map<string, ReturnType<typeof drizzle>>();

/**
 * 根據學校代碼獲取對應的資料庫連線
 * 使用不同的 schema 來隔離各學校資料
 */
export async function getSchoolDb(schoolCode: string) {
  const cacheKey = schoolCode;
  
  if (schemaPools.has(cacheKey)) {
    return schemaPools.get(cacheKey)!;
  }

  // 創建新的連線池
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL
  });
  
  const db = drizzle({ client: pool, schema });
  
  // 設定 search_path 到指定的 schema
  try {
    await db.execute(sql.raw(`SET search_path TO school_${schoolCode}, public;`));
    console.log(`✅ Set search_path to school_${schoolCode}`);
    
    // 在部署環境中額外確保連接 - 只有 REPLIT_DEPLOYMENT=1 才是真正的部署
    const isDeployment = process.env.REPLIT_DEPLOYMENT === '1';
    if (isDeployment) {
      console.log(`🚀 Running in deployment mode for school_${schoolCode}`);
    } else {
      console.log(`🛠️ Running in development mode for school_${schoolCode}`);
    }
  } catch (error) {
    console.error(`❌ Failed to set search_path for school_${schoolCode}:`, error);
    // 在部署環境出錯時提供更詳細的日誌
    const isDeployment = process.env.REPLIT_DEPLOYMENT === '1';
    if (isDeployment) {
      console.error('🚨 Deployment environment error:', error);
    } else {
      console.error('🛠️ Development environment error:', error);
    }
  }
  
  schemaPools.set(cacheKey, db);
  
  return db;
}

/**
 * 初始化學校資料庫 schema
 * 創建 schema 並複製必要的表結構
 */
export async function initializeSchoolSchema(schoolCode: string) {
  const mainPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const mainDb = drizzle({ client: mainPool, schema });
  
  const schemaName = `school_${schoolCode}`;
  
  try {
    // ✅ 關鍵修復：啟用 pgcrypto 擴展以支援 gen_random_uuid()
    await mainDb.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`));
    console.log('✅ pgcrypto extension enabled');
    
    // 創建 schema
    await mainDb.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS ${schemaName};`));
    
    // 設置 search_path 到新 schema
    await mainDb.execute(sql.raw(`SET search_path TO ${schemaName};`));
    
    // 創建 venues 表並從 public schema 複製資料
    await mainDb.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.venues AS 
      SELECT * FROM public.venues;
    `));
    
    // 創建 time_slots 表並從 public schema 複製資料
    await mainDb.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.time_slots AS 
      SELECT * FROM public.time_slots;
    `));
    
    // 創建 schedules 表結構（空表，每校獨立資料）
    await mainDb.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.schedules (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        venue_id VARCHAR NOT NULL,
        time_slot_id VARCHAR NOT NULL,
        class_name VARCHAR,
        coach_name VARCHAR,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `));
    
    // 創建 teachers 表
    await mainDb.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.teachers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_name VARCHAR NOT NULL,
        subject VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `));
    
    // 創建 teacher_feedbacks 表
    await mainDb.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.teacher_feedbacks (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id VARCHAR NOT NULL,
        teacher_name VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        reschedule_date DATE,
        reschedule_period VARCHAR,
        comment TEXT,
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (schedule_id) REFERENCES ${schemaName}.schedules(id) ON DELETE CASCADE,
        UNIQUE (schedule_id, teacher_name)
      );
    `));
    
    // 為示範學校添加課表資料（只在demo時執行）
    if (schoolCode === 'demo') {
      await seedDemoData(mainDb, schemaName);
    }
    
    console.log(`✅ Successfully initialized schema for school: ${schoolCode}`);
    
  } catch (error) {
    console.error(`❌ Failed to initialize schema for school ${schoolCode}:`, error);
    throw error;
  } finally {
    await mainPool.end();
  }
}

/**
 * 為示範學校添加課表和教師資料
 */
async function seedDemoData(db: any, schemaName: string) {
  try {
    // 檢查是否已有教師資料
    const existingTeachers = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${schemaName}.teachers`));
    const teacherCount = existingTeachers.rows[0]?.count || 0;
    
    if (teacherCount === 0) {
      // 添加教師資料
      const teachers = [
        ['吳育汝', '游泳'],
        ['周彥真', '游泳'],
        ['張宇熙', '游泳'],
        ['張暐承', '游泳'],
        ['李冠賢', '游泳'],
        ['王慶熙', '游泳'],
        ['蔡正雄', '游泳'],
        ['邱俊傑', '游泳'],
        ['陳潔', '游泳'],
        ['王老師', '數學'],
        ['李老師', '英語'],
        ['張老師', '物理'],
        ['陳老師', '化學']
      ];
      
      for (const [teacherName, subject] of teachers) {
        await db.execute(sql.raw(`
          INSERT INTO ${schemaName}.teachers (teacher_name, subject) 
          VALUES ('${teacherName}', '${subject}');
        `));
      }
    }
    
    // 添加課表資料（2024年9月16-20日）
    const scheduleData = [
      ['2024-09-16', '113', '張暐承', '新北高中第二學期體育課程'],
      ['2024-09-17', '115', '周彥真', '新北高中第二學期體育課程'],
      ['2024-09-18', '114', '李冠賢', '新北高中第二學期體育課程'],
      ['2024-09-19', '112', '王慶熙', '新北高中第二學期體育課程'],
      ['2024-09-20', '116', '吳育汝', '新北高中第二學期體育課程'],
      ['2024-09-16', '201', '張宇熙', '新北高中第二學期體育課程'],
      ['2024-09-17', '202', '蔡正雄', '新北高中第二學期體育課程'],
      ['2024-09-18', '203', '邱俊傑', '新北高中第二學期體育課程'],
      ['2024-09-19', '204', '陳潔', '新北高中第二學期體育課程'],
      ['2024-09-20', '205', '張暐承', '新北高中第二學期體育課程']
    ];
    
    // 檢查是否已有資料，避免重複插入
    const existingSchedules = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${schemaName}.schedules`));
    const count = existingSchedules.rows[0]?.count || 0;
    
    if (count === 0) {
      for (const [date, className, coachName, notes] of scheduleData) {
        await db.execute(sql.raw(`
          INSERT INTO ${schemaName}.schedules (date, venue_id, time_slot_id, class_name, coach_name, notes) 
          VALUES ('${date}', 
                  (SELECT id FROM ${schemaName}.venues LIMIT 1), 
                  (SELECT id FROM ${schemaName}.time_slots LIMIT 1), 
                  '${className}', '${coachName}', '${notes}');
        `));
      }
    }
    
    console.log(`✅ Demo data seeded for ${schemaName}`);
  } catch (error) {
    console.error(`⚠️ Error seeding demo data for ${schemaName}:`, error);
    // 不拋出錯誤，因為資料可能已存在
  }
}

/**
 * 獲取所有可用的學校列表
 */
export function getAvailableSchools(): string[] {
  // 這裡可以從配置文件或環境變數中讀取
  // 暫時回傳示例學校列表
  return ['demo', 'school1', 'school2'];
}

/**
 * 驗證學校代碼是否有效
 */
export function isValidSchoolCode(schoolCode: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(schoolCode) && schoolCode.length >= 2 && schoolCode.length <= 20;
}