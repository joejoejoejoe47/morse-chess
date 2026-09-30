alter table profiles add column if not exists avatar_json text not null default '';
alter table profiles add column if not exists piece_style text not null default '3d';
alter table profiles add column if not exists owned_gear text not null default '';
alter table profiles add column if not exists club_locked boolean not null default false;

create table if not exists chess_clubs (
  id text primary key,
  name text not null,
  name_lc text not null unique,
  password_hash text not null,
  host_user_id text not null,
  board_id text not null default 'lodge',
  created_at timestamptz not null default now()
);

create table if not exists chess_club_members (
  club_id text not null,
  user_id text not null,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists chess_club_requests (
  id text primary key,
  club_id text not null,
  user_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists chess_club_requests_host_idx on chess_club_requests (club_id, status);

create table if not exists chess_club_messages (
  id text primary key,
  club_id text not null,
  from_user_id text not null,
  to_user_id text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chess_club_messages_club_idx on chess_club_messages (club_id, created_at);

create table if not exists chess_club_events (
  id text primary key,
  club_id text not null,
  kind text not null,
  state text not null,
  updated_at timestamptz not null default now()
);

create table if not exists chess_club_calls (
  id text primary key,
  club_id text not null,
  from_user_id text not null,
  to_user_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists club_bracket (
  id text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
);
