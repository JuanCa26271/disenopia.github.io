import 'dotenv/config';
import { PrismaClient, ExtraType } from '@prisma/client';
import argon2 from 'argon2';
import { WORKSHOP_CONFIG_ID } from '../src/services/production.service';

const prisma = new PrismaClient();
async function main() {
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!initialPassword || initialPassword.length < 10) throw new Error('Set ADMIN_INITIAL_PASSWORD (10+ chars) in the protected environment before seeding.');
  const passwordHash = await argon2.hash(initialPassword, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await prisma.adminUser.upsert({ where: { username: 'MAGA@ADMON' }, update: {}, create: { username: 'MAGA@ADMON', passwordHash } });
  const categorySeeds = [
    ['Velas decoradas', 90], ['Yesos para pintar', 45], ['Aromatizantes caseros', 35],
    ['Centros de mesa', 120], ['Libros miniatura para colorear', 50],
  ] as const;
  const categories = new Map<string, string>();
  for (const [name, basePrepTimeMinutes] of categorySeeds) {
    const category = await prisma.category.upsert({ where: { name }, update: { basePrepTimeMinutes }, create: { name, basePrepTimeMinutes } });
    categories.set(name, category.id);
  }
  const products = [
    { name: 'Vela artesanal personalizada', category: 'Velas decoradas', basePrice: '180.00', prepTimeMinutes: 90, description: 'Vela artesanal con acabados personalizables.' },
    { name: 'Figura de yeso para pintar', category: 'Yesos para pintar', basePrice: '75.00', prepTimeMinutes: 45, description: 'Pieza de yeso lista para decorar.' },
    { name: 'Aromatizante artesanal', category: 'Aromatizantes caseros', basePrice: '95.00', prepTimeMinutes: 35, description: 'Aromatizante preparado en pequeños lotes.' },
  ];
  for (const p of products) await prisma.product.upsert({ where: { id: `00000000-0000-4000-8000-${Buffer.from(p.name).toString('hex').slice(0, 12).padEnd(12, '0')}` }, update: {}, create: { id: `00000000-0000-4000-8000-${Buffer.from(p.name).toString('hex').slice(0, 12).padEnd(12, '0')}`, categoryId: categories.get(p.category)!, name: p.name, basePrice: p.basePrice, prepTimeMinutes: p.prepTimeMinutes, description: p.description, isCustomizable: true } });
  const extras = [
    [ExtraType.TELA_TRASLUCIDA, 'Envoltura de tela traslúcida', '25.00', 10], [ExtraType.MONO, 'Moños', '15.00', 5],
    [ExtraType.PLANTA_PEQUENA, 'Plantas chiquitas', '35.00', 15], [ExtraType.HOJA_OPALINA, 'Hoja opalina personalizada', '30.00', 20],
    [ExtraType.FLORES, 'Flores secas', '28.00', 10], [ExtraType.AROMA, 'Aroma especial', '18.00', 5],
    [ExtraType.LIBRO_MINIATURA, 'Libro miniatura para colorear', '55.00', 20],
  ] as const;
  for (const [extraType, name, additionalCost, additionalPrepMinutes] of extras) await prisma.customizationExtra.upsert({ where: { id: `10000000-0000-4000-8000-${Buffer.from(name).toString('hex').slice(0, 12).padEnd(12, '0')}` }, update: {}, create: { id: `10000000-0000-4000-8000-${Buffer.from(name).toString('hex').slice(0, 12).padEnd(12, '0')}`, extraType, name, additionalCost, additionalPrepMinutes } });
  const fonts = [
    ['Playfair Display','https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap'],
    ['Cinzel','https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap'],
    ['Great Vibes','https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap'],
    ['Montserrat','https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap'],
    ['DM Sans','https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap'],
  ] as const;
  for (const [fontFamilyName, googleFontUrl] of fonts) await prisma.typographyFont.upsert({ where: { fontFamilyName }, update: { googleFontUrl }, create: { fontFamilyName, googleFontUrl } });
  await prisma.workshopConfig.upsert({ where:{id:WORKSHOP_CONFIG_ID}, update:{}, create:{id:WORKSHOP_CONFIG_ID,dailyWorkMinutes:Number(process.env.INITIAL_DAILY_WORK_MINUTES||480),minimumBufferHours:Number(process.env.INITIAL_MINIMUM_BUFFER_HOURS||24)} });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
