-- FRAMEWORK M2: project management.
--
-- Adds workspace-owned statuses and categories, projects with metadata, tags,
-- project notes and an append-only activity history. Follows the M1 model:
--   * every table has row-level security keyed on app.is_workspace_member();
--   * framework_app gets column-level, least-privilege grants;
--   * children reference parents with composite (id, workspace_id) foreign keys,
--     so a row can never point at another workspace's data;
--   * history is written by SECURITY DEFINER triggers, never by the application.
-- Nothing from 0001 is altered.

-- ---------------------------------------------------------------------------
-- Statuses and categories (defined per workspace, managed by owners)
-- ---------------------------------------------------------------------------

create table public.project_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- What the status means, independent of what it is called.
  kind text not null check (kind in ('planned', 'active', 'paused', 'done')),
  color text not null check (color in ('gray', 'blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal')),
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index project_statuses_name_key on public.project_statuses (workspace_id, lower(name));
create index project_statuses_order_idx on public.project_statuses (workspace_id, position);

create table public.project_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  color text not null check (color in ('gray', 'blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index project_categories_name_key on public.project_categories (workspace_id, lower(name));

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  description text not null default '' check (char_length(description) <= 5000),
  status_id uuid not null,
  category_id uuid,
  client text not null default '' check (char_length(client) <= 80 and client = btrim(client)),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  start_date date,
  due_date date,
  -- [{ "key": "Frame rate", "value": "24 fps" }, ...]; element shape is validated by the application.
  custom_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(custom_fields) = 'array' and jsonb_array_length(custom_fields) <= 20),
  archived_at timestamptz,
  archived_by uuid references public.auth_users (id) on delete set null,
  created_by uuid not null references public.auth_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or due_date is null or start_date <= due_date),
  unique (id, workspace_id),
  foreign key (status_id, workspace_id) references public.project_statuses (id, workspace_id),
  foreign key (category_id, workspace_id) references public.project_categories (id, workspace_id)
    on delete set null (category_id)
);
create index projects_workspace_updated_idx on public.projects (workspace_id, updated_at desc, id);
create index projects_status_idx on public.projects (status_id);
create index projects_category_idx on public.projects (category_id) where category_id is not null;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

create table public.project_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name) and name !~ '[,\n\r]'),
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index project_tags_name_key on public.project_tags (workspace_id, lower(name));

create table public.project_tag_links (
  project_id uuid not null,
  tag_id uuid not null,
  workspace_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, tag_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (tag_id, workspace_id) references public.project_tags (id, workspace_id) on delete cascade
);
create index project_tag_links_tag_idx on public.project_tag_links (tag_id);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------

