
Consuma o novo update do backend de embeds genéricos. Verifique o openapi.yml para ver o que mudou.

Renomear `PreviewCard.svelte` para `EmbedCard.svelte`; substituir `LinkPreview` por `Embed` em `src/lib/types`, `src/lib/store/messages.types.ts`, `src/lib/store/messages.svelte.ts`, `src/lib/api.ts` e `src/lib/types/websocket.ts`. Atualizar `Message.svelte` para renderizar `message.embeds` e atualizar o store pelo evento `message_embeds_update`.

`EmbedCard` renderiza autor, título, descrição, fields, thumbnail, imagem, vídeo, provider e footer quando presentes. A cor define a borda lateral. Imagens e vídeos carregam sob demanda; vídeos usam controles, `preload="metadata"` e `playsinline`. Iframes continuam restritos a provedores allowlistados.

Atualizar testes de API, store e renderização para `embeds`.

Estilo base de embed (html+css autocontido), implementar sessão de embed no código e substituir por dados tratados/reais:

<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>Papo Aero — Embed Preview</title>
  <style>
    :root {
      color-scheme: light;
      --ease: cubic-bezier(.2,.8,.2,1);
      --font: 'Segoe UI', Inter, system-ui, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      --blue: #0a84ff;
      --blue-2: #64d2ff;
      --cyan: #5ac8fa;
      --green: #30d158;
      --text: #12202d;
      --text-strong: #132b3b;
      --muted: #455969;
      --muted-soft: #566b7c;
      --link: #176dcc;
      --line: rgba(90,140,175,.18);
      --line-strong: rgba(255,255,255,.64);
      --glass: rgba(245,251,255,.6);
      --glass-strong: rgba(248,252,255,.8);
      --glass-soft: rgba(225,242,252,.45);
      --shadow-lg: 0 24px 70px rgba(4,40,74,.18), 0 10px 26px rgba(4,65,112,.09);
      --shadow-md: 0 12px 30px rgba(14,69,108,.12), 0 4px 12px rgba(16,78,118,.06);
      --shadow-sm: 0 6px 16px rgba(16,72,108,.08);
      --page: #e8f5fc;
      --embed-surface: linear-gradient(145deg, rgba(255,255,255,.76), rgba(224,242,252,.62));
      --embed-surface-flat: rgba(244,251,255,.9);
      --media-surface: linear-gradient(135deg, #d5effc, #cce8f5 52%, #dff7f0);
      --chip: rgba(255,255,255,.46);
      --success: #087e55;
      --accent: #1686d9;
    }

    :root[data-theme='dark'] {
      color-scheme: dark;
      --text: #edf7ff;
      --text-strong: #edf7ff;
      --muted: #98afbf;
      --muted-soft: #9bb0be;
      --link: #88d7ff;
      --line: rgba(186,226,251,.11);
      --line-strong: rgba(184,225,252,.2);
      --glass: rgba(29,55,73,.38);
      --glass-strong: rgba(20,42,58,.66);
      --glass-soft: rgba(9,31,47,.24);
      --shadow-lg: 0 30px 88px rgba(0,0,0,.4), 0 10px 26px rgba(0,0,0,.18);
      --shadow-md: 0 14px 34px rgba(0,0,0,.26);
      --shadow-sm: 0 6px 16px rgba(0,0,0,.2);
      --page: #071724;
      --embed-surface: linear-gradient(145deg, rgba(27,57,75,.88), rgba(10,34,49,.86));
      --embed-surface-flat: rgba(18,43,59,.97);
      --media-surface: linear-gradient(135deg, #123047, #15384a 52%, #10413f);
      --chip: rgba(119,194,235,.07);
      --success: #69e6ab;
      --accent: #58b8fa;
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme]) {
        color-scheme: dark;
        --text: #edf7ff;
        --text-strong: #edf7ff;
        --muted: #98afbf;
        --muted-soft: #9bb0be;
        --link: #88d7ff;
        --line: rgba(186,226,251,.11);
        --line-strong: rgba(184,225,252,.2);
        --glass: rgba(29,55,73,.38);
        --glass-strong: rgba(20,42,58,.66);
        --glass-soft: rgba(9,31,47,.24);
        --shadow-lg: 0 30px 88px rgba(0,0,0,.4), 0 10px 26px rgba(0,0,0,.18);
        --shadow-md: 0 14px 34px rgba(0,0,0,.26);
        --shadow-sm: 0 6px 16px rgba(0,0,0,.2);
        --page: #071724;
        --embed-surface: linear-gradient(145deg, rgba(27,57,75,.88), rgba(10,34,49,.86));
        --embed-surface-flat: rgba(18,43,59,.97);
        --media-surface: linear-gradient(135deg, #123047, #15384a 52%, #10413f);
        --chip: rgba(119,194,235,.07);
        --success: #69e6ab;
        --accent: #58b8fa;
      }
    }

    *, *::before, *::after { box-sizing: border-box; }
    html { min-height: 100%; background: var(--page); }
    body {
      min-height: 100vh;
      margin: 0;
      padding: 58px 22px 30px;
      display: grid;
      place-items: center;
      color: var(--text);
      font: 14px/1.42 var(--font);
      background:
        radial-gradient(circle at 74% 12%, rgba(88,255,218,.18), transparent 27%),
        radial-gradient(circle at 10% 82%, rgba(0,132,255,.22), transparent 31%),
        radial-gradient(circle at 49% 112%, rgba(191,90,242,.12), transparent 34%),
        var(--page);
      transition: background-color .25s ease, color .25s ease;
    }
    [data-theme='dark'] body {
      background:
        radial-gradient(circle at 76% 12%, rgba(0,235,198,.1), transparent 25%),
        radial-gradient(circle at 10% 82%, rgba(0,120,255,.2), transparent 31%),
        radial-gradient(circle at 49% 112%, rgba(165,82,255,.1), transparent 34%),
        var(--page);
    }

    .toolbar {
      position: fixed;
      top: 15px;
      right: 16px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .theme-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      padding: 0 13px;
      border: 1px solid var(--line-strong);
      border-radius: 13px;
      color: var(--text);
      font: 650 12px/1 var(--font);
      background: linear-gradient(145deg, var(--glass-strong), var(--glass));
      box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,.62);
      backdrop-filter: blur(18px) saturate(150%);
      -webkit-backdrop-filter: blur(18px) saturate(150%);
      cursor: pointer;
      transition: transform .18s var(--ease), box-shadow .18s var(--ease);
    }
    .theme-toggle:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
    .theme-icon { display: inline-grid; place-items: center; width: 16px; height: 16px; color: var(--accent); font-size: 15px; }

    .chat-preview {
      width: min(100%, 780px);
      min-width: 0;
      padding: clamp(14px, 3vw, 28px);
      border: 1px solid var(--line-strong);
      border-radius: 28px;
      background:
        radial-gradient(circle at 12% -18%, rgba(255,255,255,.3), transparent 38%),
        linear-gradient(145deg, var(--glass), var(--glass-soft));
      box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,.65);
      backdrop-filter: blur(24px) saturate(155%);
      -webkit-backdrop-filter: blur(24px) saturate(155%);
    }
    [data-theme='dark'] .chat-preview {
      background:
        radial-gradient(circle at 12% -18%, rgba(116,207,255,.08), transparent 38%),
        linear-gradient(145deg, var(--glass-strong), var(--glass-soft));
      box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,.09);
    }
    .demo-label {
      margin: 0 0 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted-soft);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .13em;
      text-transform: uppercase;
    }
    .demo-label::before {
      content: '';
      width: 18px;
      height: 3px;
      border-radius: 10px;
      background: linear-gradient(90deg, var(--blue), var(--cyan), #42d8b3);
      box-shadow: 0 0 12px rgba(90,200,250,.36);
    }

    .message { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
    .avatar {
      display: grid;
      place-items: center;
      flex: 0 0 42px;
      width: 42px;
      height: 42px;
      border: 1px solid rgba(255,255,255,.65);
      border-radius: 15px;
      color: white;
      font-size: 12px;
      font-weight: 850;
      letter-spacing: -.04em;
      background: linear-gradient(155deg, #72d1ff 0%, #248de2 52%, #1161b9 100%);
      box-shadow: 0 8px 20px rgba(14,103,174,.2), inset 0 1px 0 rgba(255,255,255,.45);
    }
    .message-content { flex: 1; min-width: 0; }
    .message-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin: 1px 0 8px; }
    .username { font-weight: 800; color: var(--text-strong); }
    .bot-tag {
      padding: 3px 6px;
      border: 1px solid rgba(10,132,255,.18);
      border-radius: 6px;
      color: var(--link);
      background: rgba(10,132,255,.07);
      font-size: 9px;
      line-height: 1;
      font-weight: 850;
      letter-spacing: .07em;
    }
    .timestamp { color: var(--muted-soft); font-size: 11px; }
    .message-text { margin: 0 0 13px; overflow-wrap: anywhere; }
    .message-text a { color: var(--link); text-decoration: none; }
    .message-text a:hover { text-decoration: underline; }

    /* Aero embed: glass surface and ambient color, not a Discord-style sidebar */
    .embed {
      --embed-color: #0a84ff;
      position: relative;
      isolation: isolate;
      width: 100%;
      max-width: 590px;
      min-width: 0;
      padding: 16px;
      overflow: hidden;
      border: 1px solid var(--line-strong);
      border-radius: 19px;
      background: var(--embed-surface);
      box-shadow: var(--shadow-md), inset 0 1px 0 rgba(255,255,255,.64);
      backdrop-filter: blur(20px) saturate(150%);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      transition: transform .22s var(--ease), box-shadow .22s var(--ease), border-color .22s ease;
    }
    .embed::before {
      content: '';
      position: absolute;
      z-index: -1;
      pointer-events: none;
      top: -92px;
      right: -55px;
      width: 230px;
      height: 170px;
      border-radius: 50%;
      background: var(--embed-color);
      opacity: .105;
      filter: blur(48px);
    }
    .embed::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      border-radius: inherit;
      background: linear-gradient(112deg, rgba(255,255,255,.12), transparent 32% 78%, rgba(90,200,250,.035));
    }
    .embed:hover { transform: translateY(-1px); box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,.64); }
    [data-theme='dark'] .embed { box-shadow: var(--shadow-md), inset 0 1px 0 rgba(255,255,255,.1); }

    .embed-topline { display: flex; align-items: center; min-width: 0; gap: 10px; margin-bottom: 13px; }
    .source-mark {
      position: relative;
      display: grid;
      flex: 0 0 34px;
      width: 34px;
      height: 34px;
      place-items: center;
      overflow: hidden;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      color: white;
      font-weight: 900;
      font-size: 13px;
      background: linear-gradient(145deg, #6cd3ff, #1684dc 60%, #0870bd);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 5px 13px rgba(0,103,180,.14);
    }
    .source-mark::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,.28), transparent 55%); }
    .source-meta { min-width: 0; flex: 1; }
    .source-name { margin: 0; color: var(--text-strong); font-size: 12px; line-height: 1.25; font-weight: 800; }
    .source-url { display: block; margin-top: 3px; color: var(--muted-soft); font-size: 10px; overflow-wrap: anywhere; }
    .source-state {
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid var(--line);
      border-radius: 10px;
      color: var(--muted);
      background: var(--chip);
      font-size: 9px;
      font-weight: 850;
      letter-spacing: .055em;
    }
    .state-dot { width: 6px; height: 6px; border-radius: 50%; background: #28c98a; box-shadow: 0 0 10px rgba(40,201,138,.5); }

    .embed-heading { margin: 0 0 7px; color: var(--text-strong); font-size: clamp(16px, 2.4vw, 19px); font-weight: 800; line-height: 1.27; letter-spacing: -.035em; overflow-wrap: anywhere; }
    .embed-heading a { color: inherit; text-decoration: none; }
    .embed-heading a:hover { color: var(--link); }
    .embed-description { max-width: 64ch; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.58; overflow-wrap: anywhere; }

    .embed-data { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 15px; }
    .data-chip {
      min-width: 0;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--chip);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
    }
    .data-label { display: block; margin-bottom: 4px; color: var(--muted-soft); font-size: 9px; font-weight: 800; letter-spacing: .075em; text-transform: uppercase; }
    .data-value { display: block; color: var(--text-strong); font-size: 11px; font-weight: 750; overflow-wrap: anywhere; }
    .data-value.success { color: var(--success); }

    .embed-media {
      position: relative;
      isolation: isolate;
      display: grid;
      place-items: center;
      width: 100%;
      aspect-ratio: 16 / 7;
      min-height: 150px;
      margin-top: 15px;
      overflow: hidden;
      border: 1px solid var(--line-strong);
      border-radius: 14px;
      background: var(--media-surface);
    }
    .media-orb {
      position: absolute;
      z-index: -1;
      width: 46%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.72), rgba(90,200,250,.23) 32%, rgba(10,132,255,.05) 65%, transparent 70%);
      filter: blur(1px);
    }
    .media-line { position: absolute; inset: 0; opacity: .42; background: repeating-linear-gradient(125deg, transparent 0 42px, rgba(255,255,255,.23) 43px, transparent 44px 85px); }
    .media-play {
      display: grid;
      place-items: center;
      width: 50px;
      height: 50px;
      padding-left: 3px;
      border: 1px solid rgba(255,255,255,.7);
      border-radius: 17px;
      color: white;
      font-size: 18px;
      background: linear-gradient(145deg, rgba(255,255,255,.3), rgba(255,255,255,.11));
      box-shadow: 0 10px 24px rgba(0,42,82,.14), inset 0 1px 0 rgba(255,255,255,.4);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .media-caption { position: absolute; left: 12px; right: 12px; bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--text); font-size: 10px; font-weight: 750; }
    .media-tag { padding: 4px 7px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--chip); font-size: 9px; }

    .embed-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 13px; color: var(--muted-soft); font-size: 10px; }
    .footer-mark { display: grid; place-items: center; width: 17px; height: 17px; border-radius: 6px; color: var(--accent); background: var(--chip); border: 1px solid var(--line); font-size: 9px; font-weight: 900; }
    .footer-separator { opacity: .6; }
    .footer-spacer { flex: 1; }
    .footer-link { color: var(--link); font-weight: 700; text-decoration: none; }
    .footer-link:hover { text-decoration: underline; }

    @media (max-width: 600px) {
      body { padding: 62px 12px 18px; place-items: start center; }
      .chat-preview { padding: 16px 12px; border-radius: 23px; }
      .demo-label { margin-bottom: 15px; }
      .message { gap: 9px; }
      .avatar { flex-basis: 34px; width: 34px; height: 34px; border-radius: 12px; }
      .message-text { font-size: 13px; }
      .embed { padding: 12px; border-radius: 16px; }
      .embed-topline { gap: 8px; margin-bottom: 11px; }
      .source-mark { flex-basis: 30px; width: 30px; height: 30px; border-radius: 10px; }
      .source-state { padding: 5px 6px; font-size: 8px; }
      .embed-description { font-size: 12px; }
      .embed-data { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 12px; }
      .data-chip { padding: 8px; }
      .embed-media { aspect-ratio: 16 / 9; min-height: 135px; margin-top: 12px; }
      .media-play { width: 44px; height: 44px; border-radius: 15px; }
      .embed-footer { margin-top: 11px; }
      .footer-spacer { display: none; }
    }
    @media (max-width: 360px) {
      body { padding-inline: 8px; }
      .chat-preview { padding: 13px 9px; }
      .avatar { flex-basis: 30px; width: 30px; height: 30px; }
      .embed { padding: 10px; }
      .source-state { gap: 4px; letter-spacing: 0; }
      .source-url { font-size: 9px; }
      .embed-heading { font-size: 15px; }
      .data-value { font-size: 10px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Alternar tema claro e escuro">
      <span class="theme-icon" id="theme-icon" aria-hidden="true">◐</span>
      <span id="theme-label">Alternar tema</span>
    </button>
  </div>

  <main class="chat-preview">
    <p class="demo-label">Papo Aero · embed preview</p>

    <article class="message">
      <div class="avatar" aria-hidden="true">PA</div>
      <div class="message-content">
        <div class="message-meta">
          <span class="username">papo-ci</span>
          <span class="bot-tag">BOT</span>
          <span class="timestamp">Hoje às 14:32</span>
        </div>
        <p class="message-text">
          Novo deploy concluído:
          <a href="https://github.com/Papo-Chat/papo-frontend" target="_blank" rel="noopener noreferrer">papo-frontend</a>
        </p>

        <section class="embed" style="--embed-color: #35b7e8" aria-label="Prévia de embed">
          <header class="embed-topline">
            <div class="source-mark" aria-hidden="true">P</div>
            <div class="source-meta">
              <p class="source-name">Papo Deploy</p>
              <span class="source-url">github.com / Papo-Chat / papo-frontend</span>
            </div>
            <span class="source-state"><span class="state-dot"></span> RELEASE</span>
          </header>

          <h1 class="embed-heading">
            <a href="https://github.com/Papo-Chat/papo-frontend" target="_blank" rel="noopener noreferrer">Papo Aero 1.4.0 — Deploy concluído</a>
          </h1>
          <p class="embed-description">
            A nova versão do frontend foi publicada com melhorias de interface,
            desempenho e renderização de embeds.
          </p>

          <div class="embed-data" aria-label="Detalhes do deploy">
            <div class="data-chip"><span class="data-label">Status</span><span class="data-value success">● Concluído</span></div>
            <div class="data-chip"><span class="data-label">Versão</span><span class="data-value">v1.4.0</span></div>
            <div class="data-chip"><span class="data-label">Branch</span><span class="data-value">aero</span></div>
            <div class="data-chip"><span class="data-label">Commit</span><span class="data-value">a83f21c</span></div>
          </div>

          <!-- Placeholder visual de og:video. No produto, usar a mídia validada pelo backend. -->
          <div class="embed-media" role="img" aria-label="Placeholder de vídeo do Papo Aero">
            <div class="media-orb" aria-hidden="true"></div>
            <div class="media-line" aria-hidden="true"></div>
            <span class="media-play" aria-hidden="true">▶</span>
            <div class="media-caption"><span>Papo Aero · Preview</span><span class="media-tag">VIDEO</span></div>
          </div>

          <footer class="embed-footer">
            <span class="footer-mark" aria-hidden="true">P</span>
            <span>Papo CI</span>
            <span class="footer-separator">·</span>
            <span>Publicado agora</span>
            <span class="footer-spacer"></span>
            <a class="footer-link" href="https://github.com/Papo-Chat/papo-frontend" target="_blank" rel="noopener noreferrer">Ver release ↗</a>
          </footer>
        </section>
      </div>
    </article>
  </main>

  <script>
    const root = document.documentElement;
    const toggle = document.getElementById('theme-toggle');
    const label = document.getElementById('theme-label');
    const icon = document.getElementById('theme-icon');

    function applyTheme(theme) {
      root.dataset.theme = theme;
      const isDark = theme === 'dark';
      label.textContent = isDark ? 'Tema escuro' : 'Tema claro';
      icon.textContent = isDark ? '☾' : '☼';
      toggle.setAttribute('aria-label', isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro');
    }

    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(systemDark ? 'dark' : 'light');
    toggle.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  </script>
</body>
</html>
