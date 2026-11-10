-- FRAMEWORK M1 foundation: authentication tables, workspaces, preferences,
-- and the row-level security model every later module builds on.
--
-- Isolation model
--   * The application reaches domain tables only inside a transaction that has
--     run `set local role framework_app` and set `app.user_id`.
--   * `framework_app` has no privileges on the auth_* tables at all.
--   * Every domain table has RLS enabled; policies read the acting user from
--     `app.current_user_id()` and membership from `app.is_workspace_member()`.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'framework_app') then
    create role framework_app nologin;
  end if;
end
$$;

-- The login role that runs migrations must be able to `set role framework_app`.
-- This is granted explicitly because creating a role does not imply it: on
-- PostgreSQL 16+ the creator receives ADMIN on the new role but not SET.
do $$
begin
  execute format('grant framework_app to %I', current_user);
end
$$;

create schema app;

-- ---------------------------------------------------------------------------
-- Authentication (owned by the auth library; see src/modules/auth/server)
-- ---------------------------------------------------------------------------

create table public.auth_users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id uuid not null references public.auth_users (id) on delete cascade
);
create index auth_sessions_user_id_idx on public.auth_sessions (user_id);

create table public.auth_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  provider_id text not null,
  user_id uuid not null references public.auth_users (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_accounts_user_id_idx on public.auth_accounts (user_id);

create table public.auth_verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_verifications_identifier_idx on public.auth_verifications (identifier);

create table public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  count integer not null,
  last_request bigint not null
);

-- RLS with no policies: nothing but the owning role can read credentials.
alter table public.auth_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.auth_accounts enable row level security;
alter table public.auth_verifications enable row level security;
alter table public.auth_rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------

create type public.workspace_role as enum ('owner', 'member');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  created_by uuid not null references public.auth_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.auth_users (id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Per-user preferences
-- ---------------------------------------------------------------------------

create table public.user_preferences (
  user_id uuid primary key references public.auth_users (id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  reduce_motion boolean not null default false,
  sidebar_collapsed boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function app.current_user_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- SECURITY DEFINER so policies on workspace_members can ask about membership
-- without recursing into themselves.
create function app.is_workspace_member(target_workspace uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = target_workspace
      and m.user_id = app.current_user_id()
  )
$$;

create function app.workspace_role(target_workspace uuid) returns public.workspace_role
language sql stable security definer
set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = target_workspace
    and m.user_id = app.current_user_id()
$$;

-- Creating a workspace and its first owner must be atomic, and nobody may
-- insert memberships directly, so this is the only way to create one.
create function app.create_workspace(workspace_name text, workspace_slug text) returns public.workspaces
language plpgsql security definer
set search_path = ''
as $$
declare
  acting_user uuid := app.current_user_id();
  created public.workspaces;
begin
  if acting_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (workspace_name, workspace_slug, acting_user)
  returning * into created;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created.id, acting_user, 'owner');

  return created;
end
$$;

create function app.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger workspaces_touch_updated_at
  before update on public.workspaces
  for each row execute function app.touch_updated_at();

create trigger user_preferences_touch_updated_at
  before update on public.user_preferences
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.user_preferences enable row level security;

create policy workspaces_select_member on public.workspaces
  for select to framework_app
  using (app.is_workspace_member(id));

create policy workspaces_update_owner on public.workspaces
  for update to framework_app
  using (app.workspace_role(id) = 'owner')
  with check (app.workspace_role(id) = 'owner');

create policy workspace_members_select_member on public.workspace_members
  for select to framework_app
  using (app.is_workspace_member(workspace_id));

create policy user_preferences_own on public.user_preferences
  for all to framework_app
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- Privileges for the application role (least privilege; no auth_* access)
-- ---------------------------------------------------------------------------

revoke all on schema app from public;
revoke all on all functions in schema app from public;

grant usage on schema public, app to framework_app;
grant execute on function
  app.current_user_id(),
  app.is_workspace_member(uuid),
  app.workspace_role(uuid),
  app.create_workspace(text, text)
  to framework_app;

grant select on public.workspaces, public.workspace_members to framework_app;
grant update (name) on public.workspaces to framework_app;
grant select, insert on public.user_preferences to framework_app;
grant update (theme, density, reduce_motion, sidebar_collapsed) on public.user_preferences to framework_app;
