-- =============================================================================
-- Migration 003: Sistema de fidelidade / pontuação estilo Gym Rats
-- =============================================================================
-- - checkins: cada post que o consultor marca (link + tipo + data)
-- - profiles ganha colunas total_points / streaks / last_checkin_date
-- - trigger recalcula pontos, streak e last_date ao inserir/deletar checkin
-- - RLS: consultor lê/cria os seus; admin faz tudo
-- Idempotente.
-- =============================================================================

-- 1) Enum tipo de post
do $$ begin
  create type checkin_post_type as enum ('feed', 'story', 'reel', 'carousel', 'outro');
exception when duplicate_object then null; end $$;

-- 2) Colunas em profiles
alter table public.profiles
  add column if not exists total_points      int  not null default 0,
  add column if not exists current_streak    int  not null default 0,
  add column if not exists longest_streak    int  not null default 0,
  add column if not exists last_checkin_date date;

create index if not exists profiles_points_idx on public.profiles (total_points desc);

-- 3) Tabela checkins
create table if not exists public.checkins (
  id             uuid primary key default gen_random_uuid(),
  consultant_id  uuid not null references public.profiles(id) on delete cascade,
  post_url       text not null,
  post_type      checkin_post_type not null default 'feed',
  caption        text,
  posted_at      timestamptz not null default now(),
  points_awarded int not null default 10,
  streak_at_time int not null default 1,
  approved       boolean not null default true,
  invalidated_at timestamptz,
  invalidated_by uuid references public.profiles(id) on delete set null,
  invalidated_reason text,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists checkins_consultant_date_idx on public.checkins (consultant_id, posted_at desc);
create index if not exists checkins_created_idx on public.checkins (created_at desc);

-- 4) Trigger: recalcula pontos e streak
create or replace function public.recalc_consultant_stats(p_consultant_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_total int;
  v_last date;
  v_streak int := 0;
  v_longest int := 0;
  v_prev date;
  v_curr date;
  rec record;
begin
  select coalesce(sum(points_awarded), 0)
    into v_total
    from public.checkins
    where consultant_id = p_consultant_id and approved = true and invalidated_at is null;

  select max((posted_at at time zone 'America/Sao_Paulo')::date)
    into v_last
    from public.checkins
    where consultant_id = p_consultant_id and approved = true and invalidated_at is null;

  -- calcula streak: dias consecutivos até v_last inclusive
  v_prev := null;
  v_streak := 0;
  for rec in
    select distinct (posted_at at time zone 'America/Sao_Paulo')::date as d
    from public.checkins
    where consultant_id = p_consultant_id
      and approved = true
      and invalidated_at is null
    order by d desc
  loop
    v_curr := rec.d;
    if v_prev is null then
      v_streak := 1;
    elsif v_prev - v_curr = 1 then
      v_streak := v_streak + 1;
    else
      exit; -- quebrou consecutividade
    end if;
    v_prev := v_curr;
  end loop;

  -- longest streak
  v_longest := 0;
  declare
    prev2 date;
    curr2 date;
    run int := 0;
    running_max int := 0;
  begin
    for rec in
      select distinct (posted_at at time zone 'America/Sao_Paulo')::date as d
      from public.checkins
      where consultant_id = p_consultant_id
        and approved = true
        and invalidated_at is null
      order by d asc
    loop
      curr2 := rec.d;
      if prev2 is null or curr2 - prev2 = 1 then
        run := run + 1;
      else
        run := 1;
      end if;
      if run > running_max then running_max := run; end if;
      prev2 := curr2;
    end loop;
    v_longest := running_max;
  end;

  update public.profiles
    set total_points = v_total,
        current_streak = v_streak,
        longest_streak = greatest(v_longest, longest_streak),
        last_checkin_date = v_last
    where id = p_consultant_id;
end;
$$;

create or replace function public.checkins_after_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_consultant_stats(old.consultant_id);
    return old;
  else
    perform public.recalc_consultant_stats(new.consultant_id);
    return new;
  end if;
end;
$$;

drop trigger if exists checkins_after_change on public.checkins;
create trigger checkins_after_change
  after insert or update or delete on public.checkins
  for each row execute function public.checkins_after_change();

-- 5) RLS
alter table public.checkins enable row level security;

drop policy if exists "checkins read own"   on public.checkins;
drop policy if exists "checkins insert own" on public.checkins;
drop policy if exists "checkins update own" on public.checkins;
drop policy if exists "checkins delete own" on public.checkins;
drop policy if exists "checkins admin all"  on public.checkins;

create policy "checkins read own"
  on public.checkins for select
  using (auth.uid() = consultant_id);

create policy "checkins insert own"
  on public.checkins for insert
  with check (auth.uid() = consultant_id and public.is_approved(auth.uid()));

create policy "checkins update own"
  on public.checkins for update
  using (auth.uid() = consultant_id)
  with check (auth.uid() = consultant_id);

create policy "checkins delete own"
  on public.checkins for delete
  using (auth.uid() = consultant_id);

create policy "checkins admin all"
  on public.checkins for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 6) VIEW pra ranking (leve, calculada)
create or replace view public.consultant_ranking as
  select
    p.id,
    p.full_name,
    p.email,
    p.photo_url,
    p.city,
    p.total_points,
    p.current_streak,
    p.longest_streak,
    p.last_checkin_date,
    (select count(*) from public.checkins c where c.consultant_id = p.id and c.approved = true and c.invalidated_at is null) as total_posts
  from public.profiles p
  where p.role = 'consultant' and p.status = 'approved';

-- ranking também é lido por consultores aprovados (pra ver ranking global)
grant select on public.consultant_ranking to authenticated;
