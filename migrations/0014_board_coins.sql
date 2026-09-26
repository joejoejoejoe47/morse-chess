alter table profiles add column if not exists owned_boards text not null default '';
alter table profiles add column if not exists coins_ready boolean not null default false;
update profiles set coins = 1000, coins_ready = true
where username_lc = 'mastergus' and coins_ready = false;
