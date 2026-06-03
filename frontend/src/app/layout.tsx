import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppToaster } from "@/components/AppToaster";
import { SessionCookieSync } from "@/components/SessionCookieSync";
import { StoreProvider } from "@/store";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Medica",
  description: "Medica web app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-[100dvh] min-w-0 flex flex-col overflow-x-hidden font-sans">
        <StoreProvider>
          <SessionCookieSync />
          <AppToaster />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
