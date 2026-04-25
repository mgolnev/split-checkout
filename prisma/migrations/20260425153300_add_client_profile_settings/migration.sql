-- CreateTable
CREATE TABLE IF NOT EXISTS "ClientProfileSettings" (
    "id" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT 'Елизавета',
    "lastName" TEXT NOT NULL DEFAULT 'Петрова-Водкина',
    "bonusBalanceRub" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfileSettings_pkey" PRIMARY KEY ("id")
);
