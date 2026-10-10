-- Morse Chess schema (MySQL 5.7+ / MariaDB 10.3+, utf8mb4).
--
-- This is the FINAL state of the original Node app's 17 migrations plus the
-- tables/columns it used to create lazily at runtime. Everything is
-- CREATE TABLE IF NOT EXISTS, so it is safe to run against a fresh database and
-- against a database that already holds the old app's tables.
--
-- Conventions (the SQLite test/dev path relies on them):
--   * one statement per `;`, no stored procedures
--   * secondary indexes are declared inline as `KEY name (cols)` on their own line
--   * timestamps are DATETIME(3) holding UTC, always written by PHP (never NOW())

-- ── Accounts & sessions ────────────────────────────────────────────────────
-- Column names match the old Better Auth tables so an existing database keeps
-- its users (passwords hashed by the old app cannot be verified by PHP; those
-- users need a password reset, see README).

CREATE TABLE IF NOT EXISTS `user` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `emailVerified` TINYINT(1) NOT NULL DEFAULT 0,
  `image` MEDIUMTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_email_uq` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `session` (
  `id` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `token` VARCHAR(128) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `userId` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token_uq` (`token`),
  KEY `session_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `account` (
  `id` VARCHAR(64) NOT NULL,
  `accountId` VARCHAR(255) NOT NULL,
  `providerId` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `accessToken` MEDIUMTEXT NULL,
  `refreshToken` MEDIUMTEXT NULL,
  `idToken` MEDIUMTEXT NULL,
  `accessTokenExpiresAt` DATETIME(3) NULL,
  `refreshTokenExpiresAt` DATETIME(3) NULL,
  `scope` VARCHAR(512) NULL,
  `password` MEDIUMTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `account_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sliding-window throttle for sign-in / sign-up attempts.
