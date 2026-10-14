-- =============================================================================
-- Migration 009: Fidelidade V2 — gamificação profissional + anti-fraude + analytics
-- =============================================================================
-- Pacote A: pontos por tipo, metas semanais, ranking sem/mês, badges, push streak
-- Pacote B: validação URL, anti-duplicado, flag suspeita, thumbnails
-- Pacote C: correlação posts × vendas, recompensas configuráveis, gráficos
-- =============================================================================

-- ─── A1: Pontuação diferenciada por tipo (atualiza função de pontuação) ──────
-- A pontuação em si é calculada no endpoint /api/checkins (lê do checkins.post_type)
-- Aqui apenas garantimos o default: feed = 10 (base), demais ajustados pelo backend.

-- ─── B1: Anti-duplicado (URL única por consultor) ────────────────────────────
-- Primeiro: invalida duplicatas EXISTENTES (mantém a mais antiga, invalida resto)
update public.checkins c
set invalidated_at = now(),
    invalidated_reason = 'url duplicada (migração 009)'
where id in (
  select id from (
    select id,
      row_number() over (partition by consultant_id, post_url order by created_at asc) as rn
    from public.checkins
    where invalidated_at is null
  ) t where t.rn > 1
);

-- Agora cria o índice único parcial — mesma URL não pode ser enviada 2x pelo
-- mesmo consultor (admin pode duplicar via raw SQL se precisar corrigir algo)
create unique index if not exists checkins_consultant_url_uniq
  on public.checkins (consultant_id, post_url)
  where invalidated_at is null;

-- ─── B2: Metadata pra thumbnail/caption do oEmbed ────────────────────────────
-- metadata já existe (jsonb). Backend vai gravar: { thumbnail_url, author_name, html, provider }

-- ─── A2+A3: Views de ranking semanal e mensal ───────────────────────────────
create or replace view public.v_ranking_semanal as
with inicio_semana as (
  select date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date as d
)
select
  p.id, p.full_name, p.email, p.photo_url, p.city,
  coalesce(sum(c.points_awarded) filter (where c.approved and c.invalidated_at is null), 0) as pontos_semana,
  count(c.*) filter (where c.approved and c.invalidated_at is null) as posts_semana,
  count(c.*) filter (where c.approved and c.invalidated_at is null and c.post_type = 'reel') as reels_semana
from public.profiles p
left join public.checkins c
  on c.consultant_id = p.id
  and (c.posted_at at time zone 'America/Sao_Paulo')::date >= (select d from inicio_semana)
where p.role in ('consultant', 'consultant_sdr') and p.status = 'approved'
group by p.id, p.full_name, p.email, p.photo_url, p.city
order by pontos_semana desc;

create or replace view public.v_ranking_mensal as
with inicio_mes as (
  select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as d
)
select
  p.id, p.full_name, p.email, p.photo_url, p.city,
  coalesce(sum(c.points_awarded) filter (where c.approved and c.invalidated_at is null), 0) as pontos_mes,
  count(c.*) filter (where c.approved and c.invalidated_at is null) as posts_mes
from public.profiles p
left join public.checkins c
  on c.consultant_id = p.id
  and (c.posted_at at time zone 'America/Sao_Paulo')::date >= (select d from inicio_mes)
where p.role in ('consultant', 'consultant_sdr') and p.status = 'approved'
group by p.id, p.full_name, p.email, p.photo_url, p.city
order by pontos_mes desc;

grant select on public.v_ranking_semanal, public.v_ranking_mensal to authenticated;

-- ─── A4: Sistema de badges ───────────────────────────────────────────────────
do $$ begin
  create type fidelity_badge_kind as enum (
    'post_10',          -- 10 posts
    'post_30',          -- 30 posts
    'post_100',         -- 100 posts
    'streak_7',         -- 7 dias consecutivos
    'streak_30',        -- 30 dias consecutivos
    'streak_100',       -- 100 dias consecutivos (lenda)
    'top1_semana',      -- top 1 em uma semana (any time)
    'top1_mes',         -- top 1 em um mês
    'semana_cheia',     -- 7 posts em 7 dias
    'produtor_reel',    -- 20 reels (incentiva o formato que gera autoridade)
    'convertor'         -- posts que viraram vendas (correlação com CRM)
  );
exception when duplicate_object then null; end $$;

create table if not exists public.fidelity_badges (
  id              uuid primary key default gen_random_uuid(),
  consultant_id   uuid not null references public.profiles(id) on delete cascade,
  kind            fidelity_badge_kind not null,
  awarded_at      timestamptz not null default now(),
  metadata        jsonb,
  unique (consultant_id, kind)   -- cada badge só uma vez por consultor
);
create index if not exists fidelity_badges_consultant_idx on public.fidelity_badges (consultant_id, awarded_at desc);

alter table public.fidelity_badges enable row level security;

drop policy if exists "badges read all approved" on public.fidelity_badges;
drop policy if exists "badges insert admin"      on public.fidelity_badges;

