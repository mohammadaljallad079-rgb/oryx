-- Shared, concurrency-safe allocator for human-readable master-data codes.
-- Generated codes are distinct from immutable transactional document numbers.
-- START 100000000 prevents collisions with existing short manually issued codes.
CREATE SEQUENCE IF NOT EXISTS "OryxMasterCodeSequence"
  AS BIGINT START WITH 100000000 INCREMENT BY 1 NO CYCLE;
