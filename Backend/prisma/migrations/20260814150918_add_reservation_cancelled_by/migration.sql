-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "cancelledByUserId" UUID;

-- CreateIndex
CREATE INDEX "Reservation_cancelledByUserId_idx" ON "Reservation"("cancelledByUserId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

