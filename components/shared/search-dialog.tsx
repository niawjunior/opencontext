"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderOpen, Box } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useElectron } from "@/hooks/use-electron";
import type { SearchResult } from "@/lib/types";

export function SearchDialog() {
  const api = useElectron();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Global Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!api || !query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = (await api.context.search(query.trim())) as SearchResult[];
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [api, query]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      router.push(`/projects?open=${result.projectId}`);
    },
    [router]
  );

  // Group results by project
  const grouped = new Map<string, SearchResult[]>();
  for (const r of results) {
    const group = grouped.get(r.projectName) || [];
    group.push(r);
    grouped.set(r.projectName, group);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Search across all project contexts</DialogDescription>
      </DialogHeader>
      <DialogContent className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search across all contexts..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {searching
                ? "Searching..."
                : query.trim()
                  ? "No results found."
                  : "Type to search across all project contexts."}
            </CommandEmpty>

            {Array.from(grouped.entries()).map(([projectName, items]) => (
              <CommandGroup key={projectName} heading={projectName}>
                {items.map((item, i) => (
                  <CommandItem
                    key={`${item.projectId}-${item.moduleId || "full"}-${i}`}
                    onSelect={() => handleSelect(item)}
                    className="flex items-start gap-2"
                  >
                    {item.moduleName ? (
                      <Box className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {item.moduleName || "Full Context"}
                      </p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                        {item.snippet}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
