import { ensureCareSchema, getCareDb, isValidDeviceId } from "@/db/care";

type CareRow = {
  id: number;
  deviceId: string;
  recordDate: string;
  completed: string;
  soil: string;
  leaves: string;
  bloom: string;
  note: string;
  photoKey: string | null;
  fertilized: number;
  updatedAt: string;
};

const selectFields = `id, device_id AS deviceId, record_date AS recordDate,
  completed, soil, leaves, bloom, note, photo_key AS photoKey,
  fertilized, updated_at AS updatedAt`;

function serialize(row: CareRow) {
  let completed: string[] = [];
  try { completed = JSON.parse(row.completed) as string[]; } catch { completed = []; }
  return { ...row, completed, fertilized: Boolean(row.fertilized) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId");
  if (!isValidDeviceId(deviceId)) return Response.json({ error: "无效的养护档案" }, { status: 400 });

  try {
    await ensureCareSchema();
    const result = await getCareDb().prepare(
      `SELECT ${selectFields} FROM care_records WHERE device_id = ? ORDER BY record_date DESC LIMIT 60`,
    ).bind(deviceId).all<CareRow>();
    return Response.json({ records: (result.results ?? []).map(serialize) });
  } catch {
    return Response.json({ error: "养护记录暂时无法读取" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      deviceId?: string; recordDate?: string; completed?: string[]; soil?: string;
      leaves?: string; bloom?: string; note?: string; photoKey?: string | null; fertilized?: boolean;
    };
    if (!isValidDeviceId(body.deviceId ?? null) || !/^\d{4}-\d{2}-\d{2}$/.test(body.recordDate ?? "")) {
      return Response.json({ error: "记录信息不完整" }, { status: 400 });
    }
    const completed = Array.isArray(body.completed) ? body.completed.filter((item) => typeof item === "string").slice(0, 12) : [];
    const soil = ["unknown", "dry", "moist", "wet"].includes(body.soil ?? "") ? body.soil! : "unknown";
    const leaves = ["healthy", "yellow", "spotted", "droop"].includes(body.leaves ?? "") ? body.leaves! : "healthy";
    const bloom = ["unknown", "buds", "blooming", "drop", "none"].includes(body.bloom ?? "") ? body.bloom! : "unknown";
    const note = (body.note ?? "").trim().slice(0, 500);
    const photoKey = body.photoKey && body.photoKey.startsWith(`${body.deviceId}/`) ? body.photoKey : null;

    await ensureCareSchema();
    const db = getCareDb();
    await db.prepare(`INSERT INTO care_records
      (device_id, record_date, completed, soil, leaves, bloom, note, photo_key, fertilized, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(device_id, record_date) DO UPDATE SET
        completed = excluded.completed, soil = excluded.soil, leaves = excluded.leaves,
        bloom = excluded.bloom, note = excluded.note,
        photo_key = COALESCE(excluded.photo_key, care_records.photo_key),
        fertilized = MAX(excluded.fertilized, care_records.fertilized), updated_at = CURRENT_TIMESTAMP`
    ).bind(body.deviceId, body.recordDate, JSON.stringify(completed), soil, leaves, bloom, note, photoKey, body.fertilized ? 1 : 0).run();

    const row = await db.prepare(`SELECT ${selectFields} FROM care_records WHERE device_id = ? AND record_date = ?`)
      .bind(body.deviceId, body.recordDate).first<CareRow>();
    return Response.json({ record: row ? serialize(row) : null });
  } catch {
    return Response.json({ error: "记录没有保存成功，请稍后重试" }, { status: 500 });
  }
}
