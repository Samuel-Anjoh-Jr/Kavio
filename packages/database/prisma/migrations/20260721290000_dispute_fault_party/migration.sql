-- ─────────────────────────────────────────────────────────────────────────────
-- PROMPT 85 — Dispute fault finding (ADM-05, §21.5 "disputes −20")
--
-- The dispute workspace already drove the escrow machine (PROMPT 68). What it
-- could not do was record WHO WAS WRONG — and the trust penalty needs that.
--
-- Fault is a separate column from `resolution` on purpose, because the direction
-- the money went does not settle who behaved badly:
--
--   - REFUND_TO_CLIENT usually means the work was not delivered → the worker.
--   - RELEASE_TO_WORKER usually means the work WAS delivered and the freeze
--     ended → and very often nobody is at fault. A client who escalates in good
--     faith and loses has done nothing wrong.
--
-- Deriving the penalty from the resolution alone would charge that client 20
-- points for asking, and both parties would learn never to raise a dispute — the
-- one outcome an escrow product cannot afford, since the escrow is only worth
-- anything if people are willing to use the process that unlocks it.
--
-- So the admin — the only participant who read the evidence — records fault
-- explicitly, the resolution merely supplies the default, and NONE is the common
-- case that carries no trust consequence at all. The column exists so the finding
-- survives next to the case; the ledger records that a penalty was applied, and
-- this records the finding it was applied for.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "DisputeFaultParty" AS ENUM ('NONE', 'CLIENT', 'WORKER');

-- AlterTable
ALTER TABLE "Dispute"
    ADD COLUMN "faultParty" "DisputeFaultParty" NOT NULL DEFAULT 'NONE';
