-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "edited_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "channel_reads" (
    "user_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_reads_pkey" PRIMARY KEY ("user_id","channel_id")
);

-- CreateIndex
CREATE INDEX "channel_reads_channel_id_idx" ON "channel_reads"("channel_id");

-- AddForeignKey
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Everything written before this migration counts as read, so nobody opens the app on a
-- full history of unread messages. Later accounts and channels start from their own creation.
INSERT INTO "channel_reads" ("user_id", "channel_id", "last_read_at")
SELECT u."id", c."id", CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN "channels" c
WHERE u."is_bot" = false;
