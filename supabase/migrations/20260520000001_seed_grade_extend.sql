-- Extend public.seed_grade enum from {A,B,C,reject} to {A..H, reject}.
--
-- Lets varieties declare more than three quality tiers when their
-- crop calls for it. Forward-only: Postgres allows adding enum
-- values but removing them in-place is impractical.
--
-- The "reject" value remains a special non-tier classification used
-- when no grade rule matches; it is not a user-editable grade.

alter type public.seed_grade add value if not exists 'D';
alter type public.seed_grade add value if not exists 'E';
alter type public.seed_grade add value if not exists 'F';
alter type public.seed_grade add value if not exists 'G';
alter type public.seed_grade add value if not exists 'H';
