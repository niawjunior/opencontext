"use client";

import { useState } from "react";
import { Globe, Copy, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useElectron } from "@/hooks/use-electron";
import type { McpConfigSnippet } from "@/lib/types";

export function McpStatusCard() {
  const api = useElectron();
  const [copied, setCopied] = useState(false);

  const copyConfig = async () => {
    if (!api) return;
    const config = (await api.mcp.getConfig()) as McpConfigSnippet;
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>MCP Server</CardTitle>
            <CardDescription>
              Serves project context to Claude Code via remote HTTP
            </CardDescription>
          </div>
          <Badge variant="default">
            <Globe className="h-3 w-3 mr-1" />
            Remote
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button variant="outline" size="sm" onClick={copyConfig}>
          {copied ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          {copied ? "Copied!" : "Copy MCP Config"}
        </Button>
      </CardContent>
    </Card>
  );
}
