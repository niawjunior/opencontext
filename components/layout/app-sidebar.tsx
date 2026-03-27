"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Settings,
  Globe,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderOpen },
  { title: "Team", href: "/team", icon: Users },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            CE
          </div>
          <div>
            <h2 className="text-sm font-semibold">Open Context</h2>
            <p className="text-xs text-muted-foreground">All your context in one place</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href)
                    }
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span>MCP Server</span>
          <Badge
            variant="default"
            className="ml-auto text-[10px] px-1.5 py-0"
          >
            Remote
          </Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
