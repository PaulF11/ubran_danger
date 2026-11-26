USE urban_danger_db;

CREATE TABLE news_articles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    source_name VARCHAR(120) NOT NULL,
    source_url VARCHAR(512) NOT NULL,
    published_date DATE NOT NULL,
    summary VARCHAR(600) NOT NULL,
    image_url VARCHAR(512) NULL,
    status ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    publisher_verified BOOLEAN NOT NULL DEFAULT FALSE,
    date_verified BOOLEAN NOT NULL DEFAULT FALSE,
    taguig_relevance_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_notes VARCHAR(500) NULL,
    reviewed_by VARCHAR(255) NULL,
    reviewed_at DATETIME NULL,
    verified_by VARCHAR(255) NULL,
    verified_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_news_articles_source_url (source_url),
    KEY idx_news_articles_public_week (status, published_date, id),
    KEY idx_news_articles_review (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Taguig public news articles, reviewed independently from incident verification.';
