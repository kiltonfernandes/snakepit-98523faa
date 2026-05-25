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

export interface PromptTemplate {
  id: string;
  name: string;
  topic_type: string; // StandaloneTopicType or 'custom'
  template_text: string;
  description: string;
  google_query: string;
  is_default: boolean;
  is_builtin: boolean;
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

export async function listPromptTemplates(topicType?: string): Promise<PromptTemplate[]> {
  let q = supabase.from('prompt_templates').select('*').order('is_default', { ascending: false }).order('name');
  if (topicType) q = q.eq('topic_type', topicType);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as PromptTemplate[];
}

export async function createPromptTemplate(input: {
  name: string;
  topic_type: string;
  template_text: string;
  description?: string;
  google_query?: string;
}): Promise<PromptTemplate> {
  const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('prompt_templates')
    .insert({
      id,
      name: input.name,
      topic_type: input.topic_type,
      template_text: input.template_text,
      description: input.description || '',
      google_query: input.google_query || '',
      is_default: false,
      is_builtin: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PromptTemplate;
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