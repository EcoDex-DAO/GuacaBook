import { createClient } from "@supabase/supabase-js";
import { handleAccountModeration } from "../../../../lib/server/accountModeration";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return Response.json({ error: "configuration" }, { status: 503 });
  return handleAccountModeration(request, {
    publicClient: (token) =>
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    privilegedClient: () => {
      const secret = process.env.SUPABASE_SECRET_KEY;
      if (!secret) throw new Error("Server secret unavailable");
      return createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    },
  });
}
