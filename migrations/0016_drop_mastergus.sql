-- Remove only the MasterGus account. No other profile is touched.
delete from game_chat
where user_id in (select user_id from profiles where username_lc = 'mastergus');

delete from match_queue
where user_id in (select user_id from profiles where username_lc = 'mastergus');

delete from challenges
where from_user_id in (select user_id from profiles where username_lc = 'mastergus')
   or to_user_id in (select user_id from profiles where username_lc = 'mastergus');

update games
set status = 'draw', scored = true
where status = 'active'
  and (
    white_user_id in (select user_id from profiles where username_lc = 'mastergus')
    or black_user_id in (select user_id from profiles where username_lc = 'mastergus')
  );

delete from chess_club_messages
where from_user_id in (select user_id from profiles where username_lc = 'mastergus')
   or to_user_id in (select user_id from profiles where username_lc = 'mastergus');

delete from chess_club_calls
where from_user_id in (select user_id from profiles where username_lc = 'mastergus')
   or to_user_id in (select user_id from profiles where username_lc = 'mastergus');

delete from chess_club_requests
where user_id in (select user_id from profiles where username_lc = 'mastergus');

delete from chess_club_members
where user_id in (select user_id from profiles where username_lc = 'mastergus');

delete from "session"
where "userId" in (select user_id from profiles where username_lc = 'mastergus');

delete from "account"
where "userId" in (select user_id from profiles where username_lc = 'mastergus');

delete from "user"
where id in (select user_id from profiles where username_lc = 'mastergus');

delete from "verification"
where lower("identifier") = 'mastergus@players.moreschess.app';

delete from profiles
where username_lc = 'mastergus';
