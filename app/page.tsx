"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MODEL_OPTIONS = [
  { value: "gpt-realtime-mini", label: "gpt-realtime-mini" },
  { value: "gpt-realtime", label: "gpt-realtime" },
] as const;

const VOICE_OPTIONS = [
  { value: "verse", label: "verse" },
  { value: "alloy", label: "alloy" },
  { value: "ember", label: "ember" },
  { value: "marin", label: "marin" },
  { value: "cedar", label: "cedar" },
] as const;

type ModelValue = (typeof MODEL_OPTIONS)[number]["value"];
type VoiceValue = (typeof VOICE_OPTIONS)[number]["value"];

type SessionStage = "idle" | "connecting" | "live";

export default function Home() {
  const [instructions, setInstructions] = useState(
    "You are a realtime assistant. Greet the user, then answer briefly."
  );
  const [model, setModel] = useState<ModelValue>(MODEL_OPTIONS[0].value);
  const [voice, setVoice] = useState<VoiceValue>(VOICE_OPTIONS[0].value);
  const [stage, setStage] = useState<SessionStage>("idle");
  const [status, setStatus] = useState("Press the mic to start a session.");
  const [error, setError] = useState<string | null>(null);
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const teardownSession = useCallback(
    (options: { keepMicrophone?: boolean } = {}) => {
      const { keepMicrophone = false } = options;

      dataChannelRef.current?.close();
      dataChannelRef.current = null;

      const pc = peerConnectionRef.current;
      if (pc) {
        pc.getSenders().forEach((sender) => {
          if (!keepMicrophone) {
            sender.track?.stop();
          }
        });
        pc.close();
      }
      peerConnectionRef.current = null;

      if (!keepMicrophone) {
        const stream = localStreamRef.current;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        localStreamRef.current = null;
      }

      const audioEl = remoteAudioRef.current;
      if (audioEl) {
        audioEl.pause();
        audioEl.srcObject = null;
      }

      setAutoPlayBlocked(false);
      setIsAssistantSpeaking(false);
      setStage("idle");
    },
    []
  );

  const ensureMicrophone = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("Microphone is only available in the browser.");
    }

    if (!window.isSecureContext) {
      throw new Error("Microphone capture requires HTTPS or localhost.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia is unavailable in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });

    localStreamRef.current = stream;
    return stream;
  }, []);

  const resumePlayback = useCallback(() => {
    const audioEl = remoteAudioRef.current;
    if (!audioEl) {
      return;
    }

    audioEl
      .play()
      .then(() => {
        setAutoPlayBlocked(false);
      })
      .catch(() => {
        setAutoPlayBlocked(true);
      });
  }, []);

  const startSession = useCallback(async () => {
    if (stage !== "idle") {
      return;
    }

    setError(null);
    setStatus("Preparing microphone…");
    setStage("connecting");

    try {
      const stream = await ensureMicrophone();

      setStatus("Requesting realtime session…");
      const response = await fetch("/api/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: instructions.trim() || undefined,
          model,
          voice,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload?.error ?? `Failed to create realtime session (${response.status})`
        );
      }

      const session = await response.json();
      const clientSecret: string | undefined = session?.client_secret?.value;
      if (!clientSecret) {
        throw new Error("Missing client secret in realtime session response.");
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      pc.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          setStatus("ICE complete. Finalizing connection…");
        }
      });

      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "connected") {
          setStage("live");
          setStatus("Listening…");
        } else if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          teardownSession({ keepMicrophone: true });
          setStatus("Session ended. Tap the mic to reconnect.");
        }
      });

      pc.addEventListener("track", (event) => {
        const audioEl = remoteAudioRef.current;
        if (!audioEl) {
          return;
        }

        const [remoteStream] = event.streams;
        audioEl.srcObject =
          remoteStream ??
          (() => {
            const mediaStream = new MediaStream();
            mediaStream.addTrack(event.track);
            return mediaStream;
          })();

        const playPromise = audioEl.play();
        if (playPromise) {
          playPromise
            .then(() => {
              setAutoPlayBlocked(false);
            })
            .catch(() => {
              setAutoPlayBlocked(true);
            });
        }
      });

      const dataChannel = pc.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.addEventListener("open", () => {
        dataChannel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions:
                "Say a quick hello so the user can confirm playback, then listen for their next turn.",
            },
          })
        );
      });

      dataChannel.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "input_audio_buffer.speech_started") {
            setStatus("Heard you. Processing…");
          } else if (payload.type === "input_audio_buffer.speech_stopped") {
            setStatus("Working on a reply…");
          } else if (payload.type === "response.completed") {
            setStatus("Listening…");
          } else if (payload.type === "response.error") {
            setStatus(
              `Assistant error: ${payload.error?.message ?? "unknown issue"}`
            );
          }
        } catch {
          // Non-JSON messages can be ignored.
        }
      });

      stream.getAudioTracks().forEach((track) => {
        track.contentHint = "speech";
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      setStatus("Connecting to OpenAI…");
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${model}`,
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
        const detail = await sdpResponse.text();
        throw new Error(
          detail
            ? `Realtime SDP exchange failed: ${detail}`
            : "Realtime SDP exchange failed."
        );
      }

      const answer = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error while starting realtime session.";
      setError(message);
      setStatus("Tap the mic to try again.");
      teardownSession();
    }
  }, [ensureMicrophone, instructions, model, stage, teardownSession, voice]);

  const stopSession = useCallback(() => {
    teardownSession();
    setError(null);
    setStatus("Press the mic to start a session.");
  }, [teardownSession]);

  const toggleSession = useCallback(() => {
    if (stage === "idle") {
      void startSession();
    } else if (stage === "connecting") {
      stopSession();
    } else {
      stopSession();
    }
  }, [stage, startSession, stopSession]);

  useEffect(() => {
    const audioEl = remoteAudioRef.current;
    if (!audioEl) {
      return;
    }

    const handleSpeaking = () => {
      setIsAssistantSpeaking(true);
      setStatus("Assistant speaking…");
    };

    const handleSilence = () => {
      setIsAssistantSpeaking(false);
      if (stage === "live") {
        setStatus("Listening…");
      }
    };

    audioEl.addEventListener("playing", handleSpeaking);
    audioEl.addEventListener("pause", handleSilence);
    audioEl.addEventListener("ended", handleSilence);
    audioEl.addEventListener("suspend", handleSilence);

    return () => {
      audioEl.removeEventListener("playing", handleSpeaking);
      audioEl.removeEventListener("pause", handleSilence);
      audioEl.removeEventListener("ended", handleSilence);
      audioEl.removeEventListener("suspend", handleSilence);
    };
  }, [stage]);

  useEffect(() => {
    return () => {
      teardownSession();
    };
  }, [teardownSession]);

  return (
    <main className="voice-shell">
      <div className="voice-card">
        <h1>gpt-realtime-mini voice demo</h1>
        <p className="subtitle">
          Choose a model and voice, set instructions, then start a voice session with the Realtime API.
        </p>

        <label className="field">
          <span>Custom instructions</span>
          <textarea
            rows={3}
            value={instructions}
            placeholder="Example: Act as a demo guide who keeps responses under 20 words."
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Model</span>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value as ModelValue)}
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Voice</span>
          <select
            value={voice}
            onChange={(event) => setVoice(event.target.value as VoiceValue)}
          >
            {VOICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`voice-toggle${stage === "live" ? " active" : ""}`}
          onClick={toggleSession}
          disabled={stage === "connecting"}
        >
          <span>
            {stage === "idle"
              ? "Start voice session"
              : stage === "connecting"
              ? "Connecting…"
              : "Stop session"}
          </span>
          <span aria-hidden="true" className="voice-icon">
            {stage === "live" ? "■" : "🎤"}
          </span>
        </button>

        <div className="status-line" aria-live="polite">
          <span className="status-message">{status}</span>
          {isAssistantSpeaking && (
            <span className="voice-indicator" aria-hidden="true" />
          )}
        </div>

        {error && (
          <p className="status error" role="alert">
            {error}
          </p>
        )}

        {autoPlayBlocked && (
          <button type="button" className="inline-button" onClick={resumePlayback}>
            Enable audio playback
          </button>
        )}

        <audio
          ref={remoteAudioRef}
          playsInline
          autoPlay
          className="remote-audio"
          aria-hidden="true"
        />
      </div>
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
