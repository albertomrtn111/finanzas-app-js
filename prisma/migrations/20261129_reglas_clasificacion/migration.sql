-- CreateTable
CREATE TABLE "classification_rules" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "direction" VARCHAR(8) NOT NULL,
    "merchant_key" VARCHAR(120) NOT NULL DEFAULT '',
    "pattern" VARCHAR(120) NOT NULL DEFAULT '',
    "destination" VARCHAR(16) NOT NULL,
    "business_id" INTEGER,
    "account_id" INTEGER,
    "flow_type" VARCHAR(16),
    "category" VARCHAR(100),
    "subcategory" VARCHAR(100),
    "payment_method" VARCHAR(50),
    "expense_type" VARCHAR(50),
    "source" VARCHAR(150),
    "origin" VARCHAR(8) NOT NULL DEFAULT 'LEARNED',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "example" VARCHAR(240),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classification_rules_business_id_idx" ON "classification_rules"("business_id");

-- CreateIndex
CREATE INDEX "classification_rules_account_id_idx" ON "classification_rules"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "classification_rules_match_key" ON "classification_rules"("user_id", "direction", "merchant_key", "pattern");

-- AddForeignKey
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "business_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

