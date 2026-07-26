/**
 * Adaptador Zod → JSON Schema para o `response_format.json_schema` do
 * OpenRouter (Structured Outputs, OpenAI-compatible). Mantemos uma única
 * fonte de verdade nos schemas Zod e derivamos o JSON Schema aqui.
 *
 * Depende da lib `zod-to-json-schema` (a instalar na Onda 3, junto com o
 * planner completo). Este arquivo declara o import de forma preguiçosa
 * para não falhar o build da Onda 1.
 */
import type { ZodTypeAny } from 'zod';

export interface OpenRouterJsonSchemaFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
}

export async function buildOpenRouterJsonSchema(
  name: string,
  schema: ZodTypeAny,
): Promise<OpenRouterJsonSchemaFormat> {
  // Dynamic import: dependency instalada apenas quando a Onda 3 rodar.
  const mod = await import(/* @vite-ignore */ 'zod-to-json-schema').catch(() => null);
  if (!mod || typeof mod.zodToJsonSchema !== 'function') {
    throw new Error('zod-to-json-schema não instalado. Rode `bun add zod-to-json-schema` (Onda 3).');
  }
  const jsonSchema = mod.zodToJsonSchema(schema, {
    name,
    $refStrategy: 'none',
    target: 'openApi3',
  }) as Record<string, unknown>;

  return {
    type: 'json_schema',
    json_schema: { name, strict: true, schema: jsonSchema },
  };
}