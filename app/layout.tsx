import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "小茉日常｜茉莉养护助手";
  const description = "每天陪你做好茉莉的浇水、日照、施肥、状态巡检与照片记录。";
  return {
    metadataBase: new URL(origin),
    title,
    description,
    manifest: "/manifest.webmanifest",
    applicationName: "小茉日常",
    appleWebApp: { capable: true, title: "小茉日常", statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    icons: { icon: [{ url: "/icon-192.png", type: "image/png" }], shortcut: "/icon-192.png", apple: "/apple-touch-icon.png" },
    openGraph: { title, description, type: "website", images: [{ url: `${origin}/og.png`, width: 1740, height: 907, alt: "小茉日常，茉莉养护助手" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
