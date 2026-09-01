import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { AppToaster } from "@/components/AppToaster";
import { SessionCookieSync } from "@/components/SessionCookieSync";
import { CompanyBrandingSync } from "@/components/CompanyBrandingSync";
import { StoreProvider } from "@/store";

import "./globals.css";

export const metadata: Metadata = {
  title: "Medica",
  description: "Medica web app",
  icons: {
    icon: "/medica-fabicon.svg",
  },
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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-[100dvh] min-w-0 flex flex-col overflow-x-hidden font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{if(localStorage.theme==='dark'||(!('theme' in localStorage)&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}if(localStorage.company_theme_colors){var c=JSON.parse(localStorage.company_theme_colors);if(c&&c.primary){var root=document.documentElement;root.style.setProperty('--primary',c.primary);root.style.setProperty('--brand-500',c.primary);root.style.setProperty('--primary-muted',c.brand50||'rgba(99,108,203,0.08)');root.style.setProperty('--surface-muted',c.brand50||'rgba(99,108,203,0.08)');if(c.secondary)root.style.setProperty('--ring',c.secondary);if(c.darkPrimary)root.style.setProperty('--dark-primary',c.darkPrimary);if(c.darkPrimaryHover)root.style.setProperty('--dark-primary-hover',c.darkPrimaryHover);if(c.darkPrimaryMuted)root.style.setProperty('--dark-primary-muted',c.darkPrimaryMuted);if(c.darkSurfaceMuted)root.style.setProperty('--dark-surface-muted',c.darkSurfaceMuted);if(c.darkBorder)root.style.setProperty('--dark-border',c.darkBorder);if(c.darkBg)root.style.setProperty('--dark-bg',c.darkBg);if(c.darkCard)root.style.setProperty('--dark-card',c.darkCard);var keys=['brand50','brand100','brand200','brand300','brand400','brand600','brand700','brand800','brand900','brand950'];keys.forEach(function(k){if(c[k]){var prop='--brand-'+k.replace('brand','');root.style.setProperty(prop,c[k]);}});['blue','indigo','violet'].forEach(function(fam){['50','100','200','300','400','500','600','700','800','900','950'].forEach(function(shade){var val=shade==='500'||shade==='600'?c.primary:shade==='700'?c.brand700:shade==='800'?c.brand800:shade==='400'?c.secondary:c['brand'+shade];if(val)root.style.setProperty('--color-'+fam+'-'+shade,val);});});}}}catch(_){}`}
        </Script>
        <StoreProvider>
          <SessionCookieSync />
          <CompanyBrandingSync />
          <AppToaster />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
