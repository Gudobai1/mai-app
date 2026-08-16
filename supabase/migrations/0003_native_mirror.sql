-- Native mirrors for the remaining MAI collections.
-- The legacy state remains available while the application is migrated incrementally.

alter table public.projects add column if not exists legacy_id text;
alter table public.habits add column if not exists legacy_id text;
alter table public.notes add column if not exists legacy_id text;
alter table public.calendar_events add column if not exists legacy_id text;
alter table public.goals add column if not exists legacy_id text;
alter table public.finance_accounts add column if not exists legacy_id text;
alter table public.finance_cards add column if not exists legacy_id text;
alter table public.finance_transactions add column if not exists legacy_id text;
alter table public.health_entries add column if not exists legacy_id text;
alter table public.attachments add column if not exists legacy_id text;

create unique index if not exists projects_user_legacy_uidx on public.projects(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists habits_user_legacy_uidx on public.habits(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists notes_user_legacy_uidx on public.notes(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists calendar_events_user_legacy_uidx on public.calendar_events(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists goals_user_legacy_uidx on public.goals(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists finance_accounts_user_legacy_uidx on public.finance_accounts(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists finance_cards_user_legacy_uidx on public.finance_cards(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists finance_transactions_user_legacy_uidx on public.finance_transactions(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists health_entries_user_legacy_uidx on public.health_entries(user_id, legacy_id) where legacy_id is not null;
create unique index if not exists attachments_user_legacy_uidx on public.attachments(user_id, legacy_id) where legacy_id is not null;
