// ═════════════════════════════════════════════════════════════════════════
// seed.mjs — Kavio Cameroon demo dataset
//
// Builds a realistic, internally-consistent snapshot of the platform for an
// investor / stakeholder demo: every ledger balances, every state machine
// (Job / Booking / Escrow / Dispute) has a real transition history instead
// of a status picked out of a hat, and every trust score is *derived* from
// the same TrustEvent rows the Trust Engine would replay in production —
// nothing is just a random number sitting next to unrelated evidence.
//
// Run with:  bun db:seed
//
// Media convention: MediaAsset.s3Key is documented as "never a public URL",
// but for a database that has no real S3 bucket behind it, this seed stores
// fully-qualified, reliably-resolving image URLs (Lorem Picsum for scenes,
// Pravatar for faces) directly in s3Key. Point the media-serving layer at
// these directly (e.g. "if s3Key starts with http, redirect/serve as-is")
// for the demo, and swap in real object keys once uploads flow through S3.
// ═════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { randomBytes, randomInt, randomUUID, scrypt } from 'crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** The real launch FAQ + testimonial copy: see the seeding block below for why. */
const marketingContent = JSON.parse(
  readFileSync(path.join(__dirname, 'data/marketing-content.json'), 'utf-8'),
);

const DEFAULT_PASSWORD = 'Kavio2026!';

// ─────────────────────────────────────────────────────────────────────────
// Password hashing — MUST match apps/api/src/lib/password.util.ts exactly.
//
// The API verifies `scrypt$N$r$p$salt$key` and returns false for anything
// else, so a seed that wrote bcrypt hashes produced a database where every
// demo account silently failed to log in. Keeping the same format (and the
// same OWASP cost parameters) here is what makes the seeded accounts real
// credentials rather than decoration.
// ─────────────────────────────────────────────────────────────────────────
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAX_MEM = 128 * SCRYPT_N * SCRYPT_R * 2;

function hashPassword(plain) {
  const salt = randomBytes(SCRYPT_SALT_BYTES);

  return new Promise((resolve, reject) => {
    scrypt(
      plain.normalize('NFKC'),
      salt,
      SCRYPT_KEY_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEM },
      (error, derivedKey) =>
        error
          ? reject(error)
          : resolve(
              [
                'scrypt',
                SCRYPT_N,
                SCRYPT_R,
                SCRYPT_P,
                salt.toString('base64'),
                derivedKey.toString('base64'),
              ].join('$'),
            ),
    );
  });
}
const NOW = new Date();
const PLATFORM_FEE_BPS = 1000; // 10%, mirrors the seeded SystemSetting below

// ─────────────────────────────────────────────────────────────────────────
// Small generic helpers
// ─────────────────────────────────────────────────────────────────────────
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomEnum = (obj) => randomItem(Object.values(obj));
const shuffle = (arr) => faker.helpers.shuffle(arr);
const pct = (p) => Math.random() < p;

/** Pick `n` distinct items from arr (n <= arr.length). */
function sample(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

/** Weighted choice: options = [[value, weight], ...] */
function weightedPick(options) {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of options) {
    if ((r -= w) <= 0) return value;
  }
  return options[options.length - 1][0];
}

const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);
const daysFromNow = (n) => new Date(NOW.getTime() + n * 86400000);
const hoursAfter = (date, h) => new Date(date.getTime() + h * 3600000);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Round a XAF amount to the nearest 500, the way real quotes tend to land. */
const roundXaf = (n) => Math.round(n / 500) * 500;

// ─────────────────────────────────────────────────────────────────────────
// Cameroonian identity data — real naming conventions rather than generic
// faker.js Western names, so the demo actually looks like Douala/Yaoundé.
// ─────────────────────────────────────────────────────────────────────────
const MALE_FIRST_NAMES = [
  'Jean',
  'Paul',
  'Emmanuel',
  'Serge',
  'Patrick',
  'Yannick',
  'Arnaud',
  'Christian',
  'Blaise',
  'Hervé',
  'Florent',
  'Cédric',
  'Landry',
  'Achille',
  'Boris',
  'Rodrigue',
  'Ghislain',
  'Aristide',
  'Fabrice',
  'Junior',
  'Ibrahim',
  'Aboubakar',
  'Moussa',
  'Souleymane',
  'Bertrand',
  'Idriss',
  'Marcelin',
  'Thierry',
  'Innocent',
  'Romuald',
];
const FEMALE_FIRST_NAMES = [
  'Marie',
  'Christelle',
  'Solange',
  'Brenda',
  'Larissa',
  'Josiane',
  'Carine',
  'Nadège',
  'Aïcha',
  'Fatimatou',
  'Bernadette',
  'Odette',
  'Vanessa',
  'Prisca',
  'Estelle',
  'Flore',
  'Chantal',
  'Delphine',
  'Rosine',
  'Pulchérie',
  'Judith',
  'Grace',
  'Aurélie',
  'Sandrine',
  'Colette',
  'Yvette',
  'Huguette',
  'Ariane',
  'Clarisse',
  'Inès',
];
const LAST_NAMES = [
  'Mbarga',
  'Ngono',
  'Etoundi',
  'Onana',
  'Eyenga',
  'Abena',
  'Fotso',
  'Kamga',
  'Tchoua',
  'Wandji',
  'Djoumessi',
  'Nguemo',
  'Talla',
  'Tankou',
  'Ndzana',
  'Mballa',
  'Nkeng',
  'Ngu',
  'Tabi',
  'Ndjock',
  'Assembe',
  'Belinga',
  'Essomba',
  'Meka',
  'Nnomo',
  'Zambo',
  'Biloa',
  'Amougou',
  'Owona',
  'Nkolo',
  'Fouda',
  'Kenfack',
  'Toukam',
  'Nana',
  'Djoukeng',
  'Simo',
  'Kwedi',
  'Njoya',
  'Modibo',
  'Oumarou',
  'Garga',
  'Souaibou',
];

function randomPersonName() {
  const isMale = pct(0.5);
  const first = randomItem(isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES);
  const last = randomItem(LAST_NAMES);
  return { name: `${first} ${last}`, isMale };
}

/** Cameroon mobile number in E.164, matching the MTN/Orange prefix ranges. */
function cameroonPhone() {
  const prefixes = [
    '650',
    '651',
    '652',
    '653',
    '654',
    '655',
    '656',
    '657',
    '658',
    '659', // MTN
    '670',
    '671',
    '672',
    '673',
    '674',
    '675',
    '676',
    '677',
    '678',
    '679', // Orange
    '680',
    '681',
    '682',
    '683',
    '684',
    '685',
    '686',
    '687',
    '688',
    '689', // Orange
    '690',
    '691',
    '692',
    '693',
    '694',
    '695',
    '696',
    '697',
    '698',
    '699', // MTN
  ];
  return `+237${randomItem(prefixes)}${String(randomInt(100000, 999999)).padStart(6, '0')}`;
}

const usedPhones = new Set();
function uniqueCameroonPhone() {
  let phone = cameroonPhone();
  while (usedPhones.has(phone)) phone = cameroonPhone();
  usedPhones.add(phone);
  return phone;
}

// ─────────────────────────────────────────────────────────────────────────
// Media — reliable, real, resolvable image URLs (no dead Unsplash IDs).
// Lorem Picsum (picsum.photos) for scenes/portfolio/logos/covers — a stable,
// widely-used placeholder photo CDN. Pravatar (i.pravatar.cc) for faces,
// keyed to a fixed image index 1-70 so the same seed always renders the
// same portrait rather than a random one on every request.
// ─────────────────────────────────────────────────────────────────────────
let avatarCounter = 0;
function avatarUrl() {
  avatarCounter += 1;
  const img = (avatarCounter % 70) + 1;
  return `https://i.pravatar.cc/300?img=${img}`;
}
function sceneUrl(seed, w, h) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}
const portfolioUrl = (seed) => sceneUrl(`tp-portfolio-${seed}`, 640, 480);
const jobPhotoUrl = (seed) => sceneUrl(`tp-job-${seed}`, 640, 480);
const reviewPhotoUrl = (seed) => sceneUrl(`tp-review-${seed}`, 640, 480);
const coverUrl = (seed) => sceneUrl(`tp-cover-${seed}`, 900, 300);
const logoUrl = (seed) => sceneUrl(`tp-logo-${seed}`, 240, 240);
const messageImageUrl = (seed) => sceneUrl(`tp-msg-${seed}`, 480, 480);
const idDocUrl = (seed) => sceneUrl(`tp-id-${seed}`, 640, 400);

// ─────────────────────────────────────────────────────────────────────────
// Trust Engine ledger — TrustEvent rows are written immediately (append-
// only, exactly like production); the running per-pillar totals, the set
// of checks an identity has passed, completed-job counts and ratings are
// accumulated in memory here and only turned into a TrustScore snapshot +
// a derived tier + badges once every job/booking/review has been written
// (see finalizeTrust at the end of main()). This is what keeps the tier on
// User, the checks on VerificationRecord, the completedJobs on TrustScore
// and the badges on UserBadge all telling the same story.
// ─────────────────────────────────────────────────────────────────────────
const trustLedger = new Map();
function ledgerFor(userId) {
  if (!trustLedger.has(userId)) {
    trustLedger.set(userId, {
      IDENTITY: 0,
      PROFESSIONAL: 0,
      MARKETPLACE: 0,
      FINANCIAL: 0,
      checks: new Set(),
      completedJobs: 0,
      ratings: [],
      eventCount: 0,
    });
  }
  return trustLedger.get(userId);
}

async function addTrustEvent(subjectId, type, pillar, delta, opts = {}) {
  const {
    actorId = null,
    sourceType = null,
    sourceId = null,
    metadata = null,
    occurredAt = NOW,
  } = opts;
  await prisma.trustEvent.create({
    data: { subjectId, type, pillar, delta, actorId, sourceType, sourceId, metadata, occurredAt },
  });
  const l = ledgerFor(subjectId);
  l[pillar] += delta;
  l.eventCount += 1;
}

function markCheckPassed(userId, checkType) {
  ledgerFor(userId).checks.add(checkType);
}

function recordCompletedJob(userId) {
  ledgerFor(userId).completedJobs += 1;
}

function recordRating(userId, rating) {
  ledgerFor(userId).ratings.push(rating);
}

// ─────────────────────────────────────────────────────────────────────────
// Wallet ledger — mirrors the schema's own rule: "the ledger is the truth;
// the balance is a cache". Every Transaction we write also nudges an
// in-memory running balance per user; Wallet.availableBalance is set from
// that running total at the very end, so it is always exactly the sum of
// that user's own transactions rather than an unrelated random number.
//
// Convention used throughout this seed: PAYMENT (client funding escrow) and
// REFUND (escrow returned to the client) move money over the Campay mobile-
// money rails directly and are recorded for the user's history, but do NOT
// touch the in-app withdrawable balance. DEPOSIT, WITHDRAWAL, ESCROW_RELEASE
// and FEE are the only types that adjust `availableBalance`.
// ─────────────────────────────────────────────────────────────────────────
const walletLedger = new Map();
const BALANCE_AFFECTING = new Set(['DEPOSIT', 'WITHDRAWAL', 'ESCROW_RELEASE', 'FEE']);

