# pipoca-player

Player de vídeo com a interface do PipocaFlix, pronto pra rodar sozinho na **Vercel**. Toca **MP4, HLS (`.m3u8`/`.m3u`), Google Drive e OK.ru**, e se um link falhar ele **pula sozinho pro próximo**. Dá pra usar de três jeitos:

- **`/filme/{linha}`** e **`/serie/{aba}/{linha}`**: os links vêm das suas planilhas do Google (veja [Planilhas](#planilhas-filmes-e-séries));
- **`/embed?src=…`** dentro de um `<iframe>` (funciona em qualquer site; `src` aceita vários links);
- **SDK em JavaScript** (`PipocaPlayer`) pra controlar o player por código: play, pause, seek, trocar de vídeo, ouvir eventos.

Ele **não busca, não converte e não faz proxy de vídeo**: só toca a URL que você entregar. Use com conteúdo que você tem direito de exibir (arquivos seus, conteúdo licenciado, domínio público…).

---

## Deploy na Vercel

Não precisa de build nem de dependências.

**Pelo GitHub (mais fácil):** suba esta pasta num repositório → vercel.com/new → importe o repositório → *Deploy*.

**Pela linha de comando:**

```bash
npm i -g vercel
vercel          # primeira vez: responde as perguntas (preview)
vercel --prod   # publica de verdade
```

Depois do deploy você tem, por exemplo, `https://meu-player.vercel.app`:

| Endereço | O que é |
|---|---|
| `/` | página de demonstração (playground + código pra copiar) |
| `/filme/2555` | toca a linha **2555** da planilha de filmes (links da coluna **P**) |
| `/serie/3/150` | toca a linha **150** da aba **3** (`episodios3`) da planilha de séries (links da coluna **E**) |
| `/embed?src=URL` | o player, pra usar em `<iframe>` (`src` pode ter vários links) |
| `/sdk/pipoca-player.js` | SDK de controle |
| `/sdk/pipoca-player.d.ts` | tipos TypeScript |

---

## Planilhas (filmes e séries)

As planilhas precisam estar com **Compartilhar → Qualquer pessoa com o link → Leitor** (o servidor baixa a aba em CSV, sem login). Se estiver privada, o player mostra uma mensagem explicando.

| Rota | Planilha | Onde ficam os links | O número da rota é |
|---|---|---|---|
| `/filme/{linha}` | aba `SITE, DADOS!` | coluna **P** (*Link Player 2*), da linha 2 pra baixo | o número da linha: `P2555` → `/filme/2555` (também aceita `/filme/P2555`) |
| `/serie/{aba}/{linha}` | `Episodios Divididos` | coluna **E**, da linha 2 pra baixo, em cada aba | `{aba}` de 1 a 17 (`episodios1` … `episodios17`) e `{linha}` = número da linha |

- **Vários links na mesma célula:** separe por vírgula (ou espaço, ou Alt+Enter). O player tenta **na ordem** e passa pro próximo quando um falha (erro, não respondeu em 25 s, ou travou de vez — nesse caso retoma do mesmo minuto).
- **Título, capa, sinopse, ano e categorias** da ficha vêm da mesma linha (filmes: colunas A, C, D, F, E, G e M). Nas séries o título é `Nome · T1 E3` (colunas A, C, D) e o botão **"próximo episódio"** aparece sozinho se a linha de baixo for da mesma série e tiver link.
- **Edição na planilha vale em até ~2 minutos** (cache do servidor de 2 min + 1 min no CDN).
- **O número da aba** é a posição na lista `SERIES_GIDS` (em `lib/config.js`): 1 = primeiro `gid`, 17 = último. Se uma aba da sua planilha estiver numa ordem diferente, é só reordenar essa lista (ou definir a variável `SERIES_GIDS`).
- Quer outra coluna de links? `FILMES_LINK_COL=Q`, `SERIES_LINK_COL=F`… (veja as variáveis abaixo).

### Que tipo de link funciona

| Link na célula | Como toca | Observações |
|---|---|---|
| `https://…/filme.mp4` (e `.webm`, `.mov`…) | `<video>` direto, com todos os controles | o servidor precisa aceitar *Range* pra poder pular; **`http://` vira `https://` automaticamente** (senão o navegador bloqueia) |
| `https://…/lista.m3u8` | hls.js (Safari/iPhone: HLS nativo) | o servidor precisa liberar **CORS** (`Access-Control-Allow-Origin`). `.m3u` é tratado como HLS; uma *playlist de canais IPTV* não é vídeo e vai falhar |
| link sem extensão (ex.: `https://…workers.dev/2`) | tenta como arquivo; se falhar, tenta como HLS | |
| `https://drive.google.com/file/d/ID/view` (e `open?id=`, `uc?id=`) | 1º tenta baixar direto (controles do player); 2º abre o **player do próprio Drive** | o arquivo precisa estar com *"Qualquer pessoa com o link"*. Arquivo grande/muito acessado costuma cair no player do Drive |
| `https://ok.ru/video/ID` | player do OK.ru dentro de um `<iframe>` | o vídeo precisa ser público |

**Drive e OK.ru em iframe:** quando o vídeo toca dentro do player do Drive/OK.ru, quem controla é o player **deles** (os controles do PipocaFlix somem) e o navegador **não avisa se o vídeo deu erro** lá dentro. Por isso aparece uma barrinha **‹ Fonte 2 de 3 ›** no topo pra trocar de link na mão, e o plano B do Drive (o iframe) fica sempre por último na fila. Se preferir que *todo* iframe fique por último, defina `IFRAME_LAST=1`.

**Trocar de fonte na mão:** menu ⚙ → *Fonte do vídeo* (aparece quando há mais de um link).

---

## Usando no seu site

### 1) Só um iframe

```html
<iframe
  src="https://meu-player.vercel.app/embed?src=https%3A%2F%2Fcdn.exemplo.com%2Fvideo.m3u8&title=Meu%20v%C3%ADdeo"
  style="border:0;width:100%;aspect-ratio:16/9"
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
  allowfullscreen></iframe>
```

> O valor de `src` precisa estar codificado (`encodeURIComponent`). Se preferir não montar a URL na mão, use `PipocaPlayer.embedUrl({...})`.
> Sem o atributo `allow`, o autoplay e a tela cheia não funcionam dentro do iframe.

### 2) Com o SDK (controle por código)

```html
<script src="https://meu-player.vercel.app/sdk/pipoca-player.js"></script>
<div id="player" style="aspect-ratio:16/9"></div>

<script>
  const player = new PipocaPlayer('#player', {
    src: 'https://cdn.exemplo.com/video.m3u8',
    title: 'Meu vídeo',
    poster: 'https://cdn.exemplo.com/capa.jpg',
  });

  player.on('ended', () => console.log('acabou'));
  player.on('timeupdate', ({ currentTime, duration }) => { /* barra de progresso própria */ });
  player.on('error', ({ stage, message }) => console.warn(stage, message));

  await player.play();
  await player.seek(90);
  await player.setVolume(0.5);
  await player.load({ src: 'https://cdn.exemplo.com/outro.mp4', title: 'Outro vídeo' }); // troca sem recarregar
</script>
```

Se o SDK vier do mesmo lugar do player (como acima), o endereço é descoberto sozinho. Em bundlers (`import`/`require`), passe `baseUrl: 'https://meu-player.vercel.app'`.

---

## Parâmetros do `/embed`

Todos na query string (e as mesmas chaves nas opções do SDK).

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `src` | — | **Obrigatório.** URL do vídeo (`http(s)://`). `.m3u8` = HLS, o resto = arquivo direto |
| `type` | detecta | `hls` ou `mp4`, para URLs sem extensão |
| `title` | — | Título (barra superior, aba e tela de bloqueio do celular) |
| `desc`, `year`, `age`, `tags` | — | Painel de informações. `tags` separadas por vírgula, `age` = classificação (ex.: `14`) |
| `poster` | — | Capa (fundo desfocado antes de começar) |
| `id` | hash da `src` sem query | Chave do "continuar de onde parou". Use um id estável se a URL do vídeo é assinada/muda |
| `start` | — | Começa em N segundos (ignora o "continuar de onde parou") |
| `autoplay` | `1` | `0` carrega parado |
| `muted` | `0` | `1` começa sem som (ajuda o autoplay passar nos navegadores) |
| `loop` | `0` | `1` repete |
| `resume` | `1` | `0` desliga o "continuar de onde parou" |
| `subs` | — | Legendas: JSON `[{"src":"https://…/pt.vtt","lang":"pt","label":"Português","default":true}]`. Atalho: `sub=URL&sublang=pt&sublabel=Português` |
| `next_title`, `next_url`, `next_poster` | — | Cartão "A seguir" no fim do vídeo. Com `next_url`, o botão abre essa URL (ex.: outro `/embed`); sem ela, só dispara o evento `next` |
| `accent` | `#ff2a2a` | Cor de destaque (`#rrggbb` ou `rrggbb`) |
| `brand` | `PipocaFlix` | Nome da marca na tela de carregamento |
| `engine` | `auto` | `auto`, `native` (HLS nativo) ou `hlsjs` |
| `origin`, `channel` | — | Usados pelo SDK (veja *Protocolo*). Se usar iframe cru e quiser mensagens, passe os dois |

---

## API do SDK

Todos os métodos devolvem `Promise` e rejeitam com `Error` se o comando for inválido.

| Método | O que faz |
|---|---|
| `play()` / `pause()` / `toggle()` | Reproduz / pausa. `play()` rejeita se o navegador bloquear o autoplay |
| `seek(segundos)` / `seekBy(delta)` | Vai para um ponto / pula relativo (`-10`, `30`…) |
| `setVolume(0..1)` / `mute()` / `unmute()` | Volume |
| `setRate(0.25..4)` | Velocidade |
| `captions(on?)` | Liga/desliga legendas (sem argumento, alterna). Devolve `{ enabled }` |
| `setCinema(on)` | Modo cinema (só o vídeo) |
| `load(opções)` | Troca o vídeo sem recarregar o iframe. Aceita as mesmas opções do construtor |
| `getState()` | `{ currentTime, duration, paused, ended, volume, muted, playbackRate, buffering, phase, … }` |
| `on(evento, fn)` / `once` / `off` | Eventos. `on('*', (nome, dados) => …)` recebe todos |
| `destroy()` | Remove o iframe e os listeners |

**Eventos:** `ready`, `loaded`, `loadedmetadata`, `started`, `play`, `playing`, `pause`, `waiting`, `seeking`, `seeked`, `timeupdate`, `ended`, `volumechange`, `ratechange`, `fullscreenchange`, `cinema`, `next`, `error`.

O evento `error` traz `{ stage, code, message }`. Se o link do vídeo expirou (URL assinada, por exemplo), responda com `player.load({ src: novaUrl })`.

> Tela cheia e Picture-in-Picture **não** têm comando: os navegadores só liberam isso a partir de um clique do usuário dentro do player.

---

## Protocolo `postMessage` (sem SDK)

O SDK é só um invólucro. Dá pra falar direto com o iframe:

```js
const frame = document.querySelector('iframe');

// comando  → player
frame.contentWindow.postMessage(
  { ns: 'pipoca-player', kind: 'command', channel: 'abc', reqId: '1', cmd: 'seek', args: { time: 90 } },
  'https://meu-player.vercel.app'
);

// player → página (eventos e respostas)
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://meu-player.vercel.app') return;
  const m = e.data;
  if (m?.ns !== 'pipoca-player' || m.channel !== 'abc') return;
  if (m.kind === 'event')    console.log(m.event, m.data);          // ex.: 'timeupdate'
  if (m.kind === 'response') console.log(m.reqId, m.ok, m.data ?? m.error);
});
```

Comandos: `play`, `pause`, `toggle`, `seek {time}`, `seekBy {delta}`, `setVolume {volume}`, `mute`, `unmute`, `setRate {rate}`, `captions {on?}`, `setCinema {on}`, `load {…opções}`, `getState`.

Segurança das mensagens: o player só aceita comandos vindos da janela pai e do `channel` configurado (`?channel=abc`). Se você passar `?origin=https://seusite.com`, ele também confere a origem e só envia eventos pra ela.

---

## Variáveis de ambiente (opcionais)

Vercel → Project → Settings → Environment Variables. Veja `.env.example`.

| Variável | Padrão | Pra quê |
|---|---|---|
| `BRAND`, `ACCENT` | `PipocaFlix`, `#ff2a2a` | Marca e cor |
| `SLEEP_IMG`, `ERROR_IMG` | as imagens do player original | Imagem do cartão de pausa e do erro (`none` remove) |
| `SITE_URL` | vazio | Botão "Ver mais" na tela final |
| `ALLOWED_SRC_HOSTS` | vazio (aceita tudo) | Só toca vídeos desses hosts: `meucdn.com, *.videos.com` |
| `FRAME_ANCESTORS` | `*` | Quem pode embutir o player: `https://meusite.com https://*.meusite.com` |
| `HLS_ENGINE` | `auto` | `auto`, `native`, `hlsjs` |
| `REFERRER_POLICY` | `no-referrer` | Referrer enviado ao servidor do vídeo (sem referrer é o que mais servidores aceitam) |
| `SRC_TIMEOUT` | `25` | Segundos esperando cada link antes de passar pro próximo (5 a 120; a última fonte espera ≥ 45) |
| `IFRAME_LAST` | `0` | `1` = links do Drive/OK.ru (iframe) sempre por último |
| `SHEET_TTL` | `120` | Segundos que a planilha fica em cache no servidor |
| `FILMES_SHEET_ID`, `FILMES_GID`, `FILMES_LINK_COL` | sua planilha, `300449936`, `P` | Planilha/aba de filmes e coluna dos links |
| `SERIES_SHEET_ID`, `SERIES_GIDS`, `SERIES_LINK_COL` | sua planilha, os 17 gids, `E` | Planilha de séries, lista de `gid` em ordem (separados por vírgula) e coluna dos links |
| `TELEMETRY` | `0` | `1` liga a opção "Dados técnicos anônimos" no menu (só vai pro log da Vercel) |

**Recomendado em produção:** defina `ALLOWED_SRC_HOSTS` (ninguém usa o seu player com vídeos de terceiros) e `FRAME_ANCESTORS` (ninguém embute o seu player em outros sites). Alterou variável? Faça um novo deploy.

---

## Requisitos do vídeo (onde as coisas costumam quebrar)

- **HTTPS:** se o player está em `https://`, o vídeo também precisa estar (senão o navegador bloqueia como *mixed content*). O player troca `http://` por `https://` sozinho, mas se o servidor do vídeo **só** funciona em `http://` (ou tem certificado inválido), não toca: ponha na célula um link `https://` (ex.: o do seu Worker) como alternativa.
- **CORS no HLS:** o servidor/CDN do `.m3u8` e dos segmentos precisa enviar `Access-Control-Allow-Origin` (o hls.js lê os arquivos por XHR). MP4 direto não precisa.
- **CORS nas legendas:** arquivos `.vtt` de outro domínio precisam de `Access-Control-Allow-Origin`.
- **Range requests:** MP4 precisa de `Accept-Ranges: bytes` pra poder pular pra qualquer ponto.
- **Autoplay:** navegadores bloqueiam autoplay com som sem interação. Com `autoplay=1&muted=1` costuma passar; se for bloqueado, o player mostra o botão de play normalmente.
- **Codecs:** use H.264 + AAC (MP4/HLS) pra máxima compatibilidade.

---

## Desenvolvimento local

```bash
npm run dev      # http://localhost:3000  (demo em /, /embed, /filme/2, /serie/1/2) — sem precisar de login na Vercel
npm test         # testes do servidor e do SDK (node:test, sem dependências)
```

`npx vercel dev` também funciona, se preferir o ambiente oficial.

### Estrutura

```
api/watch.js              GET /filme/{linha} e /serie/{aba}/{linha} (links vêm da planilha)
api/embed.js              GET /embed (página do player) · POST /embed (telemetria opcional)
lib/sheets.js             lê as planilhas do Google (CSV), cache, número da linha, título/capa/sinopse
lib/                      config (env), validação de parâmetros, HTML do player, ícones
public/player/sources.js  lê a célula de links, descobre o tipo (mp4/hls/drive/ok.ru) e monta a fila de tentativas (roda no servidor E no navegador)
public/player/player.js   o player (roda no navegador) — HLS, controles, painéis, API postMessage
public/player/player.css  visual do player
public/vendor/hls.min.js  hls.js 1.5.8 (Apache-2.0), servido pelo próprio projeto; CDNs só como reserva
public/sdk/               SDK + tipos
public/index.html         demo / playground
scripts/dev.js            servidor local
test/                     testes
```

Editou `public/player/player.js` ou `.css`? Não precisa fazer nada: a versão do arquivo na página é um hash do conteúdo, então o cache dos navegadores se renova sozinho.

---

## Versão 2.0 — o que mudou

- **Novo:** rotas `/filme/{linha}` e `/serie/{aba}/{linha}` lendo as planilhas; vários links por célula com **troca automática** (erro, timeout, travamento — retomando do mesmo ponto); suporte a **Google Drive** e **OK.ru**; HLS com erro de lista (404/CORS) troca na hora em vez de tentar 5 s; menu *Fonte do vídeo*; `src` do `/embed` e do SDK aceita vários links; evento `sourcechange`.
- **Mudou:** `Referrer-Policy` padrão agora é `no-referrer`; `http://` é promovido a `https://` na página https.
- **Igual:** o visual e todos os controles do player.

## O que mudou em relação ao player dentro do projeto original

- **Entrou:** `/embed` independente, SDK e API `postMessage`, `load()` sem recarregar, legendas (`subs` + menu), `start`/`muted`/`loop`/`resume`, hls.js servido por você, "Tentar novamente" que refaz a fonte sem recarregar a página.
- **Saiu:** tudo que buscava a fonte do vídeo (tickets, headers de outros sites, proxy), a ficha e as recomendações vindas da planilha, e a lista de "salvos"/histórico usada nas recomendações. A ficha agora vem dos parâmetros (`desc`, `year`, `age`, `tags`).
- **Igual:** o visual e o comportamento (controles, mapa de cenas, modos cinema/madrugada/leitura, continuar de onde parou, atalhos de teclado, PiP, layouts de celular/tablet/TV).
