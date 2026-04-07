import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const { data: oldMaterials, error: fetchErr } = await supabase
      .from("episode_materials")
      .select("id, episode_date, cover_url, cover_saved_at")
      .not("cover_url", "is", null)
      .not("cover_saved_at", "is", null)
      .lt("cover_saved_at", cutoff);

    if (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!oldMaterials || oldMaterials.length === 0) {
      return new Response(JSON.stringify({ purged: 0, message: "No expired covers to purge" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = oldMaterials.map((m: any) => m.id);
    const { error: updateErr } = await supabase
      .from("episode_materials")
      .update({ cover_url: null, cover_saved_at: null, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Purged ${ids.length} expired covers after 72h retention`);
    return new Response(
      JSON.stringify({ purged: ids.length, ids, retention_hours: 72 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});