import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPT Realtime Mini + Next.js Starter",
  description:
    "Minimal Next.js starter that demonstrates how to connect to the GPT Realtime Mini model using OpenAI best practices.",
};

export const viewport: Viewport = {
  themeColor: "#0b5394",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
