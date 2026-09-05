import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mjoaatdcrgimdjxmvjgl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qb2FhdGRjcmdpbWRqeG12amdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDMxNTMsImV4cCI6MjEwMDgxOTE1M30.536RT07pPCJFiFXvHk8Bxu_n6cR8WOZMvPLq1E0nQn0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
