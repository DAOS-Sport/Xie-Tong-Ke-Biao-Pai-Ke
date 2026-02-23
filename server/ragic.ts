import cron from 'node-cron';
import { storage } from "./storage";

const RAGIC_DEPT_API_URL = "https://ap7.ragic.com/xinsheng/ragicforms4/7";
const RAGIC_COACH_API_URL = "https://ap7.ragic.com/xinsheng/general-information/23";

const VENUE_COLORS = ["blue", "green", "purple", "yellow", "orange", "teal", "red", "pink"];

let lastSyncTime: string | null = null;
let lastSyncResult: {
  venues: { added: string[]; updated: string[]; total: number };
  coaches: { added: number; total: number };
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

async function syncCoaches(): Promise<{ added: number; total: number }> {
  const allRecords = await fetchRagicRecords(RAGIC_COACH_API_URL, 500);
  const EXCLUDED_NAMES = ["(測試帳號)教練"];
  const activeCoaches = allRecords.filter(r => r["姓名"] && r["在職狀態"] === "在職" && isCoachRole(r) && !EXCLUDED_NAMES.includes(r["姓名"] as string));

  const existingCoaches = await storage.getAllCoachUsers();
  const existingNames = new Set(existingCoaches.map(c => c.name));

  let added = 0;

  for (const coach of activeCoaches) {
    const name = coach["姓名"] as string;

    if (existingNames.has(name)) {
      continue;
    }

    const phone = (coach["手機"] as string) || null;
    const email = (coach["E-mail"] as string) || null;

    await storage.createCoachUser({
      name,
      phone,
      email,
      status: "approved",
      role: "coach",
      lineId: null,
      linkedCoachName: name,
    });

    existingNames.add(name);
    added++;
  }

  if (added > 0) {
    console.log(`Ragic sync: added ${added} coaches`);
  }

  return { added, total: activeCoaches.length };
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

    console.log(`Ragic sync completed: ${venueResult.total} departments (${venueResult.added.length} new), ${coachResult.total} active coaches (${coachResult.added} new)`);
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

  cron.schedule('0 3 * * *', () => {
    console.log('[Ragic] Daily sync triggered at 3:00 AM (Asia/Taipei)');
    syncRagicAll().catch(err => {
      console.error("Scheduled Ragic sync failed:", err);
    });
  }, { timezone: 'Asia/Taipei' });

  console.log('[Ragic] Daily sync scheduled: 03:00 Asia/Taipei');
}
