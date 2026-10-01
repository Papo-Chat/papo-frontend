# Deploy em produção (VPS + nginx + Cloudflare)

Este frontend é uma SPA estática. Em produção, o build pode ser servido diretamente pelo nginx, enquanto as chamadas REST e WebSocket são encaminhadas para o backend Papo em `127.0.0.1:8080`.

## Build

```bash
cp .env.sample .env
npm ci
npm run check
npm run build
```

Para same-origin, mantenha:

```env
PUBLIC_API_URL=
PUBLIC_WS_URL=
PUBLIC_VOICE_VIDEO_SLOTS=6
PUBLIC_VOICE_AUDIO_SLOTS=8
```

Publique o diretório `build/` em um diretório servido pelo nginx:

```bash
sudo mkdir -p /var/www/papo
sudo rsync -a --delete build/ /var/www/papo/
```

## nginx

O frontend possui páginas cujos caminhos também são prefixos da API (por exemplo `/auth`, `/channels` e `/users`). Por isso, navegações HTML devem cair na SPA, enquanto chamadas de API com outro `Accept` devem ir para o backend.

Exemplo para `papo.example.com`:

```nginx
map $http_accept $papo_page_request {
    default 0;
    ~*text/html 1;
}

server {
    listen 80;
    listen [::]:80;
    server_name papo.example.com;

    root /var/www/papo;
    index index.html;

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

    location ~ ^/(auth|users|server|channels|messages|roles|emojis|attachments|media|link-previews|search|admin|voice|health)(/|$) {
        error_page 418 = @frontend;

        if ($papo_page_request) {
            return 418;
        }

        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location @frontend {
        try_files /index.html =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## IP real atrás de reverse proxy

Ao usar nginx na frente do backend, configure no backend:

```env
CLOUDFLARE_PROXY=false
TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128
```

O nginx deve ser a única origem autorizada a enviar `X-Real-IP` ao backend. Nunca exponha a porta `8080/tcp` publicamente.

## Cloudflare

Se o hostname estiver com proxy Cloudflare, configure o nginx para restaurar o IP real a partir de `CF-Connecting-IP` somente para ranges oficiais da Cloudflare. Mantenha TLS no origin e use o modo `Full (strict)`.

O WebSocket `/ws` pode permanecer no mesmo hostname do frontend.
