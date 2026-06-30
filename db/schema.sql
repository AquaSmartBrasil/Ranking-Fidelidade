create extension if not exists "pgcrypto";

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  name text not null default 'Default Company',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conta_azul_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  sync_type text not null,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  records_processed integer not null default 0,
  error_message text null,
  created_at timestamptz not null default now()
);

create table if not exists sync_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  resource text not null,
  last_synced_at timestamptz null,
  last_cursor text null,
  updated_at timestamptz not null default now(),
  unique(company_id, resource)
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  conta_azul_id text not null,
  name text,
  email text,
  document text,
  phone text,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, conta_azul_id)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  conta_azul_id text not null,
  name text,
  sku text,
  price numeric,
  cost numeric,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, conta_azul_id)
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  conta_azul_id text not null,
  customer_id uuid references customers(id) on delete set null,
  sale_date date null,
  status text,
  total_amount numeric,
  discount_amount numeric,
  net_amount numeric,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, conta_azul_id)
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  description text,
  quantity numeric,
  unit_price numeric,
  total_amount numeric,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists receivables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  conta_azul_id text not null,
  sale_id uuid references sales(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  due_date date null,
  payment_date date null,
  status text,
  amount numeric,
  paid_amount numeric,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, conta_azul_id)
);

create index if not exists idx_conta_azul_tokens_company_id on conta_azul_tokens(company_id);
create index if not exists idx_sync_logs_company_id on sync_logs(company_id);
create index if not exists idx_sync_state_company_resource on sync_state(company_id, resource);
create index if not exists idx_customers_company_id on customers(company_id);
create index if not exists idx_products_company_id on products(company_id);
create index if not exists idx_sales_company_id on sales(company_id);
create index if not exists idx_sales_sale_date on sales(sale_date);
create index if not exists idx_receivables_company_id on receivables(company_id);
create index if not exists idx_receivables_due_date on receivables(due_date);
