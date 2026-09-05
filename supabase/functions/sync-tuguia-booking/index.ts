import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    // 1. Recibir el evento Webhook de la base de datos de Tu Guía en Brujas
    const payload = await req.json();
    const { type, record } = payload; // type: 'INSERT' o 'UPDATE'

    if (!record) {
      return new Response(JSON.stringify({ error: "No payload record" }), {
        status: 400,
      });
    }

    // 2. Conectar a la base de datos local de Tour Manager con service_role
    const supabaseLocal = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 3. Transformar los datos de 'bookings' al formato de la tabla 'reservations' local
    const reservationData = {
      external_id: record.id,
      platform: "Tu Guía en Brujas",
      tour_date: record.booking_date,
      tour_time: record.booking_time,
      customer_name: record.customer_name,
      email: record.email,
      phone: record.phone || null,
      pax_adults: record.num_adults,
      pax_minors: record.num_minors,
      pax_total: Number(record.num_adults || 0) +
        Number(record.num_minors || 0),
      status: record.status === "cancelled" ? "cancelled" : "confirmed",
      notes: record.notes || null,
      updated_at: new Date().toISOString(),
    };

    // 4. Mapear o Upsert en la tabla local 'reservations'
    const { data, error } = await supabaseLocal
      .from("reservations")
      .upsert(reservationData, { onConflict: "external_id" })
      .select();

    if (error) {
      console.error("Error al guardar reserva localmente:", error);
      throw error;
    }

    console.log(
      `Reserva ${record.id} de Tu Guía en Brujas procesada con éxito.`,
    );

    return new Response(
      JSON.stringify({ ok: true, message: "Sincronizado", data }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error en sync-tuguia-booking:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
