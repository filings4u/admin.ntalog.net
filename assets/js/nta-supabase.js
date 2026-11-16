window.NTA_CONFIG = Object.freeze({
  siteUrl: "https://ntalog.net/",
  adminUrl: "https://admin.ntalog.net/",
  forgotPasswordUrl: "https://admin.ntalog.net/forgot-password.html",
  resetPasswordUrl: "https://admin.ntalog.net/reset-password.html",
  supabaseUrl: "https://wwnwelahpiyshhueitlj.supabase.co",
  publishableKey: "sb_publishable_zO_MwLNLhks3hSlcMw8C0A_5c-9jXfM",
  functionUrl: "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-public-intake",
  carrierBucket: "NTA_logistics",
  storageFunctionUrl: "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-storage",
  carrierSecureFunctionUrl: "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-carrier-secure",
  notifyFunctionUrl: "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-form-notify",
  agentFunctionUrl: "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-agent-intake",
  adminFunctionUrl: "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-admin-api",
  blogFunctionUrl: "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-blog-public"
});

// One authenticated client is shared by all admin modules to prevent competing sessions.
window.NTAAdminClient = window.supabase?.createClient
  ? window.supabase.createClient(window.NTA_CONFIG.supabaseUrl, window.NTA_CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
window.NTASupabase = window.NTAAdminClient;
