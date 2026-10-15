# Venbhas AI Blog Writing Agent

A local-first prototype for creating and editing blog article drafts for Venbhas Softwares. The frontend uses HTML, CSS, and vanilla JavaScript. A small Node.js server serves the app and keeps AI provider credentials on the server.

Drafts are stored in the browser's local storage. They are not uploaded to this app's server and are available only in the browser and device where they were saved.

## Requirements

- Node.js 18 or later
- An AI provider API key and model only if you want to generate real articles

The interface can run without AI credentials. Generation will display a setup message until a provider is configured.

## Setup

1. Open a terminal in this project folder.
2. Check your Node.js version with `node --version`.
3. Start the app with `npm start`.
4. Visit [http://localhost:3000](http://localhost:3000).

There are no external npm packages to install.

## Configure AI generation

1. Copy `.env.example` to a new file named `.env`.
2. Set the values below in `.env`:

   ```text
   AI_PROVIDER=openai-compatible
   AI_BASE_URL=https://api.openai.com/v1
   AI_API_KEY=your-secret-api-key
   AI_MODEL=your-model-name
   PORT=3000
   ```

3. Replace the example key and model with values from your provider.
4. Restart the server after changing `.env`.

The `openai-compatible` provider uses a chat completions endpoint that follows the OpenAI-compatible request format. For another provider or request format, create a provider adapter in `src/providers/` and add its selection in `src/providers/index.js`. Keep the adapter's output in the same article shape: `title`, `introduction`, `headings`, `body`, `conclusion`, `seoTitle`, `metaDescription`, and `callToAction`.

Never put the API key in a file under `public/`, in a browser request, or in source control. `.env` is excluded by `.gitignore`. Do not commit it.

## Run in development

Run `npm run dev` to start Node's watch mode. The server restarts when server files change. Refresh the browser to see frontend changes.

## Test manually

1. Run the server with no `.env` file and open the app. Confirm the brief form and draft workspace appear.
2. Try to generate an article. Confirm the app explains that AI provider settings are missing.
3. Configure a provider, restart the app, and generate a sample article.
4. Edit the title, body, and SEO fields. Confirm the word and character counts update.
5. Save the draft, refresh the page, and reopen it from **Your drafts**.
6. Copy an article and paste it into a text editor to check that its sections are included.
7. Try a brief with a missing required field and check the browser's required-field message.
8. Inspect the browser's network responses and source files. Confirm no API key appears there.

There is no automated test framework in this prototype. The checklist above is a manual smoke test, meaning a quick check that the main features work.

## API

- `GET /api/health` returns whether the server is running and whether AI settings are present. It never returns credentials.
- `POST /api/generate` accepts `topic`, `audience`, `keywords`, `tone`, and `wordCount`. It validates the brief and returns an `article` object.

The backend limits request size and brief field lengths, accepts article lengths from 300 to 3,000 words, and adds a short per-client request interval. It does not include user accounts or production-grade usage management. Keep this prototype local or behind trusted access until proper access controls and deployment protections are added.

## Project structure

```text
public/                 Browser interface and client-side behavior
src/server.js           Node.js web server and API routes
src/config.js           Reads environment and local .env settings
src/providers/          AI provider adapter and selection point
.env.example            Configuration template with no real secrets
```
