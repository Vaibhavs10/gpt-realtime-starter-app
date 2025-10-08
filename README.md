# GPT Realtime Mini + Next.js Starter

This minimal Next.js 14 project shows how to follow OpenAI's recommended pattern for connecting to the `gpt-realtime-mini` model from the browser using ephemeral credentials, keeping your API key on the server, and streaming responses over WebRTC.

## Getting Started

1. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`.
2. Install dependencies with `npm install`.
3. (Optional) If you access the dev server from another device on your network, set `NEXT_DEV_ALLOWED_ORIGINS` in `.env.local`, for example `NEXT_DEV_ALLOWED_ORIGINS=http://192.168.1.136:3000`, so Next.js will trust the origin.
4. Run the development server with `npm run dev`.
5. Open [http://localhost:3000](http://localhost:3000), write your custom instructions, then tap the mic button to start a realtime voice session. The assistant will play a quick greeting so you can confirm audio; if playback is blocked, use **Enable audio playback** once. Browsers require HTTPS (or `localhost`) for microphone access, so if you hit the app from another device, front it with HTTPS or use a trusted tunnel.

## Architecture

- The frontend (`app/page.tsx`) fetches an ephemeral client secret from the Next.js API route and then performs the WebRTC handshake directly with OpenAI using `fetch` and the SDP offer/answer exchange. The interface keeps only two controls—custom instructions and a mic toggle—while a small status pill and pulse indicator reflect when the assistant is speaking.
- The API route (`app/api/realtime-session/route.ts`) is responsible for forwarding your `OPENAI_API_KEY` to OpenAI and returning the short-lived credential. Keeping the key server-side aligns with OpenAI's recommendations for ephemeral access.
- Strict TypeScript settings, minimal dependencies, and the App Router keep the code focused.

## Notes

- If you plan to ship audio interactions, update the `modalities` field and attach media tracks before creating the offer.
- When deploying, configure `OPENAI_API_KEY` securely in your hosting provider's environment.
- Voice mode uses OpenAI's `server_vad` turn detection with auto responses; when your speech pauses, the session commits audio and streams back both text and voice. Tweak the thresholds in `app/api/realtime-session/route.ts` if your environment is noisy.
