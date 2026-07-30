import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buffer — Know how long you're safe",
  description:
    "Buffer turns daily and shift-based earnings into a financial safety window: how many safe days you have, when a cash shortfall could arrive, and the smallest useful action to take today.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-700 focus:px-4 focus:py-2 focus:text-sm focus:text-mist-100"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