CREATE TABLE IF NOT EXISTS `auth_throttle` (
  `bucket` VARCHAR(190) NOT NULL,
  `hits` INT NOT NULL DEFAULT 0,
  `window_start` DATETIME(3) NOT NULL,
  PRIMARY KEY (`bucket`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Players, matchmaking, games ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `profiles` (
  `user_id` VARCHAR(64) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `username_lc` VARCHAR(64) NOT NULL,
  `score` INT NOT NULL DEFAULT 0,
  `last_seen` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `equipped_board` VARCHAR(64) NOT NULL DEFAULT 'lodge',
  `coins` INT NOT NULL DEFAULT 0,
  `bot_streak` INT NOT NULL DEFAULT 0,
  `owned_boards` VARCHAR(1024) NOT NULL DEFAULT '',
  `coins_ready` TINYINT(1) NOT NULL DEFAULT 0,
  `avatar_json` VARCHAR(2048) NOT NULL DEFAULT '',
  `piece_style` VARCHAR(16) NOT NULL DEFAULT '3d',
  `owned_gear` VARCHAR(2048) NOT NULL DEFAULT '',
  `club_locked` TINYINT(1) NOT NULL DEFAULT 0,
  `elo_scaled` TINYINT(1) NOT NULL DEFAULT 0,
  `sandbox_owned` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `profiles_username_lc_uq` (`username_lc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `challenges` (
  `id` VARCHAR(64) NOT NULL,
  `from_user_id` VARCHAR(64) NOT NULL,
  `to_user_id` VARCHAR(64) NOT NULL,
  `mode` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `game_id` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL,
  `kind` VARCHAR(16) NOT NULL DEFAULT 'named',
  PRIMARY KEY (`id`),
  KEY `challenges_to_status_idx` (`to_user_id`, `status`),
  KEY `challenges_from_status_idx` (`from_user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `match_queue` (
  `user_id` VARCHAR(64) NOT NULL,
  `score` INT NOT NULL,
  `mode` VARCHAR(16) NOT NULL,
  `joined_at` DATETIME(3) NOT NULL,
  `pinged` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `games` (
  `id` VARCHAR(64) NOT NULL,
  `white_user_id` VARCHAR(64) NOT NULL,
  `black_user_id` VARCHAR(64) NOT NULL,
  `mode` VARCHAR(16) NOT NULL,
  `fen` VARCHAR(255) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `turn` VARCHAR(1) NOT NULL DEFAULT 'w',
  `last_move_from` VARCHAR(8) NULL,
  `last_move_to` VARCHAR(8) NULL,
  `last_move_san` VARCHAR(32) NULL,
  `turn_started_at` DATETIME(3) NOT NULL,
  `winner_user_id` VARCHAR(64) NULL,
  `scored` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL,
  `white_clock_ms` INT NOT NULL DEFAULT 60000,
  `black_clock_ms` INT NOT NULL DEFAULT 60000,
  `chat_open` TINYINT(1) NOT NULL DEFAULT 0,
  `live_open` TINYINT(1) NOT NULL DEFAULT 0,
  `camera_open` TINYINT(1) NOT NULL DEFAULT 0,
  `last_prize` INT NULL,
  `coin_award` INT NOT NULL DEFAULT 0,
  `pull` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `games_status_idx` (`status`),
  KEY `games_white_idx` (`white_user_id`),
  KEY `games_black_idx` (`black_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_moves` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `game_id` VARCHAR(64) NOT NULL,
  `ply` INT NOT NULL,
  `san` VARCHAR(32) NOT NULL,
  `from_sq` VARCHAR(8) NOT NULL,
  `to_sq` VARCHAR(8) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `game_moves_game_idx` (`game_id`, `ply`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_chat` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `game_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `image` MEDIUMTEXT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `game_chat_game_idx` (`game_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Chess clubs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `chess_clubs` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `name_lc` VARCHAR(64) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `host_user_id` VARCHAR(64) NOT NULL,
  `board_id` VARCHAR(64) NOT NULL DEFAULT 'lodge',
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chess_clubs_name_lc_uq` (`name_lc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chess_club_members` (
  `club_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `ready` TINYINT(1) NOT NULL DEFAULT 0,
  `joined_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`club_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chess_club_requests` (
  `id` VARCHAR(64) NOT NULL,
  `club_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `chess_club_requests_host_idx` (`club_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chess_club_messages` (
  `id` VARCHAR(64) NOT NULL,
  `club_id` VARCHAR(64) NOT NULL,
  `from_user_id` VARCHAR(64) NOT NULL,
  `to_user_id` VARCHAR(64) NULL,
  `body` MEDIUMTEXT NOT NULL,
  `image` MEDIUMTEXT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `chess_club_messages_club_idx` (`club_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `game_chat` ADD COLUMN `image` MEDIUMTEXT NULL;
ALTER TABLE `chess_club_messages` ADD COLUMN `image` MEDIUMTEXT NULL;
ALTER TABLE `profiles` ADD COLUMN `sandbox_owned` TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `sandbox_queue` (
  `user_id` VARCHAR(64) NOT NULL,
  `joined_at` DATETIME(3) NOT NULL,
  `seen_at` DATETIME(3) NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `sandbox_queue` ADD COLUMN `seen_at` DATETIME(3) NULL;

CREATE TABLE IF NOT EXISTS `sandbox_games` (
  `id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `seat_s` VARCHAR(64) NOT NULL,
  `seat_w` VARCHAR(64) NOT NULL,
  `seat_n` VARCHAR(64) NOT NULL,
  `seat_e` VARCHAR(64) NOT NULL,
  `moves` MEDIUMTEXT NOT NULL,
  `turn_seat` VARCHAR(1) NOT NULL DEFAULT 's',
  `revision` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sandbox_games_status_idx` (`status`),
  KEY `sandbox_games_s_idx` (`seat_s`),
  KEY `sandbox_games_w_idx` (`seat_w`),
  KEY `sandbox_games_n_idx` (`seat_n`),
  KEY `sandbox_games_e_idx` (`seat_e`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chess_club_events` (
  `id` VARCHAR(64) NOT NULL,
  `club_id` VARCHAR(64) NOT NULL,
  `kind` VARCHAR(32) NOT NULL,
  `state` MEDIUMTEXT NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chess_club_calls` (
  `id` VARCHAR(64) NOT NULL,
  `club_id` VARCHAR(64) NOT NULL,
  `from_user_id` VARCHAR(64) NOT NULL,
  `to_user_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `club_bracket` (
  `id` VARCHAR(64) NOT NULL,
  `payload` MEDIUMTEXT NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── WebRTC signaling (rendezvous only; game traffic is peer-to-peer) ───────

CREATE TABLE IF NOT EXISTS `webrtc_peers` (
  `room` VARCHAR(64) NOT NULL,
  `peer_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `last_seen` DATETIME(3) NOT NULL,
  PRIMARY KEY (`room`, `peer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webrtc_signals` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `room` VARCHAR(64) NOT NULL,
  `to_peer` VARCHAR(64) NOT NULL,
  `from_peer` VARCHAR(64) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `payload` MEDIUMTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `webrtc_signals_inbox` (`room`, `to_peer`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── House bots ─────────────────────────────────────────────────────────────

INSERT IGNORE INTO `profiles` (`user_id`, `username`, `username_lc`, `score`, `last_seen`, `created_at`)
VALUES ('bot-mores', 'MorseBot', 'morsebot', 1840, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000');

INSERT IGNORE INTO `profiles` (`user_id`, `username`, `username_lc`, `score`, `last_seen`, `created_at`)
VALUES ('bot-mores-v2', 'MorseBotv2', 'morsebotv2', 2200, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000');
