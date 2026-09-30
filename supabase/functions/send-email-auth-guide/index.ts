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
// VIVALUX BRAND
// =============================================================================

const VIVALUX_GREEN = "#003D2F";
const VIVALUX_GREEN_DARK = "#002B22";
const VIVALUX_GOLD = "#D8B65A";
const VIVALUX_GOLD_LIGHT = "#E8CF83";
const VIVALUX_CREAM = "#F7F5EE";
const VIVALUX_TEXT = "#17352E";
const VIVALUX_MUTED = "#60716C";

// IMPORTANTE:
// Un email no puede resolver "/vivalux-logo.png" como lo haría tu aplicación.
//
// El logo debe estar publicado en una URL accesible públicamente.
// Si tu web sirve el archivo en:
// https://vivalux.tours/vivalux-logo.png
// esta URL funcionará directamente.
//
// También puedes convertirlo posteriormente en un secret/env si quieres.
const VIVALUX_LOGO_URL =
  "https://vivalux.tours/vivalux-logo.png";

// =============================================================================
// TIPOS DE EMAIL
// =============================================================================

interface EmailContent {
  subject: string;
  html: (
    confirmUrl: string,
    userName: string | null,
    userEmail: string,
  ) => string;
}

// =============================================================================
// SEGURIDAD HTML
// =============================================================================

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =============================================================================
// NOMBRE DEL USUARIO
// =============================================================================

function getUserName(
  metadata: Record<string, unknown> | undefined,
): string | null {
  const possibleName =
    metadata?.full_name ??
    metadata?.name ??
    metadata?.display_name;

  if (typeof possibleName !== "string") {
    return null;
  }

  const cleanName = possibleName.trim();

  if (!cleanName) {
    return null;
  }

  return cleanName;
}

// =============================================================================
// LAYOUT PRINCIPAL
// =============================================================================

