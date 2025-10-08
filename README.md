# GPT Realtime Mini + Next.js Starter

This minimal Next.js 14 project shows how to follow OpenAI's recommended pattern for connecting to the `gpt-realtime-mini` model from the browser using ephemeral credentials, keeping your API key on the server, and streaming responses over WebRTC.

## Getting Started

1. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`.
2. Install dependencies with `npm install`.
3. Run the development server with `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000) and click **Start session** to request an ephemeral WebRTC credential, then **Send prompt** to issue a realtime instruction.

The log panel shows the messages exchanged through the data channel so you can quickly debug round-trips.

## Architecture

- The frontend (`app/page.tsx`) fetches an ephemeral client secret from the Next.js API route and then performs the WebRTC handshake directly with OpenAI using `fetch` and the SDP offer/answer exchange.
- The API route (`app/api/realtime-session/route.ts`) is responsible for forwarding your `OPENAI_API_KEY` to OpenAI and returning the short-lived credential. Keeping the key server-side aligns with OpenAI's recommendations for ephemeral access.
- Strict TypeScript settings, minimal dependencies, and the App Router keep the code focused.

## Notes

- If you plan to ship audio interactions, update the `modalities` field and attach media tracks before creating the offer.
- When deploying, configure `OPENAI_API_KEY` securely in your hosting provider's environment.
