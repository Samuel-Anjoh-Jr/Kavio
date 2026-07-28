import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, Public, RequirePermissions } from '../auth/decorators/auth.decorators';
import { JobPostingGateService } from './job-posting-gate.service';
import { JobsReadService } from './jobs-read.service';
import { JobApplicationView, JobInvitationView, JobListView, JobView } from './models/job.model';
import { JobPostingEligibilityView } from './models/posting-eligibility.model';

/**
 * Job READS (GraphQL, per the DUAL API RULE). Writes are on JobsController.
 *
 * The board and a job's public detail are @Public(): browsing posted jobs is
 * part of the guest first-interface (ACC-01), the same argument as public worker
 * profiles. The "mine" queries are not public — an applicant tracker and a
 * poster's draft list are personal, so they carry the capability the matching
 * write does.
 */
@Resolver()
export class JobsResolver {
  constructor(
    private readonly read: JobsReadService,
    private readonly gate: JobPostingGateService,
  ) {}

  @Query(() => JobPostingEligibilityView, {
    description:
      'Whether the signed-in identity may publish a PUBLIC vacancy, and the flat fee it would cost (JOB-01, ADM-07).',
  })
  async jobPostingEligibility(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobPostingEligibilityView> {
    const eligibility = await this.gate.check(user.id);
    return {
      allowed: eligibility.allowed,
      businessVerified: eligibility.businessVerified,
      feeXaf: eligibility.feeXaf,
      steps: eligibility.steps.map((step) => ({
        kind: step.kind,
        checkType: step.checkType ?? null,
        messageKey: step.messageKey,
      })),
    };
  }

  @Public()
  @Query(() => JobView, {
    nullable: true,
    description:
      'A single job. Public for a published job; a draft resolves only for its poster (JOB-02).',
  })
  async job(
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<JobView | null> {
    return this.read.getJob(id, viewer);
  }

  @Public()
  @Query(() => JobListView, {
    description:
      'The public job board: open jobs, filterable by category, region and urgency (JOB-04).',
  })
  async jobs(
    @Args('categoryId', { type: () => ID, nullable: true }) categoryId?: string,
    @Args('geoRegionId', { type: () => ID, nullable: true }) geoRegionId?: string,
    @Args('urgency', { nullable: true }) urgency?: string,
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('pageSize', { type: () => Int, nullable: true }) pageSize?: number,
  ): Promise<JobListView> {
    return this.read.listJobs({ categoryId, geoRegionId, urgency, page, pageSize });
  }

  @RequirePermissions('job:manage_own')
  @Query(() => JobListView, {
    description: "The caller's own jobs, drafts included (JOB-07).",
  })
  async myJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('pageSize', { type: () => Int, nullable: true }) pageSize?: number,
  ): Promise<JobListView> {
    return this.read.listMyJobs(user, { page, pageSize });
  }

  @RequirePermissions('job:manage_own')
  @Query(() => [JobApplicationView], {
    description: "A job's applicants with worker cards, for its poster (JOB-03).",
  })
  async jobApplicants(
    @CurrentUser() user: AuthenticatedUser,
    @Args('jobId', { type: () => ID }) jobId: string,
  ): Promise<JobApplicationView[]> {
    return this.read.listApplicants(user, jobId);
  }

  @RequirePermissions('job:manage_own')
  @Query(() => [JobInvitationView], {
    description: 'Workers this poster invited to a job (JOB-03).',
  })
  async jobInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Args('jobId', { type: () => ID }) jobId: string,
  ): Promise<JobInvitationView[]> {
    return this.read.listJobInvitations(user, jobId);
  }

  @RequirePermissions('job:apply')
  @Query(() => [JobApplicationView], {
    description: "The worker's own applications and their statuses (JOB-04).",
  })
  async myApplications(@CurrentUser() user: AuthenticatedUser): Promise<JobApplicationView[]> {
    return this.read.listMyApplications(user);
  }

  @RequirePermissions('job:apply')
  @Query(() => [JobInvitationView], {
    description: "The worker's incoming Job Requests (JOB-04).",
  })
  async myJobInvitations(@CurrentUser() user: AuthenticatedUser): Promise<JobInvitationView[]> {
    return this.read.listMyInvitations(user);
  }
}
