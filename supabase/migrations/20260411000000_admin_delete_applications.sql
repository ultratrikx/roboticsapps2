-- =============================================================
-- Migration: Allow admins to delete applications
-- Adds a DELETE RLS policy on the applications table for admins.
-- Cascading deletes handle related rows in:
--   application_positions → decisions
--   reviews, responses, ai_analysis_results
-- =============================================================

CREATE POLICY "Admins can delete applications"
  ON public.applications FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
