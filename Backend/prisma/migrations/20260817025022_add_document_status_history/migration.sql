-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RESERVATION', 'SALES_ORDER', 'INBOUND', 'OUTBOUND', 'TRANSFER', 'INVENTORY_ADJUSTMENT');

-- CreateTable
CREATE TABLE "DocumentStatusHistory" (
    "id" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "documentId" UUID NOT NULL,
    "fromStatus" VARCHAR(30),
    "toStatus" VARCHAR(30) NOT NULL,
    "changedByUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentStatusHistory_documentType_documentId_createdAt_idx" ON "DocumentStatusHistory"("documentType", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentStatusHistory_changedByUserId_idx" ON "DocumentStatusHistory"("changedByUserId");

-- AddForeignKey
ALTER TABLE "DocumentStatusHistory" ADD CONSTRAINT "DocumentStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

