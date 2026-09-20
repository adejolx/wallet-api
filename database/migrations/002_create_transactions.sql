CREATE TABLE transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_wallet INT UNSIGNED NOT NULL,
    recipient_wallet INT UNSIGNED NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_amount_non_negative CHECK (amount_minor > 0),
    CONSTRAINT fk_sender_wallet FOREIGN KEY (sender_wallet) REFERENCES wallets(id),
    CONSTRAINT fk_recipient_wallet FOREIGN KEY (recipient_wallet) REFERENCES wallets(id)
) ENGINE=InnoDB;
