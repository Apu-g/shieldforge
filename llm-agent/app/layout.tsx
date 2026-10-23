import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ShieldForge Agent",
  description: "LLM explanations and behavioral training for ShieldForge",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
