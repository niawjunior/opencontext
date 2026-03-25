import type { Metadata } from "next";
import "./globals.css";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { SearchDialog } from "@/components/shared/search-dialog";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Open Context",
  description: "All your context in one place",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden">
        <SidebarProvider className="h-full !min-h-0">
          <AppSidebar />
          <SidebarInset>
            <AppHeader />
            <main className="flex-1 flex flex-col p-6 min-h-0 overflow-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>
        <SearchDialog />
        <Toaster />
      </body>
    </html>
  );
}
