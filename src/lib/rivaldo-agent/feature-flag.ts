import { supabase } from '@/integrations/supabase/client';

const SETTINGS_KEY = 'rivaldo_agentic_v1_enabled';

/**
 * Feature flag Rivaldo Agentic V1.
 *
 * Persistida em `app_settings.singleton_id=1`, coluna dedicada
 * `rivaldo_agentic_v1_enabled`. Quando OFF (default), o pipeline atual roda
 * intocado. Ligamos no toggle do header do Rivaldo depois que a Onda 4
 * estiver pronta.
 */
export async function loadAgenticFlag(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('app_settings' as never)
      .select('*')
      .eq('singleton_id', 1)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (data as any)?.[SETTINGS_KEY];
    return value === true;
  } catch {
    return false;
  }
}

export async function saveAgenticFlag(enabled: boolean): Promise<void> {
  await supabase
    .from('app_settings' as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ [SETTINGS_KEY]: enabled } as any)
    .eq('singleton_id', 1);
}

export const RIVALDO_AGENTIC_SETTINGS_KEY = SETTINGS_KEY;