function baseLayout(opts: {
  title: string;
  greeting: string;
  body: string;
  welcomeBoxTitle: string;
  welcomeBoxBody: string;
  buttonLabel: string;
  confirmUrl: string;
  fallbackText: string;
  footer: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <meta name="color-scheme" content="light" />
  <title>${opts.title}</title>

  <style>
    @media only screen and (max-width: 620px) {
      .email-wrapper {
        padding: 16px !important;
      }

      .email-card {
        border-radius: 18px !important;
      }

      .email-header {
        padding: 28px 24px !important;
      }

      .email-content {
        padding: 32px 24px !important;
      }

      .email-title {
        font-size: 27px !important;
        line-height: 1.2 !important;
      }

      .welcome-box {
        padding: 18px !important;
      }

      .email-button {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        text-align: center !important;
      }

      .email-footer {
        padding: 24px !important;
      }
    }
  </style>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:${VIVALUX_CREAM};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    color:${VIVALUX_TEXT};
  "
>
  <div
    class="email-wrapper"
    style="
      width:100%;
      box-sizing:border-box;
      padding:40px 16px;
      background:${VIVALUX_CREAM};
    "
  >

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="max-width:600px;margin:0 auto;"
    >
      <tr>
        <td>

          <!-- ============================================================= -->
          <!-- CARD                                                          -->
          <!-- ============================================================= -->

          <table
            class="email-card"
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="
              background:#ffffff;
              border-radius:22px;
              overflow:hidden;
              box-shadow:0 12px 40px rgba(0,61,47,0.10);
            "
          >

            <!-- ========================================================= -->
            <!-- HEADER                                                      -->
            <!-- ========================================================= -->

            <tr>
              <td
                class="email-header"
                style="
                  padding:30px 38px 28px;
                  background:${VIVALUX_GREEN};
                  border-bottom:1px solid rgba(216,182,90,0.35);
                "
              >

                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                >
                  <tr>

                    <td
                      align="left"
                      valign="middle"
                    >
                      <img
                        src="${VIVALUX_LOGO_URL}"
                        alt="VivaLux"
                        width="150"
                        style="
                          display:block;
                          width:150px;
                          max-width:100%;
                          height:auto;
                          border:0;
                          outline:none;
                          text-decoration:none;
                        "
                      />
                    </td>

                    <td
                      align="right"
                      valign="middle"
                      style="
                        color:${VIVALUX_GOLD_LIGHT};
                        font-size:11px;
                        font-weight:600;
                        letter-spacing:1.5px;
                        text-transform:uppercase;
                      "
                    >
                      Tour Manager
                    </td>

                  </tr>
                </table>

              </td>
            </tr>

            <!-- ========================================================= -->
            <!-- GOLD LINE                                                   -->
            <!-- ========================================================= -->

            <tr>
              <td
                style="
                  height:3px;
                  line-height:3px;
                  font-size:3px;
                  background:${VIVALUX_GOLD};
                "
              >
                &nbsp;
              </td>
            </tr>

            <!-- ========================================================= -->
            <!-- CONTENT                                                     -->
            <!-- ========================================================= -->

            <tr>
              <td
                class="email-content"
                style="
                  padding:42px 42px 38px;
                  background:#ffffff;
                "
              >

                <!-- Eyebrow -->

                <div
                  style="
                    margin-bottom:12px;
                    color:${VIVALUX_GOLD};
                    font-size:11px;
                    line-height:1.4;
                    font-weight:800;
                    letter-spacing:2.2px;
                    text-transform:uppercase;
                  "
                >
                  Bienvenido a VivaLux
                </div>

                <!-- Title -->

                <h1
                  class="email-title"
                  style="
                    margin:0 0 18px;
                    color:${VIVALUX_GREEN};
                    font-family:Georgia,'Times New Roman',serif;
                    font-size:32px;
                    line-height:1.2;
                    font-weight:500;
                    letter-spacing:-0.4px;
                  "
                >
                  ${opts.greeting}
                </h1>

                <!-- Main paragraph -->

                <p
                  style="
                    margin:0 0 26px;
                    color:${VIVALUX_MUTED};
                    font-size:15px;
                    line-height:1.75;
                  "
                >
                  ${opts.body}
                </p>

                <!-- ===================================================== -->
                <!-- WELCOME BOX                                            -->
                <!-- ===================================================== -->

                <table
                  class="welcome-box"
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  style="
                    margin:0 0 30px;
                    background:#F2F6F2;
                    border:1px solid #E2EBE5;
                    border-radius:14px;
                  "
                >
                  <tr>
                    <td
                      class="welcome-box"
                      style="padding:21px 22px;"
                    >

                      <div
                        style="
                          margin-bottom:7px;
                          color:${VIVALUX_GREEN};
                          font-size:14px;
                          line-height:1.4;
                          font-weight:800;
                        "
                      >
                        ${opts.welcomeBoxTitle}
                      </div>

                      <div
                        style="
                          color:${VIVALUX_MUTED};
                          font-size:13px;
                          line-height:1.65;
                        "
                      >
                        ${opts.welcomeBoxBody}
                      </div>

                    </td>
                  </tr>
                </table>

                <!-- ===================================================== -->
                <!-- BUTTON                                                  -->
                <!-- ===================================================== -->

                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  style="margin:0 0 22px;"
                >
                  <tr>
                    <td>

                      <a
                        class="email-button"
                        href="${opts.confirmUrl}"
                        style="
                          display:inline-block;
                          background:${VIVALUX_GREEN};
                          color:#ffffff;
                          text-decoration:none;
                          font-size:14px;
                          line-height:1;
                          font-weight:700;
                          padding:16px 28px;
                          border-radius:10px;
                          letter-spacing:0.1px;
                          box-shadow:0 5px 14px rgba(0,61,47,0.16);
                        "
                      >
                        ${opts.buttonLabel}
                        &nbsp;&nbsp;→
                      </a>

                    </td>
                  </tr>
                </table>

                <!-- Fallback -->

                <p
                  style="
                    margin:0 0 24px;
                    color:#87938F;
                    font-size:11px;
                    line-height:1.65;
                  "
                >
                  ${opts.fallbackText}
                </p>

                <!-- Divider -->

                <div
                  style="
                    height:1px;
                    background:#E7EBE8;
                    margin:0 0 22px;
                  "
                ></div>

                <!-- Security -->

                <p
                  style="
                    margin:0;
                    color:#8A9691;
                    font-size:11px;
                    line-height:1.6;
                  "
                >
                  ${opts.footer}
                </p>

              </td>
            </tr>

            <!-- ========================================================= -->
            <!-- FOOTER                                                      -->
            <!-- ========================================================= -->

            <tr>
              <td
                class="email-footer"
                style="
                  padding:24px 38px;
                  background:${VIVALUX_GREEN_DARK};
                  text-align:center;
                "
              >

                <div
                  style="
                    margin-bottom:7px;
                    color:${VIVALUX_GOLD};
                    font-family:Georgia,'Times New Roman',serif;
                    font-size:15px;
                    font-style:italic;
                  "
                >
                  Belgium, beautifully experienced.
                </div>

                <div
                  style="
                    color:rgba(255,255,255,0.48);
                    font-size:10px;
                    line-height:1.5;
                  "
                >
                  © VivaLux · Tour Manager
                </div>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </div>
</body>
</html>
  `;
}

// =============================================================================
// PLANTILLAS POR IDIOMA
// =============================================================================

const TEMPLATES: Record<AppLanguage, EmailContent> = {
  // ---------------------------------------------------------------------------
  // ESPAÑOL
  // ---------------------------------------------------------------------------

  es: {
    subject: "Bienvenido a VivaLux — confirma tu cuenta",

    html: (url, userName) => {
      const safeName = userName
        ? escapeHtml(userName.split(" ")[0])
        : "guía";

      return baseLayout({
        title: "Bienvenido a VivaLux",

        greeting: `Bienvenido, ${safeName}`,

        body:
          "Nos alegra darte la bienvenida a VivaLux. Tu cuenta de guía ya está lista para comenzar a formar parte de nuestra plataforma y gestionar tus tours desde un mismo lugar.",

        welcomeBoxTitle:
          "Un nuevo espacio para tu día a día",

        welcomeBoxBody:
          "Desde Tour Manager podrás consultar tus tours, horarios, información de cada servicio y las actualizaciones que necesites, de forma sencilla y organizada.",

        buttonLabel:
          "Activar mi cuenta",

        confirmUrl:
          url,

        fallbackText:
          "Si el botón no funciona, puedes copiar y pegar el enlace de confirmación en tu navegador.",

        footer:
          "Por seguridad, este enlace es personal y solo debe utilizarse para activar tu cuenta. Si no has solicitado este registro, puedes ignorar este correo con tranquilidad.",
      });
    },
  },

  // ---------------------------------------------------------------------------
  // DUTCH
  // ---------------------------------------------------------------------------

  nl: {
    subject: "Welkom bij VivaLux — bevestig je account",

    html: (url, userName) => {
      const safeName = userName
        ? escapeHtml(userName.split(" ")[0])
        : "gids";

      return baseLayout({
        title: "Welkom bij VivaLux",

        greeting: `Welkom, ${safeName}`,

        body:
          "We zijn blij je welkom te mogen heten bij VivaLux. Je gidsaccount staat klaar om deel uit te maken van ons platform en je tours vanuit één centrale omgeving te beheren.",

        welcomeBoxTitle:
          "Een nieuwe plek voor je dagelijkse planning",

        welcomeBoxBody:
          "Via Tour Manager kun je je tours, planning, servicegegevens en belangrijke updates eenvoudig en overzichtelijk raadplegen.",

        buttonLabel:
          "Mijn account activeren",

        confirmUrl:
          url,

        fallbackText:
          "Werkt de knop niet? Kopieer en plak dan de bevestigingslink in je browser.",

        footer:
          "Deze link is persoonlijk en dient alleen om je account te activeren. Heb je dit account niet aangevraagd, dan kun je deze e-mail gerust negeren.",
      });
    },
  },

  // ---------------------------------------------------------------------------
  // ENGLISH
  // ---------------------------------------------------------------------------

  en: {
    subject: "Welcome to VivaLux — confirm your account",

    html: (url, userName) => {
      const safeName = userName
        ? escapeHtml(userName.split(" ")[0])
        : "guide";

      return baseLayout({
        title: "Welcome to VivaLux",

        greeting: `Welcome, ${safeName}`,

        body:
          "We are delighted to welcome you to VivaLux. Your guide account is ready, giving you access to our platform and everything you need to manage your tours from one place.",

        welcomeBoxTitle:
          "A new space for your daily work",

        welcomeBoxBody:
          "With Tour Manager, you can easily access your tours, schedules, service information and important updates in one clear and organised environment.",

        buttonLabel:
          "Activate my account",

        confirmUrl:
          url,

        fallbackText:
          "If the button does not work, copy and paste the confirmation link into your browser.",

        footer:
          "For your security, this link is personal and should only be used to activate your account. If you did not request this account, you can safely ignore this email.",
      });
    },
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

    const resendApiKey =
      Deno.env.get("RESEND_API_KEY_AUTH_GUIDE") ?? "";

    const emailFrom =
      "VivaLux <noreply@vivalux.tours>";

    // -------------------------------------------------------------------------
    // Validación de secrets
    // -------------------------------------------------------------------------

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
      payload = wh.verify(
        rawBody,
        headers,
      ) as HookPayload;
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
    // -------------------------------------------------------------------------

    const lang = resolveLanguage(
      user.user_metadata?.preferred_language,
    );

    const template = TEMPLATES[lang];

    // -------------------------------------------------------------------------
    // Nombre del guía
    // -------------------------------------------------------------------------

    const userName = getUserName(
      user.user_metadata,
    );

    // -------------------------------------------------------------------------
    // Construir enlace de confirmación
    // -------------------------------------------------------------------------

    const confirmUrl = buildConfirmUrl(
      email_data,
    );

    // -------------------------------------------------------------------------
    // Generar HTML
    // -------------------------------------------------------------------------

    const html = template.html(
      confirmUrl,
      userName,
      user.email,
    );

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
          html,
        }),
      },
    );

    // -------------------------------------------------------------------------
    // Error de Resend
    // -------------------------------------------------------------------------

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
    console.error(
      "send-email-auth-guide error:",
      error,
    );

    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message:
            error instanceof Error
              ? error.message
              : String(error),
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