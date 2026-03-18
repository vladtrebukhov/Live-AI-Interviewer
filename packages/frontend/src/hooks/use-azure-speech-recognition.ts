'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import type { SpeechRecognitionTiming } from '@agentsgalore/shared';
import { fetchSpeechToken } from '@/lib/api';
import type { SpeechRecognitionStatus } from '@/stores/interview-store';

interface UseAzureSpeechRecognitionOptions {
  questionId?: string | null;
  sessionId?: string | null;
  locale?: string;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (payload: { text: string; timing?: SpeechRecognitionTiming }) => void;
  onError?: (message: string | null) => void;
  onStatusChange?: (status: SpeechRecognitionStatus) => void;
}

interface UseAzureSpeechRecognitionResult {
  status: SpeechRecognitionStatus;
  partialTranscript: string;
  error: string | null;
  isSupported: boolean;
  startRecognition: () => Promise<boolean>;
  stopRecognition: () => Promise<void>;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function getRefreshDelayMs(expiresInSeconds: number): number {
  return Math.max((expiresInSeconds - 60) * 1000, 60_000);
}

function getRecognitionTiming(result: SpeechSDK.SpeechRecognitionResult): SpeechRecognitionTiming | undefined {
  const offset = typeof result.offset === 'number' ? result.offset : undefined;
  const duration = typeof result.duration === 'number' ? result.duration : undefined;

  if (offset === undefined && duration === undefined) {
    return undefined;
  }

  return {
    offset,
    duration,
    offsetMs: offset === undefined ? undefined : Math.round(offset / 10_000),
    durationMs: duration === undefined ? undefined : Math.round(duration / 10_000),
  };
}

function canUseSpeechEndpoint(endpoint: string | undefined): endpoint is string {
  if (!endpoint) {
    return false;
  }

  try {
    const parsed = new URL(endpoint);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.endsWith('.api.cognitive.microsoft.com')) {
      return false;
    }

    return path.includes('/speech/');
  } catch {
    return false;
  }
}

