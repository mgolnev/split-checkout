/** Минимальный liveness для ONREZA readiness — без Prisma, БД и тяжёлых импортов. */
export async function GET() {
  return Response.json({ ok: true, live: true });
}
