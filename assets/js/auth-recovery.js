(() => {
  "use strict";
  // Forgot and reset password share the exact login screen and the existing
  // NTAAdminClient. Do not create another Supabase GoTrue client here.
  const sb = window.NTAAdminClient;
  const cfg = window.NTA_CONFIG || {};
  const root = document.getElementById("adminAuth");
  const signin = document.getElementById("signinForm");
  const forgot = document.getElementById("forgotPasswordForm");
  const reset = document.getElementById("resetPasswordForm");
  const status = document.getElementById("authStatus");
  const heading = document.getElementById("authViewTitle");
  const subtitle = document.getElementById("authViewDescription");
  const eyebrow = document.getElementById("authViewOverline");
  const resetButton = document.getElementById("resetPasswordSubmit");
  if (!sb || !root || !signin || !forgot || !reset || !status || !resetButton) return;

  const details = {
    signin: {
      eyebrow:"SECURE ADMIN ACCESS",
      heading:"Welcome back",
      subtitle:"Sign in to your NTA Logistics workspace."
    },
    "forgot-password": {
      eyebrow:"ACCOUNT RECOVERY",
      heading:"Forgot your password?",
      subtitle:"Enter your admin email address. We'll send you a secure link to set a new password."
    },
    "reset-password": {
      eyebrow:"SECURE PASSWORD RESET",
      heading:"Create a new password",
      subtitle:"Choose a new password for your NTA Logistics management account."
    }
  };

  const fromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const intent = params.get("auth");
    if (intent === "forgot-password" || intent === "reset-password") return intent;
    if (hash.get("type") === "recovery" || params.get("type") === "recovery") return "reset-password";
    return "signin";
  };

  let view = fromUrl();
  let recoveryReady = false;
  let resetFinished = false;

  window.NTAAuthFlow = Object.freeze({
    isAuthViewRequested: () => view === "forgot-password" || view === "reset-password",
    isRecoveryMode: () => view === "reset-password"
  });

  const clearStatus = () => { status.className = "status"; status.textContent = ""; };
  const message = (text, type = "") => {
    status.textContent = String(text || "");
    status.className = "status show" + (type ? " " + type : "");
  };

  function setRecoveryReady(ready) {
    recoveryReady = Boolean(ready);
    resetButton.disabled = !recoveryReady || resetFinished;
    resetButton.textContent = recoveryReady ? "Update password" : "Verify reset link to continue";
  }

  function show(mode) {
    view = details[mode] ? mode : "signin";
    signin.hidden = view !== "signin";
    forgot.hidden = view !== "forgot-password";
    reset.hidden = view !== "reset-password";
    heading.textContent = details[view].heading;
    subtitle.textContent = details[view].subtitle;
    eyebrow.textContent = details[view].eyebrow;
    root.dataset.authView = view;
    clearStatus();
    if (view === "reset-password") {
      setRecoveryReady(recoveryReady);
      if (!recoveryReady) message("Checking your secure reset link…");
    } else if (view === "signin") {
      if (new URLSearchParams(window.location.search).get("reset") === "success") {
        message("Password updated. Sign in with your new password.", "success");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }

  function navigate(mode, push = true) {
    if (push) {
      const url = mode === "signin" ? "/" : "/?auth=" + encodeURIComponent(mode);
      window.history.pushState({}, "", url);
    }
    show(mode);
    if (mode === "reset-password") void checkRecovery();
    if (mode === "forgot-password") document.getElementById("recoveryEmail")?.focus();
  }

  document.querySelectorAll("[data-auth-view]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      const mode = link.dataset.authView;
      const leavingRecovery = view === "reset-password" && mode !== "reset-password";
      navigate(mode);
      if (leavingRecovery && recoveryReady) {
        setRecoveryReady(false);
        void sb.auth.signOut({scope:"local"}).catch(() => {});
      }
    });
  });

  window.addEventListener("popstate", () => {
    show(fromUrl());
    if (view === "reset-password") void checkRecovery();
  });

  document.querySelectorAll("[data-auth-password-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.authPasswordToggle);
      if (!input) return;
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.setAttribute("aria-pressed", String(reveal));
      button.setAttribute("aria-label", (reveal ? "Hide " : "Show ") + (input.id === "newAdminPassword" ? "new password" : "confirmed password"));
    });
  });

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session && view === "reset-password") {
      setRecoveryReady(true);
      message("Your reset link has been verified. Create your new password.", "success");
    }
  });

  async function checkRecovery() {
    if (view !== "reset-password" || resetFinished) return;
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.has("error") || fragment.has("error")) {
      setRecoveryReady(false);
      message("This reset link is invalid or expired. Request another password reset email.", "error");
      return;
    }
    const tokenHash = fragment.get("token_hash") || params.get("token_hash");
    const type = fragment.get("type") || params.get("type");
    if (tokenHash && type === "recovery") {
      try {
        const { data, error } = await sb.auth.verifyOtp({token_hash:tokenHash,type:"recovery"});
        if (error || !data?.session?.user?.id) throw error || new Error("Invalid recovery link");
        if (view !== "reset-password") return;
        setRecoveryReady(true);
        // Remove the one-time token from the browser address after verification.
        window.history.replaceState({}, "", "/?auth=reset-password");
        message("Your secure reset link has been verified. Choose a new password.", "success");
      } catch {
        setRecoveryReady(false);
        message("This reset link is invalid or expired. Request another password reset email.", "error");
      }
      return;
    }
    // Legacy Supabase links carry a recovery access_token in the URL
    // and are exchanged automatically by the shared auth client.
    // An unrelated existing login session must never authorize a reset.
    if (type !== "recovery" || !fragment.has("access_token")) {
      if (!recoveryReady) {
        setRecoveryReady(false);
        message("Open the secure password reset link from your email.", "error");
      }
      return;
    }
    try {
      const {data,error}=await sb.auth.getSession();
      if(error || !data?.session?.user?.id) throw error || new Error("Invalid session");
      if(view !== "reset-password") return;
      setRecoveryReady(true);
      window.history.replaceState({}, "", "/?auth=reset-password");
      message("Your secure reset link has been verified. Choose a new password.", "success");
    } catch {
      setRecoveryReady(false);
      message("This reset link is invalid or expired. Request another password reset email.", "error");
    }
  }

  forgot.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("recoveryEmail").value.trim();
    if (!email || !forgot.reportValidity()) return;
    const button = document.getElementById("forgotPasswordSubmit");
    button.disabled = true;
    button.textContent = "Sending reset link…";
    clearStatus();
    try {
      // Keep the existing verified redirect allowlist path. That legacy
      // endpoint forwards the recovery token to this same login screen.
      const response = await fetch(cfg.passwordRecoveryFunctionUrl || "https://wwnwelahpiyshhueitlj.supabase.co/functions/v1/nta-password-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!response.ok) throw new Error("Password recovery is temporarily unavailable. Please try again.");
      const result = await response.json();
      if (!result.ok) throw new Error("Password recovery is temporarily unavailable. Please try again.");
      message("If an NTA admin account exists for that email, you'll receive a password reset link. Check your inbox.", "success");
    } catch (error) {
      message(error?.message || "Unable to send the reset link. Try again.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Send password reset link";
    }
  });

  reset.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("newAdminPassword").value;
    const confirmation = document.getElementById("confirmAdminPassword").value;
    if (!recoveryReady) {
      message("Your reset link is invalid or expired. Request a new link.", "error");
      return;
    }
    if (password.length < 10) {
      message("Use a password with at least 10 characters.", "error");
      return;
    }
    if (password !== confirmation) {
      message("The two passwords do not match.", "error");
      return;
    }
    resetButton.disabled = true;
    resetButton.textContent = "Updating password…";
    clearStatus();
    try {
      const {error} = await sb.auth.updateUser({password});
      if (error) throw error;
      resetFinished = true;
      document.getElementById("newAdminPassword").value = "";
      document.getElementById("confirmAdminPassword").value = "";
      message("Your password has been updated. Signing out securely…", "success");
      const signedOut = await sb.auth.signOut({scope:"local"});
      if (signedOut?.error) {
        message("Your password was updated, but automatic sign-out did not finish. Please close this tab and sign in again.", "error");
        return;
      }
      window.location.replace("/?reset=success");
    } catch (error) {
      message(error?.message || "Unable to update your password. Try again.", "error");
      setRecoveryReady(true);
    } finally {
      if (!resetFinished) {
        resetButton.disabled = !recoveryReady;
        resetButton.textContent = "Update password";
      }
    }
  });

  show(view);
  if (view === "reset-password") void checkRecovery();
})();
