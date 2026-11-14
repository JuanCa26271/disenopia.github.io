import type {Request,Response} from 'express';
import {z} from 'zod';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {Prisma} from '@prisma/client';
import {prisma} from '../lib/prisma';
import {asyncRoute} from '../middleware/errors';
import {encryptCustomer} from '../services/security.service';
import {CartLine,estimateReadyDate,priceCart} from '../services/production.service';

const customization=z.object({extraId:z.string().uuid().optional(),customText:z.string().max(500).optional(),fontId:z.string().uuid().optional(),templateId:z.string().uuid().optional(),customerPhotoUrl:z.string().url().max(2048).optional(),generatedHighResPrintUrl:z.string().url().max(2048).optional(),printWidthMm:z.number().positive().max(279.4).optional(),printHeightMm:z.number().positive().max(431.8).optional()}).strict();
const line=z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(100),customizations:z.array(customization).max(20).default([])}).strict();
export const cartSchema=z.object({items:z.array(line).min(1).max(50)}).strict();
export const checkoutSchema=cartSchema.extend({firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(120),phone:z.string().regex(/^\d{10}$/),requestedDeliveryDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
function parseDay(value:string){const d=new Date(`${value}T00:00:00.000Z`);if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw Object.assign(new Error('Invalid delivery date'),{status:400});return d;}
export const catalog=asyncRoute(async(_req:Request,res:Response)=>{
  const [categories,products,extras,fonts,templates]=await Promise.all([
    prisma.category.findMany({where:{isActive:true},orderBy:{name:'asc'}}),
    prisma.product.findMany({where:{isActive:true,category:{isActive:true}},include:{category:true,referenceImageRows:{orderBy:{sortOrder:'asc'}}},orderBy:{name:'asc'}}),
    prisma.customizationExtra.findMany({where:{isAvailable:true},orderBy:{name:'asc'}}),
    prisma.typographyFont.findMany({where:{isActive:true},orderBy:{fontFamilyName:'asc'}}),
    prisma.designTemplate.findMany({where:{isActive:true},orderBy:{eventCategory:'asc'}}),
  ]);res.json({categories,products,extras,fonts,templates});
});
export const quote=asyncRoute(async(req:Request,res:Response)=>{
  const cart=req.body as z.infer<typeof cartSchema>;const priced=await priceCart(cart.items as CartLine[]);const ready=await estimateReadyDate(priced.newMinutes);
  res.json({items:priced.items.map(i=>({productId:i.productId,quantity:i.quantity,unitPrice:i.unitPrice,subtotal:i.subtotal,prepMinutes:i.prepMinutes})),totalAmount:priced.total,newProductionMinutes:priced.newMinutes,calculatedReadyDate:ready.toISOString().slice(0,10)});
});
export const checkout=asyncRoute(async(req:Request,res:Response)=>{
  const data=req.body as z.infer<typeof checkoutSchema>;const requested=parseDay(data.requestedDeliveryDate);
  const result=await prisma.$transaction(async tx=>{
    const priced=await priceCart(data.items as CartLine[],tx,true);const ready=await estimateReadyDate(priced.newMinutes,tx);
    if(requested<ready)throw Object.assign(new Error(`Requested delivery date must be ${ready.toISOString().slice(0,10)} or later`),{status:400,minimumDate:ready.toISOString().slice(0,10)});
    for(const item of priced.items)if(item.stockToDeduct>0){const result=await tx.product.updateMany({where:{id:item.productId,stockAvailable:{gte:item.stockToDeduct}},data:{stockAvailable:{decrement:item.stockToDeduct}}});if(result.count!==1)throw Object.assign(new Error('Product stock changed; refresh your quote'),{status:409});}
    const encrypted=encryptCustomer(data.firstName,data.lastName,data.phone);const customer=await tx.customer.create({data:encrypted});
    const year=new Date().getUTCFullYear();const seq=await tx.ticketSequence.upsert({where:{year},create:{year,lastNumber:1},update:{lastNumber:{increment:1}}});
    const ticketCode=`MAGA-${year}-${String(seq.lastNumber).padStart(4,'0')}`;
    const order=await tx.order.create({data:{ticketCode,customerId:customer.id,totalAmount:new Prisma.Decimal(priced.total),calculatedReadyDate:ready,customerRequestedDate:requested,items:{create:priced.items.map(item=>({productId:item.productId,quantity:item.quantity,unitPriceCalculated:new Prisma.Decimal(item.unitPrice),subtotal:new Prisma.Decimal(item.subtotal),customizations:{create:item.customizations.map(c=>({extraId:c.extraId,customText:c.customText,fontId:c.fontId,templateId:c.templateId,customerPhotoUrl:c.customerPhotoUrl,generatedHighResPrintUrl:c.generatedHighResPrintUrl,printWidthMm:c.printWidthMm===undefined?undefined:new Prisma.Decimal(c.printWidthMm),printHeightMm:c.printHeightMm===undefined?undefined:new Prisma.Decimal(c.printHeightMm)}))}}))}}});
    return {ticketCode:order.ticketCode,totalAmount:priced.total,calculatedReadyDate:ready.toISOString().slice(0,10),customerRequestedDate:requested.toISOString().slice(0,10),items:priced.items.map(i=>({productId:i.productId,quantity:i.quantity,unitPrice:i.unitPrice,subtotal:i.subtotal}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  res.status(201).json({ticket:result});
});
export const ticket=asyncRoute(async(req:Request,res:Response)=>{
  const code=z.string().regex(/^MAGA-\d{4}-\d{4,8}$/).parse(req.params.ticket_code);
  const order=await prisma.order.findUnique({where:{ticketCode:code},include:{items:{include:{product:{select:{name:true}},customizations:{include:{extra:{select:{name:true}},font:{select:{fontFamilyName:true}},template:{select:{name:true}}}}}}}});
  if(!order){res.status(404).json({error:'Ticket not found'});return;}
  res.json({ticketCode:order.ticketCode,status:order.status,totalAmount:order.totalAmount,calculatedReadyDate:order.calculatedReadyDate.toISOString().slice(0,10),customerRequestedDate:order.customerRequestedDate.toISOString().slice(0,10),items:order.items.map(i=>({name:i.product.name,quantity:i.quantity,subtotal:i.subtotal,customizations:i.customizations.map(c=>({extra:c.extra?.name,text:c.customText,font:c.font?.fontFamilyName,template:c.template?.name}))}))});
});
export const downloadTicket=asyncRoute(async(req:Request,res:Response)=>{
  const order=await prisma.order.findUnique({where:{ticketCode:req.params.ticket_code},include:{items:{include:{product:true}}}});if(!order){res.status(404).json({error:'Ticket not found'});return;}
  const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText('MAGA · Velas, recuerdos y más',{x:54,y:730,size:19,font:bold,color:rgb(.25,.2,.3)});page.drawText(`Ticket: ${order.ticketCode}`,{x:54,y:690,size:14,font:bold});page.drawText(`Estado: ${order.status}`,{x:54,y:665,size:11,font});page.drawText(`Fecha estimada: ${order.calculatedReadyDate.toISOString().slice(0,10)}`,{x:54,y:645,size:11,font});page.drawText(`Fecha solicitada: ${order.customerRequestedDate.toISOString().slice(0,10)}`,{x:54,y:625,size:11,font});let y=580;for(const i of order.items){page.drawText(`${i.quantity} × ${i.product.name}    $${Number(i.subtotal).toFixed(2)} MXN`,{x:54,y,size:11,font});y-=22;}page.drawText(`Total: $${Number(order.totalAmount).toFixed(2)} MXN`,{x:54,y:y-18,size:14,font:bold});page.drawText('Conserva este número para consultar el estado de tu pedido.',{x:54,y:y-55,size:10,font});
  const bytes=await pdf.save();res.type('application/pdf').set('Content-Disposition',`attachment; filename="${order.ticketCode}.pdf"`).send(Buffer.from(bytes));
});
