// Configuration Supabase pour NDjam Ride - App Chauffeur
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ogxggllqnrhgqdvkgkhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_Al9b12x8jJYgLrrmyiaG0g_kof5Fjwy";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
