import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCP Media Generator — لوحة الإدارة",
  description: "خادم MCP لتوليد الصور والفيديو ودمج المقاطع — بالذكاء الاصطناعي",
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      {/* خط عربي عبر Google Fonts مع fallback لنظام الجهاز — التخطيط الجذري في App Router هو مكافئ _document (قاعدة الـ lint مخصصة لـ Pages Router) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- root layout في App Router يعمل كمستند عام لكل الصفحات */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
        precedence="default"
      />
      <body className="antialiased">{children}</body>
    </html>
  );
}
