-- HustleBook database foundation
-- Review before running in Supabase SQL Editor.
-- Uses hb_ prefixed tables so it does not modify Garage Operations Pro tables.
-- Private financial records are available only to their owning authenticated user.
-- Never put a Supabase service-role/secret key in browser code.

create extension if not exists pgcrypto;

create table if not exists public.hb_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  country_code text not null default 'KE',
  preferred_currency text not null default 'KES',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hb_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  workspace_type text not null check (workspace_type in ('personal','household','business','group')),
  created_at timestamptz not null default now()
);

create table if not exists public.hb_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.hb_workspaces(id) on delete set null,
  transaction_type text not null check (transaction_type in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'KES',
  category text not null default 'Other',
  description text,
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.hb_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'KES',
  period text not null default 'monthly' check (period in ('weekly','monthly','yearly')),
  starts_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.hb_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  debt_type text not null default 'owed_by_me' check (debt_type in ('owed_by_me','owed_to_me')),
  original_amount numeric(14,2) not null check (original_amount >= 0),
  balance_amount numeric(14,2) not null check (balance_amount >= 0),
  currency text not null default 'KES',
  due_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.hb_savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0),
  currency text not null default 'KES',
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.hb_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.hb_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text,
  quantity numeric(14,2) not null default 0 check (quantity >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  currency text not null default 'KES',
  created_at timestamptz not null default now()
);

create table if not exists public.hb_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.hb_customers(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft','sent','part_paid','paid','overdue','cancelled')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'KES',
  issue_date date not null default current_date,
  due_date date,
  created_at timestamptz not null default now(),
  unique (user_id, invoice_number)
);

create table if not exists public.hb_invoice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.hb_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(14,2) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.hb_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid references public.hb_invoices(id) on delete set null,
  provider text,
  provider_reference text,
  payment_type text not null default 'business_payment' check (payment_type in ('business_payment','subscription')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'KES',
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded','reversed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.hb_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null default 'free',
  status text not null default 'free' check (status in ('free','trialing','active','past_due','cancelled','expired')),
  billing_interval text check (billing_interval in ('month','year')),
  provider text,
  provider_customer_reference text,
  provider_subscription_reference text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hb_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hb_transactions_user_date_idx on public.hb_transactions(user_id, transaction_date desc);
create index if not exists hb_budgets_user_idx on public.hb_budgets(user_id);
create index if not exists hb_debts_user_idx on public.hb_debts(user_id);
create index if not exists hb_savings_goals_user_idx on public.hb_savings_goals(user_id);
create index if not exists hb_products_user_idx on public.hb_products(user_id);
create index if not exists hb_invoices_user_idx on public.hb_invoices(user_id);
create index if not exists hb_payments_user_idx on public.hb_payments(user_id);

-- Explicit privileges: signed-out visitors cannot read/write private HustleBook tables.
revoke all on table public.hb_profiles, public.hb_workspaces, public.hb_transactions,
  public.hb_budgets, public.hb_debts, public.hb_savings_goals, public.hb_customers,
  public.hb_products, public.hb_invoices, public.hb_invoice_items, public.hb_payments,
  public.hb_subscriptions, public.hb_notifications from anon;

grant select, insert, update, delete on table public.hb_profiles, public.hb_workspaces,
  public.hb_transactions, public.hb_budgets, public.hb_debts, public.hb_savings_goals,
  public.hb_customers, public.hb_products, public.hb_invoices, public.hb_invoice_items,
  public.hb_notifications to authenticated;

-- Payment and subscription records are read-only from the browser.
-- A trusted backend must create/update these after verifying provider events.
revoke all on table public.hb_payments, public.hb_subscriptions from authenticated;
grant select on table public.hb_payments, public.hb_subscriptions to authenticated;

alter table public.hb_profiles enable row level security;
alter table public.hb_workspaces enable row level security;
alter table public.hb_transactions enable row level security;
alter table public.hb_budgets enable row level security;
alter table public.hb_debts enable row level security;
alter table public.hb_savings_goals enable row level security;
alter table public.hb_customers enable row level security;
alter table public.hb_products enable row level security;
alter table public.hb_invoices enable row level security;
alter table public.hb_invoice_items enable row level security;
alter table public.hb_payments enable row level security;
alter table public.hb_subscriptions enable row level security;
alter table public.hb_notifications enable row level security;

-- Every table has an owner-based policy for each CRUD operation.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'hb_profiles','hb_workspaces','hb_transactions','hb_budgets','hb_debts',
    'hb_savings_goals','hb_customers','hb_products','hb_invoices',
    'hb_invoice_items','hb_payments','hb_subscriptions','hb_notifications'
  ] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update_own', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete_own', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', tbl || '_select_own', tbl);
    if tbl not in ('hb_payments', 'hb_subscriptions') then
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', tbl || '_insert_own', tbl);
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl || '_update_own', tbl);
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', tbl || '_delete_own', tbl);
    end if;
  end loop;
end $$;

-- IMPORTANT:
-- 1) Run this script in Supabase SQL Editor only after reviewing it.
-- 2) This is a user-owned MVP foundation. Shared household/team access needs membership-based policies before those features are enabled.
-- 3) Do not store full card numbers or CVVs here.
-- 4) Authenticated browser clients can only read their payment/subscription rows; a trusted server-side integration must create/update them after verifying provider events.
-- 5) Do not add service_role or secret API keys to frontend code.
