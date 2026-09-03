import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaces a clear message in the browser console instead of a cryptic
  // network error if .env.local hasn't been set up yet.
  console.error(
    "Missing Supabase configuration. Copy .env.example to .env.local and fill in your project's URL and anon key."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
