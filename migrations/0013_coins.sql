alter table profiles add column if not exists coins integer not null default 0;
alter table profiles add column if not exists bot_streak integer not null default 0;
alter table games add column if not exists coin_award integer not null default 0;
