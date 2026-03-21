-- Demo seed data for https://demo.opennoodle.de
-- All users have password: demo
-- Bcrypt hash generated with bcrypt@6.0.0, 10 rounds
--
-- Run: cat demo/seed-users.sql | ssh root@195.201.221.57 "cd ~/deploy && docker compose exec -T gallery-postgres psql -U gallery -d gallery"

BEGIN;

-- Users
INSERT INTO "user" (email, password, name, "isAdmin", status, "shouldChangePassword") VALUES
  ('alice@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Alice Chen', false, 'active', false),
  ('bob@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Bob Martinez', false, 'active', false),
  ('carol@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Carol Park', false, 'active', false),
  ('dave@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Dave Wilson', false, 'active', false),
  ('emma@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Emma Fischer', false, 'active', false),
  ('frank@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Frank Novak', false, 'active', false),
  ('grace@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Grace Kim', false, 'active', false),
  ('hana@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Hana Tanaka', false, 'active', false),
  ('ivan@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Ivan Petrov', false, 'active', false),
  ('julia@gallery.app', '$2b$10$aVbfpE/q6c6FbdxUYuDe0e4beN/hUEPDEcoEJvaKYB3LM6O9um5mK', 'Julia Santos', false, 'active', false)
ON CONFLICT (email) DO NOTHING;

-- User metadata (preferences + onboarding)
INSERT INTO user_metadata ("userId", key, value)
SELECT id, 'preferences', '{}'::jsonb FROM "user"
WHERE email IN ('alice@gallery.app', 'bob@gallery.app', 'carol@gallery.app', 'dave@gallery.app', 'emma@gallery.app', 'frank@gallery.app', 'grace@gallery.app', 'hana@gallery.app', 'ivan@gallery.app', 'julia@gallery.app')
AND id NOT IN (SELECT "userId" FROM user_metadata WHERE key = 'preferences')
UNION ALL
SELECT id, 'onboarding', '{"isOnboarded": true}'::jsonb FROM "user"
WHERE email IN ('alice@gallery.app', 'bob@gallery.app', 'carol@gallery.app', 'dave@gallery.app', 'emma@gallery.app', 'frank@gallery.app', 'grace@gallery.app', 'hana@gallery.app', 'ivan@gallery.app', 'julia@gallery.app')
AND id NOT IN (SELECT "userId" FROM user_metadata WHERE key = 'onboarding');

-- Groups (created by demo@gallery.app)
-- Family: Demo, Alice, Bob, Carol, Dave
INSERT INTO user_group (name, color, origin, "createdById")
SELECT 'Family', '#4CAF50', 'manual', id FROM "user" WHERE email = 'demo@gallery.app'
ON CONFLICT DO NOTHING;

INSERT INTO user_group_member ("groupId", "userId")
SELECT g.id, u.id FROM user_group g, "user" u
WHERE g.name = 'Family' AND u.email IN ('demo@gallery.app', 'alice@gallery.app', 'bob@gallery.app', 'carol@gallery.app', 'dave@gallery.app')
ON CONFLICT DO NOTHING;

-- Work Team: Demo, Emma, Frank, Grace
INSERT INTO user_group (name, color, origin, "createdById")
SELECT 'Work Team', '#2196F3', 'manual', id FROM "user" WHERE email = 'demo@gallery.app'
ON CONFLICT DO NOTHING;

INSERT INTO user_group_member ("groupId", "userId")
SELECT g.id, u.id FROM user_group g, "user" u
WHERE g.name = 'Work Team' AND u.email IN ('demo@gallery.app', 'emma@gallery.app', 'frank@gallery.app', 'grace@gallery.app')
ON CONFLICT DO NOTHING;

-- Travel Buddies: Demo, Hana, Ivan, Julia, Alice
INSERT INTO user_group (name, color, origin, "createdById")
SELECT 'Travel Buddies', '#FF9800', 'manual', id FROM "user" WHERE email = 'demo@gallery.app'
ON CONFLICT DO NOTHING;

INSERT INTO user_group_member ("groupId", "userId")
SELECT g.id, u.id FROM user_group g, "user" u
WHERE g.name = 'Travel Buddies' AND u.email IN ('demo@gallery.app', 'hana@gallery.app', 'ivan@gallery.app', 'julia@gallery.app', 'alice@gallery.app')
ON CONFLICT DO NOTHING;

-- Photography Club: Demo, Bob, Carol, Emma, Hana, Frank
INSERT INTO user_group (name, color, origin, "createdById")
SELECT 'Photography Club', '#9C27B0', 'manual', id FROM "user" WHERE email = 'demo@gallery.app'
ON CONFLICT DO NOTHING;

INSERT INTO user_group_member ("groupId", "userId")
SELECT g.id, u.id FROM user_group g, "user" u
WHERE g.name = 'Photography Club' AND u.email IN ('demo@gallery.app', 'bob@gallery.app', 'carol@gallery.app', 'emma@gallery.app', 'hana@gallery.app', 'frank@gallery.app')
ON CONFLICT DO NOTHING;

-- Close Friends: Demo, Alice, Grace, Julia
INSERT INTO user_group (name, color, origin, "createdById")
SELECT 'Close Friends', '#E91E63', 'manual', id FROM "user" WHERE email = 'demo@gallery.app'
ON CONFLICT DO NOTHING;

INSERT INTO user_group_member ("groupId", "userId")
SELECT g.id, u.id FROM user_group g, "user" u
WHERE g.name = 'Close Friends' AND u.email IN ('demo@gallery.app', 'alice@gallery.app', 'grace@gallery.app', 'julia@gallery.app')
ON CONFLICT DO NOTHING;

COMMIT;
