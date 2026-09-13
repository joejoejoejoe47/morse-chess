alter table games add column if not exists chat_open boolean not null default false;
alter table games add column if not exists last_prize integer;

create table if not exists game_chat (
  id serial primary key,
  game_id text not null,
  user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists game_chat_game_idx on game_chat (game_id, id);
