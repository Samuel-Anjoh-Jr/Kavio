import { gql } from '@apollo/client';
import type { VerificationTier } from '@/lib/trust';

/**
 * Discovery READS (DUAL API RULE: every read is GraphQL; writes are REST).
 *
 * A peer module to documents.ts rather than more lines inside it: discovery is
 * the largest read surface in the product — search, filters, geography, and two
 * full profile graphs — and folding it into the shared file would leave one
 * module nobody can scan.
 *
 * Every query here is PUBLIC on the API by design (ACC-01). A guest searches,
 * browses and opens a full profile with no account; the login wall stands at the
 * ACTION, not the read.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomy (DIS-05)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The admin-configured taxonomy. Search is scoped to these, so the category
 * chips render the real categories rather than a hardcoded list that drifts out
 * of sync with what admins actually configured.
 */
export const SERVICE_CATEGORIES_QUERY = gql`
  query ServiceCategories($topLevelOnly: Boolean) {
    serviceCategories(topLevelOnly: $topLevelOnly) {
      id
      slug
      nameEn
      nameFr
      icon
      parentId
      workerCount
    }
  }
`;

export interface ServiceCategorySummary {
  id: string;
  slug: string;
  nameEn: string;
  nameFr: string;
  icon: string | null;
  parentId: string | null;
  workerCount: number;
}

