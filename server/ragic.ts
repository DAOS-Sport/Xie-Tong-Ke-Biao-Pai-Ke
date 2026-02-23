import { storage } from "./storage";

const RAGIC_API_URL = "https://ap7.ragic.com/xinsheng/ragicforms4/7";
const SYNC_INTERVAL_MS = 30 * 60 * 1000;

const VENUE_COLORS = ["blue", "green", "purple", "yellow", "orange", "teal", "red", "pink"];

let lastSyncTime: string | null = null;
let lastSyncResult: { added: string[]; updated: string[]; total: number } | null = null;
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

async function fetchRagicDepartments(): Promise<RagicRecord[]> {
  const apiKey = process.env.RAGIC_API_KEY;
  if (!apiKey) {
    throw new Error("RAGIC_API_KEY is not configured");
  }

  const url = `${RAGIC_API_URL}?api&APIKey=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Ragic API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as Record<string, RagicRecord>;
  const departments: RagicRecord[] = [];

  for (const record of Object.values(data)) {
    if (record["部門名稱"]) {
      departments.push(record);
    }
  }

  return departments;
}

export async function syncRagicDepartments(): Promise<{ added: string[]; updated: string[]; total: number }> {
  if (isSyncing) {
    return lastSyncResult || { added: [], updated: [], total: 0 };
  }

  isSyncing = true;

  try {
    const departments = await fetchRagicDepartments();
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

    const result = { added, updated, total: departments.length };
    lastSyncTime = new Date().toISOString();
    lastSyncResult = result;

    console.log(`Ragic sync completed: ${departments.length} departments, ${added.length} added, ${updated.length} map URLs updated`);
    return result;
  } catch (error) {
    console.error("Ragic sync error:", error);
    throw error;
  } finally {
    isSyncing = false;
  }
}

export function setupRagicSyncCron() {
  syncRagicDepartments().catch(err => {
    console.error("Initial Ragic sync failed:", err);
  });

  setInterval(() => {
    syncRagicDepartments().catch(err => {
      console.error("Scheduled Ragic sync failed:", err);
    });
  }, SYNC_INTERVAL_MS);

  console.log(`Ragic sync cron set up: every ${SYNC_INTERVAL_MS / 60000} minutes`);
}
