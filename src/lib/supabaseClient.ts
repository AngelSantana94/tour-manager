import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

const SUPABASE_URL = "https://jaxkgotbstcvbqhpbnnl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpheGtnb3Ric3RjdmJxaHBibm5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDM5NjgsImV4cCI6MjEwNTMxOTk2OH0.VohRQwA8ooEkbKGlwfOUIwpmXgj-xewIbISKW6ErOyA";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

