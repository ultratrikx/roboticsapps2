-- Manual ranking order per position slot (null = use score-based order)
ALTER TABLE application_positions
  ADD COLUMN IF NOT EXISTS rank_order integer;
