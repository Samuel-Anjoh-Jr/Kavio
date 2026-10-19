'use client';

import { useSyncExternalStore } from 'react';
import { animate, stagger, type AnimationParams, type JSAnimation } from 'animejs';

/**
 * TMDS motion system (SRS §20.4, §9.4). Every preset here only animates
 * transform and opacity — with one deliberate exception: the page-transition
 * preset also animates `filter: blur(...)`, because the design spec names
 * "fade+scale+blur" explicitly as the entry transition. Both properties are
 * GPU-composited and never trigger layout, so 60fps holds either way.
 *
 * Every preset reads `prefersReducedMotion()` and collapses its duration to 0
 * when the user has asked for less motion — the end state still applies
 * (nothing is skipped), it just applies instantly instead of animating.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function subscribeReducedMotionChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

/** React hook form of prefersReducedMotion(), reactive to live OS setting changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotionChange, prefersReducedMotion, () => false);
}

/** Clamp a duration to 0 under reduced motion; otherwise pass it through. */
export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

export type MotionTarget = Parameters<typeof animate>[0];

/** Page transition: fade + scale + blur, ~450ms, eases out. */
export function pageTransitionIn(
  target: MotionTarget,
  overrides: AnimationParams = {},
): JSAnimation {
  return animate(target, {
    opacity: [0, 1],
    scale: [0.98, 1],
    filter: ['blur(6px)', 'blur(0px)'],
    duration: motionDuration(450),
    ease: 'outQuad',
    ...overrides,
  });
}

/** Card hover: subtle lift + scale to 1.02. Call on pointer enter/leave. */
export function cardHoverIn(target: MotionTarget, overrides: AnimationParams = {}): JSAnimation {
  return animate(target, {
    scale: 1.02,
    translateY: -4,
    duration: motionDuration(200),
    ease: 'outQuad',
    ...overrides,
  });
}

export function cardHoverOut(target: MotionTarget, overrides: AnimationParams = {}): JSAnimation {
  return animate(target, {
    scale: 1,
    translateY: 0,
    duration: motionDuration(200),
    ease: 'outQuad',
    ...overrides,
  });
}

/** Button micro-interaction: quick press-down, spring back. */
export function buttonPressIn(target: MotionTarget, overrides: AnimationParams = {}): JSAnimation {
  return animate(target, {
    scale: 0.96,
    duration: motionDuration(100),
    ease: 'outQuad',
    ...overrides,
  });
}

export function buttonPressOut(target: MotionTarget, overrides: AnimationParams = {}): JSAnimation {
  return animate(target, {
    scale: 1,
    duration: motionDuration(150),
    ease: 'outElastic(1, 0.6)',
    ...overrides,
  });
}

/**
 * Checkmark draw: animates `stroke-dashoffset` on an SVG path from its full
 * length to 0. This is the one preset that cannot be done with transform/
 * opacity alone — a line-drawing effect requires a stroke property — so it's
 * scoped narrowly to this single use case rather than a general pattern.
 */
export function drawCheckmark(path: SVGPathElement, overrides: AnimationParams = {}): JSAnimation {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;

  return animate(path, {
    strokeDashoffset: [length, 0],
    duration: motionDuration(500),
    ease: 'outQuad',
    ...overrides,
  });
}

/**
 * Gauge sweep: animates an SVG arc's `stroke-dashoffset` from empty to its
 * target, so a Trust Score ring fills rather than appearing already full.
 *
 * Same deliberate exception as drawCheckmark above — an arc that fills IS a
 * stroke animation, and there is no transform that expresses it. Both are
 * scoped to a single visual idea rather than opened up as a general pattern.
 */
export function sweepArc(
  circle: SVGCircleElement,
  { circumference, offset }: { circumference: number; offset: number },
  overrides: AnimationParams = {},
): JSAnimation {
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${circumference}`;

  return animate(circle, {
    strokeDashoffset: [circumference, offset],
    duration: motionDuration(900),
    ease: 'outExpo',
    ...overrides,
  });
}

export interface CountUpOptions {
  from?: number;
  to: number;
  duration?: number;
  decimals?: number;
  format?: (value: number) => string;
}

/** Count-up: animates a number from `from` to `to`, writing formatted text into `el`. */
export function countUp(el: HTMLElement, options: CountUpOptions): JSAnimation {
  const { from = 0, to, duration = 900, decimals = 0, format } = options;
  const proxy = { value: from };

  const render = (value: number) => {
    el.textContent = format ? format(value) : value.toFixed(decimals);
  };
  render(from);

  return animate(proxy, {
    value: to,
    duration: motionDuration(duration),
    ease: 'outExpo',
    onUpdate: () => render(proxy.value),
  });
}

/**
 * Section reveal (marketing): direct children rise 16px and fade in, 60ms
 * apart (UX-11: reveals 400-600ms, stagger 30-60ms).
 */
export function revealUp(targets: MotionTarget, overrides: AnimationParams = {}): JSAnimation {
  return animate(targets, {
    opacity: [0, 1],
    translateY: [16, 0],
    duration: motionDuration(500),
    delay: stagger(60),
    ease: 'outQuad',
    ...overrides,
  });
}

/**
 * Score dial: moves a Trust Score ring and its number from one value to
 * another, so the dial reads as the same score climbing rather than a new
 * gauge each time. Same stroke exception as sweepArc above.
 */
export function scoreTo(
  { circle, number }: { circle: SVGCircleElement; number: HTMLElement },
  {
    from,
    to,
    circumference,
    onValue,
  }: { from: number; to: number; circumference: number; onValue?: (value: number) => void },
  overrides: AnimationParams = {},
): JSAnimation {
  const proxy = { value: from };
  const render = () => {
    circle.style.strokeDashoffset = `${circumference * (1 - proxy.value / 100)}`;
    number.textContent = `${Math.round(proxy.value)}`;
    onValue?.(proxy.value);
  };
  render();

  return animate(proxy, {
    value: to,
    duration: motionDuration(700),
    ease: 'outExpo',
    onUpdate: render,
    ...overrides,
  });
}

export { stagger };
