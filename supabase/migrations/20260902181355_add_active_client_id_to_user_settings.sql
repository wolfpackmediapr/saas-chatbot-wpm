-- Agency multi-tenancy, Phase 1: let a user say WHICH of their businesses they
-- are looking at, instead of eight call sites each guessing "the oldest".
--
-- Deliberately additive and left NULL for every existing row. getOwnedWpmClient()
-- reads "active, falling back to oldest", so with every current user owning
-- exactly one client this is a provable no-op until the switcher UI ships.
--
-- ON DELETE SET NULL: deleting a business must not strand its owner on a
-- dangling pointer — they fall back to their oldest remaining client.
--
-- Note the RLS on user_settings only checks user_id, so it does NOT stop someone
-- pointing this at a client they do not own. The read path validates ownership
-- instead (and RLS on wpm_clients would refuse the data anyway).
alter table public.user_settings
  add column if not exists active_client_id uuid
  references public.wpm_clients(id) on delete set null;

comment on column public.user_settings.active_client_id is
  'Which of the owner''s clients the dashboard is currently scoped to. NULL means fall back to the oldest owned client. Ownership is validated on read.';

create index if not exists user_settings_active_client_id_idx
  on public.user_settings (active_client_id)
  where active_client_id is not null;
