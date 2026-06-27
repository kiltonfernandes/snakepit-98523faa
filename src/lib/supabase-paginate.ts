import { supabase } from '@/integrations/supabase/client';

const PAGE_SIZE = 1000;

/**
 * Fetches ALL rows from a Supabase table, bypassing the PostgREST default
 * limit of 1000 rows by paginating via .range().
 */
export async function fetchAllRows<T = any>(
  table: string,
  select: string = '*',
  orderBy?: { column: string; ascending?: boolean },
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Safety cap: 100 pages = 100k rows.
  for (let i = 0; i < 100; i++) {
    let q: any = supabase.from(table as any).select(select).range(from, from + PAGE_SIZE - 1);
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data as T[]) || [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}