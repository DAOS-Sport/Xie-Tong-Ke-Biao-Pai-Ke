import cron from 'node-cron';
import { storage } from "./storage";

const RAGIC_DEPT_API_URL = "https://ap7.ragic.com/xinsheng/ragicforms4/7";
const RAGIC_COACH_API_URL = "https://ap7.ragic.com/xinsheng/general-information/23";
const RAGIC_EMPLOYEE_API_URL = "https://ap7.ragic.com/xinsheng/ragicforms4/20004";

const VENUE_COLORS = ["blue", "green", "purple", "yellow", "orange", "teal", "red", "pink"];

let lastSyncTime: string | null = null;
let lastSyncResult: {
  venues: { added: string[]; updated: string[]; total: number };
  coaches: { added: number; total: number; lineIdsSynced: number; employeeIdsSynced: number };
} | null = null;
let isSyncing = false;

export function getRagicSyncStatus() {
  return {
    lastSyncTime,
    lastSyncResult,
    isSyncing,
  };
}

interface RagicRecord {
  _ragicId: number;
  [key: string]: any;
}

async function fetchRagicRecords(apiUrl: string, limit = 500): Promise<RagicRecord[]> {
  const apiKey = process.env.RAGIC_API_KEY;
  if (!apiKey) {
    throw new Error("RAGIC_API_KEY is not configured");
  }

  const url = `${apiUrl}?api&APIKey=${apiKey}&limit=${limit}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Ragic API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as Record<string, RagicRecord>;
  return Object.values(data);
}

const EXCLUDED_VENUES = new Set([
  "勞務-民生國中", "勞務-西湖國中", "勞務-明倫高中", "勞務-永吉國中", "勞務-陽明高中",
  "勞務-台灣科技大學", "國防醫學大學", "溪口國小", "百齡高中", "建成國中",
  "駿斯運動事業股份有限公司", "士東國小", "新竹科學園區", "新屋高中",
  "行銷事業處", "數位轉型發展處", "人力資源處", "營運管理處",
]);

async function syncVenues(): Promise<{ added: string[]; updated: string[]; total: number }> {
  const departments = (await fetchRagicRecords(RAGIC_DEPT_API_URL)).filter(r => r["部門名稱"]);
  const existingVenues = await storage.getVenues();
  const existingVenueNames = new Set(existingVenues.map(v => v.name));

  const existingInfos = await storage.getAllVenueInfos();
  const existingInfoMap = new Map(existingInfos.map(info => [info.venueName, info]));

  const added: string[] = [];
  const updated: string[] = [];
  let colorIndex = existingVenues.length;

  for (const dept of departments) {
    const name = dept["部門名稱"] as string;
    const googleMap = (dept["google map"] as string) || "";
    const operationType = (dept["營運性質"] as string) || "";

    if (EXCLUDED_VENUES.has(name)) continue;
    if (operationType === "內勤單位") continue;

    if (!existingVenueNames.has(name)) {
      const color = VENUE_COLORS[colorIndex % VENUE_COLORS.length];
      await storage.createVenue(name, color);
      added.push(name);
      existingVenueNames.add(name);
      colorIndex++;
      console.log(`Ragic sync: added venue "${name}"`);
    }

    const existingInfo = existingInfoMap.get(name);
    if (!existingInfo && googleMap) {
      await storage.upsertVenueInfo(name, null, null, googleMap);
      updated.push(name);
      console.log(`Ragic sync: added venue info for "${name}" with map URL`);
    } else if (existingInfo && !existingInfo.mapUrl && googleMap) {
      await storage.upsertVenueInfo(
        name,
        existingInfo.videoUrl,
        existingInfo.description,
        googleMap
      );
      updated.push(name);
      console.log(`Ragic sync: updated map URL for "${name}"`);
    }
  }

  return { added, updated, total: departments.length };
}

function isCoachRole(record: RagicRecord): boolean {
  const job = record["應徵職務"];
  if (Array.isArray(job)) return job.some((j: string) => j.includes("教練"));
  if (typeof job === "string") return job.includes("教練");
  return false;
}

interface PersonalInfo {
  lineId: string | null;
  employeeId: string | null;
}

async function fetchPersonalInfo(): Promise<Map<string, PersonalInfo>> {
  const records = await fetchRagicRecords(RAGIC_EMPLOYEE_API_URL, 500);
  const infoMap = new Map<string, PersonalInfo>();
  for (const r of records) {
    const name = r["姓名"] as string;
    const personalLineId = r["個人LINE ID"] as string;
    const employeeId = r["員工編號"] as string;
    if (name) {
      infoMap.set(name, {
        lineId: (personalLineId && personalLineId.startsWith("U")) ? personalLineId : null,
        employeeId: employeeId || null,
      });
    }
  }
  const lineIdCount = [...infoMap.values()].filter(v => v.lineId).length;
  const empIdCount = [...infoMap.values()].filter(v => v.employeeId).length;
  console.log(`[Ragic] Fetched personal info: ${lineIdCount} LINE IDs, ${empIdCount} employee IDs`);
  return infoMap;
}

async function syncCoaches(): Promise<{ added: number; total: number; lineIdsSynced: number; employeeIdsSynced: number }> {
  const [allRecords, personalInfoMap] = await Promise.all([
    fetchRagicRecords(RAGIC_COACH_API_URL, 500),
    fetchPersonalInfo(),
  ]);

  const EXCLUDED_NAMES = ["(測試帳號)教練"];
  const activeCoaches = allRecords.filter(r => r["姓名"] && isCoachRole(r) && !EXCLUDED_NAMES.includes(r["姓名"] as string));

  const existingCoaches = await storage.getAllCoachUsers();
  const existingByName = new Map(existingCoaches.map(c => [c.name, c]));

  let added = 0;
  let lineIdsSynced = 0;
  let employeeIdsSynced = 0;

  for (const coach of activeCoaches) {
    const name = coach["姓名"] as string;
    const phone = (coach["手機"] as string) || null;
    const email = (coach["E-mail"] as string) || null;
    const info = personalInfoMap.get(name);
    const personalLineId = info?.lineId || null;
    const employeeId = info?.employeeId || null;

    const existing = existingByName.get(name);

    if (!existing) {
      try {
        await storage.createCoachUser({
          name,
          phone,
          email,
          status: "approved",
          role: "coach",
          lineId: personalLineId,
          linkedCoachName: name,
          employeeId,
        });
        existingByName.set(name, { name, lineId: personalLineId, employeeId } as any);
        added++;
        if (personalLineId) lineIdsSynced++;
        if (employeeId) employeeIdsSynced++;
        console.log(`[Ragic] Added coach "${name}"${personalLineId ? " with LINE ID" : ""}${employeeId ? ` (${employeeId})` : ""}`);
      } catch (err: any) {
        if (err?.message?.includes("unique") || err?.code === "23505") {
          console.warn(`[Ragic] Skipped creating coach "${name}": duplicate value (LINE ID or name conflict)`);
        } else {
          console.error(`[Ragic] Failed to create coach "${name}":`, err?.message);
          throw err;
        }
      }
    } else {
      if (personalLineId && !existing.lineId) {
        try {
          await storage.updateCoachUserLineId(existing.id, personalLineId);
          lineIdsSynced++;
          console.log(`[Ragic] Synced LINE ID for coach "${name}" (was empty)`);
        } catch (err: any) {
          if (err?.message?.includes("unique") || err?.code === "23505") {
            console.warn(`[Ragic] Skipped LINE ID sync for coach "${name}": LINE ID already used by another coach`);
          } else {
            console.error(`[Ragic] Failed to sync LINE ID for coach "${name}":`, err?.message);
            throw err;
          }
        }
      }
      if (employeeId && !existing.employeeId) {
        await storage.updateCoachEmployeeId(existing.id, employeeId);
        employeeIdsSynced++;
        console.log(`[Ragic] Synced employee ID for coach "${name}": ${employeeId}`);
      }
    }
  }

  if (added > 0) console.log(`[Ragic] Added ${added} new coaches`);
  if (lineIdsSynced > 0) console.log(`[Ragic] Synced ${lineIdsSynced} LINE IDs total`);
  if (employeeIdsSynced > 0) console.log(`[Ragic] Synced ${employeeIdsSynced} employee IDs total`);

  return { added, total: activeCoaches.length, lineIdsSynced, employeeIdsSynced };
}

export async function syncRagicAll(): Promise<typeof lastSyncResult> {
  if (isSyncing) {
    return lastSyncResult;
  }

  isSyncing = true;

  try {
    const venueResult = await syncVenues();
    const coachResult = await syncCoaches();

    const result = {
      venues: venueResult,
      coaches: coachResult,
    };

    lastSyncTime = new Date().toISOString();
    lastSyncResult = result;

    console.log(`Ragic sync completed: ${venueResult.total} departments (${venueResult.added.length} new), ${coachResult.total} active coaches (${coachResult.added} new, ${coachResult.lineIdsSynced} LINE IDs synced)`);
    return result;
  } catch (error) {
    console.error("Ragic sync error:", error);
    throw error;
  } finally {
    isSyncing = false;
  }
}

export function setupRagicSyncCron() {
  syncRagicAll().catch(err => {
    console.error("Initial Ragic sync failed:", err);
  });

  cron.schedule('0 19 * * *', () => {
    console.log('[Ragic] Daily sync triggered at 03:00 TST (19:00 UTC)');
    syncRagicAll().catch(err => {
      console.error("Scheduled Ragic sync failed:", err);
    });
  });

  console.log('[Ragic] Daily sync scheduled: 03:00 Asia/Taipei');
}
