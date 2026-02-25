-- AlterTable: add tracking_token (nullable, unique) to projects
ALTER TABLE "projects" ADD COLUMN "tracking_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "projects_tracking_token_key" ON "projects"("tracking_token");
