import "@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "npm:standardwebhooks@1.0.0";

// =============================================================================
// auth-send-email — Send Email Hook de Supabase Auth
// -----------------------------------------------------------------------------
// Configuración necesaria en el Dashboard (Authentication > Hooks > Send Email
// hook): apuntar a esta función y pegar el "Signing secret" que Supabase
// genera ahí, guardado aquí como el secret AUTH_HOOK_SECRET.
// Además hacen falta estos secrets:
//   RESEND_API_KEY   — de resend.com/api-keys
//   EMAIL_FROM       — ej. "Vivalux Tours <no-reply@vivalux.tours>"
//                       (el dominio debe estar verificado en Resend)
// NOTA: no pude probar esto en vivo (no tengo acceso a la API de Resend ni a
// un proyecto Supabase real desde aquí). Sigue el contrato documentado por
// Supabase para este hook; conviene probarlo con un registro real y revisar
// los logs de la función antes de confiar en él en producción.
// =============================================================================

type AppLanguage = "es" | "nl" | "en";

interface HookPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type:
      | "signup"
      | "recovery"
      | "invite"
      | "magiclink"
      | "email_change"
      | "email_change_new"
      | "reauthentication";
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

// ─── PLANTILLAS ──────────────────────────────────────────────────────────────
// Solo "signup" (confirmación de registro) tiene plantilla propia por ahora,
// que es lo único que usa hoy la webapp. Los demás tipos (recovery, invite,
// magiclink...) caen al mismo texto genérico en español hasta que hagan
// falta — se añaden aquí como otra entrada en TEMPLATES cuando llegue el caso.
interface EmailContent {
  subject: string;
  html: (confirmUrl: string) => string;
}

const BRAND_COLOR = "#4F46E5";

function baseLayout(opts: {
  title: string;
  body: string;
  buttonLabel: string;
  confirmUrl: string;
  footer: string;
}): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f4f4f7; padding:32px 16px;">
    <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="background:${BRAND_COLOR}; padding:24px 32px;">
        <span style="color:#ffffff; font-size:20px; font-weight:800; letter-spacing:-0.02em;">Vivalux Tours</span>
      </div>
      <div style="padding:32px;">
        <h1 style="font-size:18px; font-weight:700; margin:0 0 12px; color:#111827;">${opts.title}</h1>
        <p style="font-size:14px; line-height:1.6; color:#374151; margin:0 0 24px;">${opts.body}</p>
        <a href="${opts.confirmUrl}"
           style="display:inline-block; background:${BRAND_COLOR}; color:#ffffff; text-decoration:none;
                  font-size:14px; font-weight:600; padding:12px 24px; border-radius:10px;">
          ${opts.buttonLabel}
        </a>
        <p style="font-size:12px; color:#9CA3AF; margin:24px 0 0;">${opts.footer}</p>
      </div>
    </div>
  </div>`;
}

const TEMPLATES: Record<AppLanguage, EmailContent> = {
  es: {
    subject: "Confirma tu cuenta — Vivalux Tours",
    html: (url) =>
      baseLayout({
        title: "Confirma tu cuenta",
        body:
          "Gracias por registrarte en TourManager. Haz clic en el botón para confirmar tu correo y activar tu cuenta.",
        buttonLabel: "Confirmar cuenta",
        confirmUrl: url,
        footer:
          "Si no creaste esta cuenta, puedes ignorar este correo con tranquilidad.",
      }),
  },
  nl: {
    subject: "Bevestig je account — Vivalux Tours",
    html: (url) =>
      baseLayout({
        title: "Bevestig je account",
        body:
          "Bedankt voor je registratie bij TourManager. Klik op de knop om je e-mailadres te bevestigen en je account te activeren.",
        buttonLabel: "Account bevestigen",
        confirmUrl: url,
        footer:
          "Als je dit account niet hebt aangemaakt, kun je deze e-mail negeren.",
      }),
  },
  en: {
    subject: "Confirm your account — Vivalux Tours",
    html: (url) =>
      baseLayout({
        title: "Confirm your account",
        body:
          "Thanks for signing up with TourManager. Click the button below to confirm your email and activate your account.",
        buttonLabel: "Confirm account",
        confirmUrl: url,
        footer: "If you didn't create this account, you can safely ignore this email.",
      }),
  },
};

function resolveLanguage(v: unknown): AppLanguage {
  return v === "nl" || v === "en" ? v : "es";
}

function buildConfirmUrl(emailData: HookPayload["email_data"]): string {
  // Formato estándar de Supabase para el enlace de verificación de un correo
  // de auth: /auth/v1/verify?token=...&type=...&redirect_to=...
  // (site_url viene del propio payload, así no hace falta hardcodear dominio).
  const base = emailData.site_url.replace(/\/$/, "");
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  });
  return `${base}/auth/v1/verify?${params.toString()}`;
}

Deno.serve(async (req) => {
  try {
    const hookSecret = Deno.env.get("AUTH_HOOK_SECRET");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");
    if (!hookSecret || !resendApiKey || !emailFrom) {
      throw new Error(
        "Faltan secrets: AUTH_HOOK_SECRET, RESEND_API_KEY o EMAIL_FROM.",
      );
    }

    const rawBody = await req.text();

    // Verificación de firma (formato Standard Webhooks, el que usa Supabase
    // para este hook). Si esto falla, cualquiera podría hacerse pasar por
    // Supabase y disparar envíos de correo arbitrarios.
    const wh = new Webhook(hookSecret);
    const headers = Object.fromEntries(req.headers);
    let payload: HookPayload;
    try {
      payload = wh.verify(rawBody, headers) as HookPayload;
    } catch {
      return new Response(JSON.stringify({ error: "Firma inválida" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { user, email_data } = payload;

    // Por ahora solo se personaliza "signup"; el resto usa la misma
    // plantilla en español como respaldo (ver comentario junto a TEMPLATES).
    const lang = resolveLanguage(user.user_metadata?.preferred_language);
    const template = TEMPLATES[lang];
    const confirmUrl = buildConfirmUrl(email_data);

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [user.email],
        subject: template.subject,
        html: template.html(confirmUrl),
      }),
    });

    if (!sendRes.ok) {
      throw new Error(`Resend respondió ${sendRes.status}: ${await sendRes.text()}`);
    }

    // El contrato del hook espera 200 y cuerpo vacío/objeto vacío en éxito.
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Si esto falla, Supabase NO envía el correo (y puede bloquear el signup
    // según la config del hook) — mejor ver el error en los logs que fallar
    // en silencio, así que se devuelve tal cual.
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: error instanceof Error ? error.message : String(error),
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});