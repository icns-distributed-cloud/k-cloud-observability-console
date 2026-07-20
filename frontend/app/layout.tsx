import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K-Cloud Observability Console",
  description: "K-Cloud CSC/CSP research platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
