'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Plays a received voice note with a static waveform and a scrub-free progress
 * fill (MSG-02).
 *
 * The waveform is deterministic pseudo-random bars derived from the URL rather
 * than decoded audio: decoding every note in a thread to draw its true waveform
 * would be a lot of CPU on a low-end phone for a purely decorative gain, and a
 * stable per-note shape reads just as much like "a voice note" while costing
 * nothing.
 */
export function VoicePlayer({ src }: { src: string | null }) {
  const t = useTranslations('Messaging');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () =>
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  if (!src) {
    return <span className="text-sm text-muted-foreground">{t('voice.unavailable')}</span>;
  }

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  };

  const bars = waveformFor(src);

  return (
    <div className="flex min-w-[180px] items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('voice.pause') : t('voice.play')}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {playing ? (
          <Pause aria-hidden className="size-4" />
        ) : (
          <Play aria-hidden className="size-4" />
        )}
      </button>

      <div className="flex h-8 flex-1 items-center gap-0.5" aria-hidden>
        {bars.map((height, index) => {
          const filled = (index / bars.length) * 100 <= progress;
          return (
            <span
              key={index}
              className={cn('w-1 shrink-0 rounded-full', filled ? 'bg-primary' : 'bg-primary/30')}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      {/* preload="none": a thread with a dozen notes must not pull a dozen audio
          files over mobile data before any is played. */}
      <audio ref={audioRef} src={src} preload="none" />
    </div>
  );
}

/** A stable bar pattern seeded from the URL, so one note always looks the same. */
function waveformFor(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return Array.from({ length: 28 }, (_, index) => {
    const value = Math.sin(hash + index * 1.7) * 0.5 + 0.5;
    return Math.round(25 + value * 75);
  });
}
