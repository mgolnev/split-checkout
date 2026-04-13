-- AlterTable: колонка есть в schema.prisma, но отсутствовала в init-миграции
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sizeLabel" TEXT;
