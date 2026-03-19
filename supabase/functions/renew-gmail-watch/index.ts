// ─── RENOVAR GMAIL WATCH ──────────────────────────────────────────────────────
// Esta función se ejecuta automáticamente cada 6 días via cron job
// para renovar el Gmail Watch antes de que caduque (caduca cada 7 días)

Deno.serve(async () => {
  try {
    // 1. Obtener access token desde refresh token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
        grant_type:    "refresh_token",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("No se pudo obtener access token: " + JSON.stringify(tokenData));
    }

    console.log("Access token obtenido correctamente");

    // 2. Renovar el Gmail Watch
    const watchRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/watch",
      {
        method: "POST",
        headers: {
          Authorization:  `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topicName: "projects/famous-modem-477813-p3/topics/gmail-reservas",
          labelIds:  ["INBOX"],
        }),
      }
    );

    const watchData = await watchRes.json();

    if (!watchRes.ok) {
      throw new Error("Error renovando Watch: " + JSON.stringify(watchData));
    }

    const expiration = new Date(Number(watchData.expiration));
    console.log("Gmail Watch renovado correctamente");
    console.log("Caduca el:", expiration.toISOString());

    return new Response(
      JSON.stringify({
        ok:         true,
        historyId:  watchData.historyId,
        expiration: expiration.toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error renovando Watch:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});