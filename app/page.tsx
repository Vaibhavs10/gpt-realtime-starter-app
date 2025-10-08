"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionLog = {
  at: string;
  message: string;
};

const MODEL = "gpt-realtime-mini";

export default function Home() {
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [prompt, setPrompt] = useState(
    "Summarize what makes the GPT Realtime Mini model unique in one sentence."
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const appendLog = useCallback((message: string) => {
    setLogs((current) => [
      ...current,
      { at: new Date().toLocaleTimeString(), message },
    ]);
  }, []);

  const closeSession = useCallback(() => {
    dataChannelRef.current?.close();
    peerConnectionRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current = null;
    setIsReady(false);
    appendLog("Closed realtime session.");
  }, [appendLog]);

  const handleSession = useCallback(async () => {
    if (isConnecting) {
      return;
    }

    appendLog("Requesting ephemeral client key…");
    setIsConnecting(true);

    try {
      const response = await fetch("/api/realtime-session", { method: "POST" });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(
          errorPayload?.error ?? `Failed to create session (${response.status})`
        );
      }

      const session = await response.json();
      const clientSecret: string | undefined = session?.client_secret?.value;

      if (!clientSecret) {
        throw new Error("Missing client secret in session response.");
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.addEventListener("open", () => {
        appendLog("Data channel opened. Ready to stream prompts.");
        setIsReady(true);
      });

      dc.addEventListener("message", (event) => {
        appendLog(`← ${event.data}`);
      });

      pc.addEventListener("connectionstatechange", () => {
        appendLog(`Connection state: ${pc.connectionState}`);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          setIsReady(false);
        }
      });

      pc.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          return;
        }
        appendLog("ICE gathering complete.");
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      appendLog("Exchanging SDP with OpenAI…");
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
          body: offer.sdp ?? "",
        }
      );

      if (!sdpResponse.ok) {
        throw new Error(
          `Realtime SDP exchange failed (${sdpResponse.status})`
        );
      }

      const answer = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      appendLog("Realtime session established.");
    } catch (error) {
      if (error instanceof Error) {
        appendLog(`Error: ${error.message}`);
      } else {
        appendLog("Unexpected error while starting session.");
      }
      closeSession();
    } finally {
      setIsConnecting(false);
    }
  }, [appendLog, closeSession, isConnecting]);

  const sendPrompt = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      appendLog("No open data channel. Establish a session first.");
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      appendLog("Cannot send an empty prompt.");
      return;
    }

    appendLog(`→ ${trimmed}`);
    channel.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions: trimmed,
          modalities: ["text"],
        },
      })
    );
  }, [appendLog, prompt]);

  useEffect(() => {
    return () => {
      closeSession();
    };
  }, [closeSession]);

  return (
    <main className="layout">
      <header className="stack">
        <h1>GPT Realtime Mini + Next.js</h1>
        <p>
          Minimal WebRTC client for OpenAI&apos;s low-latency assistant model.
          Bring your API key, request an ephemeral credential, and stream
          instructions in seconds.
        </p>
        <nav className="links" aria-label="Reference links">
          <a
            href="https://platform.openai.com/docs/models/gpt-realtime-mini"
            target="_blank"
            rel="noreferrer"
          >
            Model guide
          </a>
          <a
            href="https://platform.openai.com/docs/guides/realtime"
            target="_blank"
            rel="noreferrer"
          >
            Realtime API
          </a>
          <a
            href="https://openai.com/api/pricing"
            target="_blank"
            rel="noreferrer"
          >
            Pricing
          </a>
          <a
            href="https://help.openai.com/en/articles/8304786-preventing-unauthorized-usage"
            target="_blank"
            rel="noreferrer"
          >
            Security tips
          </a>
        </nav>
      </header>

      <section className="panel">
        <div className="controls">
          <button
            className="btn primary"
            onClick={handleSession}
            disabled={isConnecting}
          >
            {isConnecting ? "Connecting…" : "Start session"}
          </button>
          <button className="btn" onClick={closeSession} disabled={!isReady}>
            End session
          </button>
        </div>

        <label className="field">
          <span>Prompt</span>
          <textarea
            rows={4}
            value={prompt}
            placeholder="Ask something concise to see streaming output…"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>

        <button className="btn accent" onClick={sendPrompt} disabled={!isReady}>
          Send prompt
        </button>

        <div className="log" aria-live="polite">
          {logs.length === 0
            ? "Start a session to view realtime events."
            : logs.map((entry, idx) => (
                <div key={`${entry.at}-${idx}`}>
                  <span className="timestamp">{entry.at}</span>
                  <span>{entry.message}</span>
                </div>
              ))}
        </div>
      </section>

      <footer className="footer">
        <span>
          Tip: copy <code>.env.example</code> → <code>.env.local</code> before
          running <code>npm run dev</code>.
        </span>
      </footer>
    </main>
  );
}

function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const checkState = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", checkState);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", checkState);
  });
}
