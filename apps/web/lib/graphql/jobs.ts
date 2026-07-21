import { gql } from '@apollo/client';
import type { JobStatus, JobUrgency } from '@/lib/jobs';

/**
 * Job READS (DUAL API RULE: reads are GraphQL, writes are REST in lib/rest-api).
 *
 * The board and a single published job are public (ACC-01); `myJobs`,
 * `myApplications` and `myJobInvitations` are personal and resolve only for the
 * signed-in caller. Mirrors apps/api/src/jobs/jobs.resolver.ts.
 */

export interface JobPhoto {
  id: string;
  url: string | null;
  sortOrder: number;
}

export interface JobStatusEvent {
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  note: string | null;
  createdAt: string;
}

export interface WorkerPreview {
  workerId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  tier: string;
  trustScore: number;
  completedJobs: number;
  averageRating: number | null;
}

export interface JobDetail {
  id: string;
  posterId: string;
  posterName: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryNameEn: string | null;
  categoryNameFr: string | null;
  title: string | null;
  description: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  urgency: JobUrgency;
  status: JobStatus;
  city: string | null;
  area: string | null;
  landmark: string | null;
  photos: JobPhoto[];
  applicationCount: number;
  quoteCount: number;
  timeline: JobStatusEvent[];
  publishedAt: string | null;
  createdAt: string;
}

const JOB_FIELDS = `
  id
  posterId
  posterName
  categoryId
  categorySlug
  categoryNameEn
  categoryNameFr
  title
  description
  budgetMin
  budgetMax
  urgency
  status
  city
  area
  landmark
  photos {
    id
    url
    sortOrder
  }
  applicationCount
  quoteCount
  timeline {
    fromStatus
    toStatus
    note
    createdAt
  }
  publishedAt
  createdAt
`;

/** One job, with its full status timeline — the Job-in-Progress screen (JOB-06). */
export const JOB_QUERY = gql`
  query Job($id: ID!) {
    job(id: $id) {
      ${JOB_FIELDS}
    }
  }
`;

export interface JobQueryResult {
  job: JobDetail | null;
}

/** The caller's own jobs, drafts included (JOB-07). */
export const MY_JOBS_QUERY = gql`
  query MyJobs($page: Int, $pageSize: Int) {
    myJobs(page: $page, pageSize: $pageSize) {
      jobs {
        ${JOB_FIELDS}
      }
      total
      page
      pageSize
      hasMore
    }
  }
`;

export interface MyJobsQueryResult {
  myJobs: {
    jobs: JobDetail[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}
