-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "crm_ticket_ref" TEXT,
ADD COLUMN     "escalated_at" TIMESTAMP(3);
