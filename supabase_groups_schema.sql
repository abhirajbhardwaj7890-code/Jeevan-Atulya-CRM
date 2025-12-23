-- Create Groups Table
create table public.groups (
  id text not null primary key,
  name text not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Group Members Junction Table
create table public.group_members (
  group_id text not null references public.groups(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (group_id, member_id)
);

-- Enable RLS (Row Level Security) - Optional but recommended
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- Create Policies (Public Access for Demo purposes, adjust for production)
create policy "Enable all access for all users" on public.groups for all using (true) with check (true);
create policy "Enable all access for all users" on public.group_members for all using (true) with check (true);
