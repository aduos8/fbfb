-- TG OSINT Platform: Cassandra Schema
-- Run with: cqlsh -u cassandra -p cassandra -f cassandra-schema.cql
-- Fuzzy/ranked search is handled by Meilisearch. Cassandra remains the source
-- of truth for entities, messages, histories, and analytics tables.

CREATE KEYSPACE IF NOT EXISTS tgosint
WITH replication = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
}
AND DURABLE_WRITES = true;

USE tgosint;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id text PRIMARY KEY,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  photo_id text,
  phone_number text,
  created_at timestamp,
  updated_at timestamp
);

-- Users by username (lookup table)
CREATE TABLE IF NOT EXISTS users_by_username (
  username text,
  user_id text,
  display_name text,
  avatar_url text,
  PRIMARY KEY (username, user_id)
);

-- Chats (channels and groups)
CREATE TABLE IF NOT EXISTS chats (
  chat_id text PRIMARY KEY,
  chat_type text,
  username text,
  display_name text,
  member_count int,
  participants_count int,
  bio text,
  avatar_url text,
  created_at timestamp,
  updated_at timestamp
);

-- Messages by chat
CREATE TABLE IF NOT EXISTS messages_by_chat (
  chat_id text,
  bucket text,
  timestamp timestamp,
  message_id text,
  user_id text,
  content text,
  has_media boolean,
  PRIMARY KEY ((chat_id, bucket), timestamp, message_id)
);

-- Messages by user
CREATE TABLE IF NOT EXISTS messages_by_user (
  user_id text,
  bucket text,
  timestamp timestamp,
  message_id text,
  chat_id text,
  content text,
  has_media boolean,
  PRIMARY KEY ((user_id, bucket), timestamp, message_id)
);

-- Messages by ID
CREATE TABLE IF NOT EXISTS messages_by_id (
  chat_id text,
  message_id text,
  user_id text,
  content text,
  has_media boolean,
  timestamp timestamp,
  PRIMARY KEY (chat_id, message_id)
);

-- Identity history
CREATE TABLE IF NOT EXISTS user_history (
  user_id text,
  changed_at timestamp,
  field text,
  id text,
  old_value text,
  new_value text,
  PRIMARY KEY (user_id, changed_at, field, id)
);

-- Participation counters
CREATE TABLE IF NOT EXISTS participation (
  user_id text,
  chat_id text,
  message_count counter,
  PRIMARY KEY (user_id, chat_id)
);

-- Participation metadata
CREATE TABLE IF NOT EXISTS participation_meta (
  user_id text,
  chat_id text,
  first_message_at timestamp,
  last_message_at timestamp,
  PRIMARY KEY (user_id, chat_id)
);

-- Daily stats
CREATE TABLE IF NOT EXISTS user_daily_stats (
  user_id text,
  date text,
  message_count counter,
  PRIMARY KEY (user_id, date)
);

-- Word statistics
CREATE TABLE IF NOT EXISTS user_word_stats (
  user_id text,
  word text,
  count counter,
  PRIMARY KEY (user_id, word)
);

CREATE TABLE IF NOT EXISTS chat_word_stats (
  chat_id text,
  word text,
  count counter,
  PRIMARY KEY (chat_id, word)
);

-- Analytics cache
CREATE TABLE IF NOT EXISTS analytics_cache (
  user_id text PRIMARY KEY,
  stats text,
  stats_30d text,
  chats text,
  most_used_words text,
  cached_at timestamp
);

-- Global statistics
CREATE TABLE IF NOT EXISTS global_stats (
  stat_name text PRIMARY KEY,
  count counter
);

-- Media queue
CREATE TABLE IF NOT EXISTS media_queue (
  message_id text PRIMARY KEY,
  chat_id text,
  status text,
  claimed_by text,
  lease_until timestamp,
  retry_count int,
  created_at timestamp
);

-- Media dead letter
CREATE TABLE IF NOT EXISTS media_dead_letter (
  message_id text PRIMARY KEY,
  chat_id text,
  retry_count int,
  last_error text,
  created_at timestamp,
  failed_at timestamp
);

-- Avatar queue
CREATE TABLE IF NOT EXISTS avatar_queue (
  entity_id text PRIMARY KEY,
  entity_type text,
  status text,
  claimed_by text,
  lease_until timestamp,
  retry_count int,
  created_at timestamp
);

-- Standard secondary indexes for exact matches
CREATE INDEX IF NOT EXISTS idx_avatar_queue_status ON avatar_queue(status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);
CREATE INDEX IF NOT EXISTS idx_chats_username ON chats(username);
