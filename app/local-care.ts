export const CARE_RECORDS_STORAGE_KEY = "xiaomo-care-records-v1";

export type LocalCareRecord = {
  id: string;
  recordDate: string;
  completed: string[];
  soil: string;
  leaves: string;
  bloom: string;
  note: string;
  photoKey: string | null;
  fertilized: boolean;
  updatedAt: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isLocalCareRecord(value: unknown): value is LocalCareRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LocalCareRecord>;
  return typeof record.id === "string" && typeof record.recordDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.recordDate)
    && Array.isArray(record.completed) && record.completed.every((item) => typeof item === "string")
    && typeof record.soil === "string" && typeof record.leaves === "string" && typeof record.bloom === "string"
    && typeof record.note === "string" && (typeof record.photoKey === "string" || record.photoKey === null)
    && typeof record.fertilized === "boolean" && typeof record.updatedAt === "string" && Number.isFinite(Date.parse(record.updatedAt));
}

export function readLocalCareRecords(storage: StorageLike): LocalCareRecord[] {
  try {
    const stored = storage.getItem(CARE_RECORDS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isLocalCareRecord).sort(sortRecords).slice(0, 60) : [];
  } catch {
    return [];
  }
}

export function upsertLocalCareRecord(storage: StorageLike, record: LocalCareRecord) {
  const next = [record, ...readLocalCareRecords(storage).filter((item) => item.recordDate !== record.recordDate)]
    .sort(sortRecords)
    .slice(0, 60);
  storage.setItem(CARE_RECORDS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function sortRecords(left: LocalCareRecord, right: LocalCareRecord) {
  return right.recordDate.localeCompare(left.recordDate) || right.updatedAt.localeCompare(left.updatedAt);
}

const PHOTO_DATABASE = "xiaomo-care-photos-v1";
const PHOTO_STORE = "photos";

function openPhotoDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(PHOTO_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("照片存储不可用"));
  });
}

export async function saveLocalPhoto(key: string, photo: Blob) {
  const database = await openPhotoDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE, "readwrite");
    transaction.objectStore(PHOTO_STORE).put(photo, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("照片没有保存成功"));
  });
  database.close();
}

export async function readLocalPhoto(key: string) {
  const database = await openPhotoDatabase();
  const photo = await new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("照片无法读取"));
  });
  database.close();
  return photo;
}
