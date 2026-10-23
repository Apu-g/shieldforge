import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LiveDataProvider } from "@/components/LiveDataProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShieldForge — Security Control Plane",
  description:
    "Live findings, automated response policies, fix verification and CERT-In reporting for Vercel origins.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LiveDataProvider>
          <AppShell>{children}</AppShell>
        </LiveDataProvider>
      </body>
    </html>
  );
}
