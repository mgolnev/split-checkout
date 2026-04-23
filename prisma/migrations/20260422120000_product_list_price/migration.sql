-- AlterTable (без потери данных: только новая nullable-колонка, старые строки → listPrice NULL)
-- IF NOT EXISTS: безопасно, если колонку уже добавили вручную на проде до migrate deploy.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "listPrice" INTEGER;
