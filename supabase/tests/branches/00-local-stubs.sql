-- The few Supabase-hosted objects the migrations touch that a bare Supabase Postgres image
-- lacks (storage tables). Only for the throwaway test database; never run on a real project.
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now(), owner uuid, owner_id text, avif_autodetection boolean default false);
create table if not exists storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz, path_tokens text[] generated always as (string_to_array(name, '/')) stored);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:greatest(cardinality(string_to_array(name,'/'))-1,0)] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
