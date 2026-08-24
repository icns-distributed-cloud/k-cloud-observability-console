import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";
import SlaAlert from "@/components/AutoAlert";
import { TimeProvider } from "@/lib/TimeContext";
import { AlertProvider } from "@/lib/AlertContext";

export const metadata: Metadata = {
  title: "K-Cloud Insight",
  description: "K-Cloud CSC/CSP research platform",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <TimeProvider>
          <AlertProvider>
            <TopBar />
            {children}
            <SlaAlert />
          </AlertProvider>
        </TimeProvider>
      </body>
    </html>
  );
}