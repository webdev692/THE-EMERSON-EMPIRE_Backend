-- API foundation review migration for The Emerson Empire backend.
-- REVIEW BEFORE APPLYING TO PRODUCTION.
-- This file is intentionally committed for review and documentation.
-- It has not been applied to Supabase by ChatGPT.

create extension if not exists "pgcrypto";

create schema if not exists agency;

create table if not exists agency.clients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  preferred_contact_method text default 'email',
  client_type text not null default 'individual',
  status text not null default 'prospect',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agency.booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references agency.clients(id) on delete cascade,
  inquiry_source text not null default 'website',
  requested_service text not null,
  preferred_date date,
  preferred_time_window text,
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agency.compliance_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references agency.clients(id) on delete cascade,
  acknowledgement_type text not null,
  version text not null default 'v1',
  accepted boolean not null default false,
  accepted_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_agency_clients_email on agency.clients(email);
create index if not exists idx_agency_booking_client_id on agency.booking_inquiries(client_id);
create index if not exists idx_agency_booking_status on agency.booking_inquiries(status);
create index if not exists idx_agency_ack_client_id on agency.compliance_acknowledgements(client_id);

-- RLS is enabled, but policies must be designed intentionally before frontend Supabase access.
-- The backend API can continue using a server-side DATABASE_URL.
alter table agency.clients enable row level security;
alter table agency.booking_inquiries enable row level security;
alter table agency.compliance_acknowledgements enable row level security;

-- No public read policies are included in this review migration.
-- Add role-aware policies only after auth architecture is finalized.
