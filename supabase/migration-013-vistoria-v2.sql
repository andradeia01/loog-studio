-- Migration 013: Vistoria V2 (fluxo 60s + 3 fotos)
--
-- Mudanças:
-- 1. Novos capture kinds pra CRLV_PHOTO e CRLV_UPLOAD (PDF)
-- 2. Novos campos em inspections pra fluxo V2:
--    - video_duration_sec (metadata do único vídeo contínuo)
--    - video_phases_completed (quantas das 6 fases guiadas foram gravadas)
--    - wizard_version ('v1' legado | 'v2' novo)
-- 3. Nova action admin: override manual (admin_override_at, admin_override_by, admin_override_reason)

-- Capture kinds novos (adiciona ao enum)
do $$ begin
  alter type capture_kind add value if not exists 'CRLV_PHOTO';
  alter type capture_kind add value if not exists 'CRLV_UPLOAD';
exception when duplicate_object then null; end $$;

-- Colunas novas em inspections
alter table public.inspections
  add column if not exists video_duration_sec integer,
  add column if not exists video_phases_completed integer default 0,
  add column if not exists wizard_version text not null default 'v1' check (wizard_version in ('v1', 'v2')),
  add column if not exists admin_override_at timestamptz,
  add column if not exists admin_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists admin_override_reason text;

-- Index pra admin filtrar por wizard version
create index if not exists inspections_wizard_version_idx on public.inspections (wizard_version);

-- Permite PDF no bucket inspection-media (CRLV pode ser PDF digital)
update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'video/webm', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'audio/webm', 'audio/ogg', 'audio/mpeg',
  'application/pdf'
]
where id = 'inspection-media';

comment on column public.inspections.wizard_version is 'v1 = fluxo antigo 10-15min / v2 = novo 60s + 3 fotos';
comment on column public.inspections.admin_override_at is 'Quando admin fez override manual (aprovar/rejeitar NEEDS_REVIEW)';
