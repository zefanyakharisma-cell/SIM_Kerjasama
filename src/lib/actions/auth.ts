"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/** Ends the Supabase session (clears the auth cookies) and returns to login. */
export async function keluar() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
