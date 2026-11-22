-- CreateTable
CREATE TABLE "mcp_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_prefix" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "business_id" INTEGER,
    "source" VARCHAR(16) NOT NULL DEFAULT 'MCP',
    "tool" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    "entity_id" INTEGER,
    "action" VARCHAR(12) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "batch_id" VARCHAR(80),
    "reverted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tokens_token_hash_key" ON "mcp_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "mcp_tokens_user_id_idx" ON "mcp_tokens"("user_id");

-- CreateIndex
CREATE INDEX "change_log_user_id_created_at_idx" ON "change_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "change_log_batch_id_idx" ON "change_log"("batch_id");

-- AddForeignKey
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
