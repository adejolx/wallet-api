# Database design note

`users` is the parent table. A user can have one wallet, enforced by the
unique `wallets.user_id` constraint, and each wallet belongs to a user through
the foreign key on `wallets.user_id`.

`wallets.balance_minor` stores whole minor units, such as cents or kobo,
instead of floating-point major units. This avoids rounding errors when money
is added or subtracted.

The primary keys identify rows. `UNIQUE(email)` prevents duplicate users, and
the foreign key prevents orphan wallets. `NOT NULL`, the three-character
currency check, `UNIQUE(user_id)`, the default zero balance, and
`CHECK (balance_minor >= 0)` protect the wallet domain.

If multiple currencies are supported later, replace `UNIQUE(user_id)` with
`UNIQUE(user_id, currency)` so each user can have one wallet per currency.
Currency codes may eventually reference a currencies table, and conversion
must remain explicit.

MySQL `BIGINT` values can exceed JavaScript's safe integer range (`2^53 - 1`).
The database driver must return `balance_minor` as a string or JavaScript
`bigint`, never silently convert it to an ordinary JavaScript number.
