-- HustleBook shop-first MVP: sales, stock movement and business profile.
-- Run after supabase/schema.sql and supabase/migrations/20261023_workspace_business_modules.sql.
-- Only hb_ tables are touched; Garage Operations Pro tables are not changed.

create table if not exists public.hb_business_profiles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null unique references public.hb_workspaces(id) on delete cascade,
 business_name text not null,
 business_type text not null default 'general_shop',
 phone text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.hb_sales (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.hb_workspaces(id) on delete cascade,
 product_id uuid references public.hb_products(id) on delete set null,
 product_name text not null,
 quantity numeric(14,2) not null check(quantity > 0),
 unit_price numeric(14,2) not null check(unit_price >= 0),
 unit_cost numeric(14,2) not null default 0 check(unit_cost >= 0),
 total_amount numeric(14,2) not null check(total_amount >= 0),
 amount_paid numeric(14,2) not null default 0 check(amount_paid >= 0 and amount_paid <= total_amount),
 customer_name text,
 payment_method text not null default 'cash' check(payment_method in ('cash','mpesa','card','bank','credit','other')),
 sale_date date not null default current_date,
 created_at timestamptz not null default now()
);

create table if not exists public.hb_stock_movements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.hb_workspaces(id) on delete cascade,
 product_id uuid not null references public.hb_products(id) on delete cascade,
 movement_type text not null check(movement_type in ('sale','purchase','adjustment')),
 quantity_change numeric(14,2) not null,
 reference_id uuid,
 note text,
 created_at timestamptz not null default now()
);

create index if not exists hb_sales_workspace_date_idx on public.hb_sales(workspace_id,sale_date desc);
create index if not exists hb_sales_user_idx on public.hb_sales(user_id);
create index if not exists hb_stock_movements_product_idx on public.hb_stock_movements(product_id,created_at desc);

revoke all on public.hb_business_profiles, public.hb_sales, public.hb_stock_movements from anon;
grant select, insert, update, delete on public.hb_business_profiles, public.hb_sales, public.hb_stock_movements to authenticated;
alter table public.hb_business_profiles enable row level security;
alter table public.hb_sales enable row level security;
alter table public.hb_stock_movements enable row level security;

drop policy if exists hb_business_profiles_select_own on public.hb_business_profiles;
drop policy if exists hb_business_profiles_insert_own on public.hb_business_profiles;
drop policy if exists hb_business_profiles_update_own on public.hb_business_profiles;
drop policy if exists hb_business_profiles_delete_own on public.hb_business_profiles;
create policy hb_business_profiles_select_own on public.hb_business_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy hb_business_profiles_insert_own on public.hb_business_profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy hb_business_profiles_update_own on public.hb_business_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy hb_business_profiles_delete_own on public.hb_business_profiles for delete to authenticated using(user_id=(select auth.uid()));

drop policy if exists hb_sales_select_own on public.hb_sales;
drop policy if exists hb_sales_insert_own on public.hb_sales;
drop policy if exists hb_sales_update_own on public.hb_sales;
drop policy if exists hb_sales_delete_own on public.hb_sales;
create policy hb_sales_select_own on public.hb_sales for select to authenticated using(user_id=(select auth.uid()));
-- Sales are inserted through the checked RPC below to keep stock and sales consistent.
create policy hb_sales_insert_own on public.hb_sales for insert to authenticated with check(user_id=(select auth.uid()));
create policy hb_sales_update_own on public.hb_sales for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy hb_sales_delete_own on public.hb_sales for delete to authenticated using(user_id=(select auth.uid()));

drop policy if exists hb_stock_movements_select_own on public.hb_stock_movements;
drop policy if exists hb_stock_movements_insert_own on public.hb_stock_movements;
drop policy if exists hb_stock_movements_update_own on public.hb_stock_movements;
drop policy if exists hb_stock_movements_delete_own on public.hb_stock_movements;
create policy hb_stock_movements_select_own on public.hb_stock_movements for select to authenticated using(user_id=(select auth.uid()));
create policy hb_stock_movements_insert_own on public.hb_stock_movements for insert to authenticated with check(user_id=(select auth.uid()));
create policy hb_stock_movements_update_own on public.hb_stock_movements for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy hb_stock_movements_delete_own on public.hb_stock_movements for delete to authenticated using(user_id=(select auth.uid()));

-- Atomic checkout: validate ownership and stock, record the sale, reduce stock, record movement.
create or replace function public.hb_record_sale(
 p_workspace_id uuid,
 p_product_id uuid,
 p_quantity numeric,
 p_unit_price numeric,
 p_amount_paid numeric default 0,
 p_customer_name text default null,
 p_payment_method text default 'cash',
 p_sale_date date default current_date
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
 v_user uuid := auth.uid();
 v_product public.hb_products%rowtype;
 v_total numeric(14,2);
 v_sale_id uuid;
begin
 if v_user is null then raise exception 'Please sign in first.'; end if;
 if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
 if p_unit_price is null or p_unit_price < 0 then raise exception 'Selling price cannot be negative.'; end if;
 v_total := round(p_quantity * p_unit_price,2);
 if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > v_total then
   raise exception 'Amount paid must be between zero and the sale total.';
 end if;
 if p_payment_method not in ('cash','mpesa','card','bank','credit','other') then raise exception 'Invalid payment method.'; end if;
 if not exists(select 1 from public.hb_workspaces w where w.id=p_workspace_id and w.user_id=v_user and w.workspace_type='business') then
   raise exception 'Choose your own Business & Hustles workspace.';
 end if;
 select * into v_product from public.hb_products
  where id=p_product_id and user_id=v_user and workspace_id=p_workspace_id
  for update;
 if not found then raise exception 'Product not found in this business. Add the product under Products / stock first.'; end if;
 if v_product.quantity < p_quantity then raise exception 'Not enough stock available for this sale.'; end if;
 insert into public.hb_sales(user_id,workspace_id,product_id,product_name,quantity,unit_price,unit_cost,total_amount,amount_paid,customer_name,payment_method,sale_date)
 values(v_user,p_workspace_id,v_product.id,v_product.name,p_quantity,p_unit_price,v_product.unit_cost,v_total,p_amount_paid,nullif(trim(p_customer_name),''),p_payment_method,coalesce(p_sale_date,current_date))
 returning id into v_sale_id;
 update public.hb_products set quantity=quantity-p_quantity where id=v_product.id and user_id=v_user;
 insert into public.hb_stock_movements(user_id,workspace_id,product_id,movement_type,quantity_change,reference_id,note)
 values(v_user,p_workspace_id,v_product.id,'sale',-p_quantity,v_sale_id,'Sale recorded');
 return v_sale_id;
end;
$$;
revoke all on function public.hb_record_sale(uuid,uuid,numeric,numeric,numeric,text,text,date) from public, anon;
grant execute on function public.hb_record_sale(uuid,uuid,numeric,numeric,numeric,text,text,date) to authenticated;

-- Security note: browser-side sales writes should call hb_record_sale; do not expose service-role keys.
