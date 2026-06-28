import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: {
    default: "BarberAI - ניהול תורים חכם למספרות",
    template: "%s | BarberAI",
  },
  description: "מערכת ניהול תורים חכמה למספרות עם בינה מלאכותית, החלפת תורים ושליחת הודעות בוואטסאפ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BarberAI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#7C3AED",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={heebo.className}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
        <Toaster position="top-center" dir="rtl" />
      </body>
    </html>
  );
}
