import type { Metadata, Viewport } from "next";

import { AppToaster } from "@/components/AppToaster";
import { SessionCookieSync } from "@/components/SessionCookieSync";
import { StoreProvider } from "@/store";

import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
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
