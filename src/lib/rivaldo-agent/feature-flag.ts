import { supabase } from '@/integrations/supabase/client';

const SETTINGS_KEY = 'rivaldo_agentic_v1_enabled' as const;

/**
 * Feature flag Rivaldo Agentic V1 — coluna dedicada
 * `app_settings.rivaldo_agentic_v1_enabled` (default false).
 *
 * Erros de leitura/escrita são propagados: chamador decide como reagir.
 */
export async function loadAgenticFlag(): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('rivaldo_agentic_v1_enabled')
    .eq('singleton_id', 1)
    .single();
  if (error) throw error;
  return (data as { rivaldo_agentic_v1_enabled?: boolean } | null)?.rivaldo_agentic_v1_enabled === true;
}

export async function saveAgenticFlag(enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .update({ rivaldo_agentic_v1_enabled: enabled })
    .eq('singleton_id', 1);
  if (error) throw error;
}

export const RIVALDO_AGENTIC_SETTINGS_KEY = SETTINGS_KEY;