export interface ServiceCategoriesQueryResult {
  serviceCategories: ServiceCategorySummary[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Search (DIS-04…DIS-08)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fuzzy, taxonomy-scoped worker search.
 *
 * `noProviders` is selected on every call and is never optional: the difference
 * between "nobody matched your filters" and "no plumber works in this area yet"
 * is the difference between a dead end and a reason to come back (DIS-06), and
 * an empty `workers` array alone cannot tell the two apart.
 */
export const SEARCH_WORKERS_QUERY = gql`
  query SearchWorkers(
    $query: String
    $latitude: Float
    $longitude: Float
    $radiusM: Int
    $categorySlug: String
    $minPrice: Int
    $maxPrice: Int
    $minTrustScore: Int
    $minTier: VerificationTier
    $minRating: Float
    $verifiedOnly: Boolean
    $availableDay: Int
    $availableTime: String
    $availableDate: String
    $sort: String
    $limit: Int
    $offset: Int
    $viewerSeed: String
  ) {
    searchWorkers(
      query: $query
      latitude: $latitude
      longitude: $longitude
      radiusM: $radiusM
      categorySlug: $categorySlug
      minPrice: $minPrice
      maxPrice: $maxPrice
      minTrustScore: $minTrustScore
      minTier: $minTier
      minRating: $minRating
      verifiedOnly: $verifiedOnly
      availableDay: $availableDay
      availableTime: $availableTime
      availableDate: $availableDate
      sort: $sort
      limit: $limit
      offset: $offset
      viewerSeed: $viewerSeed
    ) {
      workers {
        workerProfileId
        userId
        name
        avatar
        headline
        city
        area
        tier
        trustScore
        completedJobs
        averageRating
        latitude
        longitude
        distanceM
        matchedServiceName
        matchedServiceCount
        priceFrom
      }
      totalCount
      radiusM
      limit
      offset
      hasMore
      appliedFilterCount
      noProviders {
        reason
        suggestedRadiusM
        nearestProviderM
      }
    }
  }
`;

export interface SearchWorkerResult {
  workerProfileId: string;
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  area: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  averageRating: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceM: number | null;
  matchedServiceName: string | null;
  matchedServiceCount: number;
  priceFrom: number | null;
}

export interface NoProviderSignal {
  /** NONE when results were found; otherwise a coded reason the UI localises. */
  reason: string;
  /** A radius that would return results. Null means widening will not help. */
  suggestedRadiusM: number | null;
  nearestProviderM: number | null;
}

export interface SearchWorkersQueryResult {
  searchWorkers: {
    workers: SearchWorkerResult[];
    totalCount: number;
    radiusM: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    appliedFilterCount: number;
    noProviders: NoProviderSignal;
  };
}

/**
 * Filter bounds derived from live listings (DIS-07).
 *
 * Every slider and chip reads from here rather than a hardcoded range, so the
 * price filter offers prices that exist and the rating filter hides itself in an
 * area where nobody has been rated yet — a control that can only ever return
 * nothing is worse than no control at all.
 */
export const SEARCH_FILTER_RANGES_QUERY = gql`
  query SearchFilterRanges($latitude: Float, $longitude: Float, $radiusM: Int, $categoryId: ID) {
    searchFilterRanges(
      latitude: $latitude
      longitude: $longitude
      radiusM: $radiusM
      categoryId: $categoryId
    ) {
      price {
        min
        max
        p25
        p75
        pricedServiceCount
      }
      trustScoreMin
      trustScoreMax
      ratingMin
      ratingMax
      ratedWorkerCount
      verifiedWorkerCount
      workerCount
      farthestMatchM
      responseTimeAvailable
      categories {
        categoryId
        slug
        nameEn
        nameFr
        icon
        parentId
        workerCount
      }
    }
  }
`;

export interface SearchFilterRanges {
  price: {
    min: number | null;
    max: number | null;
    p25: number | null;
    p75: number | null;
    pricedServiceCount: number;
  };
  trustScoreMin: number;
  trustScoreMax: number;
  ratingMin: number | null;
  ratingMax: number | null;
  ratedWorkerCount: number;
  verifiedWorkerCount: number;
  workerCount: number;
  farthestMatchM: number | null;
  responseTimeAvailable: boolean;
  categories: {
    categoryId: string;
    slug: string;
    nameEn: string;
    nameFr: string;
    icon: string | null;
    parentId: string | null;
    workerCount: number;
  }[];
}

export interface SearchFilterRangesQueryResult {
  searchFilterRanges: SearchFilterRanges;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geography (DIS-09, DIS-10)
// ─────────────────────────────────────────────────────────────────────────────

/** Distance-ranked workers around a point — the map markers and the "near you" rail. */
export const NEARBY_WORKERS_QUERY = gql`
  query NearbyWorkers(
    $latitude: Float!
    $longitude: Float!
    $radiusM: Int
    $limit: Int
    $offset: Int
    $categoryId: ID
  ) {
    nearbyWorkers(
      latitude: $latitude
      longitude: $longitude
      radiusM: $radiusM
      limit: $limit
      offset: $offset
      categoryId: $categoryId
    ) {
      workers {
        workerProfileId
        userId
        name
        avatar
        headline
        city
        area
        tier
        trustScore
        completedJobs
        averageRating
        latitude
        longitude
        distanceM
      }
      totalCount
      radiusM
      noProvidersInArea
    }
  }
`;

export interface NearbyWorkerResult {
  workerProfileId: string;
  userId: string;
  name: string | null;
  avatar: string | null;
  headline: string | null;
  city: string | null;
  area: string | null;
  tier: VerificationTier;
  trustScore: number;
  completedJobs: number;
  averageRating: number | null;
  latitude: number;
  longitude: number;
  distanceM: number;
}

export interface NearbyWorkersQueryResult {
  nearbyWorkers: {
    workers: NearbyWorkerResult[];
    totalCount: number;
    radiusM: number;
    noProvidersInArea: boolean;
  };
}

/** Names a coordinate, so the location setter can say where the pin actually landed. */
export const REVERSE_GEOCODE_QUERY = gql`
  query ReverseGeocodeLocation($latitude: Float!, $longitude: Float!, $locale: String) {
    reverseGeocodeLocation(latitude: $latitude, longitude: $longitude, locale: $locale) {
      regionId
      regionSlug
      locality
      city
      principalSubdivision
      countryCode
      source
    }
  }
`;

export interface ReverseGeocodeQueryResult {
  reverseGeocodeLocation: {
    regionId: string | null;
    regionSlug: string | null;
    locality: string | null;
    city: string | null;
    principalSubdivision: string | null;
    countryCode: string | null;
    /** cache | postgis | bigdatacloud | unresolved — drives the manual-pin offer. */
    source: string;
  };
}

/**
 * Named landmarks near a point.
 *
 * Addresses in Douala and Yaoundé are given as landmarks — "behind the pharmacy
 * at Carrefour Ndokotti" — so the pin picker offers real ones to attach rather
 * than asking for a street number that does not exist.
 */
export const NEARBY_LANDMARKS_QUERY = gql`
  query NearbyLandmarks($latitude: Float!, $longitude: Float!, $radiusM: Int, $limit: Int) {
    nearbyLandmarks(latitude: $latitude, longitude: $longitude, radiusM: $radiusM, limit: $limit) {
      osmId
      name
      category
      latitude
      longitude
      distanceM
    }
  }
`;

export interface NearbyLandmark {
  osmId: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  distanceM: number;
}

export interface NearbyLandmarksQueryResult {
  nearbyLandmarks: NearbyLandmark[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Profiles (PRO-01…PRO-06)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The full public worker profile in ONE round trip.
 *
 * One query rather than a fetch per tab, because on a Douala 3G connection a
 * profile assembled from six sequential requests is a hiring decision made on a
 * spinner — and this is the screen where somebody decides whether to trust a
 * stranger inside their home.
 */
export const WORKER_PROFILE_QUERY = gql`
  query WorkerProfile($userId: ID!) {
    workerProfile(userId: $userId) {
      id
      userId
      name
      avatar
      coverUrl
      headline
      bio
      yearsExperience
      city
      area
      landmark
      tier
      trustScore
      identityScore
      professionalScore
      marketplaceScore
      financialScore
      memberSince
      stats {
        completedJobs
        averageRating
        endorsementCount
        portfolioCount
        verifiedCheckCount
        onTimePercentage
        onTimeScored
        respondsWithinMinutes
        responseTimeScored
      }
      services {
        id
        name
        description
        startingPrice
        categoryId
        categorySlug
        categoryNameEn
        categoryNameFr
      }
      portfolio {
        groupKey
        projectTitle
        isBeforeAfter
        items {
          id
          type
          caption
          url
          slot
          sortOrder
          createdAt
        }
      }
      availability {
        dayOfWeek
        slots {
          startTime
          endTime
        }
      }
      availabilityExceptions {
        id
        date
        isAvailable
        startTime
        endTime
        note
      }
      verifications {
        checkType
        verifiedAt
      }
      reviews {
        averageRating
        ratedJobCount
        reviewListAvailable
      }
    }
  }
`;

export interface WorkerProfileService {
  id: string;
  name: string;
  description: string | null;
  /** XAF, whole numbers. Null means "ask", which is honest for variable work. */
  startingPrice: number | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryNameEn: string | null;
  categoryNameFr: string | null;
}

export interface PortfolioItem {
  id: string;
  type: string;
  caption: string | null;
  url: string | null;
  /** BEFORE / AFTER for a comparison pair; null for an ordinary item. */
  slot: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface PortfolioGroup {
  groupKey: string | null;
  projectTitle: string | null;
  isBeforeAfter: boolean;
  items: PortfolioItem[];
}

export interface WorkerAvailabilityDay {
  dayOfWeek: number;
  slots: { startTime: string; endTime: string }[];
}

export interface WorkerAvailabilityException {
  id: string;
  date: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

export interface WorkerProfile {
  id: string;
  userId: string;
  name: string | null;
  avatar: string | null;
  coverUrl: string | null;
  headline: string | null;
  bio: string | null;
  yearsExperience: number | null;
  city: string | null;
  area: string | null;
  landmark: string | null;
  tier: VerificationTier;
  trustScore: number;
  identityScore: number;
  professionalScore: number;
  marketplaceScore: number;
  financialScore: number;
  memberSince: string;
  stats: {
    completedJobs: number;
    averageRating: number | null;
    endorsementCount: number;
    portfolioCount: number;
    verifiedCheckCount: number;
    /** Null until the jobs module can measure it — see onTimeScored. */
    onTimePercentage: number | null;
    onTimeScored: boolean;
    /** Median minutes to answer a direct job invitation. Null until responseTimeScored. */
    respondsWithinMinutes: number | null;
    responseTimeScored: boolean;
  };
  services: WorkerProfileService[];
  portfolio: PortfolioGroup[];
  availability: WorkerAvailabilityDay[];
  availabilityExceptions: WorkerAvailabilityException[];
  verifications: { checkType: string; verifiedAt: string | null }[];
  reviews: {
    averageRating: number | null;
    ratedJobCount: number;
    /** False while individual review text cannot be listed (Phase 5). */
    reviewListAvailable: boolean;
  };
}

export interface WorkerProfileQueryResult {
  workerProfile: WorkerProfile;
}

/**
 * The public company profile with all five tabs (PRO-06).
 *
 * `credentials` carries WHICH registrations staff verified, never the documents
 * themselves — an RCCM scan holds the owner's legal name, signature and address,
 * and publishing it would be a KYC leak wearing a "transparency" label.
 */
export const BUSINESS_PROFILE_QUERY = gql`
  query BusinessProfile($id: ID!) {
    businessProfile(id: $id) {
      id
      ownerId
      name
      description
      logoUrl
      contactEmail
      contactPhone
      city
      area
      address
      rccmNumber
      verified
      ownerTier
      createdAt
      stats {
        teamSize
        trustScore
        completedJobs
        averageRating
        openJobCount
        jobsAvailable
      }
      team {
        id
        name
        roles
        joinedAt
      }
      credentials {
        labelKey
        verified
        verifiedAt
      }
    }
  }
`;

export interface BusinessProfile {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  rccmNumber: string | null;
  verified: boolean;
  ownerTier: VerificationTier;
  createdAt: string;
  stats: {
    teamSize: number;
    trustScore: number;
    completedJobs: number;
    averageRating: number | null;
    /** Zero until the jobs module lands — check jobsAvailable before saying "none". */
    openJobCount: number;
    jobsAvailable: boolean;
  };
  team: { id: string; name: string; roles: string[]; joinedAt: string }[];
  credentials: { labelKey: string; verified: boolean; verifiedAt: string | null }[];
}

export interface BusinessProfileQueryResult {
  businessProfile: BusinessProfile;
}
