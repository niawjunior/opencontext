"use client";

import { useState, useEffect, useCallback } from "react";
import { Users } from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberList } from "@/components/team/member-list";
import { MemberDetail } from "@/components/team/member-detail";
import { useElectron } from "@/hooks/use-electron";
import type { MemberSummary } from "@/lib/types";

export default function TeamPage() {
  const api = useElectron();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMembers = useCallback(async () => {
    if (!api) return;
    try {
      const list = await api.team.listMembers();
      setMembers(list);
    } catch {
      // Store not configured — show empty state
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleMemberCreated = async () => {
    await loadMembers();
  };

  const handleMemberDeleted = async () => {
    setSelectedId(null);
    await loadMembers();
  };

  if (loading) {
    return (
      <PageContainer title="Team">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Team"
      description="Manage team members, API keys, and project access"
    >
      <div className="grid grid-cols-[260px_1fr] gap-6 min-h-[400px]">
        {/* Left: Member list */}
        <div className="border rounded-lg p-3">
          <MemberList
            members={members}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMemberCreated={handleMemberCreated}
          />
        </div>

        {/* Right: Member detail */}
        <div>
          {selectedId ? (
            <MemberDetail
              key={selectedId}
              memberId={selectedId}
              onDeleted={handleMemberDeleted}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Users className="h-8 w-8" />
              <p className="text-xs">Select a member to manage their access</p>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
