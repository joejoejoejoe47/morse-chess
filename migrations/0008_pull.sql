alter table challenges add column if not exists kind text not null default 'named';
alter table match_queue add column if not exists pinged integer not null default 0;
