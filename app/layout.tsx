import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const sans = Space_Grotesk({ variable: "--font-sans", subsets: ["latin"] });
const mono = Space_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: BRAND,
  description: "Describe a task. Get a robot you can build from real parts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