-- consultores aprovados leem tudo (ranking visual mostra badges dos outros)
create policy "badges read all approved"
  on public.fidelity_badges for select
  using (public.is_approved(auth.uid()));

-- só admin insere (via trigger ou endpoint). Também aceita insert via security definer da func.
create policy "badges insert admin"
  on public.fidelity_badges for insert
  with check (public.is_admin(auth.uid()));

-- ─── C1: Tabela de recompensas configuráveis ────────────────────────────────
do $$ begin
  create type reward_scope as enum ('semanal', 'mensal', 'anual', 'conquista');
exception when duplicate_object then null; end $$;

create table if not exists public.fidelity_rewards (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descricao      text,
  scope          reward_scope not null default 'mensal',
  posicao_min    int,                              -- ex: top 1 = 1, top 3 = 3
  pontos_min     int,                              -- OU meta de pontos
  valor          text,                             -- descrição livre do prêmio ("R$ 500", "Jantar", "Comissão extra 5%")
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null
);
create index if not exists fidelity_rewards_scope_ativo on public.fidelity_rewards (scope, ativo);

alter table public.fidelity_rewards enable row level security;

drop policy if exists "rewards read all approved" on public.fidelity_rewards;
drop policy if exists "rewards admin all"         on public.fidelity_rewards;

create policy "rewards read all approved"
  on public.fidelity_rewards for select
  using (public.is_approved(auth.uid()) and ativo = true);

create policy "rewards admin all"
  on public.fidelity_rewards for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ─── C2: View de correlação posts × vendas ──────────────────────────────────
-- Posts últimos 30d por consultor VS cotações (CRM) convertidas em 'cliente'
create or replace view public.v_fidelity_vendas as
select
  p.id,
  p.full_name,
  p.email,
  coalesce(count(c.*) filter (where c.approved and c.invalidated_at is null
    and c.posted_at > now() - interval '30 days'), 0) as posts_30d,
  coalesce(count(ct.*) filter (where ct.created_at > now() - interval '30 days'), 0) as leads_30d,
  coalesce(count(ct.*) filter (where ct.status_ciclo = 'cliente'
    and ct.created_at > now() - interval '30 days'), 0) as fechamentos_30d
from public.profiles p
left join public.checkins c on c.consultant_id = p.id
left join public.crm_contacts ct on ct.owner_id = p.id
where p.role in ('consultant', 'consultant_sdr') and p.status = 'approved'
group by p.id, p.full_name, p.email;

grant select on public.v_fidelity_vendas to authenticated;

-- ─── A4-helper: função de auto-award de badges ──────────────────────────────
-- Chamada pelo trigger após cada checkin. Confere condições e insere badges novos.
create or replace function public.auto_award_badges(p_consultant_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_total_posts int;
  v_total_reels int;
  v_longest int;
  v_current int;
  v_week_posts int;
begin
  -- Contadores
  select
    count(*) filter (where approved and invalidated_at is null),
    count(*) filter (where approved and invalidated_at is null and post_type = 'reel')
    into v_total_posts, v_total_reels
    from checkins where consultant_id = p_consultant_id;

  select longest_streak, current_streak into v_longest, v_current
    from profiles where id = p_consultant_id;

  -- Posts por semana (7 dias contagem)
  select count(*) into v_week_posts
    from checkins
    where consultant_id = p_consultant_id
      and approved and invalidated_at is null
      and (posted_at at time zone 'America/Sao_Paulo')::date > (now() at time zone 'America/Sao_Paulo')::date - 7;

  -- Insere badges novos (ignora conflito pelo unique)
  if v_total_posts >= 10 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'post_10') on conflict do nothing;
  end if;
  if v_total_posts >= 30 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'post_30') on conflict do nothing;
  end if;
  if v_total_posts >= 100 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'post_100') on conflict do nothing;
  end if;
  if coalesce(v_longest, 0) >= 7 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'streak_7') on conflict do nothing;
  end if;
  if coalesce(v_longest, 0) >= 30 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'streak_30') on conflict do nothing;
  end if;
  if coalesce(v_longest, 0) >= 100 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'streak_100') on conflict do nothing;
  end if;
  if v_week_posts >= 7 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'semana_cheia') on conflict do nothing;
  end if;
  if v_total_reels >= 20 then
    insert into fidelity_badges (consultant_id, kind) values (p_consultant_id, 'produtor_reel') on conflict do nothing;
  end if;
end;
$$;

-- Trigger: após cada checkin, chama auto_award_badges
create or replace function public.checkins_after_change_with_badges()
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
    perform public.auto_award_badges(new.consultant_id);
    return new;
  end if;
end;
$$;

-- Substitui trigger antigo (que não chamava badges)
drop trigger if exists checkins_after_change on public.checkins;
create trigger checkins_after_change
  after insert or update or delete on public.checkins
  for each row execute function public.checkins_after_change_with_badges();

-- ─── Backfill: award badges pros consultores que já atingiram ───────────────
do $$
declare r record;
begin
  for r in select id from profiles where status = 'approved' and role in ('consultant','consultant_sdr')
  loop
    perform public.auto_award_badges(r.id);
  end loop;
end $$;
