alter table games add column if not exists camera_open boolean not null default false;

insert into profiles (user_id, username, username_lc, score)
values ('bot-mores-v2', 'MorseBotv2', 'morsebotv2', 2200)
on conflict (user_id) do nothing;
