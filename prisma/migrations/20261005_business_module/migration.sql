-- AlterTable
ALTER TABLE "users" ADD COLUMN     "account_mode" VARCHAR(16) NOT NULL DEFAULT 'PERSONAL';

-- CreateTable
CREATE TABLE "businesses" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "legal_name" VARCHAR(160),
    "tax_id" VARCHAR(32),
    "kind" VARCHAR(24) NOT NULL DEFAULT 'SELF_EMPLOYED',
    "vat_regime" VARCHAR(24) NOT NULL DEFAULT 'GENERAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_accounts" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'BANK',
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opening_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_activities" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "direction" VARCHAR(8) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "occurred_on" DATE NOT NULL,
    "due_on" DATE,
    "counterparty_name" VARCHAR(160),
    "counterparty_tax_id" VARCHAR(32),
    "document_kind" VARCHAR(24) NOT NULL DEFAULT 'NONE',
    "document_number" VARCHAR(80),
    "document_date" DATE,
    "vat_period" VARCHAR(7),
    "tax_lines" JSONB NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL,
    "deductible_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withholding_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_movements" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "flow_type" VARCHAR(16) NOT NULL DEFAULT 'OPERATING',
    "transfer_group" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_allocations" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "movement_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_attachments" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "filename" VARCHAR(180) NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_cash_plans" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "direction" VARCHAR(8) NOT NULL,
    "due_on" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_cash_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_budgets" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "direction" VARCHAR(8) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businesses_owner_user_id_idx" ON "businesses"("owner_user_id");

-- CreateIndex
CREATE INDEX "business_accounts_business_id_idx" ON "business_accounts"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_accounts_business_id_name_key" ON "business_accounts"("business_id", "name");

-- CreateIndex
CREATE INDEX "business_activities_business_id_occurred_on_idx" ON "business_activities"("business_id", "occurred_on");

-- CreateIndex
CREATE INDEX "business_activities_business_id_due_on_idx" ON "business_activities"("business_id", "due_on");

-- CreateIndex
CREATE INDEX "business_activities_business_id_vat_period_idx" ON "business_activities"("business_id", "vat_period");

-- CreateIndex
CREATE INDEX "business_activities_business_id_direction_document_number_idx" ON "business_activities"("business_id", "direction", "document_number");

-- Suppliers can reuse invoice numbers. Issued numbers are unique for each business;
-- received numbers are unique for each supplier within the business.
CREATE UNIQUE INDEX "business_issued_number_key" ON "business_activities"("business_id", "document_number") WHERE "direction" = 'INCOME' AND "document_number" IS NOT NULL;
CREATE UNIQUE INDEX "business_received_supplier_number_key" ON "business_activities"("business_id", lower(coalesce("counterparty_tax_id", "counterparty_name")), "document_number") WHERE "direction" = 'EXPENSE' AND "document_number" IS NOT NULL;

-- CreateIndex
CREATE INDEX "business_movements_business_id_date_idx" ON "business_movements"("business_id", "date");

-- CreateIndex
CREATE INDEX "business_movements_account_id_date_idx" ON "business_movements"("account_id", "date");

-- CreateIndex
CREATE INDEX "business_allocations_business_id_idx" ON "business_allocations"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_allocations_activity_id_movement_id_key" ON "business_allocations"("activity_id", "movement_id");

-- CreateIndex
CREATE INDEX "business_attachments_business_id_activity_id_idx" ON "business_attachments"("business_id", "activity_id");

-- CreateIndex
CREATE INDEX "business_cash_plans_business_id_due_on_idx" ON "business_cash_plans"("business_id", "due_on");

-- CreateIndex
CREATE INDEX "business_budgets_business_id_period_idx" ON "business_budgets"("business_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "business_budgets_business_id_period_direction_category_key" ON "business_budgets"("business_id", "period", "direction", "category");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_accounts" ADD CONSTRAINT "business_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_activities" ADD CONSTRAINT "business_activities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_movements" ADD CONSTRAINT "business_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_movements" ADD CONSTRAINT "business_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_allocations" ADD CONSTRAINT "business_allocations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_allocations" ADD CONSTRAINT "business_allocations_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "business_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_allocations" ADD CONSTRAINT "business_allocations_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "business_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_attachments" ADD CONSTRAINT "business_attachments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_attachments" ADD CONSTRAINT "business_attachments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "business_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_cash_plans" ADD CONSTRAINT "business_cash_plans_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_budgets" ADD CONSTRAINT "business_budgets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
