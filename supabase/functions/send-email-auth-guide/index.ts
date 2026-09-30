import { Webhook } from "npm:standardwebhooks@1.0.0";

// =============================================================================
// send-email-auth-guide — Send Email Hook de Supabase Auth
// =============================================================================
//
// Secrets necesarios:
//
//   RESEND_API_KEY_AUTH_GUIDE
//     → API Key de Resend.
//
//   SEND_EMAIL_AUTH_GUIDE_HOOK_SECRET
//     → Signing secret generado por Supabase en:
//       Authentication > Hooks > Send Email Hook
//
// El dominio usado en EMAIL_FROM debe estar verificado en Resend.
//
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

// =============================================================================
// EMAIL
// =============================================================================

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
    <div
      style="
        margin:0;
        padding:32px 16px;
        background:#f4f4f7;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
      "
    >
      <div
        style="
          width:100%;
          max-width:480px;
          margin:0 auto;
          background:#ffffff;
          border-radius:16px;
          overflow:hidden;
          box-shadow:0 2px 8px rgba(0,0,0,0.06);
        "
      >
        <!-- Header -->
        <div
          style="
            background:${BRAND_COLOR};
            padding:24px 32px;
          "
        >
          <span
            style="
              color:#ffffff;
              font-size:20px;
              font-weight:800;
              letter-spacing:-0.02em;
            "
          >
            VivaLux
          </span>
        </div>

        <!-- Content -->
        <div style="padding:32px;">
          <h1
            style="
              margin:0 0 12px;
              color:#111827;
              font-size:20px;
              line-height:1.3;
              font-weight:700;
            "
          >
            ${opts.title}
          </h1>

          <p
            style="
              margin:0 0 24px;
              color:#374151;
              font-size:14px;
              line-height:1.6;
            "
          >
            ${opts.body}
          </p>

          <a
            href="${opts.confirmUrl}"
            style="
              display:inline-block;
              background:${BRAND_COLOR};
              color:#ffffff;
              text-decoration:none;
              font-size:14px;
              font-weight:600;
              padding:12px 24px;
              border-radius:10px;
            "
          >
            ${opts.buttonLabel}
          </a>

          <p
            style="
              margin:24px 0 0;
              color:#9CA3AF;
              font-size:12px;
              line-height:1.5;
            "
          >
            ${opts.footer}
          </p>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// PLANTILLAS POR IDIOMA
// =============================================================================

const TEMPLATES: Record<AppLanguage, EmailContent> = {
  es: {
    subject: "Confirma tu cuenta — VivaLux",

    html: (url) =>
      baseLayout({
        title: "Confirma tu cuenta",

        body:
          "Gracias por registrarte en VivaLux. Haz clic en el botón para confirmar tu correo electrónico y activar tu cuenta.",

        buttonLabel: "Confirmar cuenta",

        confirmUrl: url,

        footer:
          "Si no has creado esta cuenta, puedes ignorar este correo con tranquilidad.",
      }),
  },

  nl: {
    subject: "Bevestig je account — VivaLux",

    html: (url) =>
      baseLayout({
        title: "Bevestig je account",

        body:
          "Bedankt voor je registratie bij VivaLux. Klik op de knop om je e-mailadres te bevestigen en je account te activeren.",

        buttonLabel: "Account bevestigen",

        confirmUrl: url,

        footer:
          "Als je dit account niet hebt aangemaakt, kun je deze e-mail negeren.",
      }),
  },

  en: {
    subject: "Confirm your account — VivaLux",

    html: (url) =>
      baseLayout({
        title: "Confirm your account",

        body:
          "Thanks for signing up with VivaLux. Click the button below to confirm your email address and activate your account.",

        buttonLabel: "Confirm account",

        confirmUrl: url,

        footer:
          "If you didn't create this account, you can safely ignore this email.",
      }),
  },
};

// =============================================================================
// IDIOMA
// =============================================================================

function resolveLanguage(value: unknown): AppLanguage {
  if (value === "nl") return "nl";
  if (value === "en") return "en";

  return "es";
}

// =============================================================================
// URL DE CONFIRMACIÓN DE SUPABASE
// =============================================================================

function buildConfirmUrl(
  emailData: HookPayload["email_data"],
): string {
  const base = emailData.site_url.replace(/\/$/, "");

  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  });

  return `${base}/auth/v1/verify?${params.toString()}`;
}

// =============================================================================
// EDGE FUNCTION
// =============================================================================

Deno.serve(async (req) => {
  try {
    // -------------------------------------------------------------------------
    // Secrets
    // -------------------------------------------------------------------------

    const hookSecret = (
      Deno.env.get("SEND_EMAIL_AUTH_GUIDE_HOOK_SECRET") ?? ""
    ).replace("v1,whsec_", "");

    const resendApiKey = Deno.env.get("RESEND_API_KEY_AUTH_GUIDE") ?? "";

    // Sender fijo de este sistema.
    // El dominio vivalux.tour debe estar verificado en Resend.
    const emailFrom = "VivaLux <noreply@vivalux.tours>";

    if (!hookSecret) {
      throw new Error(
        "Falta el secret SEND_EMAIL_AUTH_GUIDE_HOOK_SECRET.",
      );
    }

    if (!resendApiKey) {
      throw new Error(
        "Falta el secret RESEND_API_KEY_AUTH_GUIDE.",
      );
    }

    // -------------------------------------------------------------------------
    // Leer body original
    // -------------------------------------------------------------------------

    const rawBody = await req.text();

    // -------------------------------------------------------------------------
    // Verificación de firma de Supabase
    // -------------------------------------------------------------------------

    const wh = new Webhook(hookSecret);

    const headers = Object.fromEntries(req.headers);

    let payload: HookPayload;

    try {
      payload = wh.verify(rawBody, headers) as HookPayload;
    } catch {
      return new Response(
        JSON.stringify({
          error: "Firma inválida",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // -------------------------------------------------------------------------
    // Datos del usuario
    // -------------------------------------------------------------------------

    const { user, email_data } = payload;

    if (!user?.email) {
      throw new Error(
        "El payload de Supabase no contiene un email de usuario.",
      );
    }

    // -------------------------------------------------------------------------
    // Idioma
    //
    // AuthContext ya guarda:
    //
    // options: {
    //   data: {
    //     full_name: fullName,
    //     preferred_language: language,
    //   },
    // }
    //
    // Por tanto aquí recuperamos preferred_language directamente.
    // -------------------------------------------------------------------------

    const lang = resolveLanguage(
      user.user_metadata?.preferred_language,
    );

    const template = TEMPLATES[lang];

    // -------------------------------------------------------------------------
    // Construir enlace de confirmación
    // -------------------------------------------------------------------------

    const confirmUrl = buildConfirmUrl(email_data);

    // -------------------------------------------------------------------------
    // Enviar mediante Resend
    // -------------------------------------------------------------------------

    const sendRes = await fetch(
      "https://api.resend.com/emails",
      {
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
      },
    );

    if (!sendRes.ok) {
      throw new Error(
        `Resend respondió ${sendRes.status}: ${await sendRes.text()}`,
      );
    }

    // -------------------------------------------------------------------------
    // Respuesta correcta para Supabase Auth Hook
    // -------------------------------------------------------------------------

    return new Response(
      JSON.stringify({}),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("send-email-auth-guide error:", error);

    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: error instanceof Error ? error.message : String(error),
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});
