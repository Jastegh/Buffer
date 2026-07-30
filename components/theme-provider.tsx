"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "buffer-theme";

/**
 * Runs before first paint so a saved theme is applied without a flash of the
 * wrong colours. Dark is the designed default and light is an explicit opt-in,
 * rather than following the OS, so the product looks the same on first load
 * regardless of the visitor's system setting.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${STORAGE_KEY}")==="light")document.documentElement.classList.add("light")}catch(e){}})();`;

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts as "dark" on the server and syncs to the real value on mount, which
  // the pre-paint script has already applied to <html>.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage: the theme still applies for this session.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains("light") ? "dark" : "light");
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Chart colours cannot be Tailwind classes, so they are resolved per theme. */
export const CHART_COLORS = {
  dark: {
    grid: "#1f2530",
    axis: "#6b7688",
    axisLine: "#1f2530",
    line: "#7aa2ff",
    lineFill: "#4f7dfb",
    risk: "#ff6b6b",
    riskFill: "#ef4444",
    scenario: "#38d39f",
    tooltipBg: "#12161d",
    tooltipBorder: "#2a313d",
    dotCore: "#0e1116",
    floor: "#3a4250",
  },
  light: {
    grid: "#e2e8f0",
    axis: "#64748b",
    axisLine: "#e2e8f0",
    line: "#3b6ff0",
    lineFill: "#3b6ff0",
    risk: "#c92a2a",
    riskFill: "#e03131",
    scenario: "#08805a",
    tooltipBg: "#ffffff",
    tooltipBorder: "#c6d0dd",
    dotCore: "#ffffff",
    floor: "#94a3b8",
  },
} as const;

export function useChartColors() {
  const { theme } = useTheme();
  return CHART_COLORS[theme];
}
