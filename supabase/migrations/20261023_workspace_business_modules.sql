-- HustleBook workspace-scoping and everyday-business expansion.
-- Run after supabase/schema.sql. This only touches hb_ tables, not Garage Operations Pro.
alter table public.hb_budgets add column if not exists workspace_id uuid references public.hb_workspaces(id) on delete cascade;
alter table public.hb_debts add column if not exists workspace_id uuid references public.hb_workspaces(id) on delete cascade;
alter table public.hb_savings_goals add column if not exists workspace_id uuid references public.hb_workspaces(id) on delete cascade;
alter table public.hb_customers add column if not exists workspace_id uuid references public.hb_workspaces(id) on delete cascade;
alter table public.hb_products add column if not exists workspace_id uuid references public.hb_workspaces(id) on delete cascade;
alter table public.hb_invoices add column if not exists workspace_id uuid references public.hb_workspaces(id) on delete cascade;

create table if not exists public.hb_suppliers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid references public.hb_workspaces(id) on delete cascade,
 name text not null, email text, phone text, notes text, created_at timestamptz not null default now()
);
create table if not exists public.hb_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid references public.hb_workspaces(id) on delete cascade,
 name text not null, customer_name text,
 status text not null default 'new' check(status in ('new','in_progress','waiting_payment','completed','cancelled')),
 quoted_amount numeric(14,2) not null default 0 check(quoted_amount >= 0),
 paid_amount numeric(14,2) not null default 0 check(paid_amount >= 0),
 due_date date, notes text, created_at timestamptz not null default now()
);
create table if not exists public.hb_reminders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid references public.hb_workspaces(id) on delete cascade,
 title text not null, amount numeric(14,2) check(amount is null or amount >= 0),
 due_date date not null,
 status text not null default 'pending' check(status in ('pending','completed','dismissed')),
 notes text, created_at timestamptz not null default now()
);
create index if not exists hb_budgets_workspace_idx on public.hb_budgets(workspace_id);
create index if not exists hb_debts_workspace_idx on public.hb_debts(workspace_id);
create index if not exists hb_savings_workspace_idx on public.hb_savings_goals(workspace_id);
create index if not exists hb_customers_workspace_idx on public.hb_customers(workspace_id);
create index if not exists hb_products_workspace_idx on public.hb_products(workspace_id);
create index if not exists hb_invoices_workspace_idx on public.hb_invoices(workspace_id);

revoke all on public.hb_suppliers, public.hb_jobs, public.hb_reminders from anon;
grant select, insert, update, delete on public.hb_suppliers, public.hb_jobs, public.hb_reminders to authenticated;
alter table public.hb_suppliers enable row level security;
alter table public.hb_jobs enable row level security;
alter table public.hb_reminders enable row level security;

do $$
declare tbl text;
begin
 foreach tbl in array array['hb_suppliers','hb_jobs','hb_reminders'] loop
  execute format('drop policy if exists %I on public.%I',tbl||'_select_own',tbl);
  execute format('drop policy if exists %I on public.%I',tbl||'_insert_own',tbl);
  execute format('drop policy if exists %I on public.%I',tbl||'_update_own',tbl);
  execute format('drop policy if exists %I on public.%I',tbl||'_delete_own',tbl);
  execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',tbl||'_select_own',tbl);
  execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',tbl||'_insert_own',tbl);
  execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',tbl||'_update_own',tbl);
  execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',tbl||'_delete_own',tbl);
 end loop;
end $$;

-- Old rows with no workspace_id remain visible only in Personal through the current app.
-- This migration does not enable shared household access or paid subscriptions.
