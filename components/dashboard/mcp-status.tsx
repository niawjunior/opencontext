"use client";

import { useState } from "react";
import { Play, Square, Copy, Check } from "lucide-react";
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

interface McpStatusProps {
  running: boolean;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
}

export function McpStatusCard({ running, onStart, onStop }: McpStatusProps) {
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
              Serves project context to Claude Code and other MCP clients
            </CardDescription>
          </div>
          <Badge variant={running ? "default" : "secondary"}>
            {running ? "Running" : "Stopped"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex gap-2">
        {running ? (
          <Button variant="destructive" size="sm" onClick={onStop}>
            <Square className="h-3 w-3 mr-1" />
            Stop Server
          </Button>
        ) : (
          <Button size="sm" onClick={onStart}>
            <Play className="h-3 w-3 mr-1" />
            Start Server
          </Button>
        )}
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
