-- =============================================================
-- Migration: Allow applicants to edit submitted applications before deadline
-- Previously all tables were locked to status = 'draft' only.
-- Now edits are permitted when status = 'draft' OR
-- (status = 'submitted' AND the application deadline has not yet passed).
-- Deadline is read from settings.application_deadline (ISO date string).
-- =============================================================

-- Helper: a NOT EXISTS subquery that returns TRUE when the deadline has NOT passed.
-- Deadline is considered passed when settings.application_deadline is set to a date
-- that is strictly before today in America/Toronto timezone.
-- If no deadline is configured, editing is always allowed.

-- ===================== RESPONSES =====================
DROP POLICY IF EXISTS "Users can insert own responses" ON public.responses;
DROP POLICY IF EXISTS "Users can update own responses" ON public.responses;

CREATE POLICY "Users can insert own responses"
  ON public.responses FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

CREATE POLICY "Users can update own responses"
  ON public.responses FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

-- ===================== ACTIVITIES =====================
DROP POLICY IF EXISTS "Users can insert own activities" ON public.activities;
DROP POLICY IF EXISTS "Users can update own activities" ON public.activities;
DROP POLICY IF EXISTS "Users can delete own activities" ON public.activities;

CREATE POLICY "Users can insert own activities"
  ON public.activities FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

CREATE POLICY "Users can update own activities"
  ON public.activities FOR UPDATE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

CREATE POLICY "Users can delete own activities"
  ON public.activities FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

-- ===================== HONORS =====================
DROP POLICY IF EXISTS "Users can insert own honors" ON public.honors;
DROP POLICY IF EXISTS "Users can update own honors" ON public.honors;
DROP POLICY IF EXISTS "Users can delete own honors" ON public.honors;

CREATE POLICY "Users can insert own honors"
  ON public.honors FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

CREATE POLICY "Users can update own honors"
  ON public.honors FOR UPDATE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

CREATE POLICY "Users can delete own honors"
  ON public.honors FOR DELETE USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

-- ===================== APPLICATION_POSITIONS =====================
-- INSERT (adding positions)
DROP POLICY IF EXISTS "Users can insert own application_positions" ON public.application_positions;

CREATE POLICY "Users can insert own application_positions"
  ON public.application_positions FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

-- DELETE (removing positions)
DROP POLICY IF EXISTS "Users can delete own draft application_positions" ON public.application_positions;

CREATE POLICY "Users can delete own draft application_positions"
  ON public.application_positions FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );

-- UPDATE (ranking positions)
DROP POLICY IF EXISTS "Users can update own draft application_positions" ON public.application_positions;

CREATE POLICY "Users can update own draft application_positions"
  ON public.application_positions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
        AND a.user_id = auth.uid()
        AND (
          a.status = 'draft'
          OR (
            a.status = 'submitted'
            AND NOT EXISTS (
              SELECT 1 FROM public.settings s
              WHERE s.key = 'application_deadline'
                AND s.value IS NOT NULL
                AND s.value != 'null'::jsonb
                AND (s.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
                AND (s.value #>> '{}')::date < (now() AT TIME ZONE 'America/Toronto')::date
            )
          )
        )
    )
  );
