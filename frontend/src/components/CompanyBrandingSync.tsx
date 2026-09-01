"use client";

import { useEffect } from "react";
import { useGetCompanyInfoQuery } from "@/store/api";

const DEFAULT_FAVICON = "/medica-fabicon.svg";

export type ThemePalettePreset = {
  id: string;
  name: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  primaryMuted: string;
  darkPrimary?: string;
  description: string;
};

export const THEME_PALETTES: ThemePalettePreset[] = [
  // ── Blue & Indigo Tones ──
  {
    id: "default",
    name: "Medica Indigo",
    primary: "#636ccb",
    primaryHover: "#50589c",
    secondary: "#6e8cfb",
    primaryMuted: "#e8eaf7",
    darkPrimary: "#6e8cfb",
    description: "Signature Medica brand indigo-blue palette",
  },
  {
    id: "royal_blue",
    name: "Royal Sapphire",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    secondary: "#3b82f6",
    primaryMuted: "#eff6ff",
    darkPrimary: "#3b82f6",
    description: "Classic vibrant corporate blue",
  },
  {
    id: "navy_steel",
    name: "Navy Steel",
    primary: "#1e3a8a",
    primaryHover: "#172554",
    secondary: "#3b82f6",
    primaryMuted: "#eff6ff",
    darkPrimary: "#60a5fa",
    description: "Authoritative deep navy and steel blue",
  },
  {
    id: "glacier_cyan",
    name: "Nordic Glacier",
    primary: "#0284c7",
    primaryHover: "#0369a1",
    secondary: "#38bdf8",
    primaryMuted: "#f0f9ff",
    darkPrimary: "#38bdf8",
    description: "Crisp Arctic sky and cyan blue",
  },

  // ── Green & Teal Tones ──
  {
    id: "emerald",
    name: "Emerald Health",
    primary: "#059669",
    primaryHover: "#047857",
    secondary: "#10b981",
    primaryMuted: "#ecfdf5",
    darkPrimary: "#34d399",
    description: "Clean medical & healthcare green",
  },
  {
    id: "forest_mint",
    name: "Forest Mint",
    primary: "#15803d",
    primaryHover: "#166534",
    secondary: "#22c55e",
    primaryMuted: "#f0fdf4",
    darkPrimary: "#4ade80",
    description: "Organic botanical pine & fresh mint",
  },
  {
    id: "ocean_cyan",
    name: "Ocean Teal",
    primary: "#0f766e",
    primaryHover: "#115e59",
    secondary: "#14b8a6",
    primaryMuted: "#f0fdfa",
    darkPrimary: "#2dd4bf",
    description: "Modern clinical deep sea & teal",
  },
  {
    id: "neon_cyan",
    name: "Cyber Cyan",
    primary: "#0891b2",
    primaryHover: "#0e7490",
    secondary: "#06b6d4",
    primaryMuted: "#ecfeff",
    darkPrimary: "#22d3ee",
    description: "Vibrant high-contrast electric cyan",
  },

  // ── Purple, Violet & Pink Tones ──
  {
    id: "amethyst",
    name: "Amethyst Violet",
    primary: "#7c3aed",
    primaryHover: "#6d28d9",
    secondary: "#8b5cf6",
    primaryMuted: "#f5f3ff",
    darkPrimary: "#a78bfa",
    description: "Modern luxury purple & violet",
  },
  {
    id: "electric_iris",
    name: "Electric Iris",
    primary: "#6366f1",
    primaryHover: "#4f46e5",
    secondary: "#818cf8",
    primaryMuted: "#eef2ff",
    darkPrimary: "#a5b4fc",
    description: "High-tech vibrant blurple & periwinkle",
  },
  {
    id: "fuchsia_mirage",
    name: "Fuchsia Mirage",
    primary: "#c026d3",
    primaryHover: "#a21caf",
    secondary: "#e879f9",
    primaryMuted: "#fdf4ff",
    darkPrimary: "#f0abfc",
    description: "Bold magenta and glowing fuchsia",
  },
  {
    id: "coral_blossom",
    name: "Coral Blossom",
    primary: "#f43f5e",
    primaryHover: "#e11d48",
    secondary: "#fb7185",
    primaryMuted: "#fff1f2",
    darkPrimary: "#fda4af",
    description: "Warm radiant coral pink & rose",
  },

  // ── Red, Crimson & Amber Tones ──
  {
    id: "crimson",
    name: "Ruby Crimson",
    primary: "#e11d48",
    primaryHover: "#be123c",
    secondary: "#f43f5e",
    primaryMuted: "#fff1f2",
    darkPrimary: "#fb7185",
    description: "Bold, urgent, and high-energy crimson",
  },
  {
    id: "cardinal_red",
    name: "Cardinal Red",
    primary: "#dc2626",
    primaryHover: "#b91c1c",
    secondary: "#ef4444",
    primaryMuted: "#fef2f2",
    darkPrimary: "#f87171",
    description: "Dynamic vivid emergency & clinical red",
  },
  {
    id: "sunset_amber",
    name: "Sunset Amber",
    primary: "#d97706",
    primaryHover: "#b45309",
    secondary: "#f59e0b",
    primaryMuted: "#fffbeb",
    darkPrimary: "#fbbf24",
    description: "Warm golden amber & honey",
  },
  {
    id: "terracotta",
    name: "Tuscan Terracotta",
    primary: "#ea580c",
    primaryHover: "#c2410c",
    secondary: "#fb923c",
    primaryMuted: "#fff7ed",
    darkPrimary: "#fdba74",
    description: "Earthy baked clay & warm burnt orange",
  },
  {
    id: "imperial_gold",
    name: "Imperial Gold",
    primary: "#b45309",
    primaryHover: "#92400e",
    secondary: "#f59e0b",
    primaryMuted: "#fffbeb",
    darkPrimary: "#fde047",
    description: "Prestigious rich gold & ochre",
  },

  // ── Neutral, Titanium & Dark Tones ──
  {
    id: "slate_titanium",
    name: "Slate Minimal",
    primary: "#475569",
    primaryHover: "#334155",
    secondary: "#64748b",
    primaryMuted: "#f1f5f9",
    darkPrimary: "#94a3b8",
    description: "Neutral, sleek slate & charcoal",
  },
  {
    id: "obsidian_stealth",
    name: "Obsidian Stealth",
    primary: "#1e293b",
    primaryHover: "#0f172a",
    secondary: "#475569",
    primaryMuted: "#f8fafc",
    darkPrimary: "#cbd5e1",
    description: "Deep monochromatic obsidian & carbon",
  },
  {
    id: "zinc_monolith",
    name: "Zinc Monolith",
    primary: "#3f3f46",
    primaryHover: "#27272a",
    secondary: "#71717a",
    primaryMuted: "#fafafa",
    darkPrimary: "#d4d4d8",
    description: "Sophisticated industrial cool gray",
  },
];

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const sanitized = hex.replace("#", "").trim();
  if (sanitized.length === 3) {
    const r = parseInt(sanitized[0] + sanitized[0], 16);
    const g = parseInt(sanitized[1] + sanitized[1], 16);
    const b = parseInt(sanitized[2] + sanitized[2], 16);
    return { r, g, b };
  }
  if (sanitized.length === 6) {
    const r = parseInt(sanitized.slice(0, 2), 16);
    const g = parseInt(sanitized.slice(2, 4), 16);
    const b = parseInt(sanitized.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const adjust = (val: number) =>
    Math.min(255, Math.max(0, Math.round(val + (val * percent) / 100)));
  const r = adjust(rgb.r).toString(16).padStart(2, "0");
  const g = adjust(rgb.g).toString(16).padStart(2, "0");
  const b = adjust(rgb.b).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function applyThemeVariables(
  primaryHex: string,
  secondaryHex?: string,
  darkPrimaryHex?: string,
) {
  if (typeof document === "undefined" || !primaryHex) return;
  const rgb = hexToRgb(primaryHex);
  if (!rgb) return;

  const root = document.documentElement;
  const hoverHex = adjustBrightness(primaryHex, -15);
  const ringHex = secondaryHex || adjustBrightness(primaryHex, 15);
  const mutedLight = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;

  const brand50 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
  const brand100 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
  const brand200 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`;
  const brand300 = adjustBrightness(primaryHex, 35);
  const brand400 = ringHex;
  const brand500 = primaryHex;
  const brand600 = primaryHex;
  const brand700 = hoverHex;
  const brand800 = adjustBrightness(primaryHex, -28);
  const brand900 = adjustBrightness(primaryHex, -42);
  const brand950 = adjustBrightness(primaryHex, -56);

  // 1. Core brand CSS tokens
  root.style.setProperty("--brand-50", brand50);
  root.style.setProperty("--brand-100", brand100);
  root.style.setProperty("--brand-200", brand200);
  root.style.setProperty("--brand-300", brand300);
  root.style.setProperty("--brand-400", brand400);
  root.style.setProperty("--brand-500", brand500);
  root.style.setProperty("--brand-600", brand600);
  root.style.setProperty("--brand-700", brand700);
  root.style.setProperty("--brand-800", brand800);
  root.style.setProperty("--brand-900", brand900);
  root.style.setProperty("--brand-950", brand950);

  // 2. Primary, surface, and ring tokens (Light Mode)
  root.style.setProperty("--primary", primaryHex);
  root.style.setProperty("--primary-hover", hoverHex);
  root.style.setProperty("--primary-muted", brand50);
  root.style.setProperty("--primary-foreground", "#ffffff");
  root.style.setProperty("--ring", ringHex);
  root.style.setProperty("--surface-muted", brand50);

  // 3. Dark Mode Palette Combination (Dynamic Matching Contrast - Lighter & Softer)
  const darkPrimary = darkPrimaryHex || ringHex || adjustBrightness(primaryHex, 25);
  const darkPrimaryHover = adjustBrightness(darkPrimary, 18);
  const darkPrimaryMuted = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`;
  const darkSurfaceMuted = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`;
  const darkBorder = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`;
  const darkBg = `rgb(${Math.min(42, Math.max(26, Math.round(rgb.r * 0.18) + 16))}, ${Math.min(48, Math.max(32, Math.round(rgb.g * 0.18) + 18))}, ${Math.min(68, Math.max(48, Math.round(rgb.b * 0.22) + 24))})`;
  const darkCard = `rgb(${Math.min(56, Math.max(36, Math.round(rgb.r * 0.22) + 24))}, ${Math.min(64, Math.max(44, Math.round(rgb.g * 0.22) + 28))}, ${Math.min(84, Math.max(62, Math.round(rgb.b * 0.28) + 34))})`;

  root.style.setProperty("--dark-primary", darkPrimary);
  root.style.setProperty("--dark-primary-hover", darkPrimaryHover);
  root.style.setProperty("--dark-primary-muted", darkPrimaryMuted);
  root.style.setProperty("--dark-surface-muted", darkSurfaceMuted);
  root.style.setProperty("--dark-border", darkBorder);
  root.style.setProperty("--dark-bg", darkBg);
  root.style.setProperty("--dark-card", darkCard);

  // 4. Direct Tailwind v4 color scale mappings
  const colorMap: Record<string, string> = {
    "--color-primary": primaryHex,
    "--color-primary-hover": hoverHex,
    "--color-primary-muted": brand50,
    "--color-primary-foreground": "#ffffff",
    "--color-ring": ringHex,
    "--color-surface-muted": brand50,

    "--color-blue-50": brand50,
    "--color-blue-100": brand100,
    "--color-blue-200": brand200,
    "--color-blue-300": brand300,
    "--color-blue-400": brand400,
    "--color-blue-500": brand500,
    "--color-blue-600": brand500,
    "--color-blue-700": brand700,
    "--color-blue-800": brand800,
    "--color-blue-900": brand900,
    "--color-blue-950": brand950,
    "--color-blue-855": brand700,
    "--color-blue-955": brand800,
    "--color-blue-455": brand400,

    "--color-indigo-50": brand50,
    "--color-indigo-100": brand100,
    "--color-indigo-200": brand200,
    "--color-indigo-300": brand300,
    "--color-indigo-400": brand400,
    "--color-indigo-500": brand500,
    "--color-indigo-600": brand500,
    "--color-indigo-700": brand700,
    "--color-indigo-800": brand800,
    "--color-indigo-900": brand900,
    "--color-indigo-950": brand950,

    "--color-violet-50": brand50,
    "--color-violet-100": brand100,
    "--color-violet-200": brand200,
    "--color-violet-300": brand300,
    "--color-violet-400": brand400,
    "--color-violet-500": brand500,
    "--color-violet-600": brand500,
    "--color-violet-700": brand700,
    "--color-violet-800": brand800,
    "--color-violet-900": brand900,
    "--color-violet-950": brand950,
    "--color-violet-955": brand950,
  };

  Object.entries(colorMap).forEach(([prop, val]) => {
    root.style.setProperty(prop, val);
  });

  try {
    localStorage.setItem(
      "company_theme_colors",
      JSON.stringify({
        primary: primaryHex,
        secondary: ringHex,
        darkPrimary,
        darkPrimaryHover,
        darkPrimaryMuted,
        darkSurfaceMuted,
        darkBorder,
        darkBg,
        darkCard,
        brand50,
        brand100,
        brand200,
        brand300,
        brand400,
        brand500,
        brand600,
        brand700,
        brand800,
        brand900,
        brand950,
      }),
    );
  } catch (_) {}
}

/**
 * CompanyBrandingSync
 * Dynamically keeps browser tab favicon, title, and theme color palette in sync
 * with the active company info stored in database.
 */
export function CompanyBrandingSync() {
  const { data: companyInfo } = useGetCompanyInfoQuery();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // 1. Sync theme color palette
    const primaryColor = companyInfo?.primary_color?.trim();
    const secondaryColor = companyInfo?.secondary_color?.trim();
    if (primaryColor) {
      const matchedPreset = THEME_PALETTES.find(
        (p) =>
          p.id === companyInfo?.theme_palette ||
          p.primary.toLowerCase() === primaryColor.toLowerCase(),
      );
      applyThemeVariables(
        primaryColor,
        secondaryColor,
        matchedPreset?.darkPrimary,
      );
    }

    // 2. Sync favicon
    const faviconUrl =
      companyInfo?.favicon_url?.trim() ||
      companyInfo?.logo_url?.trim() ||
      DEFAULT_FAVICON;

    const linkRels = ["icon", "shortcut icon", "apple-touch-icon"];
    linkRels.forEach((rel) => {
      let link = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    });

    // 3. Update document title prefix if company brand name is set
    const companyName =
      companyInfo?.trade_name?.trim() || companyInfo?.legal_name?.trim();
    if (companyName && !document.title.includes(companyName)) {
      const currentTitle = document.title;
      if (
        !currentTitle ||
        currentTitle === "Medica" ||
        currentTitle === "Medica web app"
      ) {
        document.title = companyName;
      }
    }
  }, [companyInfo]);

  return null;
}

