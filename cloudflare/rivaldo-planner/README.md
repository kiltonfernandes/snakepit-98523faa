# Rivaldo Planner Worker

Servidor do planner agentic do Rivaldo em Cloudflare Workers.

## Segredos do GitHub

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `OPENROUTER_API_KEY`

O token da Cloudflare precisa de permissão para editar Workers Scripts.

Depois do primeiro deploy, crie a variável de repositório
`RIVALDO_PLANNER_URL` com a URL `https://rivaldo-planner.<subdominio>.workers.dev`.
O workflow do GitHub Pages injeta essa URL como
`VITE_RIVALDO_PLANNER_URL` durante o build.

Sem essa variável, o cliente preserva o fallback para a Edge Function
`plan-rivaldo-treatment` existente.

## Deploy

O Worker é publicado automaticamente pelo GitHub Actions após mudanças nesta pasta. O workflow valida as três credenciais antes de executar o Wrangler.
