// ─── RENOVAR GMAIL WATCH ──────────────────────────────────────────────────────
// Esta función se ejecuta automáticamente cada 6 días via cron job
// para renovar el Gmail Watch antes de que caduque (caduca cada 7 días)
//
// 🔧 FIX: ahora también sincroniza gmail_state.history_id con el historyId
// fresco que devuelve Google. Antes se renovaba el watch pero el historyId
// nuevo nunca se guardaba, así que process-reservation-email seguía usando
// un historyId cada vez más viejo hasta que Gmail lo invalidaba (>7 días)
// y history.list empezaba a fallar en silencio.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  try {
    // 1. Obtener access token desde refresh token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(
        "No se pudo obtener access token: " + JSON.stringify(tokenData),
      );
    }

    console.log("Access token obtenido correctamente");

    // 2. Renovar el Gmail Watch
    const watchRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/watch",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topicName: "projects/famous-modem-477813-p3/topics/gmail-reservas",
          labelIds: ["INBOX"],
        }),
      },
    );

    const watchData = await watchRes.json();

    if (!watchRes.ok) {
      throw new Error("Error renovando Watch: " + JSON.stringify(watchData));
    }

    if (!watchData.historyId) {
      throw new Error(
        "Watch renovado pero sin historyId en la respuesta: " +
          JSON.stringify(watchData),
      );
    }

    const expiration = new Date(Number(watchData.expiration));
    console.log("Gmail Watch renovado correctamente");
    console.log("historyId nuevo:", watchData.historyId);
    console.log("Caduca el:", expiration.toISOString());

    // 3. 🔧 Sincronizar gmail_state con el historyId fresco de Google
    //    Sin esto, process-reservation-email sigue usando un historyId
    //    viejo que Gmail acabará invalidando (>7 días) y todo se rompe
    //    en silencio.
    const { data: existing, error: selectError } = await supabase
      .from("gmail_state")
      .select("id")
      .eq("id", 1)
      .maybeSingle();

    if (selectError) {
      throw new Error("Error leyendo gmail_state: " + selectError.message);
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("gmail_state")
        .update({
          history_id: String(watchData.historyId),
          update_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (updateError) {
        throw new Error(
          "Error actualizando gmail_state: " + updateError.message,
        );
      }
      console.log("gmail_state actualizado (update)");
    } else {
      const { error: insertError } = await supabase
        .from("gmail_state")
        .insert({
          id: 1,
          history_id: String(watchData.historyId),
          update_at: new Date().toISOString(),
        });

      if (insertError) {
        throw new Error("Error insertando gmail_state: " + insertError.message);
      }
      console.log("gmail_state creado (insert)");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        historyId: watchData.historyId,
        expiration: expiration.toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error renovando Watch:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
