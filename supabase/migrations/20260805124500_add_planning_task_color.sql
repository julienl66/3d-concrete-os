alter table if exists public.production_day_tasks
  add column if not exists task_color text;

notify pgrst, 'reload schema';
