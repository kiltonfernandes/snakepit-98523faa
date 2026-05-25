/**
 * Prompt templates persistence layer.
 * Templates are stored in the `prompt_templates` table and can be selected
 * per-topic in the standalone episode wizard. Built-in templates have
 * `template_text === '__BUILTIN__'` and resolve to the hardcoded prompts
 * in `standalone-prompts.ts`.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StandaloneTopicType } from './types';

export type ComponentKey = 'pauta_completa' | 'capa' | 'titulo' | 'descricao' | 'segway' | 'custom';

export const COMPONENT_KEYS: ComponentKey[] = [
  'pauta_completa',
  'capa',
  'titulo',
  'descricao',
  'segway',
  'custom',
];

export const COMPONENT_LABELS: Record<ComponentKey, { label: string; icon: string; hint: string }> = {
  pauta_completa: { label: 'Pauta completa', icon: '📜', hint: 'Texto editorial principal usado para gerar o conteúdo do episódio.' },
  capa:           { label: 'Capa',           icon: '🎨', hint: 'Direção visual da capa 3000×3000.' },
  titulo:         { label: 'Título',         icon: '🏷️', hint: 'Geração das opções de título.' },
  descricao:      { label: 'Descrição',      icon: '📝', hint: 'HTML/texto da descrição do episódio.' },
  segway:         { label: 'Segway',         icon: '🎙️', hint: 'Falas fixas de intro/outro.' },
  custom:         { label: 'Custom',         icon: '✨', hint: 'Bloco livre para variações próprias.' },
};

export type ComponentsMap = Partial<Record<ComponentKey, string>>;

export interface PromptTemplate {
  id: string;
  name: string;
  topic_type: string; // StandaloneTopicType or 'custom'
  template_text: string;
  description: string;
  google_query: string | null;
  google_images_query: string | null;
  sort_order: number;
  is_default: boolean;
  is_builtin: boolean;
  components_json: ComponentsMap;
  created_at: string;
  updated_at: string;
}

export const TOPIC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'anniversary', label: '🎂 Aniversário' },
  { value: 'review', label: '💿 Review' },
  { value: 'news', label: '📰 Notícia' },
  { value: 'interview', label: '🎙️ Entrevista' },
  { value: 'custom', label: '✨ Outro' },
];

/** Reads a component prompt from a template, with fallback chain. */
export function getComponentPrompt(template: PromptTemplate | null | undefined, key: ComponentKey): string {
  if (!template) return '';
  const c = template.components_json || {};
  const v = c[key];
  if (typeof v === 'string') return v;
  // Legacy fallback: old templates only had template_text → treat as pauta_completa.
  if (key === 'pauta_completa') return template.template_text || '';
  return '';
}

export async function listPromptTemplates(topicType?: string): Promise<PromptTemplate[]> {
  let q = supabase.from('prompt_templates').select('*').order('sort_order', { ascending: true }).order('name');
  if (topicType) q = q.eq('topic_type', topicType);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    components_json: (row.components_json || {}) as ComponentsMap,
  })) as PromptTemplate[];
}

export async function createPromptTemplate(input: {
  name: string;
  topic_type: string;
  template_text?: string;
  description?: string;
  google_query?: string;
  google_images_query?: string;
  components_json?: ComponentsMap;
}): Promise<PromptTemplate> {
  const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('prompt_templates')
    .insert({
      id,
      name: input.name,
      topic_type: input.topic_type,
      template_text: input.template_text || (input.components_json?.pauta_completa || ''),
      description: input.description || '',
      google_query: input.google_query || '',
      google_images_query: input.google_images_query || '',
      components_json: (input.components_json || {}) as any,
      is_default: false,
      is_builtin: false,
    })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as any), components_json: ((data as any).components_json || {}) as ComponentsMap } as PromptTemplate;
}

export async function updatePromptTemplate(id: string, patch: Partial<PromptTemplate>): Promise<void> {
  const { error } = await supabase
    .from('prompt_templates')
    .update({
      ...patch,
      updated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePromptTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('prompt_templates').delete().eq('id', id);
  if (error) throw error;
}

export function usePromptTemplates(topicType?: StandaloneTopicType | string) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listPromptTemplates();
      setTemplates(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = topicType
    ? templates.filter(t => t.topic_type === topicType)
    : templates;

  return { templates: filtered, allTemplates: templates, loading, refresh };
}