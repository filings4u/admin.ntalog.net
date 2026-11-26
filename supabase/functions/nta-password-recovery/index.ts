import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const ADMIN_ORIGIN="https://admin.ntalog.net";
const LOGO_URL="https://wwnwelahpiyshhueitlj.supabase.co/storage/v1/object/public/NTA_public_assets/nta-logistics-logo4.png";
const allowedOrigin=new Set([ADMIN_ORIGIN]);
function respond(body:unknown,status=200,origin=""){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin",...(allowedOrigin.has(origin)?{"access-control-allow-origin":origin}:{})}});
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));}
function serviceKey(){try{const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");if(keys.default)return String(keys.default)}catch{}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
async function hash(text:string){
  const bytes=new TextEncoder().encode(text);
  const output=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(output)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
const generic={ok:true,message:"If an authorized NTA administrator account exists for this email, a secure reset link will be sent."};
Deno.serve(async(request:Request)=>{
  const origin=request.headers.get("origin")||"";
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":allowedOrigin.has(origin)?origin:ADMIN_ORIGIN,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type, apikey, authorization","vary":"Origin"}});
  // Non-email diagnostic: exposes only whether server configuration is ready,
  // never the secret values or individual missing key names.
  if(request.method==="GET" && new URL(request.url).searchParams.get("health")==="1"){
    const ready=Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("SUPABASE_URL") && serviceKey());
    if(!ready)console.error("NTA recovery health check: server configuration incomplete",{
      missingResendKey:!Deno.env.get("RESEND_API_KEY"),
      missingSupabaseUrl:!Deno.env.get("SUPABASE_URL"),
      missingServerAuthKey:!serviceKey()
    });
    return respond({ok:ready,service:"nta-password-recovery"},ready?200:503,origin);
  }
  if(request.method!=="POST")return respond({error:"Method not allowed"},405,origin);
  if(!allowedOrigin.has(origin))return respond({error:"Origin not allowed"},403,origin);
  const apiKey=Deno.env.get("RESEND_API_KEY");
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const adminKey=serviceKey();
  if(!apiKey||!supabaseUrl||!adminKey){console.error("Recovery email configuration missing", {missingResendKey:!apiKey,missingSupabaseUrl:!supabaseUrl,missingServerAuthKey:!adminKey});return respond({error:"Password recovery is temporarily unavailable"},503,origin);}
  let body:Record<string,unknown>;
  try{body=await request.json()}catch{return respond({error:"Invalid request"},400,origin)}
  const email=String(body.email||"").trim().toLowerCase();
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return respond({error:"Enter a valid email address"},400,origin);
  const db=createClient(supabaseUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  // Normalize response to avoid revealing whether an email belongs to an administrator.
  try{
    const ip=(request.headers.get("cf-connecting-ip")||request.headers.get("x-real-ip")||"unknown").slice(0,100);
    const pepper=adminKey.slice(-32);
    const [emailHash,ipHash]=await Promise.all([hash(pepper+"|email|"+email),hash(pepper+"|ip|"+ip)]);
    const windowStart=new Date(Date.now()-60*60*1000).toISOString();
    const [emailAttempts,ipAttempts]=await Promise.all([
      db.from("nta_password_recovery_attempts").select("id",{count:"exact",head:true}).eq("email_hash",emailHash).gte("created_at",windowStart),
      db.from("nta_password_recovery_attempts").select("id",{count:"exact",head:true}).eq("ip_hash",ipHash).gte("created_at",windowStart)
    ]);
    if(emailAttempts.error||ipAttempts.error)throw new Error("Rate limit check failed");
    if((emailAttempts.count??0)>=3 || (ipAttempts.count??0)>=15)return respond(generic,200,origin);
    const {error:trackedError}=await db.from("nta_password_recovery_attempts").insert({email_hash:emailHash,ip_hash:ipHash});
    if(trackedError)throw new Error("Unable to track recovery request");
    const {data:admin,error:adminError}=await db.from("nta_admin_users").select("user_id,active").ilike("email",email).eq("active",true).maybeSingle();
    if(adminError)throw adminError;
    if(!admin?.user_id)return respond(generic,200,origin);
    const {data:userResult,error:userError}=await db.auth.admin.getUserById(admin.user_id);
    if(userError||!userResult?.user||userResult.user.email?.toLowerCase()!==email)return respond(generic,200,origin);

    // generateLink creates a Supabase-authenticated one-time recovery token
    // but does not send any Supabase-branded email.
    const {data:linkResult,error:linkError}=await db.auth.admin.generateLink({
      type:"recovery",email,options:{redirectTo:ADMIN_ORIGIN+"/?auth=reset-password"}
    });
    if(linkError)throw linkError;
    const tokenHash=String(linkResult?.properties?.hashed_token||"");
    if(!/^[a-zA-Z0-9_-]{12,512}$/.test(tokenHash))throw new Error("Supabase did not return a recovery token");
    const resetUrl=ADMIN_ORIGIN+"/?auth=reset-password#type=recovery&token_hash="+encodeURIComponent(tokenHash);
    const safeUrl=escapeHtml(resetUrl);
    const html=`<!doctype html><html><body style="margin:0;padding:35px 14px;background:#edf2f7;font-family:Arial,Helvetica,sans-serif;color:#182f4a">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;margin:auto;border-collapse:collapse;border-radius:14px;overflow:hidden;background:white">
<tr><td style="background:#10243d;padding:30px 36px;border-bottom:4px solid #e4b447">
<img src="${LOGO_URL}" alt="NTA Logistics" width="190" style="display:block;max-width:100%;height:auto">
<p style="color:#e4b447;text-transform:uppercase;font-size:11px;letter-spacing:2px;font-weight:bold;margin:22px 0 6px">Secure account recovery</p>
<h1 style="color:white;font-size:28px;line-height:1.2;margin:0">Reset your password</h1></td></tr>
<tr><td style="padding:34px 36px 38px">
<p style="font-size:16px;line-height:1.7;margin:0 0 16px">We received a request to reset the password for your NTA Logistics Administration Platform account.</p>
<p style="font-size:14px;color:#52657b;line-height:1.7;margin:0 0 25px">Use the secure button below to choose a new password. This link is intended for one-time use and expires according to your account's security settings.</p>
<a href="${safeUrl}" style="display:inline-block;background:#e4b447;color:#12243b;text-decoration:none;border-radius:8px;padding:15px 24px;font-size:14px;font-weight:bold">Reset my password</a>
<p style="font-size:12px;color:#667b8e;line-height:1.7;margin:28px 0 0">If you didn't request this, you can ignore this email. Your current password will remain unchanged.</p>
<p style="font-size:12px;color:#667b8e;line-height:1.7;margin:14px 0 0">For assistance, contact your NTA Logistics administrator.</p>
</td></tr><tr><td style="background:#f5f8fc;padding:20px 36px;color:#667b8e;font-size:11px">NTA Logistics · Administration Platform · Secure access</td></tr></table></body></html>`;
    const sent=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({from:"NTA Logistics <notifications@ntalog.net>",to:[email],subject:"Reset your NTA Logistics admin password",html,
        text:"NTA Logistics Administration Platform\n\nReset your password: "+resetUrl+"\n\nIf you did not request this, ignore this email."})
    });
    if(!sent.ok){console.error("Resend rejected password recovery",sent.status);throw new Error("Resend delivery failed");}
  }catch(error){console.error("NTA password recovery delivery issue",error instanceof Error?error.message:"Unknown");}
  return respond(generic,200,origin);
});
