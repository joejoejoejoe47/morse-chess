-- Remove only IvoryRock and IvoryRook. No other profile is updated.
delete from game_chat
where user_id in (
  select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')
);

delete from match_queue
where user_id in (
  select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')
);

delete from challenges
where from_user_id in (
  select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')
)
or to_user_id in (
  select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')
);

update games
set status = 'draw', scored = true
where status = 'active'
  and (
    white_user_id in (select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook'))
    or black_user_id in (select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook'))
  );

delete from "session"
where "userId" in (
  select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')
);

delete from "account"
where "userId" in (
  select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')
);

delete from "user"
where id in (
  select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')
);

delete from "verification"
where lower("identifier") in (
  'ivoryrock@players.moreschess.app',
  'ivoryrook@players.moreschess.app'
);

delete from profiles
where username_lc in ('ivoryrock', 'ivoryrook');
