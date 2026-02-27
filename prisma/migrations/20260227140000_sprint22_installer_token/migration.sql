-- AlterTable
ALTER TABLE "installations" ADD COLUMN     "installer_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "installations_installer_token_key" ON "installations"("installer_token");
