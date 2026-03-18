'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SpeechRecognitionTiming, WsIncoming, WsOutgoing, WsSpeechStatus } from '@agentsgalore/shared';
import { useInterviewStore } from '@/stores/interview-store';

const RECONNECT_DELAY_MS = 1_000;

export function useInterviewSocket(questionId?: string | null, sessionId?: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const { setConnected, addMessage } = useInterviewStore();

  useEffect(() => {
    if (!questionId || !sessionId) {
      setConnected(false);
      wsRef.current = null;
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'}/api/ws?questionId=${encodeURIComponent(questionId)}&sessionId=${encodeURIComponent(sessionId)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);

      const currentCode = useInterviewStore.getState().code;
      if (currentCode) {
        ws.send(JSON.stringify({ type: 'code_update', code: currentCode, sessionId } as WsIncoming));
      }
    };

    ws.onclose = () => {
      setConnected(false);

      if (!disposed) {
        reconnectTimer = setTimeout(() => {
          setConnectionAttempt((value) => value + 1);
        }, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsOutgoing;
        switch (msg.type) {
          case 'feedback':
            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: msg.content,
              type: msg.feedbackType ?? 'feedback',
              createdAt: new Date().toISOString(),
            });
            break;
          case 'transcript':
            addMessage({
              id: crypto.randomUUID(),
              role: 'user',
              content: msg.text,
              type: 'speech',
              createdAt: new Date().toISOString(),
            });
            break;
          case 'audio':
            playAudio(msg.audio);
            break;
          case 'error':
            console.error('WS error:', msg.message);
            break;
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [questionId, sessionId, connectionAttempt, setConnected, addMessage]);

  const send = useCallback((data: WsIncoming) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }

    return false;
  }, []);

  return {
    sendCodeUpdate: useCallback((code: string) => {
      void send({ type: 'code_update', code, sessionId: sessionId ?? undefined });
    }, [send, sessionId]),
    sendFinalTranscript: useCallback((text: string, timing?: SpeechRecognitionTiming, code?: string) => {
      void send({
        type: 'transcript_final',
        text,
        timing,
        code,
        sessionId: sessionId ?? undefined,
      });
    }, [send, sessionId]),
    sendSpeechStatus: useCallback((status: WsSpeechStatus, error?: string) => {
      void send({ type: 'speech_status', status, error, sessionId: sessionId ?? undefined });
    }, [send, sessionId]),
    requestFeedback: useCallback(() => {
      void send({ type: 'request_feedback', includeTts: true, sessionId: sessionId ?? undefined });
    }, [send, sessionId]),
  };
}

function playAudio(base64Data: string) {
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'audio/ogg' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play().catch(console.error);
  audio.onended = () => URL.revokeObjectURL(url);
}