async function addTransaction(userId, type, direction, amount, opts = {}) {
  const {
    status = 'SUCCESS',
    bookingId = null,
    escrowHoldId = null,
    paymentMethodId = null,
    description = null,
    metadata = null,
    campayReference = null,
    externalReference = null,
    createdAt = NOW,
    settledAt = status === 'SUCCESS' ? NOW : null,
    failureReason = null,
  } = opts;
  await prisma.transaction.create({
    data: {
      userId,
      type,
      status,
      direction,
      amount,
      bookingId,
      escrowHoldId,
      paymentMethodId,
      description,
      metadata,
      campayReference,
      externalReference,
      createdAt,
      settledAt,
      failureReason,
    },
  });
  if (BALANCE_AFFECTING.has(type)) {
    const current = walletLedger.get(userId) ?? 0;
    walletLedger.set(userId, direction === 'CREDIT' ? current + amount : current - amount);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// State-machine history helpers — Job / Booking / EscrowHold all move only
// through an appended event log in production, so the seed writes a real
// chain of transitions rather than a bare final status with no history.
// ─────────────────────────────────────────────────────────────────────────
async function writeJobHistory(
  jobId,
  chain,
  { actorId = null, startAt = daysAgo(20), noteFor = () => null },
) {
  let t = startAt;
  for (const [fromStatus, toStatus] of chain) {
    await prisma.jobStatusEvent.create({
      data: { jobId, fromStatus, toStatus, actorId, note: noteFor(toStatus), createdAt: t },
    });
    t = hoursAfter(t, randomInt(2, 60));
  }
  return t;
}

async function writeBookingHistory(
  bookingId,
  chain,
  { actorId = null, startAt, noteFor = () => null },
) {
  let t = startAt;
  for (const [fromStatus, toStatus] of chain) {
    await prisma.bookingStatusEvent.create({
      data: { bookingId, fromStatus, toStatus, actorId, note: noteFor(toStatus), createdAt: t },
    });
    t = hoursAfter(t, randomInt(1, 24));
  }
  return t;
}

async function writeEscrowHistory(
  escrowHoldId,
  chain,
  { actorId = null, startAt, noteFor = () => null },
) {
  let t = startAt;
  for (const [fromState, toState] of chain) {
    await prisma.escrowStatusEvent.create({
      data: { escrowHoldId, fromState, toState, actorId, note: noteFor(toState), createdAt: t },
    });
    t = hoursAfter(t, randomInt(1, 24));
  }
  return t;
}

// A MediaAsset factory — every attachment in the schema is a MediaAsset FK
// rather than a raw URL column, so every photo in this seed goes through
// this one function.
async function createMedia(
  ownerId,
  kind,
  url,
  { mimeType = 'image/jpeg', visibility = 'PUBLIC', sizeBytes } = {},
) {
  return prisma.mediaAsset.create({
    data: {
      ownerId,
      kind,
      s3Key: url,
      mimeType,
      visibility,
      sizeBytes: sizeBytes ?? randomInt(80_000, 600_000),
      checksum: randomUUID().replace(/-/g, ''),
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════
// main()
// ═════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🌱 Seeding Kavio Cameroon demo database...\n');
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  // ── Phase 0: clear existing data, leaf tables first ─────────────────────
  console.log('🧹 Clearing existing data...');

  // TrustEvent and VerificationStageEvent are enforced append-only at the
  // database level (see the *_no_delete triggers in their migrations) — the
  // ledger integrity guarantee that lets a review metric trust what it reads.
  // A re-seed still needs to actually clear them, so their delete guard is
  // dropped for the duration of this reset and restored right after,
  // regardless of outcome.
  await prisma.$executeRawUnsafe('ALTER TABLE "TrustEvent" DISABLE TRIGGER "TrustEvent_no_delete"');
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "VerificationStageEvent" DISABLE TRIGGER "VerificationStageEvent_no_delete"',
  );

  try {
    await prisma.$transaction([
      prisma.locationPing.deleteMany(),
      prisma.trackingSession.deleteMany(),
      prisma.sOSAlertEvent.deleteMany(),
      prisma.sOSAlertShare.deleteMany(),
      prisma.sOSAlert.deleteMany(),
      prisma.emergencyContact.deleteMany(),
      prisma.messageAttachment.deleteMany(),
      prisma.message.deleteMany(),
      prisma.conversationParticipant.deleteMany(),
      prisma.abuseReport.deleteMany(),
      prisma.moderationAction.deleteMany(),
      prisma.conversation.deleteMany(),
      prisma.block.deleteMany(),
      prisma.reviewPhoto.deleteMany(),
      prisma.review.deleteMany(),
      prisma.disputeAttachment.deleteMany(),
      prisma.disputeMessage.deleteMany(),
      prisma.dispute.deleteMany(),
      prisma.escrowStatusEvent.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.escrowHold.deleteMany(),
      prisma.paymentMethod.deleteMany(),
      prisma.bookingStatusEvent.deleteMany(),
      prisma.booking.deleteMany(),
      prisma.quoteAttachment.deleteMany(),
      prisma.quote.deleteMany(),
      prisma.jobInvitation.deleteMany(),
      prisma.jobApplication.deleteMany(),
      prisma.jobStatusEvent.deleteMany(),
      prisma.jobPhoto.deleteMany(),
      prisma.job.deleteMany(),
      prisma.wallet.deleteMany(),
      prisma.portfolioItem.deleteMany(),
      prisma.availabilityException.deleteMany(),
      prisma.availability.deleteMany(),
      prisma.service.deleteMany(),
      prisma.businessTeamMember.deleteMany(),
      prisma.businessProfile.deleteMany(),
      prisma.clientProfile.deleteMany(),
      prisma.workerProfile.deleteMany(),
      prisma.onboardingProgress.deleteMany(),
      prisma.deviceRegistration.deleteMany(),
      prisma.notification.deleteMany(),
      prisma.notificationPreference.deleteMany(),
      prisma.notificationLog.deleteMany(),
      prisma.userBadge.deleteMany(),
      prisma.endorsement.deleteMany(),
      prisma.verificationStageEvent.deleteMany(),
      prisma.verificationDocument.deleteMany(),
      prisma.verificationRecord.deleteMany(),
      prisma.trustScore.deleteMany(),
      prisma.trustEvent.deleteMany(),
      prisma.mediaAsset.deleteMany(),
      prisma.agentInvitation.deleteMany(),
      prisma.announcement.deleteMany(),
      prisma.systemSetting.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.passwordResetToken.deleteMany(),
      prisma.refreshToken.deleteMany(),
      prisma.verificationCode.deleteMany(),
      prisma.userRole.deleteMany(),
      prisma.user.deleteMany(),
      prisma.serviceCategory.deleteMany(),
      prisma.geoRegion.deleteMany(),
      prisma.tierConfig.deleteMany(),
      prisma.faq.deleteMany(),
      prisma.testimonial.deleteMany(),
      prisma.portfolioShowcase.deleteMany(),
    ]);
  } finally {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "TrustEvent" ENABLE TRIGGER "TrustEvent_no_delete"',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "VerificationStageEvent" ENABLE TRIGGER "VerificationStageEvent_no_delete"',
    );
  }
  console.log('✅ Cleared.\n');

  // ── Phase 1: static / reference data ─────────────────────────────────────
  console.log('📦 Seeding reference data (tiers, settings, taxonomy, geography)...');

  // TierConfig — the admin-tunable gates the Trust Engine derives `tier`
  // from. Kept as data (not literals) and reused below by deriveTier() so
  // every seeded user's tier is actually consistent with these rows.
  const TIER_CONFIGS = [
    {
      tier: 'TIER_0',
      minScore: 0,
      requiredChecks: [],
      minCompletedJobs: null,
      minAverageRating: null,
      labelKey: 'tier0',
    },
    {
      tier: 'TIER_1',
      minScore: 15,
      requiredChecks: ['PHONE'],
      minCompletedJobs: null,
      minAverageRating: null,
      labelKey: 'tier1',
    },
    {
      tier: 'TIER_2',
      minScore: 30,
      requiredChecks: ['PHONE', 'ID_APPROVED'],
      minCompletedJobs: null,
      minAverageRating: null,
      labelKey: 'tier2',
    },
    {
      tier: 'TIER_3',
      minScore: 50,
      requiredChecks: ['PHONE', 'ID_APPROVED', 'FIELD_VERIFICATION'],
      minCompletedJobs: 3,
      minAverageRating: 4.0,
      labelKey: 'tier3',
    },
  ];
  for (const tc of TIER_CONFIGS) {
    await prisma.tierConfig.create({ data: tc });
  }

  /** Walks TIER_CONFIGS in order and stops at the first unmet gate — the
   * exact derivation rule described in the schema's TierConfig comment. */
  function deriveTier(ledger) {
    const total = clamp(
      ledger.IDENTITY + ledger.PROFESSIONAL + ledger.MARKETPLACE + ledger.FINANCIAL,
      0,
      100,
    );
    const avgRating = ledger.ratings.length
      ? ledger.ratings.reduce((s, r) => s + r, 0) / ledger.ratings.length
      : null;
    let achieved = 'TIER_0';
    for (const cfg of TIER_CONFIGS) {
      const scoreOk = total >= cfg.minScore;
      const checksOk = cfg.requiredChecks.every((c) => ledger.checks.has(c));
      const jobsOk = cfg.minCompletedJobs == null || ledger.completedJobs >= cfg.minCompletedJobs;
      const ratingOk =
        cfg.minAverageRating == null || (avgRating != null && avgRating >= cfg.minAverageRating);
      if (scoreOk && checksOk && jobsOk && ratingOk) achieved = cfg.tier;
      else break;
    }
    return { tier: achieved, total, avgRating };
  }

  // SystemSetting — admin-tunable switches/thresholds, never secrets.
  //
  // The KEYS must match SETTING_REGISTRY in apps/api/src/admin/admin-ops.service.ts.
  // The admin console lists the registry and joins stored rows onto it by key, so
  // a row whose key is not in the registry is simply never shown — the settings
  // screen rendered every value as "unset" while the table looked fully seeded.
  const SYSTEM_SETTINGS = [
    {
      key: 'platform.feePercent',
      value: PLATFORM_FEE_BPS / 100,
      category: 'payments',
      description: 'Platform service fee taken at escrow release, as a percentage.',
    },
    {
      key: 'platform.minPayoutXaf',
      value: 2000,
      category: 'payments',
      description: 'Smallest withdrawal a worker may request, in whole XAF.',
    },
    {
      key: 'notifications.smsEnabled',
      value: false,
      category: 'notifications',
      description: 'Master switch for the (deferred) SMS channel. OFF at launch.',
    },
    {
      key: 'notifications.digestHourUtc',
      value: 6,
      category: 'notifications',
      description: 'Hour of day, UTC, at which digest notifications are sent.',
    },
    {
      key: 'moderation.autoSuspendReportThreshold',
      value: 3,
      category: 'moderation',
      description: 'Open reports about one account before it is escalated in the risk monitor.',
    },
    {
      key: 'discovery.defaultRadiusKm',
      value: 10,
      category: 'discovery',
      description: 'Default search radius when a visitor has set no distance filter.',
    },
    {
      key: 'verification.fieldVisitRequiredTier',
      value: 'TIER_3',
      category: 'verification',
      description: 'Tier at which a physical field visit becomes mandatory.',
    },
    {
      // EMAIL, not PHONE: SMS is a paid aggregator that is not connected, so
      // email is the channel that actually delivers a code today. An operator
      // flips this the day SMS goes live, with no code change.
      key: 'verification.contactChannel',
      value: 'EMAIL',
      category: 'verification',
      description:
        'Which contact a worker must verify before their profile is public: PHONE, EMAIL, or EITHER. EMAIL while SMS is deferred.',
    },
    {
      // Free at launch. Seeded explicitly rather than left unset so the admin
      // console shows the switch, and so the job board renders "Free" from real
      // data instead of from a default nobody can see.
      key: 'jobs.postingFeeXaf',
      value: 0,
      category: 'jobs',
      description: 'Flat charge to publish a job, in whole XAF. 0 makes posting free.',
    },
  ];
  for (const s of SYSTEM_SETTINGS) {
    await prisma.systemSetting.create({ data: s });
  }

  // ServiceCategory — a two-level taxonomy: top-level trades with a few
  // specialisations under the two categories with the most listings.
  const TOP_CATEGORIES = [
    { slug: 'plumbing', nameEn: 'Plumbing', nameFr: 'Plomberie', icon: 'wrench' },
    { slug: 'electrical', nameEn: 'Electrical', nameFr: 'Électricité', icon: 'bolt' },
    { slug: 'carpentry', nameEn: 'Carpentry', nameFr: 'Menuiserie', icon: 'hammer' },
    { slug: 'painting', nameEn: 'Painting', nameFr: 'Peinture', icon: 'paint-roller' },
    { slug: 'cleaning', nameEn: 'Cleaning', nameFr: 'Nettoyage', icon: 'broom' },
    { slug: 'gardening', nameEn: 'Gardening', nameFr: 'Jardinage', icon: 'seedling' },
    { slug: 'moving', nameEn: 'Moving', nameFr: 'Déménagement', icon: 'truck' },
    { slug: 'security', nameEn: 'Security', nameFr: 'Sécurité', icon: 'shield' },
    {
      slug: 'appliance-repair',
      nameEn: 'Appliance Repair',
      nameFr: 'Réparation d\u2019Électroménager',
      icon: 'washing-machine',
    },
    { slug: 'masonry', nameEn: 'Masonry', nameFr: 'Maçonnerie', icon: 'trowel' },
    { slug: 'tiling', nameEn: 'Tiling', nameFr: 'Carrelage', icon: 'grid' },
    { slug: 'welding', nameEn: 'Welding', nameFr: 'Soudure', icon: 'flame' },
  ];
  const CHILD_CATEGORIES = [
    {
      slug: 'pipe-installation',
      nameEn: 'Pipe Installation',
      nameFr: 'Installation de Tuyauterie',
      parentSlug: 'plumbing',
    },
    {
      slug: 'leak-repair',
      nameEn: 'Leak Repair',
      nameFr: 'Réparation de Fuites',
      parentSlug: 'plumbing',
    },
    {
      slug: 'water-heater-install',
      nameEn: 'Water Heater Installation',
      nameFr: 'Installation de Chauffe-eau',
      parentSlug: 'plumbing',
    },
    {
      slug: 'house-wiring',
      nameEn: 'House Wiring',
      nameFr: 'Câblage Domestique',
      parentSlug: 'electrical',
    },
    {
      slug: 'solar-installation',
      nameEn: 'Solar Panel Installation',
      nameFr: 'Installation de Panneaux Solaires',
      parentSlug: 'electrical',
    },
  ];
  const categoryBySlug = {};
  let catSortOrder = 0;
  for (const cat of TOP_CATEGORIES) {
    const created = await prisma.serviceCategory.create({
      data: {
        slug: cat.slug,
        nameEn: cat.nameEn,
        nameFr: cat.nameFr,
        icon: cat.icon,
        descriptionEn: `Professional ${cat.nameEn.toLowerCase()} services, vetted through Kavio's tiered verification.`,
        descriptionFr: `Services professionnels de ${cat.nameFr.toLowerCase()}, vérifiés via le système de niveaux de confiance Kavio.`,
        sortOrder: catSortOrder++,
        workerCount: 0, // recomputed below once workers are attached
      },
    });
    categoryBySlug[cat.slug] = created;
  }
  for (const cat of CHILD_CATEGORIES) {
    const created = await prisma.serviceCategory.create({
      data: {
        slug: cat.slug,
        nameEn: cat.nameEn,
        nameFr: cat.nameFr,
        descriptionEn: `A specialisation within ${categoryBySlug[cat.parentSlug].nameEn}.`,
        descriptionFr: `Une spécialisation au sein de ${categoryBySlug[cat.parentSlug].nameFr}.`,
        parentId: categoryBySlug[cat.parentSlug].id,
        sortOrder: catSortOrder++,
        workerCount: 0,
      },
    });
    categoryBySlug[cat.slug] = created;
  }
  const allCategories = Object.values(categoryBySlug);
  const topCategories = TOP_CATEGORIES.map((c) => categoryBySlug[c.slug]);

  // GeoRegion — Country → Region → City → District (arrondissement) →
  // Neighbourhood (quartier), for the two launch cities.
  const geoBySlug = {};
  async function makeRegion(slug, nameEn, nameFr, level, parentSlug) {
    const created = await prisma.geoRegion.create({
      data: {
        slug,
        nameEn,
        nameFr,
        level,
        parentId: parentSlug ? geoBySlug[parentSlug].id : null,
        isActive: true,
      },
    });
    geoBySlug[slug] = created;
    return created;
  }
  await makeRegion('cameroon', 'Cameroon', 'Cameroun', 'COUNTRY', null);
  await makeRegion('littoral', 'Littoral', 'Littoral', 'REGION', 'cameroon');
  await makeRegion('centre', 'Centre', 'Centre', 'REGION', 'cameroon');
  await makeRegion('douala', 'Douala', 'Douala', 'CITY', 'littoral');
  await makeRegion('yaounde', 'Yaoundé', 'Yaoundé', 'CITY', 'centre');
  await makeRegion('douala-1', 'Douala 1er', 'Douala 1er', 'DISTRICT', 'douala');
  await makeRegion('douala-3', 'Douala 3e', 'Douala 3e', 'DISTRICT', 'douala');
  await makeRegion('douala-5', 'Douala 5e', 'Douala 5e', 'DISTRICT', 'douala');
  await makeRegion('yaounde-1', 'Yaoundé 1er', 'Yaoundé 1er', 'DISTRICT', 'yaounde');
  await makeRegion('yaounde-3', 'Yaoundé 3e', 'Yaoundé 3e', 'DISTRICT', 'yaounde');
  await makeRegion('yaounde-6', 'Yaoundé 6e', 'Yaoundé 6e', 'DISTRICT', 'yaounde');
  const NEIGHBOURHOODS = [
    ['bonanjo', 'Bonanjo', 'Bonanjo', 'douala-1'],
    ['akwa', 'Akwa', 'Akwa', 'douala-1'],
    ['makepe', 'Makepe', 'Maképé', 'douala-3'],
    ['bepanda', 'Bepanda', 'Bépanda', 'douala-3'],
    ['bonamoussadi', 'Bonamoussadi', 'Bonamoussadi', 'douala-5'],
    ['kotto', 'Kotto', 'Kotto', 'douala-5'],
    ['bastos', 'Bastos', 'Bastos', 'yaounde-1'],
    ['tsinga', 'Tsinga', 'Tsinga', 'yaounde-1'],
    ['efoulan', 'Efoulan', 'Efoulan', 'yaounde-3'],
    ['mvog-ada', 'Mvog-Ada', 'Mvog-Ada', 'yaounde-3'],
    ['nsam', 'Nsam', 'Nsam', 'yaounde-6'],
    ['odza', 'Odza', 'Odza', 'yaounde-6'],
  ];
  for (const [slug, en, fr, parent] of NEIGHBOURHOODS) {
    await makeRegion(slug, en, fr, 'NEIGHBOURHOOD', parent);
  }
  const neighbourhoods = NEIGHBOURHOODS.map(([slug]) => geoBySlug[slug]);
  // Rough real-world centroids so lat/lng at least land in the right city.
  const CITY_CENTROIDS = {
    douala: { lat: 4.05, lng: 9.7 },
    yaounde: { lat: 3.87, lng: 11.52 },
  };
  const DOUALA_QUARTIERS = new Set([
    'bonanjo',
    'akwa',
    'makepe',
    'bepanda',
    'bonamoussadi',
    'kotto',
  ]);
  const neighbourhoodCitySlug = (n) => (DOUALA_QUARTIERS.has(n.slug) ? 'douala' : 'yaounde');
  function coordsNear(neighbourhood) {
    const city = neighbourhoodCitySlug(neighbourhood);
    const centre = CITY_CENTROIDS[city];
    return {
      city: city === 'douala' ? 'Douala' : 'Yaoundé',
      latitude: centre.lat + (Math.random() - 0.5) * 0.08,
      longitude: centre.lng + (Math.random() - 0.5) * 0.08,
    };
  }
  console.log('✅ Reference data seeded.\n');

  // ── Phase 2: identities ──────────────────────────────────────────────────
  console.log('👤 Creating identities...');

  const userRoles = new Map(); // userId -> Set<Role>
  async function addRole(userId, role, isActive) {
    await prisma.userRole.create({ data: { userId, role, isActive } });
    if (!userRoles.has(userId)) userRoles.set(userId, new Set());
    userRoles.get(userId).add(role);
  }
  function hasRole(userId, role) {
    return userRoles.get(userId)?.has(role) ?? false;
  }

  /** Every identity in the system goes through this one factory, so the
   * baseline trust ledger entries (ACCOUNT_CREATED, PHONE_VERIFIED) and the
   * wallet row are never forgotten for any of the 40-odd users below. */
  async function createIdentity({
    email,
    phone,
    name,
    avatar,
    locale,
    status = 'ACTIVE',
    phoneVerifiedAt = null,
    emailVerifiedAt = NOW,
    twoFactorEnabled = false,
    createdAt = daysAgo(randomInt(10, 240)),
  }) {
    const user = await prisma.user.create({
      data: {
        email,
        phone,
        name,
        avatar,
        locale,
        status,
        passwordHash,
        phoneVerifiedAt,
        emailVerifiedAt,
        twoFactorEnabled,
        twoFactorEnabledAt: twoFactorEnabled ? createdAt : null,
        createdAt,
      },
    });
    await prisma.wallet.create({ data: { userId: user.id, availableBalance: 0 } });
    walletLedger.set(user.id, 0);
    await addTrustEvent(user.id, 'ACCOUNT_CREATED', 'IDENTITY', 15, { occurredAt: createdAt });
    if (phoneVerifiedAt) {
      markCheckPassed(user.id, 'PHONE');
      await addTrustEvent(user.id, 'PHONE_VERIFIED', 'IDENTITY', 5, {
        occurredAt: phoneVerifiedAt,
      });
      /**
       * The tier the API ENFORCES is derived from VerificationRecord rows, not
       * from User.tier. Without a PHONE record every identity derived back to
       * TIER_0 — so seeded profiles displayed "Field Verified" while the posting
       * gate refused them for an unverified phone. A phone check carries no
       * documents, hence the empty docKinds.
       */
      await createVerificationRecord(user.id, 'PHONE', {
        status: 'VERIFIED',
        stage: 'APPROVED',
        submittedAt: phoneVerifiedAt,
        docKinds: [],
      });
    }
    return user;
  }

  // — Admin —
  const admin = await createIdentity({
    email: 'admin@kavio.cm',
    phone: '+237699000001',
    name: 'Admin Kavio',
    avatar: avatarUrl(),
    locale: 'en',
    phoneVerifiedAt: daysAgo(200),
    twoFactorEnabled: true,
    createdAt: daysAgo(240),
  });
  await addRole(admin.id, 'ADMIN', true);
  console.log(`   Admin ........... ${admin.email} (password: ${DEFAULT_PASSWORD})`);

  // A consumed TWO_FACTOR code on the admin's own login, showing ACC-08 end to end.
  await prisma.verificationCode.create({
    data: {
      userId: admin.id,
      purpose: 'TWO_FACTOR',
      destination: admin.email,
      codeHash: randomUUID(),
      expiresAt: hoursAfter(daysAgo(1), 1),
      attempts: 1,
      consumedAt: daysAgo(1),
      createdAt: daysAgo(1),
    },
  });

  // — Field agents, one recruited by direct admin invitation, one already
  //   active — plus two still-open invitations for the Bafoussam/Bamenda
  //   expansion, showing AGT-01 recruiting ahead of a market launch. —
  const agents = [];
  for (const [first, city] of [
    ['Agent Douala', 'Douala'],
    ['Agent Yaoundé', 'Yaoundé'],
  ]) {
    const { name } = randomPersonName();
    const agentUser = await createIdentity({
      email: `${first.toLowerCase().replace(/\s+/g, '.')}@kavio.cm`,
      phone: uniqueCameroonPhone(),
      name,
      avatar: avatarUrl(),
      locale: pct(0.5) ? 'fr' : 'en',
      phoneVerifiedAt: daysAgo(180),
      createdAt: daysAgo(190),
    });
    await addRole(agentUser.id, 'AGENT', true);
    agents.push(agentUser);
    console.log(`   Field agent ..... ${agentUser.email} (${city}, password: ${DEFAULT_PASSWORD})`);
  }
  for (const agentUser of agents) {
    await prisma.agentInvitation.create({
      data: {
        name: agentUser.name,
        email: agentUser.email,
        phone: agentUser.phone,
        tokenHash: randomUUID(),
        status: 'ACCEPTED',
        invitedById: admin.id,
        acceptedUserId: agentUser.id,
        note: 'Founding field team, TRU-09 in-person verification.',
        expiresAt: daysAgo(150),
        acceptedAt: daysAgo(185),
        createdAt: daysAgo(190),
      },
    });
  }
  // Two pipeline invitations, still open — a growth story for the demo.
  for (const [city, note] of [
    [
      'Bafoussam',
      'Expansion team, West Region — starts after the Douala/Yaoundé launch stabilises.',
    ],
    ['Bamenda', 'North-West expansion; candidate referred by an existing field agent.'],
  ]) {
    const { name } = randomPersonName();
    await prisma.agentInvitation.create({
      data: {
        name,
        email: faker.internet.email({ firstName: name.split(' ')[0] }).toLowerCase(),
        phone: uniqueCameroonPhone(),
        tokenHash: randomUUID(),
        status: 'PENDING',
        invitedById: admin.id,
        note,
        expiresAt: daysFromNow(7),
        createdAt: daysAgo(2),
      },
    });
  }
  console.log(`   Agent invitations: ${agents.length} accepted, 2 pending (expansion)`);

  // — Verification pipeline helper, reused for every worker below —
  const suspendedUsers = new Set(); // TRU-08: confirmed-fraud identities, score overridden to 0
  async function createVerificationRecord(subjectId, checkType, opts = {}) {
    const {
      status = 'VERIFIED',
      stage = 'APPROVED',
      attempt = 1,
      reviewerId = null,
      assignedToId = null,
      rejectionReason = null,
      reason = null,
      submittedAt = daysAgo(30),
      reviewedAt = stage === 'APPROVED' || stage === 'REJECTED'
        ? hoursAfter(submittedAt, 36)
        : null,
      docKinds = ['NATIONAL_ID_FRONT', 'NATIONAL_ID_BACK'],
      metadata = null,
    } = opts;
    const record = await prisma.verificationRecord.create({
      data: {
        subjectId,
        checkType,
        status,
        stage,
        attempt,
        assignedToId,
        reviewerId,
        rejectionReason,
        reason,
        metadata,
        submittedAt,
        stageUpdatedAt: reviewedAt ?? submittedAt,
        reviewedAt,
        createdAt: submittedAt,
      },
    });
    for (const kind of docKinds) {
      const media = await createMedia(
        subjectId,
        kind,
        idDocUrl(`${subjectId}-${checkType}-${kind}-${attempt}`),
        { visibility: 'PRIVATE' },
      );
      await prisma.verificationDocument.create({
        data: { verificationRecordId: record.id, mediaAssetId: media.id },
      });
    }
    const chain = [[null, 'SUBMITTED']];
    if (stage !== 'SUBMITTED') chain.push(['SUBMITTED', 'UNDER_REVIEW']);
    if (stage === 'FIELD_CHECK') chain.push(['UNDER_REVIEW', 'FIELD_CHECK']);
    if (stage === 'APPROVED')
      chain.push(['UNDER_REVIEW', 'PENDING_APPROVAL'], ['PENDING_APPROVAL', 'APPROVED']);
    if (stage === 'REJECTED') chain.push(['UNDER_REVIEW', 'REJECTED']);
    let t = submittedAt;
    for (const [from, to] of chain) {
      const actorId = [
        'UNDER_REVIEW',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'FIELD_CHECK',
      ].includes(to)
        ? (reviewerId ?? assignedToId)
        : null;
      await prisma.verificationStageEvent.create({
        data: {
          verificationRecordId: record.id,
          fromStage: from,
          toStage: to,
          actorId,
          createdAt: t,
        },
      });
      t = hoursAfter(t, randomInt(4, 48));
    }
    return record;
  }

  // — Workers, spread across the four tiers so the demo shows the whole
  //   funnel: brand-new sign-ups, phone-only, ID-verified, and the field-
  //   verified elite. —
  const WORKER_COUNT = 22;
  const WORKER_TIER_PLAN = shuffle([
    ...Array(4).fill('TIER_0'),
    ...Array(6).fill('TIER_1'),
    ...Array(9).fill('TIER_2'),
    ...Array(3).fill('TIER_3'),
  ]);
  const TIER_AGE_DAYS = {
    TIER_0: [5, 30],
    TIER_1: [30, 100],
    TIER_2: [100, 260],
    TIER_3: [220, 420],
  };

  const workers = [];
  let fraudCaseAssigned = false;
  for (let i = 0; i < WORKER_COUNT; i++) {
    const targetTier = WORKER_TIER_PLAN[i];
    const [ageMin, ageMax] = TIER_AGE_DAYS[targetTier];
    const createdAt = daysAgo(randomInt(ageMin, ageMax));
    const { name, isMale } = randomPersonName();
    const locale = pct(0.6) ? 'fr' : 'en';
    const phoneVerified = targetTier !== 'TIER_0' || pct(0.4);

    const worker = await createIdentity({
      email: `worker${i + 1}@example.com`,
      phone: uniqueCameroonPhone(),
      name,
      avatar: avatarUrl(),
      locale,
      phoneVerifiedAt: phoneVerified ? hoursAfter(createdAt, randomInt(1, 48)) : null,
      createdAt,
    });
    await addRole(worker.id, 'WORKER', true);
    worker.tierTarget = targetTier;
    worker.locale = locale;
    worker.isMale = isMale;
    workers.push(worker);

    if (targetTier === 'TIER_0') {
      // A couple of brand-new workers have an ID submission already sitting
      // in the agent queue — the AGT-03 pipeline board, not just empty state.
      if (pct(0.5)) {
        await createVerificationRecord(worker.id, 'ID_SUBMITTED', {
          status: 'PENDING',
          stage: pct(0.5) ? 'SUBMITTED' : 'UNDER_REVIEW',
          assignedToId: randomItem(agents).id,
          submittedAt: hoursAfter(createdAt, 6),
        });
      }
      continue;
    }

    if (targetTier === 'TIER_1') {
      if (pct(0.5)) {
        await createVerificationRecord(worker.id, 'ID_SUBMITTED', {
          status: 'PENDING',
          stage: 'UNDER_REVIEW',
          assignedToId: randomItem(agents).id,
          submittedAt: hoursAfter(createdAt, 24),
        });
      }
      continue;
    }

    // TIER_2 and TIER_3 both clear ID_APPROVED.
    const reviewer = randomItem(agents);
    const isFraudCase = targetTier === 'TIER_2' && !fraudCaseAssigned && pct(0.4);
    if (isFraudCase) {
      fraudCaseAssigned = true;
      // TRU-08: a confirmed-fraudulent submission. Permanent suspension,
      // overriding whatever score the identity had accumulated.
      await createVerificationRecord(worker.id, 'ID_APPROVED', {
        status: 'REJECTED',
        stage: 'REJECTED',
        reviewerId: reviewer.id,
        rejectionReason: 'CONFIRMED_FRAUDULENT',
        reason:
          'Submitted ID does not match the national registry photo on file; a second identity was found using the same document number.',
        submittedAt: hoursAfter(createdAt, 48),
      });
      await addTrustEvent(worker.id, 'FAKE_DOCUMENTS_CONFIRMED', 'IDENTITY', -100, {
        actorId: reviewer.id,
        sourceType: 'VerificationRecord',
        occurredAt: hoursAfter(createdAt, 96),
        metadata: { reason: 'CONFIRMED_FRAUDULENT' },
      });
      suspendedUsers.add(worker.id);
      await prisma.user.update({ where: { id: worker.id }, data: { status: 'SUSPENDED' } });
      await prisma.moderationAction.create({
        data: {
          subjectUserId: worker.id,
          actorId: admin.id,
          action: 'BAN',
          targetType: null,
          targetId: null,
          reason: 'Confirmed fraudulent identity document (forged national ID).',
          internalNote:
            'Escalated by field agent review; document number reused across two accounts.',
          createdAt: hoursAfter(createdAt, 96),
        },
      });
      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'USER_SUSPENDED',
          target: worker.id,
          requestId: randomUUID(),
          meta: { reason: 'CONFIRMED_FRAUDULENT' },
          createdAt: hoursAfter(createdAt, 96),
        },
      });
      continue; // no further checks matter once suspended
    }

    // One TIER_2 worker shows a real re-submission after a rejection
    // (TRU-06 "re-upload on rejection"), everyone else clears first try.
    const showsResubmission =
      targetTier === 'TIER_2' && i === WORKER_TIER_PLAN.findIndex((t) => t === 'TIER_2');
    if (showsResubmission) {
      await createVerificationRecord(worker.id, 'ID_APPROVED', {
        status: 'REJECTED',
        stage: 'REJECTED',
        attempt: 1,
        reviewerId: reviewer.id,
        rejectionReason: 'OCR_UNREADABLE',
        reason: 'Photo of the ID was blurred; asked for a retake in better lighting.',
        submittedAt: hoursAfter(createdAt, 24),
      });
      await createVerificationRecord(worker.id, 'ID_APPROVED', {
        status: 'VERIFIED',
        stage: 'APPROVED',
        attempt: 2,
        reviewerId: reviewer.id,
        submittedAt: hoursAfter(createdAt, 72),
      });
    } else {
      await createVerificationRecord(worker.id, 'ID_APPROVED', {
        status: 'VERIFIED',
        stage: 'APPROVED',
        reviewerId: reviewer.id,
        submittedAt: hoursAfter(createdAt, 24),
      });
    }
    markCheckPassed(worker.id, 'ID_APPROVED');
    await addTrustEvent(worker.id, 'ID_VERIFIED', 'IDENTITY', 10, {
      actorId: reviewer.id,
      sourceType: 'VerificationRecord',
      occurredAt: hoursAfter(createdAt, 96),
    });

    if (targetTier === 'TIER_3') {
      const fieldAgent = randomItem(agents);
      await createVerificationRecord(worker.id, 'FIELD_VERIFICATION', {
        status: 'VERIFIED',
        stage: 'APPROVED',
        reviewerId: fieldAgent.id,
        docKinds: ['SELFIE'],
        submittedAt: hoursAfter(createdAt, 240),
        metadata: {
          gps: {
            lat: 4.05 + (Math.random() - 0.5) * 0.05,
            lng: 9.7 + (Math.random() - 0.5) * 0.05,
          },
          method: 'in-person workshop visit',
        },
      });
      markCheckPassed(worker.id, 'FIELD_VERIFICATION');
      await addTrustEvent(worker.id, 'FIELD_VERIFIED', 'PROFESSIONAL', 15, {
        actorId: fieldAgent.id,
        sourceType: 'VerificationRecord',
        occurredAt: hoursAfter(createdAt, 312),
      });
      await prisma.userBadge.create({
        data: {
          subjectId: worker.id,
          type: 'FOUNDING_PROFESSIONAL',
          sourceType: 'FieldAgentIntake',
          awardedAt: hoursAfter(createdAt, 312),
        },
      });
    }
  }
  console.log(
    `   Workers ......... ${workers.length} (tiers: ${WORKER_TIER_PLAN.filter((t) => t === 'TIER_0').length}×T0, ${WORKER_TIER_PLAN.filter((t) => t === 'TIER_1').length}×T1, ${WORKER_TIER_PLAN.filter((t) => t === 'TIER_2').length}×T2, ${WORKER_TIER_PLAN.filter((t) => t === 'TIER_3').length}×T3)`,
  );

  // — Individual clients —
  const CLIENT_COUNT = 12;
  const clients = [];
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const { name, isMale } = randomPersonName();
    const locale = pct(0.55) ? 'fr' : 'en';
    const createdAt = daysAgo(randomInt(5, 300));
    const phoneVerified = i < 10;
    const client = await createIdentity({
      email: `client${i + 1}@example.com`,
      phone: uniqueCameroonPhone(),
      name,
      avatar: avatarUrl(),
      locale,
      phoneVerifiedAt: phoneVerified ? hoursAfter(createdAt, randomInt(1, 24)) : null,
      createdAt,
    });
    await addRole(client.id, 'CLIENT', true);
    client.locale = locale;
    client.isMale = isMale;

    /**
     * Posting a job is gated at TIER_2 (MIN_POSTING_TIER in
     * apps/api/src/jobs/job-posting-gate.service.ts): PHONE *and* ID_APPROVED,
     * plus the tier's score floor. A phone number alone is NOT enough, so a
     * seed that stopped at phone verification produced a demo database in which
     * no client could publish anything — every "Post a job" ended on the
     * verification wall. The first few clients therefore clear ID review too.
     */
    if (i < 6) {
      const reviewer = randomItem(agents);
      await createVerificationRecord(client.id, 'ID_APPROVED', {
        status: 'VERIFIED',
        stage: 'APPROVED',
        reviewerId: reviewer.id,
        submittedAt: hoursAfter(createdAt, 24),
      });
      markCheckPassed(client.id, 'ID_APPROVED');
      await addTrustEvent(client.id, 'ID_VERIFIED', 'IDENTITY', 10, {
        actorId: reviewer.id,
        sourceType: 'VerificationRecord',
        occurredAt: hoursAfter(createdAt, 96),
      });
    }

    clients.push(client);
  }
  console.log(
    `   Clients ......... ${clients.length} (6 ID-verified, i.e. able to post jobs at Tier 2)`,
  );

  // — Businesses —
  const BUSINESS_NAMES = [
    { name: 'Douala Facility Services SARL', city: 'douala' },
    { name: 'Yaoundé BTP Solutions', city: 'yaounde' },
    { name: 'Bonanjo Home Care Group', city: 'douala' },
    { name: 'Akwa Bâtiment & Rénovation', city: 'douala' },
  ];
  const businesses = []; // { owner, profile }
  const teamMembers = [];
  for (let i = 0; i < BUSINESS_NAMES.length; i++) {
    const { name: bizName, city } = BUSINESS_NAMES[i];
    const { name: ownerName } = randomPersonName();
    const createdAt = daysAgo(randomInt(60, 300));
    const owner = await createIdentity({
      email: `business${i + 1}@example.com`,
      phone: uniqueCameroonPhone(),
      name: ownerName,
      avatar: avatarUrl(),
      locale: pct(0.5) ? 'fr' : 'en',
      phoneVerifiedAt: hoursAfter(createdAt, 12),
      createdAt,
    });
    await addRole(owner.id, 'BUSINESS', true);
    markCheckPassed(owner.id, 'PHONE');
    const verified = i < 2; // first two are Enhanced-Business-Verified (BIZ-01)
    let verifiedAt = null;
    if (verified) {
      verifiedAt = hoursAfter(createdAt, 24 * 14);

      /**
       * The owner's own ID, approved, IN ADDITION to the company's registration.
       * Publishing a PUBLIC vacancy requires both (see JobPostingGateService):
       * a company letterhead is not identity, so neither check substitutes for
       * the other. Without this the seeded "verified" businesses could not post
       * anything and the job board would be unreachable through the product.
       */
      await createVerificationRecord(owner.id, 'ID_APPROVED', {
        status: 'VERIFIED',
        stage: 'APPROVED',
        reviewerId: admin.id,
        submittedAt: hoursAfter(createdAt, 24 * 8),
        reviewedAt: hoursAfter(createdAt, 24 * 9),
      });
      markCheckPassed(owner.id, 'ID_APPROVED');
      await addTrustEvent(owner.id, 'ID_VERIFIED', 'IDENTITY', 10, {
        actorId: admin.id,
        sourceType: 'VerificationRecord',
        occurredAt: hoursAfter(createdAt, 24 * 9),
      });

      await createVerificationRecord(owner.id, 'BUSINESS_REGISTRATION', {
        status: 'VERIFIED',
        stage: 'APPROVED',
        reviewerId: admin.id,
        docKinds: ['BUSINESS_REGISTRATION'],
        submittedAt: hoursAfter(createdAt, 24 * 10),
        reviewedAt: verifiedAt,
      });
      markCheckPassed(owner.id, 'BUSINESS_REGISTRATION');
      await addTrustEvent(owner.id, 'ID_VERIFIED', 'IDENTITY', 10, {
        actorId: admin.id,
        sourceType: 'VerificationRecord',
        occurredAt: verifiedAt,
        metadata: { check: 'BUSINESS_REGISTRATION' },
      });
      await prisma.userBadge.create({
        data: {
          subjectId: owner.id,
          type: 'VERIFIED_BUSINESS',
          sourceType: 'BusinessVerification',
          awardedAt: verifiedAt,
        },
      });
    }
    const logo = await createMedia(owner.id, 'BUSINESS_LOGO', logoUrl(bizName), {
      visibility: 'PUBLIC',
    });
    const geo = randomItem(neighbourhoods.filter((n) => neighbourhoodCitySlug(n) === city));
    const coords = coordsNear(geo);
    const profile = await prisma.businessProfile.create({
      data: {
        ownerId: owner.id,
        name: bizName,
        description: pct(0.5)
          ? `Registered facility-management and skilled-trade company serving ${coords.city} and surrounding neighbourhoods.`
          : `Entreprise agréée de services multi-métiers et gestion de bâtiments à ${coords.city}.`,
        rccmNumber: verified
          ? `RC/${coords.city === 'Douala' ? 'DLA' : 'YAO'}/${2018 + i}/B/${randomInt(1000, 9999)}`
          : null,
        taxId: verified ? `M${randomInt(100000000, 999999999)}` : null,
        contactEmail: owner.email,
        contactPhone: owner.phone,
        city: coords.city,
        area: geo.nameEn,
        address: `${randomInt(20, 900)} Rue ${randomItem(['de la Joie', 'des Manguiers', 'Bonanjo', 'Njo-Njo', 'du Marché'])}`,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationSource: 'HUMAN_INPUT',
        verified,
        verifiedAt,
        verifiedById: verified ? admin.id : null,
        logoAssetId: logo.id,
        geoRegionId: geo.id,
        landmark: `En face de ${randomItem(['la pharmacie', 'la station Total', 'l\u2019école publique', 'le marché'])}`,
        locationUpdatedAt: createdAt,
        createdAt,
      },
    });
    businesses.push({ owner, profile, city: coords.city });

    const teamSize = randomInt(1, 3);
    for (let t = 0; t < teamSize; t++) {
      const { name: memberName } = randomPersonName();
      const status = t === 0 && i === 0 ? 'INVITED' : t === 1 && i === 1 ? 'DECLINED' : 'ACTIVE';
      const invitationSentAt = hoursAfter(createdAt, 24 * (20 + t));
      let memberUser = null;
      if (status === 'ACTIVE') {
        memberUser = await createIdentity({
          email: `team${t + 1}.biz${i + 1}@example.com`,
          phone: uniqueCameroonPhone(),
          name: memberName,
          avatar: avatarUrl(),
          locale: owner.locale ?? 'fr',
          phoneVerifiedAt: hoursAfter(invitationSentAt, 24),
          createdAt: invitationSentAt,
        });
        await addRole(memberUser.id, 'WORKER', true);
      }
      const member = await prisma.businessTeamMember.create({
        data: {
          businessProfileId: profile.id,
          userId: memberUser?.id ?? null,
          name: memberName,
          email: memberUser?.email ?? `pending.team${t + 1}.biz${i + 1}@example.com`,
          phone: memberUser?.phone ?? uniqueCameroonPhone(),
          title: randomItem(['Site Supervisor', 'Chef d\u2019équipe', 'Comptable', 'Technicien']),
          role: randomItem(['ADMIN', 'HR_MANAGER', 'ACCOUNTANT', 'STAFF']),
          accessLevel:
            status === 'ACTIVE'
              ? randomItem(['MANAGE_JOBS', 'PAYMENTS', 'VIEW_ONLY'])
              : 'VIEW_ONLY',
          status,
          invitedById: owner.id,
          invitationTokenHash: status !== 'ACTIVE' ? randomUUID() : null,
          invitationSentAt,
          invitationExpiresAt: hoursAfter(invitationSentAt, 24 * 7),
          acceptedAt: status === 'ACTIVE' ? hoursAfter(invitationSentAt, 6) : null,
          removedAt: null,
          createdAt: invitationSentAt,
        },
      });
      if (memberUser) teamMembers.push({ user: memberUser, business: profile });
    }
  }
  console.log(
    `   Businesses ...... ${businesses.length} (${businesses.filter((b) => b.profile.verified).length} Enhanced-Verified), ${teamMembers.length} active team seats`,
  );

  // — Dual-role showcase (ACC-06): two established workers also hold a
  //   CLIENT role on the same identity, and one client also works. Tier and
  //   Trust Score never re-derive on the switch — same identity, same score. —
  const dualRoleWorkers = workers
    .filter((w) => w.tierTarget === 'TIER_2' || w.tierTarget === 'TIER_3')
    .slice(0, 2);
  for (const w of dualRoleWorkers) {
    await addRole(w.id, 'CLIENT', false);
  }
  console.log(
    `   Dual-role identities: ${dualRoleWorkers.length} worker(s) also hold a CLIENT role\n`,
  );

  // ── Phase 3: auth session artifacts ──────────────────────────────────────
  console.log('🔑 Creating sessions, reset tokens and OTP history...');
  const allIdentities = [
    admin,
    ...agents,
    ...workers,
    ...clients,
    ...businesses.map((b) => b.owner),
    ...teamMembers.map((t) => t.user),
  ];

  const activeSessionUsers = sample(allIdentities, 18);
  for (const u of activeSessionUsers) {
    const familyId = randomUUID();
    await prisma.refreshToken.create({
      data: {
        userId: u.id,
        familyId,
        tokenHash: randomUUID(),
        expiresAt: daysFromNow(30),
        userAgent: randomItem([
          'Mozilla/5.0 (Linux; Android 13) Chrome/124',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)',
          'Mozilla/5.0 (Windows NT 10.0) Chrome/124',
          'Mozilla/5.0 (Macintosh) Safari/17.4',
        ]),
        createdAt: daysAgo(randomInt(0, 5)),
      },
    });
  }
  // A rotated-and-revoked family, showing reuse detection kicking in once.
  {
    const u = randomItem(clients);
    const familyId = randomUUID();
    await prisma.refreshToken.create({
      data: {
        userId: u.id,
        familyId,
        tokenHash: randomUUID(),
        expiresAt: daysAgo(20),
        rotatedAt: daysAgo(25),
        revokedAt: daysAgo(20),
        userAgent: 'Mozilla/5.0 (Linux; Android 12)',
        createdAt: daysAgo(30),
      },
    });
  }

  for (const u of sample(allIdentities, 3)) {
    await prisma.passwordResetToken.create({
      data: {
        userId: u.id,
        tokenHash: randomUUID(),
        expiresAt: daysFromNow(1),
        consumedAt: pct(0.5) ? daysAgo(2) : null,
        createdAt: daysAgo(2),
      },
    });
  }

  for (const u of sample(workers, 6)) {
    await prisma.verificationCode.create({
      data: {
        userId: u.id,
        purpose: 'PHONE_VERIFICATION',
        destination: u.phone,
        codeHash: randomUUID(),
        expiresAt: hoursAfter(u.createdAt, 1),
        attempts: randomInt(1, 2),
        consumedAt: hoursAfter(u.createdAt, 1),
        createdAt: u.createdAt,
      },
    });
  }
  console.log(
    `   Refresh sessions: ${activeSessionUsers.length + 1}, password resets: 3, OTP history: 6\n`,
  );

  // ── Phase 4: community endorsements (FR-35) ──────────────────────────────
  console.log('🤝 Creating community endorsements...');
  const ENDORSEMENT_QUOTES_EN = [
    'Rewired my whole shop before the rainy season — no more flickering lights since.',
    'Fixed a leak three other people said needed a full re-pipe. Ten minutes, done.',
    'Built our reception desk exactly to the sketch I gave him, on time.',
    'Painted the compound in a weekend without touching a single window frame.',
  ];
  const ENDORSEMENT_QUOTES_FR = [
    'A refait l\u2019électricité de ma boutique avant la saison des pluies, plus aucun problème depuis.',
    'A réparé une fuite que trois autres disaient impossible à réparer sans tout changer.',
    'A construit notre comptoir exactement selon le croquis, dans les délais.',
    'A peint toute la concession en un week-end, sans une seule tache sur les fenêtres.',
  ];
  const endorsableWorkers = sample(
    workers.filter((w) => !suspendedUsers.has(w.id)),
    6,
  );
  let endorsementCount = 0;
  for (const worker of endorsableWorkers) {
    const status = weightedPick([
      ['APPROVED', 6],
      ['PENDING', 2],
      ['REJECTED', 1],
    ]);
    const offPlatform = pct(0.4);
    const relationship = randomItem([
      'PREVIOUS_CUSTOMER',
      'WORKSHOP_OWNER',
      'QUARTER_CHIEF',
      'LANDLORD',
      'COMMUNITY_LEADER',
      'COLLEAGUE',
    ]);
    const isFr = worker.locale === 'fr';
    const quote = isFr ? randomItem(ENDORSEMENT_QUOTES_FR) : randomItem(ENDORSEMENT_QUOTES_EN);
    const author = offPlatform ? null : randomItem(clients.filter((c) => c.id !== worker.id));
    const reviewedBy = status !== 'PENDING' ? randomItem(agents) : null;
    const createdAt = daysAgo(randomInt(10, 150));
    const endorsement = await prisma.endorsement.create({
      data: {
        subjectId: worker.id,
        authorId: author?.id ?? null,
        authorName: offPlatform ? randomPersonName().name : null,
        relationship,
        quote,
        rating: randomInt(4, 5),
        status,
        reviewedById: reviewedBy?.id ?? null,
        reviewedAt: reviewedBy ? hoursAfter(createdAt, 24) : null,
        reviewNote:
          status === 'REJECTED'
            ? 'Endorser could not be reached to confirm the relationship.'
            : null,
        createdAt,
      },
    });
    endorsementCount++;
    if (status === 'APPROVED') {
      await addTrustEvent(worker.id, 'ENDORSEMENT_RECEIVED', 'PROFESSIONAL', 2, {
        actorId: reviewedBy?.id ?? null,
        sourceType: 'Endorsement',
        sourceId: endorsement.id,
        occurredAt: hoursAfter(createdAt, 24),
      });
    }
  }
  console.log(`   Endorsements .... ${endorsementCount}\n`);

  // ── Phase 5: onboarding autosave state (ACC-10) ──────────────────────────
  console.log('📝 Creating onboarding progress...');
  // The step KEYS must match apps/api/src/onboarding/onboarding.steps.ts and
  // apps/web/lib/onboarding.ts exactly. A key that exists in neither leaves the
  // wizard on a step it has no panel and no `steps.<key>.*` translation for.
  const ONBOARDING_STEPS = {
    WORKER: ['services', 'availability', 'portfolio', 'identity', 'location'],
    CLIENT: ['profile', 'location'],
    BUSINESS: ['company', 'documents', 'team'],
  };

  /**
   * The saved payload is keyed BY STEP, in the shape each step's Zod schema
   * accepts, because that is what the server reads back to decide which steps
   * are complete. A bag of step names would leave every step "unstarted" no
   * matter what completionPercent claims.
   */
  function onboardingDataFor(role, user, steps) {
    const city = randomItem(['Douala', 'Yaoundé']);
    const all = {
      services: [
        { name: 'General repairs', description: 'Callouts across the city.', startingPrice: 15000 },
      ],
      availability: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '17:00' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '17:00' },
      ],
      portfolio: [{ mediaAssetId: randomUUID(), caption: 'Recent job', type: 'PHOTO' }],
      identity: { idFrontAssetId: randomUUID(), selfieAssetId: randomUUID() },
      profile: { displayName: user.name ?? 'Kavio user' },
      company: { name: user.name ?? 'Kavio Services', city },
      documents: { registrationAssetId: randomUUID() },
      team: [{ name: 'Team member', role: 'STAFF', accessLevel: 'VIEW_ONLY' }],
      location: { city, source: 'HUMAN_INPUT' },
    };

    return Object.fromEntries(steps.filter((step) => step in all).map((step) => [step, all[step]]));
  }

  async function createOnboarding(user, role, { inProgress = false } = {}) {
    const steps = ONBOARDING_STEPS[role];
    // Stop short of the last step while in progress; otherwise finish the run.
    const stepIdx = inProgress ? randomInt(0, steps.length - 1) : steps.length - 1;
    const reached = steps.slice(0, stepIdx + 1);
    const completionPercent = inProgress ? Math.round((reached.length / steps.length) * 100) : 100;

    await prisma.onboardingProgress.create({
      data: {
        userId: user.id,
        role,
        currentStep: steps[stepIdx],
        // Only the steps actually reached carry data, so an in-progress row
        // resumes with earlier answers filled in and the rest still blank.
        data: onboardingDataFor(role, user, inProgress ? reached : steps),
        completionPercent,
        completedAt: inProgress ? null : daysAgo(randomInt(1, 30)),
      },
    });
  }
  // Each identity's onboarding row is independent of every other's, so the
  // whole batch fans out concurrently. The in-progress coin flip is decided
  // synchronously up front, before anything is awaited.
  const workerInProgressFlags = workers.map((w) => w.tierTarget === 'TIER_0' && pct(0.4));
  const inProgressCount = workerInProgressFlags.filter(Boolean).length;
  await Promise.all([
    ...workers.map((w, i) =>
      createOnboarding(w, 'WORKER', { inProgress: workerInProgressFlags[i] }),
    ),
    ...clients.map((c) => createOnboarding(c, 'CLIENT', {})),
    ...businesses.map((b) => createOnboarding(b.owner, 'BUSINESS', {})),
  ]);
  console.log(
    `   Onboarding flows: ${workers.length + clients.length + businesses.length} (${inProgressCount} still in progress — autosave demo)\n`,
  );

  // ── Phase 6: worker profiles, services, availability, portfolio ─────────
  console.log('🛠️  Building worker profiles...');
  const BIO_EN = [
    'Reliable, on-time, and honest about what a job really needs before I quote it.',
    'Trained in Douala, ten years on real sites — I bring my own tools and clean up after.',
    'I explain the problem in plain language before I fix it, so you know what you\u2019re paying for.',
    'Small jobs or big ones, same care. Ask my past clients before you ask me.',
  ];
  const BIO_FR = [
    'Sérieux, ponctuel, et honnête sur ce qu\u2019un travail demande vraiment avant de faire le devis.',
    'Formé à Douala, dix ans de chantiers réels — j\u2019apporte mes outils et je nettoie après.',
    'J\u2019explique le problème simplement avant de le réparer, pour que vous sachiez ce que vous payez.',
    'Petits ou grands travaux, même sérieux. Demandez à mes anciens clients avant de me demander à moi.',
  ];
  const LANDMARK_TEMPLATES = [
    'Derrière la pharmacie',
    'En face du carrefour',
    'À côté du marché',
    'Près de l\u2019école publique',
    'Non loin de la station Total',
  ];

  // Accumulated in memory and flushed as one batched update per category
  // after the worker loop, instead of one awaited UPDATE per service — the
  // final counts are identical, just without a round trip per increment.
  const categoryWorkerCountDelta = new Map();
  function bumpCategoryWorkerCount(categoryId) {
    categoryWorkerCountDelta.set(categoryId, (categoryWorkerCountDelta.get(categoryId) ?? 0) + 1);
  }

  const workerProfiles = new Map(); // userId -> WorkerProfile row
  const workerPortfolioCount = new Map();
  // Each worker's profile/services/availability/portfolio are independent of
  // every other worker's, so the whole pass fans out concurrently.
  await Promise.all(
    workers
      .filter((worker) => !suspendedUsers.has(worker.id)) // banned identity keeps no public profile
      .map(async (worker) => {
        const geo = randomItem(neighbourhoods);
        const coords = coordsNear(geo);
        const isFr = worker.locale === 'fr';
        const primaryCategory = randomItem(topCategories);
        const yearsExperience = randomInt(1, 22);

        let coverAssetId = null;
        if (pct(0.55)) {
          const cover = await createMedia(worker.id, 'WORKER_COVER', coverUrl(worker.id), {
            visibility: 'PUBLIC',
          });
          coverAssetId = cover.id;
        }

        const wp = await prisma.workerProfile.create({
          data: {
            userId: worker.id,
            headline: isFr
              ? `${primaryCategory.nameFr} professionnel(le)`
              : `Professional ${primaryCategory.nameEn}`,
            bio: isFr ? randomItem(BIO_FR) : randomItem(BIO_EN),
            yearsExperience,
            city: coords.city,
            area: geo.nameEn,
            latitude: coords.latitude,
            longitude: coords.longitude,
            locationSource: 'HUMAN_INPUT',
            landmark: `${randomItem(LANDMARK_TEMPLATES)} ${geo.nameFr}`,
            locationUpdatedAt: worker.createdAt,
            geoRegionId: geo.id,
            coverAssetId,
            createdAt: worker.createdAt,
          },
        });
        workerProfiles.set(worker.id, wp);

        // Services — the worker's own categories, 1-3 of them.
        const numServices = randomInt(1, 3);
        const chosenCategories = sample(allCategories, numServices);
        for (const cat of chosenCategories) {
          await prisma.service.create({
            data: {
              workerProfileId: wp.id,
              categoryId: cat.id,
              name: isFr ? `Service de ${cat.nameFr.toLowerCase()}` : `${cat.nameEn} service`,
              description: isFr
                ? `Intervention rapide et soignée en ${cat.nameFr.toLowerCase()}.`
                : `Fast, careful ${cat.nameEn.toLowerCase()} work.`,
              startingPrice: roundXaf(randomInt(3000, 25000)),
              isActive: true,
            },
          });
          bumpCategoryWorkerCount(cat.id);
        }

        // Weekly availability — 5 of 7 days.
        for (const day of sample([0, 1, 2, 3, 4, 5, 6], 5)) {
          await prisma.availability.create({
            data: {
              workerProfileId: wp.id,
              dayOfWeek: day,
              startTime: '08:00',
              endTime: pct(0.5) ? '17:00' : '18:30',
            },
          });
        }

        // Occasional one-off exceptions (public holidays), bilingual note.
        if (pct(0.15)) {
          await prisma.availabilityException.create({
            data: {
              workerProfileId: wp.id,
              date: daysFromNow(randomInt(5, 40)),
              isAvailable: false,
              note: isFr ? 'Fête du Travail — fermé' : 'Public holiday — closed',
            },
          });
        }

        // Portfolio — the top survey-validated driver of who gets hired (PRO-02).
        const numPortfolio = randomInt(
          worker.tierTarget === 'TIER_0' ? 0 : 1,
          worker.tierTarget === 'TIER_3' ? 5 : 3,
        );
        if (numPortfolio > 0) {
          const doBeforeAfter = pct(0.4);
          const groupKey = doBeforeAfter ? randomUUID() : null;
          const projectTitle = doBeforeAfter
            ? isFr
              ? 'Rénovation complète'
              : 'Full renovation'
            : null;
          for (let p = 0; p < numPortfolio; p++) {
            const media = await createMedia(
              worker.id,
              'PORTFOLIO_IMAGE',
              portfolioUrl(`${worker.id}-${p}`),
              { visibility: 'PUBLIC' },
            );
            await prisma.portfolioItem.create({
              data: {
                workerProfileId: wp.id,
                mediaAssetId: media.id,
                type: 'PHOTO',
                caption: isFr
                  ? 'Travail terminé pour un client à ' + coords.city
                  : 'Finished work for a client in ' + coords.city,
                groupKey: doBeforeAfter && p < 2 ? groupKey : null,
                projectTitle: doBeforeAfter && p < 2 ? projectTitle : null,
                slot:
                  doBeforeAfter && p === 0 ? 'BEFORE' : doBeforeAfter && p === 1 ? 'AFTER' : null,
                sortOrder: p,
              },
            });
          }
          workerPortfolioCount.set(worker.id, numPortfolio);
          markCheckPassed(worker.id, 'PORTFOLIO');
          await addTrustEvent(worker.id, 'PORTFOLIO_ADDED', 'PROFESSIONAL', 3, {
            sourceType: 'PortfolioItem',
            occurredAt: hoursAfter(worker.createdAt, 48),
          });
        }
      }),
  );

  await Promise.all(
    Array.from(categoryWorkerCountDelta.entries()).map(([categoryId, delta]) =>
      prisma.serviceCategory.update({
        where: { id: categoryId },
        data: { workerCount: { increment: delta } },
      }),
    ),
  );
  console.log(
    `   Worker profiles . ${workerProfiles.size} (services, availability, portfolio attached)\n`,
  );

  // ── Phase 7: client profiles ──────────────────────────────────────────────
  console.log('🏠 Building client profiles...');
  const clientProfiles = new Map();
  async function createClientProfile(user) {
    const geo = randomItem(neighbourhoods);
    const coords = coordsNear(geo);
    const cp = await prisma.clientProfile.create({
      data: {
        userId: user.id,
        displayName: user.name,
        city: coords.city,
        area: geo.nameEn,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationSource: 'HUMAN_INPUT',
        landmark: `${randomItem(LANDMARK_TEMPLATES)} ${geo.nameFr}`,
        locationUpdatedAt: user.createdAt,
        geoRegionId: geo.id,
        createdAt: user.createdAt,
      },
    });
    clientProfiles.set(user.id, cp);
    return cp;
  }
  await Promise.all([...clients, ...dualRoleWorkers].map((u) => createClientProfile(u)));
  console.log(`   Client profiles . ${clientProfiles.size}\n`);

  // ── Phase 8: jobs, applications, invitations, quotes, bookings, escrow,
  //    transactions and disputes — one pass per job, since each of those is
  //    a dependent step of the same job's story. ──────────────────────────
  console.log('📋 Building the jobs pipeline...');

  const bookableWorkers = workers.filter((w) => !suspendedUsers.has(w.id));
  const featuredWorkers = workers.filter((w) => w.tierTarget === 'TIER_3'); // the 3 flagship profiles
  const eligibleClientPosters = clients.slice(0, 10); // phone-verified, tier-eligible to post (JOB-01)
  const repeatClient = eligibleClientPosters[0];

  const JOB_TITLES_EN = (cat, area) => [
    `${cat.nameEn} needed in ${area}`,
    `Looking for a reliable ${cat.nameEn.toLowerCase()} professional`,
    `${cat.nameEn} job — ${area}, ${randomItem(['small fix', 'full job', 'one-off visit'])}`,
  ];
  const JOB_TITLES_FR = (cat, area) => [
    `Besoin de ${cat.nameFr.toLowerCase()} à ${area}`,
    `Recherche un(e) professionnel(le) sérieux(se) en ${cat.nameFr.toLowerCase()}`,
    `Travail de ${cat.nameFr.toLowerCase()} — ${area}`,
  ];
  function jobTitleAndDescription(cat, geo, isFr) {
    const title = randomItem(
      isFr ? JOB_TITLES_FR(cat, geo.nameFr) : JOB_TITLES_EN(cat, geo.nameEn),
    );
    const description = isFr
      ? `${faker.lorem.sentence()} Zone: ${geo.nameFr}. Merci de proposer un devis clair avant de commencer.`
      : `${faker.lorem.sentence()} Location: ${geo.nameEn}. Please share a clear quote before starting.`;
    return { title, description };
  }

  // Only a VERIFIED business may publish to the open board, so only their jobs
  // can legitimately be PUBLIC. Drawing business posters from this subset (and
  // often enough to matter) is what gives the demo a job board with something
  // on it; drawing from all four would seed public jobs their posters could not
  // have created through the product.
  const boardEligibleBusinesses = businesses.filter((b) => b.profile.verified);

  /**
   * `stillRecruiting` marks a job that is OPEN or QUOTED — one a worker could
   * still answer. Those are the jobs that belong on the public board, so they
   * are drawn from verified businesses almost always; a board with one listing
   * on it reads as broken rather than as new.
   */
  function pickPoster(stillRecruiting = false) {
    const businessChance = stillRecruiting ? 0.85 : 0.3;
    if (boardEligibleBusinesses.length > 0 && pct(businessChance)) {
      const b = randomItem(boardEligibleBusinesses);
      return {
        posterId: b.owner.id,
        businessProfileId: b.profile.id,
        posterUser: b.owner,
        isFr: b.owner.locale === 'fr',
      };
    }
    const c = randomItem(eligibleClientPosters);
    return { posterId: c.id, businessProfileId: null, posterUser: c, isFr: c.locale === 'fr' };
  }

  // Job-lifecycle transition chains, reused across the whole pipeline below.
  const CHAIN_TO_QUOTED = [
    [null, 'DRAFT'],
    ['DRAFT', 'OPEN'],
    ['OPEN', 'QUOTED'],
  ];
  const CHAIN_TO_ACCEPTED = [...CHAIN_TO_QUOTED, ['QUOTED', 'ACCEPTED']];
  const CHAIN_TO_IN_PROGRESS = [...CHAIN_TO_ACCEPTED, ['ACCEPTED', 'IN_PROGRESS']];
  const CHAIN_TO_COMPLETED = [...CHAIN_TO_IN_PROGRESS, ['IN_PROGRESS', 'COMPLETED']];
  const CHAIN_TO_RELEASED = [...CHAIN_TO_COMPLETED, ['COMPLETED', 'RELEASED']];
  const JOB_CHAINS = {
    DRAFT: [[null, 'DRAFT']],
    OPEN: [
      [null, 'DRAFT'],
      ['DRAFT', 'OPEN'],
    ],
    QUOTED: CHAIN_TO_QUOTED,
    ACCEPTED: CHAIN_TO_ACCEPTED,
    IN_PROGRESS: CHAIN_TO_IN_PROGRESS,
    COMPLETED: CHAIN_TO_COMPLETED,
    RELEASED: CHAIN_TO_RELEASED,
    DISPUTED: [...CHAIN_TO_IN_PROGRESS, ['IN_PROGRESS', 'DISPUTED']],
    CANCELLED: [...CHAIN_TO_ACCEPTED, ['ACCEPTED', 'CANCELLED']],
    REFUNDED: [...CHAIN_TO_IN_PROGRESS, ['IN_PROGRESS', 'DISPUTED'], ['DISPUTED', 'REFUNDED']],
    ARCHIVED: [
      ...CHAIN_TO_IN_PROGRESS,
      ['IN_PROGRESS', 'DISPUTED'],
      ['DISPUTED', 'RELEASED'],
      ['RELEASED', 'ARCHIVED'],
    ],
  };
  const BCHAIN_TO_PAID = [
    [null, 'PENDING_PAYMENT'],
    ['PENDING_PAYMENT', 'PAID'],
  ];
  const BCHAIN_TO_ACCEPTED = [...BCHAIN_TO_PAID, ['PAID', 'ACCEPTED']];
  const BCHAIN_TO_IN_PROGRESS = [...BCHAIN_TO_ACCEPTED, ['ACCEPTED', 'IN_PROGRESS']];
  const BCHAIN_TO_COMPLETED = [...BCHAIN_TO_IN_PROGRESS, ['IN_PROGRESS', 'COMPLETED']];
  const BCHAIN_TO_RELEASED = [...BCHAIN_TO_COMPLETED, ['COMPLETED', 'RELEASED']];
  const ECHAIN_TO_ACCEPTED = [
    [null, 'PAID'],
    ['PAID', 'ACCEPTED'],
  ];
  const ECHAIN_TO_IN_PROGRESS = [...ECHAIN_TO_ACCEPTED, ['ACCEPTED', 'IN_PROGRESS']];
  const ECHAIN_TO_COMPLETED = [...ECHAIN_TO_IN_PROGRESS, ['IN_PROGRESS', 'COMPLETED']];
  const ECHAIN_TO_RELEASED = [
    ...ECHAIN_TO_IN_PROGRESS,
    ['IN_PROGRESS', 'COMPLETED'],
    ['COMPLETED', 'RELEASED'],
  ];

  // Payment methods are created lazily, the first time a user needs one.
  const MTN_PREFIXES = new Set([
    '650',
    '651',
    '652',
    '653',
    '654',
    '655',
    '656',
    '657',
    '658',
    '659',
    '690',
    '691',
    '692',
    '693',
    '694',
    '695',
    '696',
    '697',
    '698',
    '699',
  ]);
  const paymentMethodCache = new Map();
  async function getPaymentMethod(user) {
    if (paymentMethodCache.has(user.id)) return paymentMethodCache.get(user.id);
    const prefix = user.phone.slice(4, 7);
    const isMtn = MTN_PREFIXES.has(prefix);
    const pm = await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        type: isMtn ? 'MTN_MOMO' : 'ORANGE_MONEY',
        label: `${isMtn ? 'MTN' : 'Orange'} •••• ${user.phone.slice(-4)}`,
        phone: user.phone,
        operator: isMtn ? 'MTN' : 'ORANGE',
        isDefault: true,
        isActive: true,
      },
    });
    paymentMethodCache.set(user.id, pm);
    return pm;
  }

  const REVIEW_TEXT_EN = [
    'Showed up on time and the work was clean. Would hire again.',
    'Fixed the problem faster than I expected and explained everything.',
    'Good communication throughout, fair price for the work done.',
    'Solid work. Had one small follow-up question, answered right away.',
  ];
  const REVIEW_TEXT_FR = [
    'Arrivé à l\u2019heure, travail propre. Je referai appel à lui sans hésiter.',
    'A réglé le problème plus vite que prévu et a tout expliqué clairement.',
    'Bonne communication du début à la fin, prix juste pour le travail fourni.',
    'Bon travail. Une petite question après coup, réponse rapide.',
  ];
  const allReviews = []; // { review, worker, client, job } — used later for the moderation demo

  // 32 jobs, spread across the whole lifecycle so the demo shows every
  // state a job can be in, not just the happy path.
  const JOB_STATUS_PLAN = shuffle([
    ...Array(2).fill('DRAFT'),
    ...Array(8).fill('OPEN'),
    ...Array(4).fill('QUOTED'),
    ...Array(3).fill('ACCEPTED'),
    ...Array(4).fill('IN_PROGRESS'),
    ...Array(5).fill('COMPLETED'),
    ...Array(6).fill('RELEASED'),
    'DISPUTED',
    'CANCELLED',
    'REFUNDED',
    'ARCHIVED',
  ]);

  // Guarantees the 3 flagship profiles clear the TIER_3 volume+rating gate.
  const featuredQueue = shuffle([
    ...Array(4).fill(featuredWorkers[0]),
    ...Array(3).fill(featuredWorkers[1]),
    ...Array(3).fill(featuredWorkers[2]),
  ]);
  let acceptedPendingUsed = false;
  const clientWorkerReleasedPairs = new Set();

  const jobsCreated = [];
  const applicationStatusPool = [
    'SUBMITTED',
    'UNDER_REVIEW',
    'SHORTLISTED',
    'NOT_SELECTED',
    'WITHDRAWN',
  ];

  for (let i = 0; i < JOB_STATUS_PLAN.length; i++) {
    let finalStatus = JOB_STATUS_PLAN[i];
    const needsBooking = !['DRAFT', 'OPEN', 'QUOTED'].includes(finalStatus);
    const cat = randomItem(allCategories);
    const geo = randomItem(neighbourhoods);
    const coords = coordsNear(geo);

    // Force the repeat-customer scenario onto two of featuredWorkers[0]'s jobs.
    let forcedWorker = null;
    let poster = pickPoster(['OPEN', 'QUOTED'].includes(finalStatus));
    if (
      needsBooking &&
      ['COMPLETED', 'RELEASED'].includes(finalStatus) &&
      featuredQueue[0] === featuredWorkers[0] &&
      clientWorkerReleasedPairs.has(`${repeatClient.id}:${featuredWorkers[0].id}`) === false &&
      pct(0.5)
    ) {
      poster = {
        posterId: repeatClient.id,
        businessProfileId: null,
        posterUser: repeatClient,
        isFr: repeatClient.locale === 'fr',
      };
      forcedWorker = featuredWorkers[0];
    }

    const { title, description } = jobTitleAndDescription(cat, geo, poster.isFr);
    const budgetMin = roundXaf(randomInt(5000, 40000));
    const budgetMax = budgetMin + roundXaf(randomInt(10000, 150000));
    const isTeamJob = pct(0.12);
    const publishedAt = finalStatus === 'DRAFT' ? null : daysAgo(randomInt(20, 45));
    const startAt = publishedAt ?? daysAgo(50);
    const closedAt = ['COMPLETED', 'RELEASED', 'CANCELLED', 'REFUNDED', 'ARCHIVED'].includes(
      finalStatus,
    )
      ? hoursAfter(startAt, randomInt(72, 400))
      : null;

    const job = await prisma.job.create({
      data: {
        posterId: poster.posterId,
        businessProfileId: poster.businessProfileId,
        categoryId: cat.id,
        title,
        description,
        budgetMin,
        budgetMax,
        urgency: randomItem(['FLEXIBLE', 'WITHIN_WEEK', 'WITHIN_48_HOURS', 'EMERGENCY']),
        status: finalStatus,
        /**
         * Only a verified business advertises on the open board; a client's job
         * is a DIRECT engagement with a worker they chose. Seeding every job
         * PUBLIC would show a board no client could actually have posted to,
         * and seeding every job DIRECT would leave the board empty.
         */
        visibility: finalStatus !== 'DRAFT' && poster.businessProfileId ? 'PUBLIC' : 'DIRECT',
        postingFeeXaf: 0,
        city: coords.city,
        area: geo.nameEn,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationSource: 'HUMAN_INPUT',
        landmark: `${randomItem(LANDMARK_TEMPLATES)} ${geo.nameFr}`,
        geoRegionId: geo.id,
        teamSize: isTeamJob ? randomInt(2, 5) : null,
        durationDays: isTeamJob ? randomInt(2, 10) : null,
        publishedAt,
        statusUpdatedAt: closedAt ?? startAt,
        closedAt,
        createdAt: startAt,
      },
    });

    // Job photos — most jobs have 0-2 client-supplied context photos.
    const numPhotos = randomInt(0, 2);
    for (let p = 0; p < numPhotos; p++) {
      const media = await createMedia(poster.posterId, 'JOB_PHOTO', jobPhotoUrl(`${job.id}-${p}`));
      await prisma.jobPhoto.create({
        data: { jobId: job.id, mediaAssetId: media.id, sortOrder: p },
      });
    }

    const noteMap = {
      DRAFT: () => 'Draft started',
      OPEN: () => 'Opened for quotes',
      QUOTED: () => 'Quotes received',
      ACCEPTED: () => 'Client accepted a quote',
      IN_PROGRESS: () => 'Worker started the job',
      COMPLETED: () => 'Worker marked the job done',
      RELEASED: () => 'Client confirmed; payout released',
      DISPUTED: () => 'A dispute was opened',
      CANCELLED: () => 'Cancelled before payment',
      REFUNDED: () => 'Refunded to client after dispute',
    };
    await writeJobHistory(job.id, JOB_CHAINS[finalStatus], {
      actorId: poster.posterId,
      startAt,
      noteFor: (s) => (noteMap[s] ? noteMap[s]() : null),
    });

    // Applications: every published job attracted some interest.
    let hiredWorker = null;
    let hiredApplication = null;
    let applicantPool = [];
    if (finalStatus !== 'DRAFT') {
      if (needsBooking) {
        hiredWorker =
          forcedWorker ??
          (featuredQueue.length && ['COMPLETED', 'RELEASED'].includes(finalStatus)
            ? featuredQueue.shift()
            : randomItem(bookableWorkers));
      }
      applicantPool = sample(
        bookableWorkers.filter((w) => w.id !== hiredWorker?.id),
        randomInt(1, 3),
      );
      if (hiredWorker) {
        hiredApplication = await prisma.jobApplication.create({
          data: {
            jobId: job.id,
            workerId: hiredWorker.id,
            status: 'HIRED',
            message: faker.lorem.sentence(),
            statusUpdatedAt: startAt,
            createdAt: startAt,
          },
        });
      }
      for (const w of applicantPool) {
        await prisma.jobApplication.create({
          data: {
            jobId: job.id,
            workerId: w.id,
            status: randomItem(applicationStatusPool),
            message: faker.lorem.sentence(),
            createdAt: hoursAfter(startAt, randomInt(1, 48)),
          },
        });
      }
      if (pct(0.35)) {
        const invitee = randomItem(bookableWorkers);
        await prisma.jobInvitation
          .create({
            data: {
              jobId: job.id,
              workerId: invitee.id,
              invitedById: poster.posterId,
              status:
                invitee.id === hiredWorker?.id
                  ? 'ACCEPTED'
                  : randomItem(['PENDING', 'DECLINED', 'EXPIRED']),
              message: faker.lorem.sentence(),
              expiresAt: daysFromNow(randomInt(1, 7)),
              createdAt: hoursAfter(startAt, 6),
            },
          })
          .catch(() => {}); // unique([jobId, workerId]) can collide with an application worker; harmless to skip
      }
    }

    // Quotes — QUOTED-only jobs get live offers with no acceptance yet;
    // booked jobs get the one accepted quote (sometimes after a revision).
    let acceptedQuote = null;
    if (finalStatus === 'QUOTED') {
      const quoter = randomItem(applicantPool.length ? applicantPool : bookableWorkers);
      await prisma.quote.create({
        data: {
          jobId: job.id,
          workerId: quoter.id,
          price: roundXaf(randomInt(budgetMin, budgetMax)),
          durationValue: randomInt(1, 5),
          durationUnit: randomItem(['HOUR', 'DAY', 'WEEK']),
          includes: [faker.commerce.productName(), 'Nettoyage post-travaux'],
          message: faker.lorem.sentence(),
          status: pct(0.5) ? 'VIEWED' : 'SENT',
          sentAt: hoursAfter(startAt, 4),
          viewedAt: pct(0.5) ? hoursAfter(startAt, 20) : null,
          expiresAt: daysFromNow(5),
          createdAt: hoursAfter(startAt, 4),
        },
      });
    } else if (needsBooking) {
      const showsRevision = pct(0.3);
      if (showsRevision) {
        const original = await prisma.quote.create({
          data: {
            jobId: job.id,
            workerId: hiredWorker.id,
            applicationId: hiredApplication.id,
            price: roundXaf(randomInt(budgetMin, budgetMax) + 15000),
            durationValue: randomInt(1, 5),
            durationUnit: 'DAY',
            includes: [faker.commerce.productName()],
            message: faker.lorem.sentence(),
            status: 'DECLINED',
            sentAt: hoursAfter(startAt, 4),
            viewedAt: hoursAfter(startAt, 10),
            respondedAt: hoursAfter(startAt, 14),
            counterRequestedAt: hoursAfter(startAt, 12),
            counterMessage: 'Could you come down a little on the price?',
            counterTargetPrice: roundXaf(randomInt(budgetMin, budgetMax)),
            supersededAt: hoursAfter(startAt, 16),
            declineReason: 'Revised after a counter-offer request',
            createdAt: hoursAfter(startAt, 4),
          },
        });
        acceptedQuote = await prisma.quote.create({
          data: {
            jobId: job.id,
            workerId: hiredWorker.id,
            applicationId: hiredApplication.id,
            parentQuoteId: original.id,
            price: roundXaf(randomInt(budgetMin, budgetMax)),
            durationValue: randomInt(1, 5),
            durationUnit: 'DAY',
            includes: [faker.commerce.productName(), faker.commerce.productName()],
            message: faker.lorem.sentence(),
            status: 'ACCEPTED',
            sentAt: hoursAfter(startAt, 16),
            viewedAt: hoursAfter(startAt, 18),
            respondedAt: hoursAfter(startAt, 20),
            createdAt: hoursAfter(startAt, 16),
          },
        });
      } else {
        acceptedQuote = await prisma.quote.create({
          data: {
            jobId: job.id,
            workerId: hiredWorker.id,
            applicationId: hiredApplication?.id ?? null,
            price: roundXaf(randomInt(budgetMin, budgetMax)),
            durationValue: randomInt(1, 5),
            durationUnit: randomItem(['HOUR', 'DAY', 'WEEK']),
            includes: [faker.commerce.productName(), faker.commerce.productName()],
            message: faker.lorem.sentence(),
            status: 'ACCEPTED',
            sentAt: hoursAfter(startAt, 4),
            viewedAt: hoursAfter(startAt, 8),
            respondedAt: hoursAfter(startAt, 12),
            createdAt: hoursAfter(startAt, 4),
          },
        });
      }
      if (pct(0.2)) {
        const media = await createMedia(
          hiredWorker.id,
          'QUOTE_ATTACHMENT',
          jobPhotoUrl(`quote-${acceptedQuote.id}`),
        );
        await prisma.quoteAttachment.create({
          data: { quoteId: acceptedQuote.id, mediaAssetId: media.id },
        });
      }
    }

    // Bookings, escrow, transactions, disputes and reviews — everything
    // downstream of an accepted quote.
    let booking = null;
    let escrow = null;
    if (needsBooking && acceptedQuote) {
      const agreedPrice = acceptedQuote.price;
      const feeAmount = Math.round(agreedPrice * (PLATFORM_FEE_BPS / 10000));
      const payoutAmount = agreedPrice - feeAmount;
      const client = poster.posterUser;
      const worker = hiredWorker;
      const effClosedAt = closedAt ?? hoursAfter(startAt, 240);

      let bookingStatus, bookingChain, escrowStatus, escrowChain;
      if (finalStatus === 'ACCEPTED' && !acceptedPendingUsed) {
        acceptedPendingUsed = true;
        bookingStatus = 'PENDING_PAYMENT';
        bookingChain = [[null, 'PENDING_PAYMENT']];
        escrowStatus = null;
        escrowChain = null;
      } else if (finalStatus === 'ACCEPTED') {
        bookingStatus = 'PAID';
        bookingChain = BCHAIN_TO_PAID;
        escrowStatus = 'PAID';
        escrowChain = [[null, 'PAID']];
      } else if (finalStatus === 'IN_PROGRESS') {
        bookingStatus = 'IN_PROGRESS';
        bookingChain = BCHAIN_TO_IN_PROGRESS;
        escrowStatus = 'IN_PROGRESS';
        escrowChain = ECHAIN_TO_IN_PROGRESS;
      } else if (finalStatus === 'COMPLETED') {
        bookingStatus = 'COMPLETED';
        bookingChain = BCHAIN_TO_COMPLETED;
        escrowStatus = 'COMPLETED';
        escrowChain = ECHAIN_TO_COMPLETED;
      } else if (finalStatus === 'RELEASED') {
        bookingStatus = 'RELEASED';
        bookingChain = BCHAIN_TO_RELEASED;
        escrowStatus = 'RELEASED';
        escrowChain = ECHAIN_TO_RELEASED;
      } else if (finalStatus === 'DISPUTED') {
        bookingStatus = 'DISPUTED';
        bookingChain = [...BCHAIN_TO_IN_PROGRESS, ['IN_PROGRESS', 'DISPUTED']];
        escrowStatus = 'DISPUTED';
        escrowChain = [...ECHAIN_TO_IN_PROGRESS, ['IN_PROGRESS', 'DISPUTED']];
      } else if (finalStatus === 'CANCELLED') {
        bookingStatus = 'CANCELLED';
        bookingChain = [
          [null, 'PENDING_PAYMENT'],
          ['PENDING_PAYMENT', 'CANCELLED'],
        ];
        escrowStatus = null;
        escrowChain = null;
      } else if (finalStatus === 'REFUNDED') {
        bookingStatus = 'REFUNDED';
        bookingChain = [
          ...BCHAIN_TO_IN_PROGRESS,
          ['IN_PROGRESS', 'DISPUTED'],
          ['DISPUTED', 'REFUNDED'],
        ];
        escrowStatus = 'REFUNDED';
        escrowChain = [
          ...ECHAIN_TO_IN_PROGRESS,
          ['IN_PROGRESS', 'DISPUTED'],
          ['DISPUTED', 'REFUNDED'],
        ];
      } else {
        // ARCHIVED — dispute resolved in the worker's favour, job archived afterwards
        bookingStatus = 'RELEASED';
        bookingChain = [
          ...BCHAIN_TO_IN_PROGRESS,
          ['IN_PROGRESS', 'DISPUTED'],
          ['DISPUTED', 'RELEASED'],
        ];
        escrowStatus = 'RELEASED';
        escrowChain = [
          ...ECHAIN_TO_IN_PROGRESS,
          ['IN_PROGRESS', 'DISPUTED'],
          ['DISPUTED', 'RELEASED'],
        ];
      }

      booking = await prisma.booking.create({
        data: {
          jobId: job.id,
          quoteId: acceptedQuote.id,
          workerId: worker.id,
          clientId: client.id,
          agreedPrice,
          platformFeeBps: PLATFORM_FEE_BPS,
          platformFeeAmount: feeAmount,
          workerPayoutAmount: payoutAmount,
          status: bookingStatus,
          escrowInitiatedAt: hoursAfter(startAt, 1),
          completedAt: ['COMPLETED', 'RELEASED', 'DISPUTED', 'REFUNDED', 'ARCHIVED'].includes(
            finalStatus,
          )
            ? hoursAfter(startAt, 200)
            : null,
          releasedAt: bookingStatus === 'RELEASED' ? effClosedAt : null,
          statusUpdatedAt: effClosedAt,
          createdAt: startAt,
        },
      });
      await writeBookingHistory(booking.id, bookingChain, { actorId: worker.id, startAt });

      if (escrowChain) {
        const reaches = (state) => escrowChain.some(([, to]) => to === state);
        escrow = await prisma.escrowHold.create({
          data: {
            bookingId: booking.id,
            clientId: client.id,
            workerId: worker.id,
            amount: agreedPrice,
            feeAmount,
            payoutAmount,
            state: escrowStatus,
            campayCollectionRef: `CMP-${randomUUID().slice(0, 12).toUpperCase()}`,
            paidAt: hoursAfter(startAt, 2),
            acceptedAt: reaches('ACCEPTED') ? hoursAfter(startAt, 6) : null,
            startedAt: reaches('IN_PROGRESS') ? hoursAfter(startAt, 8) : null,
            completedAt: reaches('COMPLETED') ? hoursAfter(startAt, 200) : null,
            releasedAt: reaches('RELEASED') ? effClosedAt : null,
            refundedAt: reaches('REFUNDED') ? effClosedAt : null,
            disputedAt: reaches('DISPUTED') ? hoursAfter(startAt, 210) : null,
            updatedAt: effClosedAt,
          },
        });
        await writeEscrowHistory(escrow.id, escrowChain, {
          actorId: null,
          startAt: hoursAfter(startAt, 2),
        });
      }

      // Money movement — see BALANCE_AFFECTING above for which of these
      // actually move the cached wallet balance.
      const clientPm = await getPaymentMethod(client);
      if (bookingStatus === 'PENDING_PAYMENT') {
        await addTransaction(client.id, 'PAYMENT', 'DEBIT', agreedPrice, {
          status: 'PENDING',
          bookingId: booking.id,
          paymentMethodId: clientPm.id,
          description: `Payment for job: ${job.title} (awaiting Campay confirmation)`,
          externalReference: `EXT-${randomUUID().slice(0, 10).toUpperCase()}`,
          createdAt: hoursAfter(startAt, 1),
          settledAt: null,
        });
      } else {
        await addTransaction(client.id, 'PAYMENT', 'DEBIT', agreedPrice, {
          bookingId: booking.id,
          escrowHoldId: escrow?.id ?? null,
          paymentMethodId: clientPm.id,
          description: `Payment for job: ${job.title}`,
          campayReference: `CMP-${randomUUID().slice(0, 10).toUpperCase()}`,
          createdAt: hoursAfter(startAt, 2),
          settledAt: hoursAfter(startAt, 2),
        });
      }
      if (bookingStatus === 'RELEASED') {
        const workerPm = await getPaymentMethod(worker);
        await addTransaction(worker.id, 'ESCROW_RELEASE', 'CREDIT', agreedPrice, {
          bookingId: booking.id,
          escrowHoldId: escrow.id,
          paymentMethodId: workerPm.id,
          description: `Escrow release for job: ${job.title}`,
          createdAt: effClosedAt,
          settledAt: effClosedAt,
        });
        await addTransaction(worker.id, 'FEE', 'DEBIT', feeAmount, {
          bookingId: booking.id,
          escrowHoldId: escrow.id,
          description: `Platform fee (10%) for job: ${job.title}`,
          createdAt: effClosedAt,
          settledAt: effClosedAt,
        });
      }
      if (bookingStatus === 'REFUNDED') {
        await addTransaction(client.id, 'REFUND', 'CREDIT', agreedPrice, {
          bookingId: booking.id,
          escrowHoldId: escrow.id,
          paymentMethodId: clientPm.id,
          description: `Refund for job: ${job.title}`,
          createdAt: effClosedAt,
          settledAt: effClosedAt,
        });
      }

      // Disputes.
      if (['DISPUTED', 'REFUNDED', 'ARCHIVED'].includes(finalStatus)) {
        const disputeOpener = finalStatus === 'ARCHIVED' ? worker : client; // the party who felt wronged
        const otherParty = disputeOpener.id === client.id ? worker : client;
        const disputeStatus = finalStatus === 'DISPUTED' ? 'ESCALATED' : 'RESOLVED';
        const resolution =
          finalStatus === 'REFUNDED'
            ? 'REFUND_TO_CLIENT'
            : finalStatus === 'ARCHIVED'
              ? 'RELEASE_TO_WORKER'
              : null;
        const faultParty =
          finalStatus === 'REFUNDED' ? 'WORKER' : finalStatus === 'ARCHIVED' ? 'CLIENT' : 'NONE';
        const reasonText =
          finalStatus === 'REFUNDED'
            ? poster.isFr
              ? 'Le travail n\u2019a jamais été terminé comme convenu.'
              : 'The work was never finished as agreed.'
            : finalStatus === 'ARCHIVED'
              ? poster.isFr
                ? 'Le client affirme que le travail est incomplet, alors qu\u2019il a été livré.'
                : 'Client disputed the release, claiming the work was incomplete.'
              : poster.isFr
                ? 'Désaccord sur la qualité du travail livré.'
                : 'Disagreement over the quality of the delivered work.';
        const resolutionNote =
          resolution === 'REFUND_TO_CLIENT'
            ? 'Worker could not provide evidence the job was completed; escrow returned to the client.'
            : resolution === 'RELEASE_TO_WORKER'
              ? 'Client\u2019s complaint did not hold up against the photos and the worker\u2019s account; escrow released.'
              : null;
        const dispute = await prisma.dispute.create({
          data: {
            jobId: job.id,
            bookingId: booking.id,
            escrowHoldId: escrow.id,
            openedById: disputeOpener.id,
            reason: reasonText,
            status: disputeStatus,
            resolution,
            faultParty,
            resolutionNote,
            resolvedById: resolution ? admin.id : null,
            resolvedAt: resolution ? effClosedAt : null,
            createdAt: hoursAfter(startAt, 210),
          },
        });
        await prisma.disputeMessage.create({
          data: {
            disputeId: dispute.id,
            authorId: disputeOpener.id,
            body: reasonText,
            createdAt: hoursAfter(startAt, 210),
          },
        });
        const replyMsg = await prisma.disputeMessage.create({
          data: {
            disputeId: dispute.id,
            authorId: otherParty.id,
            body: poster.isFr
              ? 'Je conteste cette version des faits — voici une photo du travail terminé.'
              : 'I disagree with this account — here is a photo of the finished work.',
            createdAt: hoursAfter(startAt, 221),
          },
        });
        const evidenceMedia = await createMedia(
          otherParty.id,
          'DISPUTE_EVIDENCE',
          jobPhotoUrl(`dispute-${dispute.id}`),
          { visibility: 'PRIVATE' },
        );
        await prisma.disputeAttachment.create({
          data: { disputeMessageId: replyMsg.id, mediaAssetId: evidenceMedia.id },
        });
        if (resolution) {
          await prisma.disputeMessage.create({
            data: {
              disputeId: dispute.id,
              authorId: admin.id,
              body: resolutionNote,
              createdAt: effClosedAt,
            },
          });
        }
        if (finalStatus === 'REFUNDED') {
          await addTrustEvent(worker.id, 'DISPUTE_UPHELD', 'MARKETPLACE', -20, {
            actorId: admin.id,
            sourceType: 'Dispute',
            sourceId: dispute.id,
            occurredAt: effClosedAt,
          });
        } else if (finalStatus === 'ARCHIVED') {
          await addTrustEvent(client.id, 'DISPUTE_LOST', 'MARKETPLACE', -10, {
            actorId: admin.id,
            sourceType: 'Dispute',
            sourceId: dispute.id,
            occurredAt: effClosedAt,
          });
        }
      }

      if (finalStatus === 'CANCELLED') {
        await addTrustEvent(worker.id, 'JOB_CANCELLED', 'MARKETPLACE', -3, {
          occurredAt: effClosedAt,
          sourceType: 'Job',
          sourceId: job.id,
        });
      }

      // Completed-job credit, for every job that genuinely finished —
      // including the ARCHIVED one, whose dispute the client lost.
      if (['COMPLETED', 'RELEASED', 'ARCHIVED'].includes(finalStatus)) {
        recordCompletedJob(worker.id);
        await addTrustEvent(worker.id, 'JOB_COMPLETED', 'MARKETPLACE', 5, {
          occurredAt: effClosedAt,
          sourceType: 'Job',
          sourceId: job.id,
        });
        if (['COMPLETED', 'RELEASED'].includes(finalStatus)) {
          const pairKey = `${client.id}:${worker.id}`;
          if (clientWorkerReleasedPairs.has(pairKey)) {
            await addTrustEvent(worker.id, 'REPEAT_CUSTOMER', 'MARKETPLACE', 5, {
              occurredAt: effClosedAt,
              sourceType: 'Job',
              sourceId: job.id,
            });
          }
          clientWorkerReleasedPairs.add(pairKey);
        }
      }

      // Reviews — only for the clean, undisputed completions (REV-02).
      if (['COMPLETED', 'RELEASED'].includes(finalStatus)) {
        const rating = featuredWorkers.includes(worker) ? randomInt(4, 5) : randomInt(3, 5);
        const review = await prisma.review.create({
          data: {
            jobId: job.id,
            bookingId: booking.id,
            authorId: client.id,
            subjectId: worker.id,
            rating,
            text: poster.isFr ? randomItem(REVIEW_TEXT_FR) : randomItem(REVIEW_TEXT_EN),
            status: 'PUBLISHED',
            createdAt: hoursAfter(effClosedAt, 24),
          },
        });
        allReviews.push({ review, worker, client, job, rating });
        if (pct(0.4)) {
          const media = await createMedia(client.id, 'REVIEW_PHOTO', reviewPhotoUrl(review.id));
          await prisma.reviewPhoto.create({
            data: { reviewId: review.id, mediaAssetId: media.id },
          });
        }
        recordRating(worker.id, rating, review.id);
        if (rating >= 4) {
          await addTrustEvent(worker.id, 'EXCELLENT_REVIEW', 'MARKETPLACE', 4, {
            sourceType: 'Review',
            sourceId: review.id,
            occurredAt: hoursAfter(effClosedAt, 24),
          });
        }
        if (pct(0.4)) {
          await prisma.review.create({
            data: {
              jobId: job.id,
              bookingId: booking.id,
              authorId: worker.id,
              subjectId: client.id,
              rating: randomInt(4, 5),
              text: poster.isFr
                ? 'Client clair et paiement rapide, sans complication.'
                : 'Clear client, paid promptly, no complications.',
              status: 'PUBLISHED',
              createdAt: hoursAfter(effClosedAt, 30),
            },
          });
        }
      }
    }

    jobsCreated.push({
      job,
      category: cat,
      geo,
      poster,
      hiredWorker,
      acceptedQuote,
      finalStatus,
      startAt,
      closedAt: closedAt ?? startAt,
      booking,
      escrow,
    });
  }
  console.log(`   Jobs ............ ${jobsCreated.length} across every lifecycle state`);
  console.log(
    `   Bookings ........ ${jobsCreated.filter((j) => j.booking).length}, of which ${jobsCreated.filter((j) => j.booking?.status === 'RELEASED').length} released`,
  );
  console.log(`   Reviews ......... ${allReviews.length}\n`);

  // ── Phase 9: finalize the Trust Engine ───────────────────────────────────
  // Every TrustEvent has already been written above, live, as each thing
  // happened. This is the one pass that turns the accumulated ledger into
  // the TrustScore snapshot, the derived tier and the milestone badges —
  // exactly the "safe to delete and rebuild by replaying TrustEvent" shape
  // the schema describes.
  console.log('🔒 Finalizing Trust Scores, tiers and badges...');

  // One grouped query instead of one `endorsement.count` per identity.
  const approvedEndorsementCounts = await prisma.endorsement.groupBy({
    by: ['subjectId'],
    where: { status: 'APPROVED' },
    _count: { _all: true },
  });
  const approvedEndorsementsBySubject = new Map(
    approvedEndorsementCounts.map((r) => [r.subjectId, r._count._all]),
  );

  // Every identity's score/tier/badges are independent of every other
  // identity's — nothing here reads another user's just-written row — so the
  // whole finalization pass fans out concurrently instead of paying one full
  // network round trip per identity, per row.
  const finalizationResults = await Promise.all(
    allIdentities.map(async (user) => {
      const ledger = ledgerFor(user.id);
      const isSuspended = suspendedUsers.has(user.id);
      const { tier, total, avgRating } = isSuspended
        ? { tier: 'TIER_0', total: 0, avgRating: null }
        : deriveTier(ledger);

      await prisma.trustScore.create({
        data: {
          subjectId: user.id,
          identityScore: clamp(ledger.IDENTITY, 0, 100),
          professionalScore: clamp(ledger.PROFESSIONAL, 0, 100),
          marketplaceScore: clamp(ledger.MARKETPLACE, 0, 100),
          financialScore: clamp(ledger.FINANCIAL, 0, 100),
          total,
          suspended: isSuspended,
          suspendedAt: isSuspended ? NOW : null,
          suspensionReason: isSuspended ? 'Confirmed fraudulent identity document (TRU-08).' : null,
          completedJobs: ledger.completedJobs,
          averageRating: avgRating != null ? Number(avgRating.toFixed(2)) : null,
          eventCount: ledger.eventCount,
          computedAt: NOW,
        },
      });
      await prisma.user.update({ where: { id: user.id }, data: { trustScore: total, tier } });

      // Milestone badges (TRU-11) — permanent once unlocked, so derived here
      // alongside the score rather than toggled with it later.
      const badgeTypes = [];
      if (ledger.checks.has('PHONE')) badgeTypes.push('IDENTITY_VERIFIED');
      if (tier === 'TIER_2' || tier === 'TIER_3') badgeTypes.push('VERIFIED_PROFESSIONAL');
      if (tier === 'TIER_3') badgeTypes.push('FIELD_VERIFIED_PROFESSIONAL');
      if (total >= 25) badgeTypes.push('TRUST_SCORE_25');
      if (total >= 50) badgeTypes.push('TRUST_SCORE_50');
      if (total >= 75) badgeTypes.push('TRUST_SCORE_75');
      if (total >= 90) badgeTypes.push('TRUST_SCORE_90');
      if (ledger.completedJobs >= 1) badgeTypes.push('FIRST_JOB');
      if (ledger.completedJobs >= 10) badgeTypes.push('JOBS_10');
      const approvedEndorsements = approvedEndorsementsBySubject.get(user.id) ?? 0;
      if (approvedEndorsements >= 5) badgeTypes.push('COMMUNITY_ENDORSED');
      await Promise.all(
        badgeTypes.map((type) =>
          prisma.userBadge.upsert({
            where: { subjectId_type: { subjectId: user.id, type } },
            update: {},
            create: {
              subjectId: user.id,
              type,
              sourceType: 'TrustEngineDerivation',
              awardedAt: NOW,
            },
          }),
        ),
      );
      return isSuspended;
    }),
  );
  const suspendedCount = finalizationResults.filter(Boolean).length;
  console.log(
    `   Trust scores .... ${allIdentities.length} identities (${suspendedCount} suspended for confirmed fraud)`,
  );
  const tierCounts = { TIER_0: 0, TIER_1: 0, TIER_2: 0, TIER_3: 0 };
  for (const w of workers) {
    const { tier } = suspendedUsers.has(w.id) ? { tier: 'TIER_0' } : deriveTier(ledgerFor(w.id));
    tierCounts[tier]++;
  }
  console.log(
    `   Derived worker tiers: T0=${tierCounts.TIER_0} T1=${tierCounts.TIER_1} T2=${tierCounts.TIER_2} T3=${tierCounts.TIER_3}\n`,
  );

  // ── Phase 10: messaging ───────────────────────────────────────────────────
  console.log('💬 Creating conversations and messages...');
  // Each job's conversation thread is independent of every other job's — the
  // running `t`/`lastMessage` closures are scoped per-thread — so the threads
  // fan out concurrently. Promise.all preserves the input array's order, so
  // conversations[1] below still refers to the same thread it always did.
  const conversations = await Promise.all(
    jobsCreated
      .filter((j) => j.hiredWorker)
      .map(async (jc) => {
        const { job, poster, hiredWorker, acceptedQuote, finalStatus, startAt } = jc;
        const posterUser = poster.posterUser;
        const isFr = poster.isFr;
        const conv = await prisma.conversation.create({
          data: { jobId: job.id, createdAt: hoursAfter(startAt, 3) },
        });
        await prisma.conversationParticipant.create({
          data: {
            conversationId: conv.id,
            userId: posterUser.id,
            role: 'MEMBER',
            createdAt: hoursAfter(startAt, 3),
          },
        });
        await prisma.conversationParticipant.create({
          data: {
            conversationId: conv.id,
            userId: hiredWorker.id,
            role: 'MEMBER',
            createdAt: hoursAfter(startAt, 3),
          },
        });
        if (finalStatus === 'DISPUTED') {
          await prisma.conversationParticipant.create({
            data: {
              conversationId: conv.id,
              userId: admin.id,
              role: 'OBSERVER',
              createdAt: hoursAfter(startAt, 215),
            },
          });
        }

        let t = hoursAfter(startAt, 3);
        let lastMessage = null;
        const send = async (sender, kind, body, metadata = null, withImage = false) => {
          const msg = await prisma.message.create({
            data: {
              conversationId: conv.id,
              senderId: sender.id,
              kind,
              body,
              metadata,
              status: 'READ',
              deliveredAt: hoursAfter(t, 0.2),
              readAt: hoursAfter(t, 0.5),
              createdAt: t,
            },
          });
          if (withImage) {
            const media = await createMedia(sender.id, 'MESSAGE_IMAGE', messageImageUrl(msg.id), {
              visibility: 'PRIVATE',
            });
            await prisma.messageAttachment.create({
              data: { messageId: msg.id, mediaAssetId: media.id },
            });
          }
          lastMessage = msg;
          t = hoursAfter(t, randomInt(1, 20));
          return msg;
        };

        await send(
          posterUser,
          'TEXT',
          isFr
            ? 'Bonjour, je suis intéressé(e) par votre devis.'
            : 'Hi, I\u2019m interested in your quote.',
        );
        if (acceptedQuote) await send(hiredWorker, 'QUOTE', null, { quoteId: acceptedQuote.id });
        await send(
          posterUser,
          'TEXT',
          isFr ? 'Ça marche, on peut commencer quand ?' : 'Sounds good — when can we start?',
        );
        await send(
          hiredWorker,
          'TEXT',
          isFr ? 'Je peux venir dès demain matin.' : 'I can come by tomorrow morning.',
        );
        if (pct(0.5))
          await send(
            posterUser,
            'IMAGE',
            isFr ? 'Voici une photo du problème.' : 'Here\u2019s a photo of the issue.',
            null,
            true,
          );
        if (['IN_PROGRESS', 'COMPLETED', 'RELEASED'].includes(finalStatus) && pct(0.5)) {
          await send(hiredWorker, 'LOCATION', null, { lat: job.latitude, lng: job.longitude });
        }
        await send(
          hiredWorker,
          'TEXT',
          isFr ? "J'arrive dans 15 minutes." : 'On my way — about 15 minutes out.',
        );
        if (['COMPLETED', 'RELEASED'].includes(finalStatus)) {
          await send(posterUser, 'TEXT', isFr ? 'Merci, super travail !' : 'Thanks, great work!');
        }
        if (finalStatus === 'DISPUTED') {
          await send(
            posterUser,
            'TEXT',
            isFr
              ? 'Je ne suis pas satisfait, il manque du travail.'
              : 'I\u2019m not satisfied — some of the work is missing.',
          );
        }
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: t,
            lastMessagePreview: (lastMessage.body ?? 'Media message').slice(0, 60),
          },
        });
        return { conv, job, posterUser, hiredWorker, finalStatus };
      }),
  );

  // A block, following a soured job (MSG-04).
  const refundedThread = conversations.find((c) => c.finalStatus === 'REFUNDED');
  if (refundedThread) {
    await prisma.block.create({
      data: {
        blockerId: refundedThread.posterUser.id,
        blockedId: refundedThread.hiredWorker.id,
        reason: 'Dispute over unfinished work.',
        createdAt: NOW,
      },
    });
  }
  console.log(`   Conversations ... ${conversations.length}, plus 1 block\n`);

  // ── Phase 11: moderation — a hidden review, a warning, and a dismissed
  //    report, so ADM-08's whole workflow (open → review → action/dismiss)
  //    is represented rather than just its happy path. ──────────────────
  console.log('🛡️  Creating abuse reports and moderation actions...');
  const goodReview = allReviews.find((r) => r.rating >= 4);
  if (goodReview) {
    const reporter = randomItem(clients.filter((c) => c.id !== goodReview.client.id));
    const reportedAt = hoursAfter(goodReview.review.createdAt, 48);
    const modAction = await prisma.moderationAction.create({
      data: {
        subjectUserId: goodReview.worker.id,
        actorId: admin.id,
        action: 'CONTENT_REMOVED',
        targetType: 'REVIEW',
        targetId: goodReview.review.id,
        reason: 'Review hidden pending an authenticity check.',
        internalNote:
          'Reporter flagged that the author and subject appear to know each other off-platform.',
        createdAt: hoursAfter(reportedAt, 24),
      },
    });
    await prisma.abuseReport.create({
      data: {
        reporterId: reporter.id,
        reportedUserId: goodReview.worker.id,
        targetType: 'REVIEW',
        targetId: goodReview.review.id,
        reason: 'MISLEADING',
        details: 'This review looks coordinated rather than a genuine client experience.',
        status: 'ACTIONED',
        reviewedById: admin.id,
        reviewNote: 'Hidden pending further verification; not yet a permanent takedown.',
        reviewedAt: hoursAfter(reportedAt, 24),
        moderationActionId: modAction.id,
        createdAt: reportedAt,
      },
    });
    await prisma.review.update({
      where: { id: goodReview.review.id },
      data: {
        status: 'HIDDEN',
        hiddenReason: 'Reported as a potentially inauthentic review; under investigation.',
        moderatedById: admin.id,
        moderatedAt: hoursAfter(reportedAt, 24),
      },
    });
    // REV-03: a hidden review stops counting — the ledger gets the
    // compensating event, and the rating comes back out of the average.
    await addTrustEvent(goodReview.worker.id, 'EXCELLENT_REVIEW_REVOKED', 'MARKETPLACE', -4, {
      actorId: admin.id,
      sourceType: 'Review',
      sourceId: goodReview.review.id,
      occurredAt: hoursAfter(reportedAt, 24),
    });
    const l = ledgerFor(goodReview.worker.id);
    l.ratings = l.ratings.filter((r) => r.reviewId !== goodReview.review.id);
  }

  // A warning for harassment in-thread, content stays up.
  if (conversations.length > 1) {
    const target = conversations[1];
    const reporter = target.posterUser;
    await prisma.moderationAction
      .create({
        data: {
          subjectUserId: target.hiredWorker.id,
          actorId: admin.id,
          action: 'WARN',
          reason: 'Unprofessional language in chat with a client.',
          internalNote: 'First offence; formal warning issued.',
          createdAt: daysAgo(10),
        },
      })
      .then(async (modAction) => {
        await prisma.abuseReport.create({
          data: {
            reporterId: reporter.id,
            reportedUserId: target.hiredWorker.id,
            targetType: 'CONVERSATION',
            targetId: target.conv.id,
            conversationId: target.conv.id,
            reason: 'HARASSMENT',
            details: 'Used inappropriate language after a pricing disagreement.',
            status: 'ACTIONED',
            reviewedById: admin.id,
            reviewNote: 'Warned; no further action needed at this time.',
            reviewedAt: daysAgo(10),
            moderationActionId: modAction.id,
            createdAt: daysAgo(11),
          },
        });
      });
  }

  // A dismissed report — reviewed, found to need nothing.
  {
    const reporter = randomItem(clients);
    const reportedUser = randomItem(
      workers.filter((w) => !suspendedUsers.has(w.id) && w.id !== reporter.id),
    );
    await prisma.abuseReport.create({
      data: {
        reporterId: reporter.id,
        reportedUserId: reportedUser.id,
        targetType: 'USER',
        targetId: reportedUser.id,
        reason: 'OTHER',
        details: 'Seemed suspicious but I can\u2019t point to anything specific.',
        status: 'DISMISSED',
        reviewedById: admin.id,
        reviewNote: 'No policy violation found.',
        reviewedAt: daysAgo(3),
        createdAt: daysAgo(4),
      },
    });
  }
  console.log('   Moderation cases: 1 review hidden, 1 warning, 1 dismissed report\n');

  // ── Phase 12: Safety & SOS ──────────────────────────────────────────────
  console.log('🚨 Creating SOS alerts and emergency contacts...');

  const sosUsers = sample(
    allIdentities.filter((u) => !suspendedUsers.has(u.id)),
    6,
  );
  for (const user of sosUsers) {
    // Each user has 1-3 emergency contacts
    const numContacts = randomInt(1, 3);
    const contactRows = [];
    for (let i = 0; i < numContacts; i++) {
      const { name } = randomPersonName();
      contactRows.push({
        userId: user.id,
        name,
        phone: uniqueCameroonPhone(),
        relationship: randomItem([
          'Brother',
          'Sister',
          'Spouse',
          'Friend',
          'Colleague',
          'Landlord',
        ]),
        email: faker.internet.email({ firstName: name.split(' ')[0] }).toLowerCase(),
        isActive: true,
        createdAt: daysAgo(randomInt(10, 200)),
      });
    }
    await prisma.emergencyContact.createMany({ data: contactRows });

    // Half of them have triggered at least one SOS alert
    if (pct(0.5)) {
      const alertStatus = randomEnum(['ACTIVE', 'RESOLVED', 'FALSE_ALARM']);
      const alertCreatedAt = daysAgo(randomInt(0, 60));
      const resolvedAt =
        alertStatus === 'ACTIVE' ? null : hoursAfter(alertCreatedAt, randomInt(2, 48));

      // Pick a job/booking if they have any
      const userJobs = jobsCreated.filter(
        (j) => j.poster.posterId === user.id || j.hiredWorker?.id === user.id,
      );
      const jobRef = userJobs.length ? randomItem(userJobs) : null;

      const alert = await prisma.sOSAlert.create({
        data: {
          userId: user.id,
          status: alertStatus,
          latitude: (userJobs.length ? jobRef.job.latitude : 4.05) + (Math.random() - 0.5) * 0.05,
          longitude: (userJobs.length ? jobRef.job.longitude : 9.7) + (Math.random() - 0.5) * 0.05,
          accuracy: randomInt(10, 80),
          message: randomItem([
            'I feel unsafe and need help.',
            'Being followed – please check in.',
            'Emergency at work site – need assistance.',
            'Medical emergency – please send help.',
          ]),
          jobId: jobRef?.job.id ?? null,
          bookingId: jobRef?.booking?.id ?? null,
          resolvedById: alertStatus !== 'ACTIVE' ? randomItem([admin, ...agents]).id : null,
          resolvedAt: resolvedAt,
          resolutionNote:
            alertStatus === 'RESOLVED'
              ? 'Contact reached, situation resolved.'
              : alertStatus === 'FALSE_ALARM'
                ? 'Triggered by mistake – user confirmed safe.'
                : null,
          createdAt: alertCreatedAt,
          updatedAt: alertCreatedAt,
        },
      });

      // Shares to contacts
      const contacts = await prisma.emergencyContact.findMany({ where: { userId: user.id } });
      if (contacts.length > 0) {
        for (const contact of sample(contacts, randomInt(1, contacts.length + 1))) {
          await prisma.sOSAlertShare.create({
            data: {
              sosAlertId: alert.id,
              emergencyContactId: contact.id,
              channel: randomItem(['email', 'sms', 'console']),
              delivered: pct(0.8),
              error: pct(0.1) ? 'Phone unreachable' : null,
              sentAt: hoursAfter(alertCreatedAt, randomInt(0, 3)),
              createdAt: alertCreatedAt,
            },
          });
        }
      }
      // Log status events
      const statusChain = [[null, alertStatus]];
      if (alertStatus === 'RESOLVED') statusChain.push(['ACTIVE', 'RESOLVED']);
      if (alertStatus === 'FALSE_ALARM') statusChain.push(['ACTIVE', 'FALSE_ALARM']);
      let t = alertCreatedAt;
      for (const [from, to] of statusChain) {
        await prisma.sOSAlertEvent.create({
          data: {
            sosAlertId: alert.id,
            fromStatus: from,
            toStatus: to,
            actorId: to !== 'ACTIVE' ? (alert.resolvedById ?? null) : null,
            note:
              to === 'RESOLVED'
                ? 'Safety team resolved'
                : to === 'FALSE_ALARM'
                  ? 'User confirmed safe – false alarm'
                  : null,
            createdAt: t,
          },
        });
        t = hoursAfter(t, randomInt(1, 6));
      }
    }
  }
  console.log(
    `   SOS alerts ...... ${await prisma.sOSAlert.count()} (${await prisma.emergencyContact.count()} contacts)`,
  );

  // ── Phase 13: Live tracking ──────────────────────────────────────────────
  console.log('📍 Creating tracking sessions...');

  const trackableBookings = jobsCreated
    .filter((j) => j.booking && ['IN_PROGRESS', 'COMPLETED', 'RELEASED'].includes(j.finalStatus))
    .slice(0, 4);

  for (const jc of trackableBookings) {
    const { booking, hiredWorker, poster } = jc;
    const session = await prisma.trackingSession.create({
      data: {
        bookingId: booking.id,
        subjectId: hiredWorker.id,
        viewerId: poster.posterId,
        status: jc.finalStatus === 'RELEASED' ? 'ENDED' : 'ACTIVE',
        destinationLat: jc.job.latitude + (Math.random() - 0.5) * 0.005,
        destinationLng: jc.job.longitude + (Math.random() - 0.5) * 0.005,
        consentGrantedAt: hoursAfter(jc.startAt, 10),
        consentRevokedAt: pct(0.2) ? hoursAfter(jc.startAt, 180) : null,
        startedAt: hoursAfter(jc.startAt, 12),
        endedAt: jc.finalStatus === 'RELEASED' ? jc.closedAt : null,
        createdAt: jc.startAt,
        updatedAt: jc.closedAt ?? jc.startAt,
      },
    });

    // A handful of pings (the subject's position over time)
    const numPings = randomInt(5, 15);
    const pingRows = [];
    for (let i = 0; i < numPings; i++) {
      pingRows.push({
        sessionId: session.id,
        userId: hiredWorker.id,
        latitude: jc.job.latitude + (Math.random() - 0.5) * 0.02,
        longitude: jc.job.longitude + (Math.random() - 0.5) * 0.02,
        accuracy: randomInt(10, 50),
        heading: randomInt(0, 360),
        speed: randomInt(0, 60),
        recordedAt: hoursAfter(session.startedAt, i * 3 + randomInt(0, 10)),
        createdAt: hoursAfter(session.startedAt, i * 3 + randomInt(0, 10)),
      });
    }
    await prisma.locationPing.createMany({ data: pingRows });
  }
  console.log(
    `   Tracking sessions: ${await prisma.trackingSession.count()}, pings: ${await prisma.locationPing.count()}`,
  );

  // ── Phase 14: Notifications ──────────────────────────────────────────────
  console.log('🔔 Creating notifications and preferences...');

  // Seed preferences for all users (upsert to avoid duplicates)
  const channels = ['EMAIL', 'WEB_PUSH', 'IN_APP'];
  const categories = [
    'SECURITY',
    'ACCOUNT',
    'JOBS',
    'QUOTES',
    'MESSAGES',
    'PAYMENTS',
    'TRUST',
    'REVIEWS',
    'DISPUTES',
    'SAFETY',
    'MARKETING',
  ];
  // Phase 0 always clears NotificationPreference first, so every (user, channel,
  // category) triple below is guaranteed unique — a single batched insert is
  // equivalent to the one-row-at-a-time upsert this replaced, just without
  // ~1,500 sequential network round trips.
  const preferenceRows = [];
  for (const user of allIdentities) {
    for (const channel of channels) {
      for (const category of categories) {
        preferenceRows.push({
          userId: user.id,
          channel,
          category,
          enabled: pct(0.75),
          createdAt: user.createdAt,
        });
      }
    }
  }
  await prisma.notificationPreference.createMany({ data: preferenceRows, skipDuplicates: true });

  // In-app notifications for every user (0-8 each)
  const notificationTemplates = [
    {
      category: 'JOBS',
      title: 'New job posted in your area',
      body: 'A new job matching your skills is available.',
    },
    { category: 'QUOTES', title: 'Your quote was viewed', body: 'A client has viewed your quote.' },
    {
      category: 'MESSAGES',
      title: 'New message from client',
      body: 'You have a new message in your inbox.',
    },
    {
      category: 'PAYMENTS',
      title: 'Payment received',
      body: 'Your escrow payment has been released.',
    },
    {
      category: 'TRUST',
      title: 'Trust Score updated',
      body: 'Your Trust Score has changed based on recent activity.',
    },
    {
      category: 'REVIEWS',
      title: 'New review',
      body: 'A client left a review for your recent job.',
    },
    {
      category: 'DISPUTES',
      title: 'Dispute updated',
      body: 'A dispute you are involved in has been updated.',
    },
    { category: 'SAFETY', title: 'SOS alert resolved', body: 'Your SOS alert has been resolved.' },
  ];

  const notificationRows = [];
  for (const user of sample(allIdentities, 18)) {
    const numNotifs = randomInt(0, 6);
    const usedTemplates = sample(
      notificationTemplates,
      Math.min(numNotifs, notificationTemplates.length),
    );
    for (const tmpl of usedTemplates) {
      const createdAt = daysAgo(randomInt(0, 30));
      const readAt = pct(0.6) ? hoursAfter(createdAt, randomInt(1, 48)) : null;
      notificationRows.push({
        userId: user.id,
        category: tmpl.category,
        templateKey: `${tmpl.category.toLowerCase()}_notification`,
        title: tmpl.title,
        body: tmpl.body,
        url: '/dashboard',
        important: ['PAYMENTS', 'TRUST', 'DISPUTES', 'SECURITY'].includes(tmpl.category),
        readAt,
        metadata: { randomSeed: randomUUID() },
        createdAt,
      });
    }
  }
  await prisma.notification.createMany({ data: notificationRows });
  console.log(
    `   Notifications ... ${await prisma.notification.count()} (preferences for ${allIdentities.length} users)`,
  );

  // ── Phase 15: Device registrations ──────────────────────────────────────
  console.log('📱 Creating device registrations...');

  const deviceUsers = sample(allIdentities, 10);
  const deviceRows = [];
  for (const user of deviceUsers) {
    const numDevices = randomInt(1, 2);
    for (let d = 0; d < numDevices; d++) {
      deviceRows.push({
        userId: user.id,
        platform: 'WEB',
        endpoint: `https://example.com/push/${randomUUID()}`,
        p256dh: faker.string.alphanumeric(20),
        auth: faker.string.alphanumeric(20),
        deviceName: randomItem([
          'Chrome on Mac',
          'Firefox on Windows',
          'Safari on iPhone',
          'Edge on Windows',
          'Chrome on Android',
        ]),
        isActive: pct(0.85),
        lastSeenAt: daysAgo(randomInt(0, 5)),
        createdAt: daysAgo(randomInt(10, 100)),
        updatedAt: new Date(),
      });
    }
  }
  await prisma.deviceRegistration.createMany({ data: deviceRows });
  console.log(`   Device registrations: ${await prisma.deviceRegistration.count()}`);

  // ── Phase 16: Admin content ──────────────────────────────────────────────
  console.log('📢 Creating announcements, FAQ, testimonials...');

  const announcements = [
    {
      titleEn: 'Welcome to Kavio Cameroon!',
      titleFr: 'Bienvenue sur Kavio Cameroun!',
      bodyEn:
        'We are excited to launch the platform connecting trusted professionals with clients.',
      bodyFr:
        'Nous sommes ravis de lancer la plateforme connectant les professionnels de confiance avec les clients.',
      audience: 'ALL',
      status: 'PUBLISHED',
      publishedAt: daysAgo(30),
      authorId: admin.id,
      createdAt: daysAgo(30),
      updatedAt: daysAgo(30),
    },
    {
      titleEn: 'New Safety Feature: SOS Alerts',
      titleFr: 'Nouvelle fonctionnalité de sécurité: Alertes SOS',
      bodyEn: 'You can now trigger an SOS alert to notify your emergency contacts.',
      bodyFr:
        "Vous pouvez maintenant déclencher une alerte SOS pour informer vos contacts d'urgence.",
      audience: 'ALL',
      status: 'PUBLISHED',
      publishedAt: daysAgo(15),
      authorId: admin.id,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(15),
    },
    {
      titleEn: 'Verification Drive in Douala',
      titleFr: 'Campagne de vérification à Douala',
      bodyEn: 'Field agents will be available in Akwa and Bonapriso next week.',
      bodyFr: 'Des agents de terrain seront disponibles à Akwa et Bonapriso la semaine prochaine.',
      audience: 'WORKERS',
      status: 'PUBLISHED',
      publishedAt: daysAgo(7),
      authorId: admin.id,
      createdAt: daysAgo(7),
      updatedAt: daysAgo(7),
    },
  ];
  for (const ann of announcements) {
    await prisma.announcement.create({ data: ann });
  }

  // The real launch FAQ and testimonial copy lives in data/marketing-content.json
  // (PROMPT 92.1; SRS §26.2) rather than inline here, so marketing and
  // engineering edit one shared file instead of two drifting copies. Upserted
  // by the fixed `id` each row carries, matching that file's own idempotency
  // contract: a re-run of this seed edits the row it wrote last time instead
  // of piling up near-duplicates.
  for (const [index, faq] of marketingContent.faqs.entries()) {
    await prisma.faq.upsert({
      where: { id: faq.id },
      create: {
        id: faq.id,
        questionEn: faq.questionEn,
        questionFr: faq.questionFr,
        answerEn: faq.answerEn,
        answerFr: faq.answerFr,
        category: faq.category ?? null,
        order: index + 1,
        isPublished: true,
        createdAt: daysAgo(60),
        updatedAt: daysAgo(60),
      },
      update: {
        questionEn: faq.questionEn,
        questionFr: faq.questionFr,
        answerEn: faq.answerEn,
        answerFr: faq.answerFr,
        category: faq.category ?? null,
        order: index + 1,
        updatedAt: daysAgo(60),
      },
    });
  }

  for (const [index, t] of marketingContent.testimonials.entries()) {
    await prisma.testimonial.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        author: t.author,
        roleEn: t.roleEn,
        roleFr: t.roleFr,
        avatarUrl: avatarUrl(),
        contentEn: t.contentEn,
        contentFr: t.contentFr,
        rating: t.rating,
        order: index + 1,
        visible: true,
        createdAt: daysAgo(45),
        updatedAt: daysAgo(45),
      },
      update: {
        author: t.author,
        roleEn: t.roleEn,
        roleFr: t.roleFr,
        contentEn: t.contentEn,
        contentFr: t.contentFr,
        rating: t.rating,
        order: index + 1,
        updatedAt: daysAgo(45),
      },
    });
  }

  // Same copy the landing page previously hardcoded, now admin-editable rows.
  // Local SVG placeholders (root-relative, resolved against the web app's own
  // origin) rather than a live third-party host — an admin swaps in real
  // photos through /app/admin/marketing whenever they're ready.
  const portfolioItems = [
    {
      tradeEn: 'Electrician',
      tradeFr: 'Électricien',
      captionEn: 'Panel rewire, Bonapriso',
      captionFr: 'Réfection du tableau, Bonapriso',
      beforeUrl:
        'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=640&h=480&fit=crop',
      afterUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640&h=480&fit=crop',
      order: 0,
      isPublished: true,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(60),
    },
    {
      tradeEn: 'Plumber',
      tradeFr: 'Plombier',
      captionEn: 'Bathroom refit, Bastos',
      captionFr: 'Rénovation salle de bain, Bastos',
      beforeUrl:
        'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=640&h=480&fit=crop',
      afterUrl: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=640&h=480&fit=crop',
      order: 1,
      isPublished: true,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(60),
    },
    {
      tradeEn: 'Painter',
      tradeFr: 'Peintre',
      captionEn: 'Full repaint, Akwa',
      captionFr: 'Repeinte complète, Akwa',
      beforeUrl: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=640&h=480&fit=crop',
      afterUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=640&h=480&fit=crop',
      order: 2,
      isPublished: true,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(60),
    },
    {
      tradeEn: 'Welder',
      tradeFr: 'Soudeur',
      captionEn: 'Security gate, Bonabéri',
      captionFr: 'Portail de sécurité, Bonabéri',
      beforeUrl:
        'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=640&h=480&fit=crop',
      afterUrl: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=640&h=480&fit=crop',
      order: 3,
      isPublished: true,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(60),
    },
  ];
  for (const item of portfolioItems) {
    await prisma.portfolioShowcase.create({ data: item });
  }

  console.log(
    `   Admin content .. ${announcements.length} announcements, ${faqs.length} FAQs, ${testimonials.length} testimonials, ${portfolioItems.length} portfolio items`,
  );

  // ── Phase 17: Finalize wallet balances ────────────────────────────────────
  console.log('💰 Finalizing wallet balances...');
  for (const [userId, balance] of walletLedger) {
    await prisma.wallet.update({
      where: { userId },
      data: { availableBalance: Math.max(0, balance) },
    });
  }
  console.log(`   Wallets updated for ${walletLedger.size} users`);

  // ── Phase 18: Additional audit logs ──────────────────────────────────────
  console.log('📜 Creating additional audit logs...');
  const auditActions = [
    'JOB_POSTED',
    'QUOTE_ACCEPTED',
    'ESCROW_RELEASED',
    'DISPUTE_RESOLVED',
    'PROFILE_UPDATED',
    'PASSWORD_CHANGED',
  ];
  for (let i = 0; i < 30; i++) {
    const actor = randomItem(allIdentities);
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: randomItem(auditActions),
        target: actor.id,
        requestId: randomUUID(),
        meta: { ip: faker.internet.ip(), userAgent: faker.internet.userAgent() },
        createdAt: daysAgo(randomInt(0, 60)),
      },
    });
  }
  console.log(`   Audit logs ..... ${await prisma.auditLog.count()}`);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n✅ Seeding complete!');

  // ── Final summary ──────────────────────────────────────────────────────
  console.log('\n📊 SEED SUMMARY 📊');
  const totalUsers = await prisma.user.count();
  const totalWorkers = await prisma.user.count({ where: { roles: { some: { role: 'WORKER' } } } });
  const totalClients = await prisma.user.count({ where: { roles: { some: { role: 'CLIENT' } } } });
  const totalBusinesses = await prisma.user.count({
    where: { roles: { some: { role: 'BUSINESS' } } },
  });
  const totalJobs = await prisma.job.count();
  const totalBookings = await prisma.booking.count();
  const totalReviews = await prisma.review.count();
  const totalMessages = await prisma.message.count();
  const totalTransactions = await prisma.transaction.count();
  console.log(
    `👤 Users: ${totalUsers} (Workers: ${totalWorkers}, Clients: ${totalClients}, Businesses: ${totalBusinesses})`,
  );
  console.log(`📋 Jobs: ${totalJobs}`);
  console.log(`📦 Bookings: ${totalBookings}`);
  console.log(`⭐ Reviews: ${totalReviews}`);
  console.log(`💬 Messages: ${totalMessages}`);
  console.log(`💰 Transactions: ${totalTransactions}`);
  console.log(`🔔 Notifications: ${await prisma.notification.count()}`);
  console.log(`📍 Tracking Sessions: ${await prisma.trackingSession.count()}`);
  console.log(`🚨 SOS Alerts: ${await prisma.sOSAlert.count()}`);
  console.log(`🏷️ Badges awarded: ${await prisma.userBadge.count()}`);
  console.log(`📢 Announcements: ${await prisma.announcement.count()}`);
  console.log(`📖 FAQ: ${await prisma.faq.count()}`);
  console.log(`📝 Testimonials: ${await prisma.testimonial.count()}`);
  console.log(`🖼️  Portfolio showcase: ${await prisma.portfolioShowcase.count()}`);
  console.log(`📜 Audit Logs: ${await prisma.auditLog.count()}`);
  console.log(`🔑 Refresh Tokens: ${await prisma.refreshToken.count()}`);
  console.log(`🔐 Password Reset Tokens: ${await prisma.passwordResetToken.count()}`);
  console.log(`📨 Agent Invitations: ${await prisma.agentInvitation.count()}`);
  console.log(`\n🔑 Default password for all seeded users: ${DEFAULT_PASSWORD}`);
  console.log('🎉 Demo database is ready!');
}

// ── Entry point ──────────────────────────────────────────────────────────
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
