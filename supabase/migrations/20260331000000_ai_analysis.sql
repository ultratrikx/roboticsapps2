-- AI Analysis: store generated responses and similarity scores for AI detection
create table public.ai_analysis_results (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  generated_response text not null,
  similarity_score float not null default 0,
  provider text not null default 'gemini' check (provider in ('gemini', 'openai')),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(application_id, question_id)
);

alter table public.ai_analysis_results enable row level security;

create policy "Admins can manage ai_analysis_results"
  on public.ai_analysis_results for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Default setting: AI analysis disabled
insert into public.settings (key, value)
values ('ai_analysis_enabled', 'false'::jsonb)
on conflict (key) do nothing;
