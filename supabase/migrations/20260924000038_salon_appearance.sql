-- =============================================================================
-- Salon appearance: colour scheme, fonts and text size
--
-- Phase 4 of the frontend redesign. Four presentation settings, one value each
-- per salon, applied to everyone who signs in to it. They live on `salons`
-- beside the other salon-level choices (name, timezone, currency) rather than
-- on `salon_settings`, so the dashboard layout reads them in the query that
-- already loads the salon -- no extra round trip.
--
-- The allowed values are enforced here as well as in the form: a CHECK
-- constraint is the only thing that cannot be bypassed by a hand-made request.
-- They mirror THEMES, HEADING_FONTS, BODY_FONTS and TEXT_SIZES in
-- src/lib/appearance.ts, and the [data-*] blocks in src/app/globals.css.
--
-- No policy changes. Row Level Security already covers these columns:
--
--   salons_select_own_tenant   SELECT  id = current_salon_id()
--   salons_update_owner_only   UPDATE  id = current_salon_id()
--                                      and has_module('settings')
--                              (migration 20260923000032; the name predates
--                              roles -- "owner" there means "holds Settings",
--                              which the owner always does)
--
-- so every member of a salon can read its appearance, and whoever holds the
-- Settings module can change it. Existing rows take the defaults, which are the
-- look the app has always had.
-- =============================================================================

alter table public.salons
  add column theme text not null default 'plum'
    constraint salons_theme_check
    check (theme in ('plum', 'sage', 'ocean', 'rose', 'terra', 'midnight')),
  add column font_heading text not null default 'sora'
    constraint salons_font_heading_check
    check (font_heading in ('sora', 'playfair', 'dmserif', 'poppins')),
  add column font_body text not null default 'figtree'
    constraint salons_font_body_check
    check (font_body in ('figtree', 'nunito', 'lato', 'source')),
  add column text_size text not null default 'm'
    constraint salons_text_size_check
    check (text_size in ('s', 'm', 'l'));

comment on column public.salons.theme is
  'Dashboard colour scheme. Applies to everyone in the salon. Mirrors THEMES in src/lib/appearance.ts.';
comment on column public.salons.font_heading is
  'Heading font. Mirrors HEADING_FONTS in src/lib/appearance.ts.';
comment on column public.salons.font_body is
  'Body text font. Mirrors BODY_FONTS in src/lib/appearance.ts.';
comment on column public.salons.text_size is
  'Base text size: s (13px), m (14px) or l (15.5px). Mirrors TEXT_SIZES in src/lib/appearance.ts.';
