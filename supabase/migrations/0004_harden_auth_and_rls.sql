revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
alter function public.handle_new_user() set search_path = '';

alter policy attachments_all_own on public.attachments to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy calendar_events_all_own on public.calendar_events to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy finance_accounts_all_own on public.finance_accounts to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy finance_cards_all_own on public.finance_cards to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy finance_transactions_all_own on public.finance_transactions to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy goal_milestones_all_own on public.goal_milestones to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy goals_all_own on public.goals to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy habit_entries_all_own on public.habit_entries to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy habits_all_own on public.habits to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy health_entries_all_own on public.health_entries to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy notes_all_own on public.notes to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy projects_all_own on public.projects to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy subtasks_all_own on public.subtasks to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy tasks_all_own on public.tasks to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter policy profiles_insert_own on public.profiles to authenticated with check ((select auth.uid()) = id);
alter policy profiles_select_own on public.profiles to authenticated using ((select auth.uid()) = id);
alter policy profiles_update_own on public.profiles to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
