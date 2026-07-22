'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Voice-note recorder with a live waveform (MSG-02).
 *
 * Records with the browser MediaRecorder into whichever format the device
 * supports — Opus/WebM on Chrome/Android, AAC/MP4 on Safari/iOS — which is
 * exactly the set the storage layer now sniffs, so a note recorded here uploads
 * rather than being rejected as an unknown type.
 *
 * The waveform is drawn from the live analyser while recording and from the
 * captured samples afterwards, so a note is never a featureless grey bar: on a
 * low-bandwidth phone a visible waveform is the difference between "this is a
 * voice note" and "this is broken".
 */
export function VoiceRecorder({
  onRecorded,
  onCancel,
  sending,
}: {
  onRecorded: (file: File, durationSeconds: number) => void;
  onCancel: () => void;
  sending: boolean;
}) {
  const t = useTranslations('Messaging');
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordedRef = useRef<{ file: File; duration: number } | null>(null);
  const startedAtRef = useRef(0);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  // Guarantees the mic is released if the recorder unmounts mid-recording — a
  // live mic left running after the component is gone is the worst possible bug
  // on a privacy-sensitive surface.
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });

      recorder.addEventListener('stop', () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voice-note.${extension}`, { type });
        recordedRef.current = {
          file,
          duration: Math.round((Date.now() - startedAtRef.current) / 1000),
        };
        setState('recorded');
      });

      // Live level meter feeding the waveform.
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
        setLevels((prev) => [...prev.slice(-59), avg / 255]);
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);

      startedAtRef.current = Date.now();
      recorder.start();
      setState('recording');
      setElapsed(0);
      setLevels([]);
    } catch {
      setError(t('voice.micDenied'));
    }
  }, [t]);

  // Elapsed-time ticker while recording.
  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const discard = useCallback(() => {
    recordedRef.current = null;
    setState('idle');
    setLevels([]);
    setElapsed(0);
    cleanup();
    onCancel();
  }, [cleanup, onCancel]);

  const send = useCallback(() => {
    const recorded = recordedRef.current;
    if (recorded) onRecorded(recorded.file, recorded.duration);
  }, [onRecorded]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-input border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
        <span className="flex-1">{error}</span>
        <Button type="button" variant="ghost" size="sm" onClick={discard}>
          {t('voice.dismiss')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-input border border-input bg-surface px-3 py-2">
      {state === 'idle' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void start()}
          className="gap-2"
        >
          <Mic aria-hidden className="size-4 text-danger" />
          {t('voice.record')}
        </Button>
      )}

      {state !== 'idle' && (
        <>
          <Waveform levels={levels} live={state === 'recording'} />
          <span className="font-numeric text-xs text-muted-foreground tabular-nums">
            {formatDuration(elapsed)}
          </span>

          {state === 'recording' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={stop}
              aria-label={t('voice.stop')}
            >
              <Square aria-hidden className="size-4 text-danger" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={discard}
                aria-label={t('voice.discard')}
                disabled={sending}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={send}
                aria-label={t('voice.send')}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Send aria-hidden className="size-4" />
                )}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A simple bar waveform. Shared shape with the playback waveform on a sent voice
 * note, so recording and playback read as the same object.
 */
export function Waveform({
  levels,
  live = false,
  className,
}: {
  levels: number[];
  live?: boolean;
  className?: string;
}) {
  const bars = levels.length > 0 ? levels : Array.from({ length: 24 }, () => 0.15);

  return (
    <div
      className={cn('flex h-8 flex-1 items-center gap-0.5 overflow-hidden', className)}
      aria-hidden
    >
      {bars.map((level, index) => (
        <span
          key={index}
          className={cn('w-1 shrink-0 rounded-full', live ? 'bg-danger' : 'bg-primary/60')}
          style={{ height: `${Math.max(10, Math.min(100, level * 100))}%` }}
        />
      ))}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
