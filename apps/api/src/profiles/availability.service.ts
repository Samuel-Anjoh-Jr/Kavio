import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../lib/app-exception';
import { createLogger } from '../lib/logger';
import { PrismaService } from '../prisma/prisma.service';
import { validateWeeklySlots } from './availability.util';
import type { SetAvailabilityDto, SetAvailabilityExceptionDto } from './dto/profile-management.dto';
import { ProfileOwnershipService } from './profile-ownership.service';
import { toDateString } from './worker-profile.service';

const logger = createLogger('profiles.availability');

export interface AvailabilitySlotRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface AvailabilityExceptionRow {
  id: string;
  date: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

/**
 * Weekly availability and its exceptions (PROMPT 48; PRO-05).
 *
 * The week is REPLACED wholesale rather than patched slot by slot. A schedule is
 * one mental object — "Monday to Friday, half-day Saturday" — and patching it a
 * row at a time means the stored state passes through combinations the worker
 * never intended. It is also the only way overlap validation can work: a week
 * cannot be checked for conflicts while you are holding one row of it.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: ProfileOwnershipService,
  ) {}

  async get(user: AuthenticatedUser): Promise<{
    slots: AvailabilitySlotRow[];
    exceptions: AvailabilityExceptionRow[];
  }> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [slots, exceptions] = await Promise.all([
      this.prisma.client.availability.findMany({
        where: { workerProfileId: profile.id },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        select: { dayOfWeek: true, startTime: true, endTime: true },
      }),
      this.prisma.client.availabilityException.findMany({
        where: { workerProfileId: profile.id, date: { gte: today } },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          isAvailable: true,
          startTime: true,
          endTime: true,
          note: true,
        },
      }),
    ]);

    return {
      slots,
      exceptions: exceptions.map((exception) => ({
        ...exception,
        date: toDateString(exception.date),
      })),
    };
  }

  /**
   * Replaces the whole week, atomically.
   *
   * Delete-then-insert inside one transaction: a worker whose save fails halfway
   * would otherwise be left advertising no availability at all, which is a
   * strictly worse state than the schedule they were trying to change.
   */
  async setWeek(user: AuthenticatedUser, dto: SetAvailabilityDto): Promise<AvailabilitySlotRow[]> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    // Zod has already checked each slot's shape; this checks the week as a WHOLE
    // — overlaps and inverted ranges — which no per-field schema can see.
    const issues = validateWeeklySlots(dto.slots);

    if (issues.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AVAILABILITY_INVALID',
        'Some of those hours need a second look.',
        // Keyed by array index so the form marks the exact rows. Every problem
        // is reported at once: fixing one only to be shown the next is the most
        // tedious possible way to fill in a fourteen-row schedule.
        Object.fromEntries(issues.map((issue) => [`slots.${issue.index}`, [issue.message]])),
      );
    }

    await this.prisma.client.$transaction([
      this.prisma.client.availability.deleteMany({ where: { workerProfileId: profile.id } }),
      this.prisma.client.availability.createMany({
        data: dto.slots.map((slot) => ({
          workerProfileId: profile.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      }),
    ]);

    logger.info('Availability replaced', {
      payload: { workerProfileId: profile.id, slotCount: dto.slots.length },
    });

    return dto.slots
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  }

  /**
   * Sets or replaces one day's override.
   *
   * An upsert, because the schema allows exactly one exception per worker per
   * day: a second one would be ambiguous, and a worker marking the same holiday
   * twice means "yes, that day" — not "create a conflict".
   */
  async setException(
    user: AuthenticatedUser,
    dto: SetAvailabilityExceptionDto,
  ): Promise<AvailabilityExceptionRow> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    if (dto.isAvailable && Boolean(dto.startTime) !== Boolean(dto.endTime)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AVAILABILITY_EXCEPTION_INCOMPLETE',
        'Give both a start and an end time, or neither for the whole day.',
        { startTime: ['Set both times, or leave both empty.'] },
      );
    }

    if (dto.isAvailable && dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AVAILABILITY_EXCEPTION_INVALID',
        'The end time must be after the start time.',
        { endTime: ['Choose a later time.'] },
      );
    }

    // Parsed as UTC midnight to match the DATE column. Using `new Date(string)`
    // with a local offset would shift a holiday onto the previous day for anyone
    // west of Greenwich — and a worker marked closed on the wrong day gets
    // called out on their day off.
    const date = new Date(`${dto.date}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_DATE', 'Choose a valid date.', {
        date: ['Use YYYY-MM-DD.'],
      });
    }

    const exception = await this.prisma.client.availabilityException.upsert({
      where: { workerProfileId_date: { workerProfileId: profile.id, date } },
      create: {
        workerProfileId: profile.id,
        date,
        isAvailable: dto.isAvailable,
        startTime: dto.isAvailable ? (dto.startTime ?? null) : null,
        endTime: dto.isAvailable ? (dto.endTime ?? null) : null,
        note: dto.note ?? null,
      },
      update: {
        isAvailable: dto.isAvailable,
        // Times are cleared when the day is marked CLOSED. Leaving stale hours
        // on a closed day is how "closed 08:00-17:00" ends up rendered.
        startTime: dto.isAvailable ? (dto.startTime ?? null) : null,
        endTime: dto.isAvailable ? (dto.endTime ?? null) : null,
        note: dto.note ?? null,
      },
      select: {
        id: true,
        date: true,
        isAvailable: true,
        startTime: true,
        endTime: true,
        note: true,
      },
    });

    return { ...exception, date: toDateString(exception.date) };
  }

  async removeException(user: AuthenticatedUser, id: string): Promise<{ id: string }> {
    const profile = await this.ownership.requireWorkerProfile(user.id);

    const existing = await this.prisma.client.availabilityException.findFirst({
      where: { id, workerProfileId: profile.id },
      select: { id: true },
    });

    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'AVAILABILITY_EXCEPTION_NOT_FOUND',
        'That date is not marked on your calendar.',
      );
    }

    await this.prisma.client.availabilityException.delete({ where: { id } });

    return { id };
  }
}
