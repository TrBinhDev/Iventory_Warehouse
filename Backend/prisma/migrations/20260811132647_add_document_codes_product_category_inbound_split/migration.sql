-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropIndex
DROP INDEX "Product_categoryId_idx";

-- AlterTable
ALTER TABLE "Inbound" ADD COLUMN     "code" VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE "InboundItem" DROP COLUMN "quantity",
ADD COLUMN     "note" TEXT,
ADD COLUMN     "quantityOrdered" INTEGER NOT NULL,
ADD COLUMN     "quantityReceived" INTEGER;

-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "code" VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "createdByUserId" UUID;

-- AlterTable
ALTER TABLE "Outbound" ADD COLUMN     "code" VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "categoryId";

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "code" VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "code" VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "code" VARCHAR(30) NOT NULL;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateIndex
CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Inbound_code_key" ON "Inbound"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_code_key" ON "InventoryAdjustment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Outbound_code_key" ON "Outbound"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_code_key" ON "Reservation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_code_key" ON "SalesOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_code_key" ON "Transfer"("code");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

