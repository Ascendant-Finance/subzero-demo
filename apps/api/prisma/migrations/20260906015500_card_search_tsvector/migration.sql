-- Card full text search. Generated tsvector over title and description with a
-- GIN index. Searches are always scoped to a board the caller can access.
ALTER TABLE "Card"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "Card_searchVector_idx" ON "Card" USING GIN ("searchVector");
