create table if not exists profiles (
  user_id text primary key,
  username text not null,
  username_lc text not null unique,
  score integer not null default 0,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists challenges (
  id text primary key,
  from_user_id text not null,
  to_user_id text not null,
  mode text not null,
  status text not null default 'pending',
  game_id text,
  created_at timestamptz not null default now()
);
create index if not exists challenges_to_status_idx on challenges (to_user_id, status);
create index if not exists challenges_from_status_idx on challenges (from_user_id, status);

create table if not exists match_queue (
  user_id text primary key,
  score integer not null,
  mode text not null,
  joined_at timestamptz not null default now()
);

create table if not exists games (
  id text primary key,
  white_user_id text not null,
  black_user_id text not null,
  mode text not null,
  fen text not null,
  status text not null default 'active',
  turn text not null default 'w',
  last_move_from text,
  last_move_to text,
  last_move_san text,
  turn_started_at timestamptz not null default now(),
  winner_user_id text,
  scored boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists games_status_idx on games (status);
create index if not exists games_white_idx on games (white_user_id);
create index if not exists games_black_idx on games (black_user_id);

create table if not exists game_moves (
  id serial primary key,
  game_id text not null,
  ply integer not null,
  san text not null,
  from_sq text not null,
  to_sq text not null,
  created_at timestamptz not null default now()
);
create index if not exists game_moves_game_idx on game_moves (game_id, ply);

insert into profiles (user_id, username, username_lc, score)
values ('bot-mores', 'MoresBot', 'moresbot', 0)
on conflict (user_id) do nothing;
