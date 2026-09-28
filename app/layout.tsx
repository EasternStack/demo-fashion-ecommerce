import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Easternstack Store",
  description: "Demo e-commerce end-to-end",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
