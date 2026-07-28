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

export interface JobBoardEntry {
  id: string;
  title: string | null;
  categorySlug: string | null;
  categoryNameEn: string | null;
  categoryNameFr: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  urgency: JobUrgency;
  city: string | null;
  area: string | null;
  photos: JobPhoto[];
  publishedAt: string | null;
}

/**
 * The public job board (JOB-04), trimmed to what a teaser card shows — no
 * timeline, no application/quote counts, no poster reliability. Those matter
 * once someone opens the job, not while scanning a rail of them.
 */
export const JOBS_QUERY = gql`
  query Jobs($categoryId: ID, $geoRegionId: ID, $urgency: String, $page: Int, $pageSize: Int) {
    jobs(
      categoryId: $categoryId
      geoRegionId: $geoRegionId
      urgency: $urgency
      page: $page
      pageSize: $pageSize
    ) {
      jobs {
        id
        title
        categorySlug
        categoryNameEn
        categoryNameFr
        budgetMin
        budgetMax
        urgency
        city
        area
        photos {
          id
          url
          sortOrder
        }
        publishedAt
      }
      total
      page
      pageSize
      hasMore
    }
  }
`;

export interface JobsQueryResult {
  jobs: {
    jobs: JobBoardEntry[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

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

/**
 * Whether the viewer may publish a PUBLIC vacancy and what it costs (JOB-01).
 * Read up front so the fee and the remaining steps are an invitation rather
 * than a refusal discovered at the end of a four-step form.
 */
export const JOB_POSTING_ELIGIBILITY_QUERY = gql`
  query JobPostingEligibility {
    jobPostingEligibility {
      allowed
      businessVerified
      feeXaf
      steps {
        kind
        checkType
        messageKey
      }
    }
  }
`;

export interface JobPostingEligibilityResult {
  jobPostingEligibility: {
    allowed: boolean;
    businessVerified: boolean;
    feeXaf: number;
    steps: Array<{ kind: string; checkType: string | null; messageKey: string }>;
  };
}
