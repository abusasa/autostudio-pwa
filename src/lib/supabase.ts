import { createClient } from '@supabase/supabase-js'
const u=import.meta.env.VITE_SUPABASE_URL,k=import.meta.env.VITE_SUPABASE_ANON_KEY
export const sb=u&&k?createClient(u,k):null
