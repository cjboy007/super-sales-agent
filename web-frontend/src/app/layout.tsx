import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import { ProjectProvider } from "@/lib/project";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { OpsStatusProvider } from "@/components/ui/OpsStatusProvider";

export const metadata: Metadata = {
  title: "SSA",
  description: "Super Sales Agent business workbench with confirmation-based AI workflows",
  applicationName: "SSA",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/brand/ssa-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/ssa-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#a44912",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <ThemeProvider>
          <ProjectProvider>
            <OpsStatusProvider>
              <ClientLayout>{children}</ClientLayout>
            </OpsStatusProvider>
          </ProjectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
