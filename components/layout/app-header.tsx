"use client";

import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const openSearch = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <span className="text-sm font-medium text-muted-foreground">
        Open Context
      </span>
      <div className="ml-auto">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-muted-foreground gap-2"
          onClick={openSearch}
        >
          <Search className="h-3 w-3" />
          Search
          <kbd className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
            {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}K
          </kbd>
        </Button>
      </div>
    </header>
  );
}
