# LegisBot

Chatbot RAG que responde preguntas sobre la actividad legislativa de Santa Fe,
usando como fuente el [Monitor Legislativo de la Secretaría de Asuntos
Legislativos de Santa Fe](https://monitorlegislativosf.vercel.app/).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**, UI con **Tailwind CSS v4**.
- **Vercel AI SDK** (`ai`, `@ai-sdk/react`, `@ai-sdk/groq`) para el streaming de chat y la integración con Groq.
- **Groq** (`openai/gpt-oss-120b`) como LLM de generación de respuestas.
- **`@xenova/transformers`** (`Xenova/all-MiniLM-L6-v2`, 384 dims) para embeddings 100% locales, sin API key.
- **SQLite** vía `better-sqlite3` + extensión **`sqlite-vec`** como vector store.
- **Cheerio** para parsear HTML durante el scraping.

## Cómo funciona

El sitio fuente es una SPA de Next.js sin API pública: los datasets completos
de cada sección (leyes, sesiones, mensajes del Poder Ejecutivo, legisladores)
vienen embebidos como JSON dentro de los chunks JS estáticos que sirve
Vercel, no en el HTML renderizado. El pipeline de este proyecto:

1. **`scripts/scrape.ts`** — descubre esos chunks a partir del HTML de cada
   sección, los descarga y extrae los 5 datasets JSON embebidos (260 leyes,
   ~160 mensajes del PE, ~2000 proyectos tratados en sesión, ~70
   legisladores con asistencia). Guarda todo en `data/scraped.json`.
2. **`scripts/embed.ts`** — arma un chunk de texto por cada ley, mensaje,
   proyecto de sesión y legislador; genera embeddings locales (sin API key,
   modelo `all-MiniLM-L6-v2` vía `@xenova/transformers`); los guarda en
   `data/vectors.sqlite` usando la extensión `sqlite-vec`. Es incremental:
   compara un hash de contenido por chunk y solo re-embeddea lo que cambió.
3. **`app/api/chat/route.ts`** — al recibir una pregunta, embeddea la
   consulta, busca los `top-k` chunks más similares (coseno) en SQLite, arma
   un bloque de contexto citable y se lo pasa a un modelo de Groq
   (`openai/gpt-oss-120b`) vía Vercel AI SDK, con streaming e instrucciones
   estrictas de citar la fuente o declarar que no hay información suficiente.
4. **`app/page.tsx`** — UI de chat con `useChat` (`@ai-sdk/react`), streaming
   y las fuentes citadas (`source-url` parts) visibles debajo de cada
   respuesta.
5. **`scripts/refresh.ts`** — re-corre scrape + embed; el embed solo
   reprocesa chunks nuevos o modificados (diff por hash de contenido), y
   elimina del vector store los que ya no existen en la fuente.

## Setup

Requisitos: Node.js 20+.

```bash
npm install
```

Variables de entorno — copiá `.env.example` a `.env.local` y completá tu API
key de Groq (gratuita en [console.groq.com](https://console.groq.com/keys)):

```bash
cp .env.example .env.local
```

```
GROQ_API_KEY=gsk_...
```

### Cargar los datos (primera vez)

```bash
npm run scrape   # scrapea el sitio -> data/scraped.json (~1-2 min, con rate limit)
npm run embed    # genera embeddings -> data/vectors.sqlite (descarga el modelo la primera vez, ~90MB)
```

### Correr la app

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Actualizar los datos (refresh)

El sitio fuente se actualiza cuando la Legislatura sesiona o se promulgan
leyes nuevas. Para traer esos cambios:

```bash
npm run refresh
```

Esto re-scrapea todo (es liviano) y re-embeddea solo lo nuevo o modificado
comparando un hash de contenido por chunk, así que corridas repetidas son
baratas.

### Automatizarlo con Vercel Cron

Si el proyecto está deployado en Vercel, agregá un `vercel.json` con un cron
que pegue a un endpoint propio que dispare el refresh (Vercel Cron solo hace
`GET` a rutas HTTP, no puede correr `npm run refresh` directo — necesitás un
route handler que invoque la misma lógica):

```json
{
  "crons": [
    { "path": "/api/refresh", "schedule": "0 9 * * *" }
  ]
}
```

Y protegé ese endpoint validando el header `Authorization: Bearer
$CRON_SECRET` que Vercel Cron agrega automáticamente (configurá
`CRON_SECRET` en las variables de entorno del proyecto). Tené en cuenta que
el embedding local puede tardar varios minutos si hay muchos chunks nuevos:
en el plan gratuito de Vercel las funciones tienen un timeout bajo, así que
para volúmenes grandes puede convenir la opción de GitHub Action de abajo en
vez de un cron serverless.

### Automatizarlo con GitHub Actions

Alternativa que no depende del runtime de Vercel y corre el script real
(`npm run refresh`) sin límite de duración de función serverless. Creá
`.github/workflows/refresh.yml`:

```yaml
name: Refresh legislative data

on:
  schedule:
    - cron: "0 9 * * *" # todos los días 9:00 UTC
  workflow_dispatch: {} # permite dispararlo a mano desde la pestaña Actions

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run refresh
      - name: Commit updated data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/scraped.json data/vectors.sqlite
          git diff --cached --quiet || git commit -m "chore: refresh legislative data"
          git push
```

Esto asume que en este repo `data/scraped.json` y `data/vectors.sqlite` **sí**
se versionan (remové las líneas correspondientes de `.gitignore` si optás por
este approach) para que el deploy de Vercel sirva los datos ya embeddeados
sin tener que correr `scrape`/`embed` en el build. Si preferís no versionar
binarios de SQLite en git, cambiá el último paso por subir `data/` a un
storage externo (Vercel Blob, S3) y descargarlo en el build.

## Estructura

```
app/
  api/chat/route.ts    # endpoint RAG (retrieval + streaming con Groq)
  page.tsx             # UI de chat (useChat de @ai-sdk/react)
  layout.tsx           # layout raíz de Next.js
  globals.css          # estilos globales (Tailwind v4)
  components/
    ChatMessage.tsx      # burbuja de mensaje (usuario/asistente)
    ChatInput.tsx        # input de texto + envío
    SourcePill.tsx       # chip de fuente citada debajo de una respuesta
    TypingIndicator.tsx  # indicador de "escribiendo" durante el streaming
    EmptyState.tsx        # estado inicial con sugerencias de preguntas
    Header.tsx             # encabezado de la app
lib/
  fetcher.ts           # fetch con rate-limit, User-Agent, reintentos
  bundle-extractor.ts  # descubre y extrae los datasets JSON del bundle JS del sitio
  classify.ts          # identifica cuál dataset es cuál por su forma
  types.ts             # tipos compartidos (Ley, Mensaje, ProyectoSesion, Legislador...)
  chunking.ts           # arma el texto + cita de cada chunk por sección
  embeddings.ts         # wrapper de @xenova/transformers (embeddings locales)
  vector-store.ts       # SQLite + sqlite-vec (esquema, insert, búsqueda por similitud)
  hash.ts                # hash de contenido para el diff incremental
  rag.ts                 # retrieval + formateo de contexto, usado por el endpoint
  suggestions.ts          # preguntas sugeridas que se muestran en el estado vacío del chat
scripts/
  scrape.ts    # popula data/scraped.json
  embed.ts     # popula data/vectors.sqlite (incremental)
  refresh.ts   # orquesta scrape + embed para actualizaciones periódicas
data/          # output generado (gitignored por defecto — ver arriba)
```

## Notas

- El scraper es respetuoso del sitio fuente: identifica su User-Agent, espera
  ~800ms entre requests y reintenta con backoff exponencial ante errores
  5xx/429. El `robots.txt` del sitio permite crawling completo (`Allow: /`).
- Si el sitio cambia su estructura de datos (nombres de campos), el scraper
  falla explícitamente en vez de guardar datos parciales silenciosamente —
  revisar `lib/classify.ts` si eso pasa.
- Los embeddings son 100% locales (no llaman a ninguna API), así que
  `scrape`/`embed`/`refresh` no consumen la cuota de Groq. Solo el endpoint
  de chat usa `GROQ_API_KEY`.
