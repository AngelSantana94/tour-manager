import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hccxpmnraefgccowdwri.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
