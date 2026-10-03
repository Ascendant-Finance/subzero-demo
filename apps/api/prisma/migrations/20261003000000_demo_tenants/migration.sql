-- CreateTable
CREATE TABLE "DemoTenant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT,
    "subzeroProjectKey" TEXT NOT NULL,
    "subzeroIngestKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoTenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoTenant_userId_key" ON "DemoTenant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoTenant_subzeroProjectKey_key" ON "DemoTenant"("subzeroProjectKey");

-- AddForeignKey
ALTER TABLE "DemoTenant" ADD CONSTRAINT "DemoTenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
