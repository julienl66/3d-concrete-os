-- Permet d'assigner une tâche sans sujet hebdomadaire lié.
alter table if exists public.weekly_tasks
  alter column topic_id drop not null;
