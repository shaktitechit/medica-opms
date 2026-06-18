import { useSyncExternalStore } from "react";

// Helper to check if dark mode is active on documentElement
const getDarkSnapshot = () => {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
};

const getServerSnapshot = () => false;

const subscribeDark = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};

  // 1. Listen to manual class changes on <html>
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === "class") {
        cb();
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // 2. Listen to system preference changes (only if no theme override in localStorage)
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemChange = () => {
    if (!("theme" in localStorage)) {
      if (mediaQuery.matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      cb();
    }
  };

  mediaQuery.addEventListener("change", handleSystemChange);

  return () => {
    observer.disconnect();
    mediaQuery.removeEventListener("change", handleSystemChange);
  };
};

export function useIsDark() {
  return useSyncExternalStore(subscribeDark, getDarkSnapshot, getServerSnapshot);
}

export function toggleTheme() {
  if (typeof window === "undefined") return;
  const isDark = document.documentElement.classList.contains("dark");
  if (isDark) {
    document.documentElement.classList.remove("dark");
    localStorage.theme = "light";
  } else {
    document.documentElement.classList.add("dark");
    localStorage.theme = "dark";
  }
}

export function getThemePreference() {
  if (typeof window === "undefined") return "light";
  if (localStorage.theme === "dark") return "dark";
  if (localStorage.theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
