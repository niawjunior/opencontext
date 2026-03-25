"use client";

import { Copy, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";
import { formatRelativeDate } from "@/lib/format";
import type { Project, ContextDocument } from "@/lib/types";

interface ContextPreviewProps {
  project: Project;
  contextDoc: ContextDocument | null;
}

export function ContextPreview({ project, contextDoc }: ContextPreviewProps) {
  const api = useElectron();
  const preview = contextDoc?.fullContext || buildPreview(project);

  const wordCount = preview.split(/\s+/).filter(Boolean).length;
  const lineCount = preview.split("\n").length;
  const charCount = preview.length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
    toast.success("Copied to clipboard");
  };

  const handleExport = async () => {
    if (!api) return;
    try {
      const result = (await api.context.exportToProject(project.id)) as { path: string };
      toast.success(`Exported to ${result.path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    }
  };

  return (
    <div className="rounded-lg border flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">llms.txt Preview</span>
          {contextDoc && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {formatRelativeDate(contextDoc.generatedAt)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {wordCount} words · {lineCount} lines · {charCount} chars
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handleExport}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save as llms.txt in your project directory</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleCopy}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3">
          {preview}
        </pre>
      </ScrollArea>
    </div>
  );
}

function buildPreview(project: Project): string {
  let doc = `# ${project.name}\n\n`;
  doc += `> ${project.description || "No description"}\n\n`;
  doc += `**Path:** ${project.path}\n`;
  doc += `**Modules:** ${project.modules.length}\n\n`;

  const grouped = new Map<string, typeof project.modules>();
  for (const mod of project.modules) {
    const group = grouped.get(mod.type) || [];
    group.push(mod);
    grouped.set(mod.type, group);
  }

  for (const [type, modules] of grouped) {
    doc += `## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
    for (const mod of modules) {
      doc += `### ${mod.name}\n`;
      doc += `**Path:** \`${mod.path}\`\n\n`;
      doc += (mod.context || "_No context yet_") + "\n\n";
    }
  }

  return doc;
}
