import type { NextConfig } from "next";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Stop before bundling if a privileged server key is accidentally supplied.
if (key?.startsWith("sb_secret_"))
  throw new Error(
    "Use a Supabase publishable key, never a secret key, in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
if (key?.split(".").length === 3) {
  let role: string | undefined;
  try {
    role = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    ).role;
  } catch {}
  if (role === "service_role")
    throw new Error(
      "A service_role key must never be used as NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
}
const config: NextConfig = {};
export default config;
