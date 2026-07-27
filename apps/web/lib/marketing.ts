'use client';

import { restDelete, restPatch, restPost } from '@/lib/rest-api';
import type { FaqEntry, PortfolioItemEntry, TestimonialEntry } from '@/lib/graphql/marketing';

/**
 * Marketing-content WRITES (DUAL API RULE; SRS §26.2). Reads are GraphQL
 * (lib/graphql/marketing.ts).
 *
 * These are admin-only writes and they go through the ordinary `restPost` /
 * `restPatch` — NOT the offline `restWrite` queue. That is deliberate: the write
 * queue exists for a field user drafting on a flaky connection, whereas an admin
 * editing the landing copy wants a hard, immediate confirmation that the change
 * landed. An FAQ answer silently sitting in IndexedDB is the wrong failure mode
 * for a content surface the whole public sees.
 */

export interface FaqInput {
  questionEn: string;
  questionFr: string;
  answerEn: string;
  answerFr: string;
  category?: string | null;
  order?: number;
  isPublished?: boolean;
}

export interface TestimonialInput {
  author: string;
  roleEn: string;
  roleFr: string;
  avatarUrl?: string | null;
  contentEn: string;
  contentFr: string;
  rating: number;
  order?: number;
  visible?: boolean;
}

export interface ReorderEntry {
  id: string;
  order: number;
}

// ── FAQ ──────────────────────────────────────────────────────────────────────

export function createFaq(input: FaqInput): Promise<FaqEntry> {
  return restPost<FaqEntry>('admin/marketing/faqs', input);
}

export function updateFaq(id: string, input: Partial<FaqInput>): Promise<FaqEntry> {
  return restPatch<FaqEntry>(`admin/marketing/faqs/${id}`, input);
}

export function deleteFaq(id: string): Promise<{ id: string }> {
  return restDelete<{ id: string }>(`admin/marketing/faqs/${id}`);
}

export function reorderFaqs(order: ReorderEntry[]): Promise<FaqEntry[]> {
  return restPost<FaqEntry[]>('admin/marketing/faqs/reorder', { order });
}

// ── Testimonials ─────────────────────────────────────────────────────────────

export function createTestimonial(input: TestimonialInput): Promise<TestimonialEntry> {
  return restPost<TestimonialEntry>('admin/marketing/testimonials', input);
}

export function updateTestimonial(
  id: string,
  input: Partial<TestimonialInput>,
): Promise<TestimonialEntry> {
  return restPatch<TestimonialEntry>(`admin/marketing/testimonials/${id}`, input);
}

export function deleteTestimonial(id: string): Promise<{ id: string }> {
  return restDelete<{ id: string }>(`admin/marketing/testimonials/${id}`);
}

export function reorderTestimonials(order: ReorderEntry[]): Promise<TestimonialEntry[]> {
  return restPost<TestimonialEntry[]>('admin/marketing/testimonials/reorder', { order });
}

// ── Portfolio showcase ───────────────────────────────────────────────────────

export interface PortfolioItemInput {
  tradeEn: string;
  tradeFr: string;
  captionEn: string;
  captionFr: string;
  beforeUrl: string;
  afterUrl: string;
  order?: number;
  isPublished?: boolean;
}

export function createPortfolioItem(input: PortfolioItemInput): Promise<PortfolioItemEntry> {
  return restPost<PortfolioItemEntry>('admin/marketing/portfolio', input);
}

export function updatePortfolioItem(
  id: string,
  input: Partial<PortfolioItemInput>,
): Promise<PortfolioItemEntry> {
  return restPatch<PortfolioItemEntry>(`admin/marketing/portfolio/${id}`, input);
}

export function deletePortfolioItem(id: string): Promise<{ id: string }> {
  return restDelete<{ id: string }>(`admin/marketing/portfolio/${id}`);
}

export function reorderPortfolio(order: ReorderEntry[]): Promise<PortfolioItemEntry[]> {
  return restPost<PortfolioItemEntry[]>('admin/marketing/portfolio/reorder', { order });
}

/**
 * Moves an entry one step up or down within a list, returning the reorder
 * payload (pure).
 *
 * Up/down buttons rather than drag-and-drop for the reorder affordance. Drag is
 * the flashier interaction, but it is a genuine accessibility problem — a
 * pointer-only reorder is invisible to a keyboard and awkward on the phone the
 * console is used on in the field. Two buttons with `aria-label`s are operable
 * by everyone (NFR-A11Y-01), and the API takes the same bulk payload either way.
 */
export function moveWithin<T extends { id: string }>(
  items: T[],
  id: string,
  direction: 'up' | 'down',
): ReorderEntry[] | null {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return null;

  const reordered = [...items];
  [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];

  return reordered.map((item, i) => ({ id: item.id, order: i }));
}
