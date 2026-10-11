-- ============================================================================
-- Migration 007 — SDR assignments: atribuição de leads do Hub pros consultores
-- ============================================================================
-- O SDR real vive no LOOG Hub externo (/api/sdr/* é só proxy). Esta tabela
-- adiciona a camada LOCAL de "quem é responsável por qual lead" — permite ao
-- admin distribuir leads pros 4 consultores dedicados e cada consultor ver
-- APENAS os leads atribuídos a ele (aba "Meus leads").
--
-- lead_id é string livre: vem do Hub (ex: "wa:5524998601553") e não temos FK.
-- ============================================================================

create table if not exists public.sdr_assignments (
  lead_id        text primary key,
  consultant_id  uuid not null references auth.users(id) on delete cascade,
  assigned_by    uuid references auth.users(id) on delete set null,
  assigned_at    timestamptz not null default now(),
  notes          text
);

create index if not exists sdr_assignments_consultant_idx
  on public.sdr_assignments (consultant_id, assigned_at desc);
create index if not exists sdr_assignments_assigned_at_idx
  on public.sdr_assignments (assigned_at desc);

-- ───────────────────── RLS ──────────────────────────────────────────────────
alter table public.sdr_assignments enable row level security;

-- SELECT: admin vê tudo; consultor vê só o que foi atribuído a ele;
-- gestor vê os do seu grupo (via join com profiles)
create policy sdr_assignments_select on public.sdr_assignments for select
  using (
    public.is_admin(auth.uid())
    or consultant_id = auth.uid()
    or (public.is_gestor(auth.uid()) and exists (
          select 1 from public.profiles p
          where p.id = sdr_assignments.consultant_id
            and p.group_id = public.gestor_group_id(auth.uid())))
  );

-- INSERT/UPDATE/DELETE: só admin
create policy sdr_assignments_insert on public.sdr_assignments for insert
  with check (public.is_admin(auth.uid()));
create policy sdr_assignments_update on public.sdr_assignments for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy sdr_assignments_delete on public.sdr_assignments for delete
  using (public.is_admin(auth.uid()));
