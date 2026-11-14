import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Db=Prisma.TransactionClient|PrismaClient;
export const WORKSHOP_CONFIG_ID='00000000-0000-4000-8000-000000000001';
function invalid(message:string):never{throw Object.assign(new Error(message),{status:400});}
export type CartCustomization={extraId?:string;customText?:string;fontId?:string;templateId?:string;customerPhotoUrl?:string;generatedHighResPrintUrl?:string;printWidthMm?:number;printHeightMm?:number};
export type CartLine={productId:string;quantity:number;customizations:CartCustomization[]};
export type PricedLine={productId:string;quantity:number;unitPrice:number;subtotal:number;prepMinutes:number;stockToDeduct:number;customizations:CartCustomization[]};
export async function priceCart(lines:CartLine[],db:Db=prisma,requirePrintAssets=false):Promise<{items:PricedLine[];total:number;newMinutes:number}> {
  if(lines.length<1||lines.length>50)invalid('Cart must contain 1–50 lines');
  const productIds=[...new Set(lines.map(line=>line.productId))],customizations=lines.flatMap(line=>line.customizations);
  const extraIds=[...new Set(customizations.flatMap(c=>c.extraId?[c.extraId]:[]))],fontIds=[...new Set(customizations.flatMap(c=>c.fontId?[c.fontId]:[]))],templateIds=[...new Set(customizations.flatMap(c=>c.templateId?[c.templateId]:[]))];
  const [products,extras,fonts,templates]=await Promise.all([
    db.product.findMany({where:{id:{in:productIds},isActive:true},include:{category:true}}),
    extraIds.length?db.customizationExtra.findMany({where:{id:{in:extraIds},isAvailable:true}}):Promise.resolve([]),
    fontIds.length?db.typographyFont.findMany({where:{id:{in:fontIds},isActive:true}}):Promise.resolve([]),
    templateIds.length?db.designTemplate.findMany({where:{id:{in:templateIds},isActive:true}}):Promise.resolve([]),
  ]);
  const productMap=new Map(products.map(p=>[p.id,p])),extraMap=new Map(extras.map(e=>[e.id,e])),fontMap=new Map(fonts.map(f=>[f.id,f])),templateMap=new Map(templates.map(t=>[t.id,t]));
  let total=0,newMinutes=0;const priced:PricedLine[]=[],stockRemaining=new Map<string,number>();
  for(const line of lines){
    const product=productMap.get(line.productId);
    if(!product)invalid('Product unavailable');
    if(!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>100)invalid('Invalid quantity');
    if(!product.isCustomizable&&line.customizations.length)invalid('Product does not support customization');
    let unit=Number(product.basePrice),extraMinutes=0;
    for(const custom of line.customizations){
      if(custom.extraId){const extra=extraMap.get(custom.extraId);if(!extra)invalid('Customization option unavailable');unit+=Number(extra.additionalCost);extraMinutes+=extra.additionalPrepMinutes;}
      if(custom.fontId&&!fontMap.has(custom.fontId))invalid('Font unavailable');
      if(custom.templateId&&!templateMap.has(custom.templateId))invalid('Template unavailable');
      if(custom.customText&&custom.customText.length>500)invalid('Custom text too long');
      if(requirePrintAssets&&(custom.customText||custom.templateId)&&!custom.generatedHighResPrintUrl)invalid('Provide the generated print-ready artwork for text or template customizations');
      if(custom.printWidthMm!==undefined&&(custom.printWidthMm<=0||custom.printWidthMm>279.4))invalid('Invalid print width');
      if(custom.printHeightMm!==undefined&&(custom.printHeightMm<=0||custom.printHeightMm>431.8))invalid('Invalid print height');
    }
    const subtotal=Number((unit*line.quantity).toFixed(2));
    const available=stockRemaining.get(product.id)??product.stockAvailable;const stockToDeduct=Math.min(available,line.quantity);stockRemaining.set(product.id,available-stockToDeduct);
    const madeToOrder=line.quantity-stockToDeduct;const prepMinutes=madeToOrder*(product.prepTimeMinutes+product.category.basePrepTimeMinutes)+line.quantity*extraMinutes;
    total+=subtotal;newMinutes+=prepMinutes;
    priced.push({productId:line.productId,quantity:line.quantity,unitPrice:unit,subtotal,prepMinutes,stockToDeduct,customizations:line.customizations});
  }
  return {items:priced,total:Number(total.toFixed(2)),newMinutes};
}
export async function getWorkshop(db:Db=prisma){return db.workshopConfig.upsert({where:{id:WORKSHOP_CONFIG_ID},create:{id:WORKSHOP_CONFIG_ID,dailyWorkMinutes:480,minimumBufferHours:24},update:{}});}
export async function getActiveBacklogMinutes(db:Db=prisma){
  const orders=await db.order.findMany({where:{status:{in:['PENDIENTE','EN_PRODUCCION']}},include:{items:{include:{product:{include:{category:true}},customizations:{include:{extra:true}}}}}});
  return orders.reduce((sum,o)=>sum+o.items.reduce((s,item)=>s+item.quantity*(item.product.prepTimeMinutes+item.product.category.basePrepTimeMinutes+item.customizations.reduce((a,c)=>a+(c.extra?.additionalPrepMinutes||0),0)),0),0);
}
function dateKey(date:Date){return date.toISOString().slice(0,10)}
export async function estimateReadyDate(newMinutes:number,db:Db=prisma,now=new Date()):Promise<Date>{
  const config=await getWorkshop(db),holidayRows=await db.workshopHoliday.findMany({where:{workshopConfigId:config.id},select:{holidayDate:true}}),holidays=holidayRows.map(h=>h.holidayDate.toISOString().slice(0,10)),backlog=await getActiveBacklogMinutes(db);
  let remaining=backlog+newMinutes;const capacity=config.dailyWorkMinutes;const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  date.setUTCDate(date.getUTCDate()+Math.ceil(config.minimumBufferHours/24));let guard=0;
  while(remaining>0){if(!holidays.includes(dateKey(date)))remaining-=capacity;if(remaining>0)date.setUTCDate(date.getUTCDate()+1);if(++guard>3660)throw new Error('Unable to estimate production date');}
  return date;
}
