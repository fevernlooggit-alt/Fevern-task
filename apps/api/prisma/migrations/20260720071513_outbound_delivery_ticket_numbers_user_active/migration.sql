-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('not_applicable', 'pending', 'sent', 'failed');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "delivery_error" TEXT,
ADD COLUMN     "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'not_applicable';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "number" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "tickets_number_key" ON "tickets"("number");

