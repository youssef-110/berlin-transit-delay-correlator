import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  title: { default: "VBB Pulse – Berlin-Potsdam Transit & Delay Correlator", template: "%s · VBB Pulse" },
  description:
    "Real-time S-Bahn, U-Bahn, tram and regional delay monitoring for Berlin & Potsdam, correlated with live weather and major events – with smart email alerts.",
  applicationName: "VBB Pulse",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#05070d", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
