import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jnpfubczdlmywtsihvcs.supabase.co";
const supabaseKey = "sb_publishable_pEtL8UVo3rj2HcOPImfZfQ_aAGWjf5R";

export const supabase = createClient(supabaseUrl, supabaseKey);