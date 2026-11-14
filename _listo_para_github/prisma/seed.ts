import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
const db = new PrismaClient();
async function main() {
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) throw new Error('Set ADMIN_INITIAL_PASSWORD in the deployment environment.');
  const passwordHash = await hash(password, { type: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await db.admin.upsert({ where: { username: 'MAGA@ADMON' }, update: {}, create: { username: 'MAGA@ADMON', passwordHash } });
  const categories = ['Velas decoradas','Yesos para pintar','Aromatizantes caseros','Centros de mesa','Libros miniatura para colorear'];
  for (const name of categories) await db.category.upsert({ where:{name}, update:{}, create:{name,baseProductionTimeMinutes:60} });
}
main().finally(() => db.$disconnect());
