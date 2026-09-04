-- Every other table in this schema defaults `owner` to auth.uid(); repairs was
-- created without it, which would have made the insert policy
-- (owner = auth.uid()) refuse every write from the browser, since the client
-- never sends the column.
alter table public.repairs alter column owner set default auth.uid();
