-- Documents per property: contracts, receipts, municipal tax, appraisals.
--
-- Shai named this twice in a 69-second video — at 0:17 ("פה יש לי מסמכים
-- שאני יכול לראות מה שמתי") and again at 1:05, where it was the thing he
-- closed "זה הכי נוח שיש" with. Until now the app stored only images.
--
-- ⚠️ The bucket is PRIVATE, unlike property-images. A lease contract carries a
-- tenant's name, ID and bank details; it must never sit behind a guessable
-- public URL. Reads go through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-documents', 'property-documents', false,
  20971520,  -- 20 MB; scans of a signed lease run large
  array[
    'application/pdf',
    'image/jpeg','image/png','image/heic','image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.property_documents (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  owner        uuid not null default auth.uid(),
  title        text not null,
  -- A closed vocabulary, so the list can be filtered and coloured. 'אחר' is
  -- the honest escape hatch — better than forcing a wrong category.
  doc_type     text not null default 'אחר'
               check (doc_type in ('חוזה','קבלה','ארנונה','שמאות','ביטוח','אישור','אחר')),
  storage_path text not null unique,
  mime_type    text,
  size_bytes   bigint,
  -- The date ON the document (contract signing, receipt date) — deliberately
  -- separate from created_at, which is only when it was uploaded. Nullable:
  -- inventing a date for a document that does not carry one is worse than null.
  doc_date     date,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists property_documents_property_idx
  on public.property_documents (property_id, doc_date desc nulls last, created_at desc);

alter table public.property_documents enable row level security;

-- Same shape as properties / property_images: the portfolio is shared between
-- Shai and Royi, so membership grants read; only the uploader is stamped owner.
drop policy if exists property_documents_select_member on public.property_documents;
create policy property_documents_select_member on public.property_documents
  for select using (public.is_portfolio_member());

drop policy if exists property_documents_insert_member on public.property_documents;
create policy property_documents_insert_member on public.property_documents
  for insert with check (public.is_portfolio_member() and owner = auth.uid());

drop policy if exists property_documents_update_member on public.property_documents;
create policy property_documents_update_member on public.property_documents
  for update using (public.is_portfolio_member());

drop policy if exists property_documents_delete_member on public.property_documents;
create policy property_documents_delete_member on public.property_documents
  for delete using (public.is_portfolio_member());

-- Storage: the same membership rule, scoped to this bucket only, so it cannot
-- widen access to property-images by accident.
drop policy if exists property_documents_objects_select on storage.objects;
create policy property_documents_objects_select on storage.objects
  for select using (bucket_id = 'property-documents' and public.is_portfolio_member());

drop policy if exists property_documents_objects_insert on storage.objects;
create policy property_documents_objects_insert on storage.objects
  for insert with check (bucket_id = 'property-documents' and public.is_portfolio_member());

drop policy if exists property_documents_objects_delete on storage.objects;
create policy property_documents_objects_delete on storage.objects
  for delete using (bucket_id = 'property-documents' and public.is_portfolio_member());
