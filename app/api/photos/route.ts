import { env } from "cloudflare:workers";
import { isValidDeviceId } from "@/db/care";

interface StoredObject { body: ReadableStream; httpMetadata?: { contentType?: string } }
interface PhotoBucket {
  put(key: string, value: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<StoredObject | null>;
}

function getPhotoBucket() {
  const bucket = (env as unknown as { PHOTOS?: PhotoBucket }).PHOTOS;
  if (!bucket) throw new Error("Photo storage unavailable");
  return bucket;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("photo");
    const deviceId = String(form.get("deviceId") ?? "");
    const recordDate = String(form.get("recordDate") ?? "");
    if (!(file instanceof File) || !isValidDeviceId(deviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
      return Response.json({ error: "请选择一张照片" }, { status: 400 });
    }
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "image/heic": "heic", "image/heif": "heif",
    };
    if (!extensions[file.type] || file.size > 2 * 1024 * 1024) {
      return Response.json({ error: "请上传 JPG、PNG 或 WebP 图片" }, { status: 400 });
    }
    const extension = extensions[file.type];
    const key = `${deviceId}/${recordDate}/${crypto.randomUUID()}.${extension}`;
    await getPhotoBucket().put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return Response.json({ key });
  } catch {
    return Response.json({ error: "照片暂时无法上传" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const deviceId = url.searchParams.get("deviceId");
  if (!isValidDeviceId(deviceId) || !key.startsWith(`${deviceId}/`)) return new Response("Not found", { status: 404 });
  try {
    const object = await getPhotoBucket().get(key);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      headers: { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Photo unavailable", { status: 500 });
  }
}