export function useAzureSpeechRecognition({
  questionId,
  sessionId,
  locale = process.env.NEXT_PUBLIC_SPEECH_LOCALE ?? 'en-US',
  onPartialTranscript,
  onFinalTranscript,
  onError,
  onStatusChange,
}: UseAzureSpeechRecognitionOptions): UseAzureSpeechRecognitionResult {
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAuthorizationTokenRef = useRef<() => Promise<void>>(async () => {});
  const statusRef = useRef<SpeechRecognitionStatus>('idle');

  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSupported = typeof window !== 'undefined' && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

  const updateStatus = useCallback((nextStatus: SpeechRecognitionStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    onStatusChange?.(nextStatus);
  }, [onStatusChange]);

  const updatePartialTranscript = useCallback((text: string) => {
    setPartialTranscript(text);
    onPartialTranscript?.(text);
  }, [onPartialTranscript]);

  const updateError = useCallback((message: string | null) => {
    setError(message);
    onError?.(message);
  }, [onError]);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback((expiresInSeconds: number) => {
    clearRefreshTimer();
    refreshTimerRef.current = setTimeout(() => {
      void refreshAuthorizationTokenRef.current();
    }, getRefreshDelayMs(expiresInSeconds));
  }, [clearRefreshTimer]);

  const disposeRecognizer = useCallback(() => {
    clearRefreshTimer();
    recognizerRef.current?.close();
    recognizerRef.current = null;
  }, [clearRefreshTimer]);

  const refreshAuthorizationToken = useCallback(async () => {
    const recognizer = recognizerRef.current;
    if (!recognizer) {
      return;
    }

    try {
      const tokenResponse = await fetchSpeechToken({ questionId: questionId ?? undefined, sessionId: sessionId ?? undefined });
      recognizer.authorizationToken = tokenResponse.token;
      scheduleTokenRefresh(tokenResponse.expiresInSeconds);
    } catch (refreshError) {
      const message = getErrorMessage(refreshError, 'Failed to refresh Azure Speech authorization');
      updateError(message);
      updatePartialTranscript('');
      disposeRecognizer();
      updateStatus('error');
    }
  }, [disposeRecognizer, questionId, scheduleTokenRefresh, sessionId, updateError, updatePartialTranscript, updateStatus]);

  useEffect(() => {
    refreshAuthorizationTokenRef.current = refreshAuthorizationToken;
  }, [refreshAuthorizationToken]);

  const stopRecognition = useCallback(async () => {
    const recognizer = recognizerRef.current;
    if (!recognizer) {
      updatePartialTranscript('');
      if (statusRef.current !== 'error') {
        updateStatus('idle');
      }
      return;
    }

    updateStatus('stopping');
    clearRefreshTimer();

    await new Promise<void>((resolve) => {
      recognizer.stopContinuousRecognitionAsync(
        () => resolve(),
        () => resolve(),
      );
    });

    disposeRecognizer();
    updatePartialTranscript('');

    if (statusRef.current !== 'error') {
      updateStatus('idle');
    }
  }, [clearRefreshTimer, disposeRecognizer, updatePartialTranscript, updateStatus]);

  const startRecognition = useCallback(async () => {
    if (!isSupported) {
      updateError('Speech recognition requires microphone access in a supported browser');
      updateStatus('error');
      return false;
    }

    if (!questionId && !sessionId) {
      updateError('Speech recognition is unavailable until the interview has loaded');
      updateStatus('error');
      return false;
    }

    if (recognizerRef.current) {
      return true;
    }

    updateStatus('starting');
    updateError(null);
    updatePartialTranscript('');

    try {
      const tokenResponse = await fetchSpeechToken({ questionId: questionId ?? undefined, sessionId: sessionId ?? undefined });
      const speechConfig = canUseSpeechEndpoint(tokenResponse.endpoint)
        ? SpeechSDK.SpeechConfig.fromEndpoint(new URL(tokenResponse.endpoint))
        : SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenResponse.token, tokenResponse.region);

      speechConfig.authorizationToken = tokenResponse.token;
      speechConfig.speechRecognitionLanguage = locale;

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
      recognizerRef.current = recognizer;

      recognizer.sessionStarted = () => {
        updateStatus('listening');
      };

      recognizer.recognizing = (_, event) => {
        const text = event.result.text.trim();
        updatePartialTranscript(text);
      };

      recognizer.recognized = (_, event) => {
        const text = event.result.text.trim();

        if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && text) {
          updatePartialTranscript('');
          onFinalTranscript?.({ text, timing: getRecognitionTiming(event.result) });
          return;
        }

        if (event.result.reason === SpeechSDK.ResultReason.NoMatch) {
          updatePartialTranscript('');
        }
      };

      recognizer.canceled = (_, event) => {
        const message = event.errorDetails?.trim()
          || `Speech recognition canceled (${SpeechSDK.CancellationReason[event.reason] ?? 'unknown'})`;

        updateError(message);
        updatePartialTranscript('');
        disposeRecognizer();
        updateStatus('error');
      };

      recognizer.sessionStopped = () => {
        if (!recognizerRef.current) {
          return;
        }

        disposeRecognizer();
        updatePartialTranscript('');

        if (statusRef.current !== 'error') {
          updateStatus('idle');
        }
      };

      await new Promise<void>((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(resolve, reject);
      });

      scheduleTokenRefresh(tokenResponse.expiresInSeconds);

      updateStatus('listening');
      return true;
    } catch (startError) {
      const message = getErrorMessage(startError, 'Failed to start Azure Speech recognition');
      updateError(message);
      updatePartialTranscript('');
      disposeRecognizer();
      updateStatus('error');
      return false;
    }
  }, [disposeRecognizer, isSupported, locale, onFinalTranscript, questionId, scheduleTokenRefresh, sessionId, updateError, updatePartialTranscript, updateStatus]);

  useEffect(() => {
    return () => {
      void stopRecognition();
    };
  }, [stopRecognition]);

  return {
    status,
    partialTranscript,
    error,
    isSupported,
    startRecognition,
    stopRecognition,
  };
}