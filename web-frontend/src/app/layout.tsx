import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import { ProjectProvider } from "@/lib/project";

export const metadata: Metadata = {
  title: "Super Sales Agent",
  description: "AI-powered sales automation platform",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1e293b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <ProjectProvider>
          <ClientLayout>{children}</ClientLayout>
        </ProjectProvider>
      </body>
    </html>
  );
}
