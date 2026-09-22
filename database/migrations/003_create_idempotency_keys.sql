CREATE TABLE idempotency_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(255) NOT NULL,
    sender_wallet_id INT UNSIGNED NOT NULL,
    recipient_wallet_id INT UNSIGNED NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    transaction_id INT UNSIGNED,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT fk_sender_wallet_id FOREIGN KEY (sender_wallet_id) REFERENCES wallets (id), 
    CONSTRAINT fk_recipient_wallet_id FOREIGN KEY (recipient_wallet_id) REFERENCES wallets (id), 
    CONSTRAINT fk_transaction_id FOREIGN KEY (transaction_id) REFERENCES transactions (id),
    CONSTRAINT chk_amount_minor_positive CHECK (amount_minor > 0)
) ENGINE=InnoDB;
