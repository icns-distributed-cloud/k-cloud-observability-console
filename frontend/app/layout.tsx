import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";
import { TimeProvider } from "@/lib/TimeContext";

export const metadata: Metadata = {
  title: "K-Cloud Observability Console",
  description: "K-Cloud CSC/CSP research platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <TimeProvider>
          <TopBar />
          {children}
        </TimeProvider>
      </body>
    </html>
  );
}