alter table games add column if not exists white_clock_ms integer not null default 60000;
alter table games add column if not exists black_clock_ms integer not null default 60000;
