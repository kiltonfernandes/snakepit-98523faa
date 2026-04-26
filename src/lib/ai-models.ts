export interface AiModelOption {
  id: string;
  label: string;
  provider: 'Google Gemini' | 'OpenAI GPT';
  description: string;
}

export const AI_MODELS: AiModelOption[] = [
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google Gemini', description: 'Mais poderoso, melhor raciocínio (mais lento e caro).' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google Gemini', description: 'Equilíbrio padrão entre custo, latência e qualidade.' },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'Google Gemini', description: 'Mais rápido e barato. Ideal para tarefas simples.' },
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', provider: 'Google Gemini', description: 'Próxima geração — equilíbrio entre velocidade e capacidade.' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', provider: 'Google Gemini', description: 'Última geração de raciocínio do Google.' },
  { id: 'openai/gpt-5', label: 'GPT-5', provider: 'OpenAI GPT', description: 'Top de linha OpenAI. Excelente raciocínio e nuance.' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', provider: 'OpenAI GPT', description: 'Meio-termo: bom desempenho com custo menor.' },
  { id: 'openai/gpt-5-nano', label: 'GPT-5 nano', provider: 'OpenAI GPT', description: 'Foco em velocidade e custo. Tarefas simples e em volume.' },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2', provider: 'OpenAI GPT', description: 'Mais recente da OpenAI, com raciocínio aprimorado.' },
];

export const DEFAULT_AI_MODEL = 'google/gemini-2.5-flash';
