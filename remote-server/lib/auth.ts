import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export interface AuthResult {
  orgId: string;
  keyId: string;
  memberId: string | null;
}

/**
 * Validate an API key from the Authorization header.
 * Returns the org context or null if invalid.
 */
export async function validateApiKey(
  authHeader: string | null
): Promise<AuthResult | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const keyHash = crypto.createHash("sha256").update(token).digest("hex");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const client = createClient(url, key);

  const { data, error } = await client
    .from("api_keys")
    .select("id, org_id, member_id")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !data) return null;

  // Update last_used_at (fire and forget)
  client
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then();

  return { orgId: data.org_id, keyId: data.id, memberId: data.member_id ?? null };
}
