import type {Request,Response} from 'express';
import {z} from 'zod';
import {OrderStatus,Prisma} from '@prisma/client';
import {PDFDocument,StandardFonts,rgb,degrees} from 'pdf-lib';
import sharp from 'sharp';
import path from 'node:path';
import {prisma} from '../lib/prisma';
import {asyncRoute} from '../middleware/errors';
import {decryptCustomer} from '../services/security.service';
import {packTabloid} from '../services/print.service';
import {WORKSHOP_CONFIG_ID} from '../services/production.service';
import {decryptAssetBytes} from '../services/security.service';

const productSchema=z.object({categoryId:z.string().uuid(),name:z.string().trim().min(1).max(180),description:z.string().max(5000).default(''),basePrice:z.number().finite().nonnegative(),prepTimeMinutes:z.number().int().nonnegative(),stockAvailable:z.number().int().nonnegative().default(0),referenceImages:z.array(z.string().url().max(2048)).max(20).default([]),isCustomizable:z.boolean().default(false),isActive:z.boolean().default(true)}).strict();
const extraSchema=z.object({extraType:z.enum(['TELA_TRASLUCIDA','MONO','PLANTA_PEQUENA','HOJA_OPALINA','FLORES','AROMA','LIBRO_MINIATURA','CENTRO_MESA','OTRO']),name:z.string().trim().min(1).max(180),additionalCost:z.number().finite().nonnegative(),additionalPrepMinutes:z.number().int().nonnegative().default(0),previewImageUrl:z.string().url().max(2048).nullable().optional(),isAvailable:z.boolean().default(true)}).strict();
export const dashboard=asyncRoute(async(_req:Request,res:Response)=>{
  const active=await prisma.order.findMany({where:{status:{in:['PENDIENTE','EN_PRODUCCION','IMPRESO','LISTO']}},orderBy:{customerRequestedDate:'asc'},include:{customer:true,items:{include:{product:true,customizations:{include:{extra:true}}}}}});
  res.json({orders:active.map(o=>({ticketCode:o.ticketCode,status:o.status,totalAmount:o.totalAmount,calculatedReadyDate:o.calculatedReadyDate,customerRequestedDate:o.customerRequestedDate,createdAt:o.createdAt,customer:decryptCustomer(o.customer),items:o.items.map(i=>({name:i.product.name,quantity:i.quantity,subtotal:i.subtotal,customizations:i.customizations.map(c=>({extra:c.extra?.name,text:c.customText,printPending:!c.isPrinted}))}))}))});
});
export const listProducts=asyncRoute(async(_req:Request,res:Response)=>res.json(await prisma.product.findMany({include:{category:true,referenceImageRows:{orderBy:{sortOrder:'asc'}}},orderBy:{name:'asc'}})));
export const createProduct=asyncRoute(async(req:Request,res:Response)=>{const data=productSchema.parse(req.body),{referenceImages,...fields}=data;const item=await prisma.product.create({data:{...fields,basePrice:new Prisma.Decimal(data.basePrice),referenceImageRows:{create:referenceImages.map((imageUrl,sortOrder)=>({imageUrl,sortOrder}))}},include:{referenceImageRows:true}});res.status(201).json(item)});
export const updateProduct=asyncRoute(async(req:Request,res:Response)=>{const id=z.string().uuid().parse(req.params.id),data=productSchema.partial().parse(req.body),{referenceImages,...fields}=data;const item=await prisma.$transaction(async tx=>{if(referenceImages){await tx.productReferenceImage.deleteMany({where:{productId:id}});await tx.productReferenceImage.createMany({data:referenceImages.map((imageUrl,sortOrder)=>({productId:id,imageUrl,sortOrder}))});}return tx.product.update({where:{id},data:{...fields,basePrice:data.basePrice===undefined?undefined:new Prisma.Decimal(data.basePrice)},include:{referenceImageRows:true}})});res.json(item)});
export const deleteProduct=asyncRoute(async(req:Request,res:Response)=>{const id=z.string().uuid().parse(req.params.id);await prisma.product.update({where:{id},data:{isActive:false}});res.status(204).end()});
export const listExtras=asyncRoute(async(_req:Request,res:Response)=>res.json(await prisma.customizationExtra.findMany({orderBy:{name:'asc'}})));
export const createExtra=asyncRoute(async(req:Request,res:Response)=>{const data=extraSchema.parse(req.body);const item=await prisma.customizationExtra.create({data:{...data,additionalCost:new Prisma.Decimal(data.additionalCost)}});res.status(201).json(item)});
export const updateExtra=asyncRoute(async(req:Request,res:Response)=>{const id=z.string().uuid().parse(req.params.id),data=extraSchema.partial().parse(req.body);const item=await prisma.customizationExtra.update({where:{id},data:{...data,additionalCost:data.additionalCost===undefined?undefined:new Prisma.Decimal(data.additionalCost)}});res.json(item)});
export const deleteExtra=asyncRoute(async(req:Request,res:Response)=>{const id=z.string().uuid().parse(req.params.id);await prisma.customizationExtra.update({where:{id},data:{isAvailable:false}});res.status(204).end()});
const statusSchema=z.object({status:z.nativeEnum(OrderStatus)}).strict();
export const changeOrderStatus=asyncRoute(async(req:Request,res:Response)=>{const code=z.string().min(8).max(40).parse(req.params.ticket_code),{status}=statusSchema.parse(req.body);const order=await prisma.order.update({where:{ticketCode:code},data:{status},select:{ticketCode:true,status:true}});res.json(order)});
const workshopSchema=z.object({dailyWorkMinutes:z.number().int().min(30).max(1440),minimumBufferHours:z.number().int().min(0).max(720),holidayDates:z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(500)}).strict();
export const getWorkshopSettings=asyncRoute(async(_req:Request,res:Response)=>{const config=await prisma.workshopConfig.upsert({where:{id:WORKSHOP_CONFIG_ID},create:{id:WORKSHOP_CONFIG_ID,dailyWorkMinutes:480,minimumBufferHours:24},update:{}});const holidays=await prisma.workshopHoliday.findMany({where:{workshopConfigId:config.id},orderBy:{holidayDate:'asc'}});res.json({dailyWorkMinutes:config.dailyWorkMinutes,minimumBufferHours:config.minimumBufferHours,holidayDates:holidays.map(h=>h.holidayDate.toISOString().slice(0,10))})});
export const updateWorkshopSettings=asyncRoute(async(req:Request,res:Response)=>{const data=workshopSchema.parse(req.body);for(const date of data.holidayDates){const parsed=new Date(`${date}T00:00:00.000Z`);if(parsed.toISOString().slice(0,10)!==date)throw Object.assign(new Error('Invalid holiday date'),{status:400});}const result=await prisma.$transaction(async tx=>{const config=await tx.workshopConfig.upsert({where:{id:WORKSHOP_CONFIG_ID},create:{id:WORKSHOP_CONFIG_ID,dailyWorkMinutes:data.dailyWorkMinutes,minimumBufferHours:data.minimumBufferHours},update:{dailyWorkMinutes:data.dailyWorkMinutes,minimumBufferHours:data.minimumBufferHours}});await tx.workshopHoliday.deleteMany({where:{workshopConfigId:config.id}});if(data.holidayDates.length)await tx.workshopHoliday.createMany({data:data.holidayDates.map(d=>({workshopConfigId:WORKSHOP_CONFIG_ID,holidayDate:new Date(`${d}T00:00:00.000Z`)}))});return config;});res.json({dailyWorkMinutes:result.dailyWorkMinutes,minimumBufferHours:result.minimumBufferHours,holidayDates:data.holidayDates})});
const printSchema=z.object({orderIds:z.array(z.string().uuid()).max(200).optional(),customizationIds:z.array(z.string().uuid()).max(500).optional()}).strict().refine(v=>(v.orderIds?.length||0)+(v.customizationIds?.length||0)>0);
async function loadPrintAsset(url:string):Promise<{bytes:Buffer;type:'png'|'jpg';width:number;height:number}>{
  const publicOrigin=(process.env.PUBLIC_API_ORIGIN||`http://localhost:${process.env.PORT||4000}`).replace(/\/$/,'');
  if(url.startsWith(`${publicOrigin}/api/v1/store/assets/`)){
    const assetId=z.string().uuid().parse(url.slice(`${publicOrigin}/api/v1/store/assets/`.length)),asset=await prisma.uploadedAsset.findUnique({where:{id:assetId}});if(!asset)throw new Error('Print asset not found');
    const encrypted=await (await import('node:fs/promises')).readFile(path.join(path.resolve(process.env.UPLOAD_DIR||'./private-uploads'),...asset.storageKey.split('/'))),source=decryptAssetBytes(encrypted,asset.encryptionIv,asset.encryptionAuthTag),converted=await sharp(source).png().toBuffer(),metadata=await sharp(converted).metadata();return {bytes:converted,type:'png',width:metadata.width!,height:metadata.height!};
  }
  const parsed=new URL(url),allowed=(process.env.ASSET_HOST_ALLOWLIST||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(parsed.protocol!=='https:'||!allowed.includes(parsed.hostname))throw new Error('Print asset host is not allowlisted');
  const response=await fetch(parsed,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new Error('Unable to retrieve print asset');
  const maxBytes=12*1024*1024,length=Number(response.headers.get('content-length')||0);if(length>maxBytes)throw new Error('Print asset exceeds 12 MB');
  if(!response.body)throw new Error('Print asset has no response body');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let received=0;
  while(true){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;if(received>maxBytes){await reader.cancel();throw new Error('Print asset exceeds 12 MB');}chunks.push(value);}
  const bytes=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),received);
  const metadata=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();if(!['jpeg','png','webp'].includes(metadata.format||''))throw new Error('Unsupported print asset format');
  if(metadata.format==='webp'){const converted=await sharp(bytes).png().toBuffer(),m=await sharp(converted).metadata();return{bytes:converted,type:'png',width:m.width!,height:m.height!};}
  return{bytes,type:metadata.format==='jpeg'?'jpg':'png',width:metadata.width!,height:metadata.height!};
}
export const generateTabloid=asyncRoute(async(req:Request,res:Response)=>{
  const body=printSchema.parse(req.body),where:Prisma.OrderItemCustomizationWhereInput={isPrinted:false,...(body.customizationIds?.length?{id:{in:body.customizationIds}}:{}),...(body.orderIds?.length?{orderItem:{orderId:{in:body.orderIds}}}:{})};
  const rows=await prisma.orderItemCustomization.findMany({where,include:{orderItem:{include:{order:{select:{ticketCode:true}},product:true}},template:true}});
  if(!rows.length){res.status(404).json({error:'No pending print customizations found'});return;}
  const pieces=rows.filter(r=>r.customerPhotoUrl||r.generatedHighResPrintUrl||r.template).map(r=>({id:r.id,width:Number(r.printWidthMm||r.template?.printWidthMm||50),height:Number(r.printHeightMm||r.template?.printHeightMm||35),source:r.generatedHighResPrintUrl||r.customerPhotoUrl||r.template!.templateImageUrl,rotationAllowed:true}));
  if(!pieces.length){res.status(400).json({error:'Selected customizations have no printable asset'});return;}
  const layouts:ReturnType<typeof packTabloid>[]=[];let pending=pieces;while(pending.length){const layout=packTabloid(pending);if(!layout.placements.length){res.status(422).json({error:'A selected piece is larger than the safe tabloid print area',overflow:layout.overflow.map(p=>p.id)});return;}layouts.push(layout);pending=layout.overflow;}
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);const mm=(n:number)=>n*72/25.4;
  for(const layout of layouts){const page=pdf.addPage([279.4*72/25.4,431.8*72/25.4]);for(const placed of layout.placements){const row=rows.find(r=>r.id===placed.id)!;const {bytes,type,width,height}=await loadPrintAsset(placed.source);const requiredW=Math.ceil(placed.width/25.4*300),requiredH=Math.ceil(placed.height/25.4*300);if(!((width>=requiredW&&height>=requiredH)||(width>=requiredH&&height>=requiredW)))throw Object.assign(new Error(`Asset ${placed.id} does not meet 300 DPI at print size`),{status:422});const image=type==='jpg'?await pdf.embedJpg(bytes):await pdf.embedPng(bytes);const x=mm(placed.x),y=mm(431.8-placed.y-placed.height),w=mm(placed.width),h=mm(placed.height);
    const drawW=placed.rotated?h:w,drawH=placed.rotated?w:h;page.drawImage(image,{x:x+(w-drawW)/2,y:y+(h-drawH)/2,width:drawW,height:drawH,rotate:placed.rotated?degrees(90):degrees(0)});const mark=mm(1.5),gap=mm(.7),lw=.25;colorDraw(page,x,y,w,h,mark,gap,lw);
    page.drawText(row.orderItem.order.ticketCode,{x:x+2,y:y+2,size:5,font,color:rgb(.3,.3,.3)});
  }}
  const bytes=await pdf.save();const printedIds=layouts.flatMap(layout=>layout.placements.map(p=>p.id));await prisma.orderItemCustomization.updateMany({where:{id:{in:printedIds}},data:{isPrinted:true}});
  res.type('application/pdf').set('Content-Disposition','attachment; filename="MAGA-tabloid.pdf"').send(Buffer.from(bytes));
});
function colorDraw(page:import('pdf-lib').PDFPage,x:number,y:number,w:number,h:number,mark:number,gap:number,lw:number){const color=rgb(.25,.25,.25);for(const [cx,cy,sx,sy] of [[x,y,-1,-1],[x+w,y,1,-1],[x,y+h,-1,1],[x+w,y+h,1,1]] as const){page.drawLine({start:{x:cx+sx*gap,y:cy},end:{x:cx+sx*(gap+mark),y:cy},thickness:lw,color});page.drawLine({start:{x:cx,y:cy+sy*gap},end:{x:cx,y:cy+sy*(gap+mark)},thickness:lw,color});}}
