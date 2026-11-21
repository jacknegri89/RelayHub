CREATE TABLE "LostResponseOrder" (
    "deliveryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LostResponseOrder_pkey" PRIMARY KEY ("deliveryId"),
    CONSTRAINT "LostResponseOrder_deliveryId_fkey" FOREIGN KEY ("deliveryId")
        REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
