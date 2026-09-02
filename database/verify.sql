-- Valid user and wallet
INSERT INTO users (email)
VALUES ('valid@example.com');

-- Session variable containing the generated user ID
SET @valid_user_id = LAST_INSERT_ID();

INSERT INTO wallets (user_id, currency, balance_minor)
VALUES (@valid_user_id, 'NGN', 0);

SELECT *
FROM wallets
WHERE user_id = @valid_user_id;

-- Each statement below should fail.

-- Duplicate email
INSERT INTO users (email)
VALUES ('valid@example.com');

-- Orphan wallet
INSERT INTO wallets (user_id, currency, balance_minor)
VALUES (999999999, 'NGN', 0);

-- Negative balance
INSERT INTO users (email)
VALUES ('negative@example.com');

SET @negative_user_id = LAST_INSERT_ID();

INSERT INTO wallets (user_id, currency, balance_minor)
VALUES (@negative_user_id, 'NGN', -1);

-- Duplicate wallet for the same user
INSERT INTO wallets (user_id, currency, balance_minor)
VALUES (@valid_user_id, 'NGN', 0);