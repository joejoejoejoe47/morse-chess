update profiles as bot
set score = greatest(100, player.score - 1)
from profiles as player
where player.username_lc = 'jsmorse47'
  and bot.user_id = 'bot-mores'
  and bot.score >= player.score;
