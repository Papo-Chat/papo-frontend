# Deploy em produção (VPS + nginx + Cloudflare)

Este frontend é uma SPA estática. Em produção, a topologia recomendada mantém o frontend e a API em hostnames separados:

```text
https://papo.example.com
    → nginx
    → build estático do Svelte

https://api.papo.example.com
    → nginx
    → backend Go em 127.0.0.1:8080
```

A porta `8080/tcp` não precisa ser exposta diretamente. O backend continua público por HTTPS através de `api.papo.example.com`.

## Build

Configure o frontend para apontar explicitamente para a API pública:

```env
PUBLIC_API_URL=https://api.papo.example.com
PUBLIC_WS_URL=wss://api.papo.example.com/ws
PUBLIC_VOICE_VIDEO_SLOTS=6
PUBLIC_VOICE_AUDIO_SLOTS=8
```

Depois:

```bash
npm ci
npm run check
npm run build
```

Publique o diretório `build/`:

```bash
sudo mkdir -p /var/www/papo
sudo rsync -a --delete build/ /var/www/papo/
```

O Node não precisa permanecer em execução.

## nginx do frontend

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name papo.example.com;

    root /var/www/papo;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Como a API possui hostname próprio, não é necessário distinguir rotas da SPA de rotas REST por `Accept`.

## nginx da API

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name api.papo.example.com;

    include /etc/nginx/cloudflare-realip.conf;

    real_ip_header CF-Connecting-IP;
    real_ip_recursive on;

    client_max_body_size 110M;

    location = /ws {
        proxy_pass http://127.0.0.1:8080;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Configuração do backend

Para o frontend oficial em um subdomínio irmão:

```env
BASE_URL=https://api.papo.example.com/

CORS_ORIGINS=https://papo.example.com

SAME_SITE=true

CLOUDFLARE_PROXY=false
TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128
```

`CLOUDFLARE_PROXY=false` é intencional nessa topologia: a conexão direta recebida pelo Go vem do nginx local, não da Cloudflare.

O nginx restaura o IP real da Cloudflare e envia um `X-Real-IP` normalizado. O backend deve confiar nesse header somente quando o peer direto pertence a uma rede configurada em `TRUSTED_PROXY_CIDRS`.

Nunca exponha `8080/tcp` ou `5432/tcp` publicamente.

## CORS e cookies

`papo.example.com` e `api.papo.example.com` são origins diferentes, então o navegador aplica CORS às chamadas REST.

O frontend usa `credentials: 'include'` nas chamadas via `fetch`, e o backend precisa permitir explicitamente o origin do frontend e credenciais.

Como ambos os hosts pertencem ao mesmo site registrável e usam HTTPS, o cookie `SameSite=Strict` pode continuar sendo usado para o frontend oficial.

### Uploads via XMLHttpRequest

Uploads com progresso usam `XMLHttpRequest`, não `fetch`.

Para API em outro origin, esse transporte também precisa enviar credenciais:

```ts
const xhr = new XMLHttpRequest();
xhr.open(method, buildUrl(path, q), true);
xhr.withCredentials = true;
```

Sem `withCredentials = true`, uploads autenticados podem falhar quando frontend e API estão em origins diferentes.

## WebSocket

Configure:

```env
PUBLIC_WS_URL=wss://api.papo.example.com/ws
```

O backend valida o header `Origin` do handshake contra a mesma allowlist usada no CORS. Por isso, `CORS_ORIGINS` precisa conter o frontend permitido.

## Frontends em outros domínios

O backend pode ser consumido por outros clientes, mas o modelo atual de autenticação web usa cookie `HttpOnly`.

Para um frontend hospedado em outro site, por exemplo:

```text
https://cliente.example
    → https://api.papo.example.com
```

será necessário considerar:

```env
SAME_SITE=false
CORS_ORIGINS=https://cliente.example
```

Isso faz o cookie usar `SameSite=None; Secure`, mas navegadores podem restringir cookies de terceiros.

Para uma API realmente frontend-agnostic, especialmente para clientes web em domínios arbitrários, mobile, desktop ou integrações, é recomendável adicionar futuramente autenticação explícita por token, por exemplo:

```http
Authorization: Bearer <token>
```

mantendo o cookie `HttpOnly` como opção para o frontend web oficial.

## Cloudflare

Crie dois registros DNS apontando para a VPS:

```text
A  papo      IP_DA_VPS
A  api.papo  IP_DA_VPS
```

Durante a emissão inicial do certificado TLS, pode ser conveniente mantê-los em `DNS only`.

Depois, ambos podem usar o proxy Cloudflare.

Use TLS no origin e modo:

```text
Full (strict)
```

O WebSocket `/ws` permanece no hostname da API.

## IP real da Cloudflare

O arquivo:

```text
/etc/nginx/cloudflare-realip.conf
```

deve conter as redes oficiais da Cloudflare em diretivas `set_real_ip_from`.

Prefira gerar e atualizar esse arquivo automaticamente a partir do endpoint oficial da Cloudflare, validando a nova configuração com `nginx -t` antes de executar `systemctl reload nginx`.

## Firewall

Exponha:

```text
22/tcp     SSH
80/tcp     HTTP
443/tcp    HTTPS
50000/udp  WebRTC
```

Não exponha:

```text
8080/tcp   backend interno
5432/tcp   PostgreSQL
```

## Resultado

```text
papo.example.com
    → Cloudflare
    → nginx
    → /var/www/papo

api.papo.example.com
    → Cloudflare
    → nginx
    → 127.0.0.1:8080

127.0.0.1:8080
    → backend Go

127.0.0.1:5432
    → PostgreSQL

50000/udp
    → WebRTC
```