create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  title text not null default '' check (char_length(title) <= 120 and title = btrim(title)),
  body text not null check (char_length(body) between 1 and 20000),
  pinned boolean not null default false,
  created_by uuid not null references public.auth_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set only when the title or body changes (not for pinning); stamped by a trigger.
  edited_at timestamptz,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index project_notes_project_idx on public.project_notes (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Activity (append-only; written only by the triggers below)
-- ---------------------------------------------------------------------------

create table public.project_activity (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  project_id uuid not null,
  actor_id uuid references public.auth_users (id) on delete set null,
  kind text not null check (kind in (
    'project_created', 'renamed', 'status_changed', 'category_changed', 'priority_changed',
    'client_changed', 'start_date_changed', 'due_date_changed', 'description_changed',
    'fields_changed', 'archived', 'restored', 'tag_added', 'tag_removed',
    'note_added', 'note_edited', 'note_deleted', 'note_pinned', 'note_unpinned'
  )),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index project_activity_project_idx on public.project_activity (project_id, id desc);
create index project_activity_workspace_idx on public.project_activity (workspace_id, id desc);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Display names of the members of a workspace the caller belongs to. This is
-- the only route from framework_app to auth_users, and it exposes names only.
create function app.workspace_member_names(target_workspace uuid) returns table (user_id uuid, name text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.name
  from public.workspace_members m
  join public.auth_users u on u.id = m.user_id
  where m.workspace_id = target_workspace
    and app.is_workspace_member(target_workspace)
$$;

create function app.log_project_activity(p_workspace uuid, p_project uuid, p_kind text, p_data jsonb default '{}'::jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.project_activity (workspace_id, project_id, actor_id, kind, data)
  values (p_workspace, p_project, app.current_user_id(), p_kind, coalesce(p_data, '{}'::jsonb))
$$;

create function app.assert_project_active(target_project uuid) returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.projects where id = target_project and archived_at is not null) then
    raise exception 'project is archived' using errcode = '55000';
  end if;
end
$$;

-- Default statuses and categories for a workspace.
create function app.seed_project_defaults(target_workspace uuid) returns void
language sql security definer
set search_path = ''
as $$
  insert into public.project_statuses (workspace_id, name, kind, color, position)
  values
    (target_workspace, 'Planning', 'planned', 'gray', 0),
    (target_workspace, 'In progress', 'active', 'blue', 1),
    (target_workspace, 'In review', 'active', 'violet', 2),
    (target_workspace, 'On hold', 'paused', 'amber', 3),
    (target_workspace, 'Delivered', 'done', 'green', 4);
  insert into public.project_categories (workspace_id, name, color)
  values
    (target_workspace, 'Motion design', 'violet'),
    (target_workspace, 'Editing', 'blue'),
    (target_workspace, 'VFX', 'teal'),
    (target_workspace, 'Film', 'amber'),
    (target_workspace, 'Personal', 'gray');
$$;

create function app.workspaces_seed_project_defaults() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.seed_project_defaults(new.id);
  return null;
end
$$;

-- BEFORE UPDATE on projects: archived projects are read-only, and archived_by
-- is stamped here so it cannot be forged through the column grants.
create function app.projects_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null then
    -- The one change an archived project accepts is its category being cleared by
    -- the foreign key when that category is deleted; that update runs inside the
    -- constraint trigger (trigger depth > 1), unlike a direct edit.
    if (new.name, new.description, new.status_id, new.client, new.priority,
        new.start_date, new.due_date, new.custom_fields)
       is distinct from
       (old.name, old.description, old.status_id, old.client, old.priority,
        old.start_date, old.due_date, old.custom_fields)
       or (new.category_id is distinct from old.category_id
           and not (new.category_id is null and pg_trigger_depth() > 1)) then
      raise exception 'project is archived' using errcode = '55000';
    end if;
    if new.archived_at is not null then
      new.archived_at := old.archived_at;
      new.archived_by := old.archived_by;
    else
      new.archived_by := null;
    end if;
  elsif new.archived_at is not null then
    new.archived_by := app.current_user_id();
  else
    new.archived_by := null;
  end if;
  return new;
end
$$;

create function app.projects_log_activity() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  fields_diff jsonb;
begin
  if tg_op = 'INSERT' then
    perform app.log_project_activity(new.workspace_id, new.id, 'project_created', jsonb_build_object('name', new.name));
    return null;
  end if;

  if new.name is distinct from old.name then
    perform app.log_project_activity(new.workspace_id, new.id, 'renamed',
      jsonb_build_object('from', old.name, 'to', new.name));
  end if;

  if new.status_id is distinct from old.status_id then
    perform app.log_project_activity(new.workspace_id, new.id, 'status_changed', jsonb_build_object(
      'from', (select s.name from public.project_statuses s where s.id = old.status_id),
      'to', (select s.name from public.project_statuses s where s.id = new.status_id)));
  end if;

  -- When a category is deleted, the foreign key clears it on each project after the row is
  -- gone, so its name can no longer be read here. categories_log_delete() records that case
  -- (with the name) before the delete; this branch handles every other change.
  if new.category_id is distinct from old.category_id
     and not (new.category_id is null
              and old.category_id is not null
              and not exists (select 1 from public.project_categories c where c.id = old.category_id)) then
    perform app.log_project_activity(new.workspace_id, new.id, 'category_changed', jsonb_build_object(
      'from', (select c.name from public.project_categories c where c.id = old.category_id),
      'to', (select c.name from public.project_categories c where c.id = new.category_id)));
  end if;

  if new.priority is distinct from old.priority then
    perform app.log_project_activity(new.workspace_id, new.id, 'priority_changed',
      jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;

  if new.client is distinct from old.client then
    perform app.log_project_activity(new.workspace_id, new.id, 'client_changed',
      jsonb_build_object('from', old.client, 'to', new.client));
  end if;

  if new.start_date is distinct from old.start_date then
    perform app.log_project_activity(new.workspace_id, new.id, 'start_date_changed',
      jsonb_build_object('from', to_char(old.start_date, 'YYYY-MM-DD'), 'to', to_char(new.start_date, 'YYYY-MM-DD')));
  end if;

  if new.due_date is distinct from old.due_date then
    perform app.log_project_activity(new.workspace_id, new.id, 'due_date_changed',
      jsonb_build_object('from', to_char(old.due_date, 'YYYY-MM-DD'), 'to', to_char(new.due_date, 'YYYY-MM-DD')));
  end if;

  if new.description is distinct from old.description then
    perform app.log_project_activity(new.workspace_id, new.id, 'description_changed');
  end if;

  if new.custom_fields is distinct from old.custom_fields then
    with o as (select e ->> 'key' as k, e ->> 'value' as v from jsonb_array_elements(old.custom_fields) e),
         n as (select e ->> 'key' as k, e ->> 'value' as v from jsonb_array_elements(new.custom_fields) e)
    select jsonb_build_object(
      'added', coalesce((select jsonb_agg(n.k order by n.k) from n where n.k not in (select k from o)), '[]'::jsonb),
      'removed', coalesce((select jsonb_agg(o.k order by o.k) from o where o.k not in (select k from n)), '[]'::jsonb),
      'changed', coalesce((select jsonb_agg(n.k order by n.k) from n join o on o.k = n.k where n.v is distinct from o.v), '[]'::jsonb))
    into fields_diff;
    -- Reordering alone is not a change worth recording.
    if fields_diff <> '{"added": [], "removed": [], "changed": []}'::jsonb then
      perform app.log_project_activity(new.workspace_id, new.id, 'fields_changed', fields_diff);
    end if;
  end if;

  if old.archived_at is null and new.archived_at is not null then
    perform app.log_project_activity(new.workspace_id, new.id, 'archived');
  elsif old.archived_at is not null and new.archived_at is null then
    perform app.log_project_activity(new.workspace_id, new.id, 'restored');
  end if;

  return null;
end
$$;

create function app.categories_log_delete() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.project_activity (workspace_id, project_id, actor_id, kind, data)
  select p.workspace_id, p.id, app.current_user_id(), 'category_changed',
         jsonb_build_object('from', old.name, 'to', null)
  from public.projects p
  where p.category_id = old.id;
  return old;
end
$$;

create function app.tag_links_guard() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.assert_project_active(case when tg_op = 'DELETE' then old.project_id else new.project_id end);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create function app.tag_links_log_activity() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  link public.project_tag_links := case when tg_op = 'DELETE' then old else new end;
begin
  -- Skipped when the project itself is going away (cascade).
  if exists (select 1 from public.projects p where p.id = link.project_id) then
    perform app.log_project_activity(
      link.workspace_id, link.project_id,
      case when tg_op = 'DELETE' then 'tag_removed' else 'tag_added' end,
      jsonb_build_object('tag', (select t.name from public.project_tags t where t.id = link.tag_id)));
  end if;
  return null;
end
$$;

create function app.notes_guard() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.assert_project_active(case when tg_op = 'DELETE' then old.project_id else new.project_id end);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create function app.notes_stamp_edit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end
$$;

create function app.notes_log_activity() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  subject public.project_notes := case when tg_op = 'DELETE' then old else new end;
  label text := coalesce(nullif(subject.title, ''), left(subject.body, 60));
  kind text;
begin
  if not exists (select 1 from public.projects p where p.id = subject.project_id) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    kind := 'note_added';
  elsif tg_op = 'DELETE' then
    kind := 'note_deleted';
  elsif new.title is distinct from old.title or new.body is distinct from old.body then
    kind := 'note_edited';
  elsif new.pinned is distinct from old.pinned then
    kind := case when new.pinned then 'note_pinned' else 'note_unpinned' end;
  end if;

  if kind is not null then
    perform app.log_project_activity(subject.workspace_id, subject.project_id, kind,
      jsonb_build_object('note_id', subject.id, 'title', label));
    -- Notes count as activity on the project, so "recently updated" reflects them.
    update public.projects set updated_at = now() where id = subject.project_id;
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger project_statuses_touch_updated_at
  before update on public.project_statuses
  for each row execute function app.touch_updated_at();
create trigger project_categories_touch_updated_at
  before update on public.project_categories
  for each row execute function app.touch_updated_at();
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function app.touch_updated_at();
create trigger project_notes_touch_updated_at
  before update on public.project_notes
  for each row execute function app.touch_updated_at();

create trigger workspaces_seed_project_defaults
  after insert on public.workspaces
  for each row execute function app.workspaces_seed_project_defaults();

create trigger projects_guard
  before update on public.projects
  for each row execute function app.projects_guard();
create trigger projects_log_insert
  after insert on public.projects
  for each row execute function app.projects_log_activity();
create trigger projects_log_update
  after update on public.projects
  for each row execute function app.projects_log_activity();

create trigger project_categories_log_delete
  before delete on public.project_categories
  for each row execute function app.categories_log_delete();

create trigger project_tag_links_guard
  before insert or delete on public.project_tag_links
  for each row execute function app.tag_links_guard();
create trigger project_tag_links_log
  after insert or delete on public.project_tag_links
  for each row execute function app.tag_links_log_activity();

create trigger project_notes_guard
  before insert or update or delete on public.project_notes
  for each row execute function app.notes_guard();
create trigger project_notes_stamp_edit
  before update on public.project_notes
  for each row execute function app.notes_stamp_edit();
create trigger project_notes_log
  after insert or update or delete on public.project_notes
  for each row execute function app.notes_log_activity();

-- Existing workspaces (created under M1) get the defaults too.
select app.seed_project_defaults(w.id) from public.workspaces w;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.project_statuses enable row level security;
alter table public.project_categories enable row level security;
alter table public.projects enable row level security;
alter table public.project_tags enable row level security;
alter table public.project_tag_links enable row level security;
alter table public.project_notes enable row level security;
alter table public.project_activity enable row level security;

-- Statuses and categories: everyone in the workspace reads, owners manage.
create policy project_statuses_select_member on public.project_statuses
  for select to framework_app using (app.is_workspace_member(workspace_id));
create policy project_statuses_insert_owner on public.project_statuses
  for insert to framework_app with check (app.workspace_role(workspace_id) = 'owner');
create policy project_statuses_update_owner on public.project_statuses
  for update to framework_app
  using (app.workspace_role(workspace_id) = 'owner')
  with check (app.workspace_role(workspace_id) = 'owner');
create policy project_statuses_delete_owner on public.project_statuses
  for delete to framework_app using (app.workspace_role(workspace_id) = 'owner');

create policy project_categories_select_member on public.project_categories
  for select to framework_app using (app.is_workspace_member(workspace_id));
create policy project_categories_insert_owner on public.project_categories
  for insert to framework_app with check (app.workspace_role(workspace_id) = 'owner');
create policy project_categories_update_owner on public.project_categories
  for update to framework_app
  using (app.workspace_role(workspace_id) = 'owner')
  with check (app.workspace_role(workspace_id) = 'owner');
create policy project_categories_delete_owner on public.project_categories
  for delete to framework_app using (app.workspace_role(workspace_id) = 'owner');

-- Projects: members read, create and edit. There is deliberately no delete policy.
create policy projects_select_member on public.projects
  for select to framework_app using (app.is_workspace_member(workspace_id));
create policy projects_insert_member on public.projects
  for insert to framework_app
  with check (app.is_workspace_member(workspace_id) and created_by = app.current_user_id());
create policy projects_update_member on public.projects
  for update to framework_app
  using (app.is_workspace_member(workspace_id))
  with check (app.is_workspace_member(workspace_id));

create policy project_tags_select_member on public.project_tags
  for select to framework_app using (app.is_workspace_member(workspace_id));
create policy project_tags_insert_member on public.project_tags
  for insert to framework_app with check (app.is_workspace_member(workspace_id));

create policy project_tag_links_select_member on public.project_tag_links
  for select to framework_app using (app.is_workspace_member(workspace_id));
create policy project_tag_links_insert_member on public.project_tag_links
  for insert to framework_app with check (app.is_workspace_member(workspace_id));
create policy project_tag_links_delete_member on public.project_tag_links
  for delete to framework_app using (app.is_workspace_member(workspace_id));

-- Notes: members read and write; only the author or an owner changes or removes one.
create policy project_notes_select_member on public.project_notes
  for select to framework_app using (app.is_workspace_member(workspace_id));
create policy project_notes_insert_member on public.project_notes
  for insert to framework_app
  with check (app.is_workspace_member(workspace_id) and created_by = app.current_user_id());
create policy project_notes_update_author_or_owner on public.project_notes
  for update to framework_app
  using (created_by = app.current_user_id() or app.workspace_role(workspace_id) = 'owner')
  with check (created_by = app.current_user_id() or app.workspace_role(workspace_id) = 'owner');
create policy project_notes_delete_author_or_owner on public.project_notes
  for delete to framework_app
  using (created_by = app.current_user_id() or app.workspace_role(workspace_id) = 'owner');

-- Activity: read-only for members. Rows come from the trigger functions only.
create policy project_activity_select_member on public.project_activity
  for select to framework_app using (app.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Privileges for the application role
-- ---------------------------------------------------------------------------

-- Only the helper that policies and queries need is callable by the app role.
-- The trigger and seeding functions must not be callable directly.
revoke all on function
  app.workspace_member_names(uuid),
  app.log_project_activity(uuid, uuid, text, jsonb),
  app.assert_project_active(uuid),
  app.seed_project_defaults(uuid),
  app.workspaces_seed_project_defaults(),
  app.projects_guard(),
  app.projects_log_activity(),
  app.tag_links_guard(),
  app.tag_links_log_activity(),
  app.notes_guard(),
  app.notes_stamp_edit(),
  app.notes_log_activity(),
  app.categories_log_delete()
  from public;

grant execute on function app.workspace_member_names(uuid) to framework_app;

grant select on
  public.project_statuses, public.project_categories, public.projects, public.project_tags,
  public.project_tag_links, public.project_notes, public.project_activity
  to framework_app;

grant insert (workspace_id, name, kind, color, position) on public.project_statuses to framework_app;
grant update (name, kind, color, position) on public.project_statuses to framework_app;
grant delete on public.project_statuses to framework_app;

grant insert (workspace_id, name, color) on public.project_categories to framework_app;
grant update (name, color) on public.project_categories to framework_app;
grant delete on public.project_categories to framework_app;

grant insert (workspace_id, name, description, status_id, category_id, client, priority, start_date, due_date, custom_fields, created_by)
  on public.projects to framework_app;
grant update (name, description, status_id, category_id, client, priority, start_date, due_date, custom_fields, archived_at)
  on public.projects to framework_app;

grant insert (workspace_id, name) on public.project_tags to framework_app;

grant insert (project_id, tag_id, workspace_id) on public.project_tag_links to framework_app;
grant delete on public.project_tag_links to framework_app;

grant insert (workspace_id, project_id, title, body, pinned, created_by) on public.project_notes to framework_app;
grant update (title, body, pinned) on public.project_notes to framework_app;
grant delete on public.project_notes to framework_app;
