-- DropForeignKey
ALTER TABLE "Reservation" DROP CONSTRAINT "Reservation_cancelledByUserId_fkey";

-- DropIndex
DROP INDEX "Reservation_cancelledByUserId_idx";

-- AlterTable
ALTER TABLE "Reservation" DROP COLUMN "cancelledByUserId";

