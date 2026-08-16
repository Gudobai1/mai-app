create table if not exists public.mai_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mai_state enable row level security;

create policy "mai_state_select_own"
on public.mai_state for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "mai_state_insert_own"
on public.mai_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "mai_state_update_own"
on public.mai_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists mai_state_updated_at_idx on public.mai_state(updated_at desc);
