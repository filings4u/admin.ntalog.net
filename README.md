# NTA Logistics Management Portal

This is the dedicated administration application for NTA Logistics, separate from the public `ntalog.net` website.

The administration UI uses the existing NTA Supabase authentication and `nta-admin-api` backend. Public intake and blog delivery stay on `ntalog.net`.

Security: the management portal requires authorization through the backend; no management API secrets belong in frontend files.

## Branded administrator password recovery

The admin login at `https://admin.ntalog.net/` contains the Forgot Password and Reset Password views. Requests from the forgot form go to the public rate-limited Supabase Edge Function `nta-password-recovery` (source: `supabase/functions/nta-password-recovery/index.ts`). This server-side function uses Supabase Admin Auth to generate a one-time recovery token and **Resend** to deliver a branded message from `NTA Logistics <notifications@ntalog.net>`. The message reuses the verified NTA logo from the `NTA_public_assets` storage bucket. No Resend or Supabase administrative key is shipped to the browser.

The reset link opens `/?auth=reset-password#type=recovery&token_hash=...`; the existing client verifies the token with Supabase Auth and only then permits the password update. Existing `reset-password.html` email links continue to redirect into the same login view. After a successful password update the recovery session is signed out.

The rate-limit table `public.nta_password_recovery_attempts` has RLS enabled and no browser policies; only the server can check and record hashed email/IP request counters. The function avoids email-account enumeration in its public response. Review the NTA Supabase Edge Function environment to ensure `RESEND_API_KEY` is configured. The existing `nta-form-notify` uses the same secret.

**Scope:** This custom Resend integration handles the admin **password recovery email**. To ensure *all other* automatically generated Supabase Auth emails use Resend as well, configure Resend SMTP in Supabase Authentication > SMTP and use branded Supabase Auth email templates; the custom recovery function does not itself reconfigure global Auth SMTP.
