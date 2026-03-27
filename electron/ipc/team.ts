import { ipcMain } from "electron";
import crypto from "node:crypto";
import type { SupabaseStore } from "../store/supabase-store";

export function registerTeamHandlers(
  getStore: () => SupabaseStore | null
): void {
  const requireStore = () => {
    const store = getStore();
    if (!store)
      throw new Error(
        "Database not configured. Set Supabase credentials in Settings."
      );
    return store;
  };

  ipcMain.handle("team:list-members", async () => {
    return requireStore().listMembers();
  });

  ipcMain.handle(
    "team:create-member",
    async (_e, data: { name: string; email?: string }) => {
      return requireStore().createMember(data);
    }
  );

  ipcMain.handle("team:delete-member", async (_e, memberId: string) => {
    return requireStore().deleteMember(memberId);
  });

  ipcMain.handle("team:get-member", async (_e, memberId: string) => {
    return requireStore().getMember(memberId);
  });

  ipcMain.handle(
    "team:generate-key",
    async (_e, memberId: string, keyName: string) => {
      const store = requireStore();
      const rawKey = crypto.randomBytes(32).toString("base64url");
      const apiKey = `oc_live_${rawKey}`;
      const keyHash = crypto
        .createHash("sha256")
        .update(apiKey)
        .digest("hex");
      const keyPrefix = apiKey.slice(0, 16) + "...";

      const record = await store.createApiKey({
        keyHash,
        keyPrefix,
        name: keyName,
        memberId,
      });
      return { ...record, rawKey: apiKey };
    }
  );

  ipcMain.handle("team:revoke-key", async (_e, keyId: string) => {
    return requireStore().revokeApiKey(keyId);
  });

  ipcMain.handle(
    "team:assign-project",
    async (_e, memberId: string, projectId: string) => {
      return requireStore().assignProject(memberId, projectId);
    }
  );

  ipcMain.handle(
    "team:unassign-project",
    async (_e, memberId: string, projectId: string) => {
      return requireStore().unassignProject(memberId, projectId);
    }
  );
}
