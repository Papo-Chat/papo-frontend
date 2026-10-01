# Papo Frontend

Interface do Papo, um chat self-hosted. Conecta ao backend Go via REST + WebSocket, com o proxy do Vite em desenvolvimento e nginx em produção.

## Stack

- SvelteKit 2 + Svelte 5 + TypeScript
- Vite 8
- Vitest (testes)

## Rodando em desenvolvimento

O backend precisa estar no ar em `http://localhost:8080` (REST e `/ws`).

```bash
npm install
cp .env.sample .env   # opcional: deixe vazio para usar same-origin
npm run dev
```

O dev server faz proxy de todos os prefixos de API e do WebSocket para o backend, mantendo tudo same-origin (cookie `HttpOnly`, sem CORS).

## Produção

```bash
npm run build
```

Sobe o build estático atrás do nginx. Em produção, o frontend pode usar uma API pública em outro origin, por exemplo `https://api.papo.example.com`, configurando `PUBLIC_API_URL` e `PUBLIC_WS_URL`.

Guia de deploy em VPS com nginx e Cloudflare: [`docs/production.md`](docs/production.md).

## Testes

```bash
npm test
```

Verificação de tipos:

```bash
npm run check
```

## Variáveis de ambiente (`.env`)

| Variável         | Descrição                                                               |
| ---------------- | ----------------------------------------------------------------------- |
| `PUBLIC_API_URL` | Base URL pública da API. Vazio = same-origin. Ex.: `https://api.papo.example.com`. |
| `PUBLIC_WS_URL`  | URL do WebSocket. Vazio = same-origin. Ex.: `wss://api.papo.example.com/ws`. |
