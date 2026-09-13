alter table profiles add column if not exists equipped_board text not null default 'lodge';
alter table profiles alter column score set default 0;
