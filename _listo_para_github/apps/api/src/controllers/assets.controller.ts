import type {Request,Response} from 'express';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import {z} from 'zod';
import {prisma} from '../lib/prisma';
import {decryptAssetBytes,encryptAssetBytes} from '../services/security.service';
import {asyncRoute} from '../middleware/errors';

const MAX_BYTES=5*1024*1024,MAX_PIXELS=30_000_000;
const purposes={PRODUCT_REFERENCE:'catalog/products',COLLECTION_REFERENCE:'catalog/collections',SYSTEM_CUSTOMIZATION:'catalog/customizations',ORDER_CUSTOMIZATION:'orders/customer-personalizations'} as const;
type UploadPurpose=keyof typeof purposes;
export const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_BYTES,files:1,fields:0,parts:1}}).single('photo');
function signature(bytes:Buffer){if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg';if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';return null;}
const uploadLimit=(req:Request,res:Response,next:import('express').NextFunction)=>{photoUpload(req,res,error=>{if(error){if(error instanceof multer.MulterError&&error.code==='LIMIT_FILE_SIZE'){res.status(413).json({error:'Image exceeds 5 MB'});return;}res.status(400).json({error:'Invalid image upload'});return;}next();});};
export const uploadPhotoMiddleware=uploadLimit;
async function saveUploadedPhoto(req:Request,res:Response,purpose:UploadPurpose){
  const file=req.file;if(!file){res.status(400).json({error:'Choose an image in the photo field'});return;}
  const kind=signature(file.buffer);if(!kind){res.status(415).json({error:'Only JPEG, PNG and WebP images are allowed'});return;}
  const metadata=await sharp(file.buffer,{limitInputPixels:MAX_PIXELS}).metadata();if(metadata.format!==kind||!metadata.width||!metadata.height||metadata.width*metadata.height>MAX_PIXELS){res.status(415).json({error:'Image content is invalid or too large'});return;}
  const id=randomUUID(),storageKey=path.posix.join(purposes[purpose],`${id}.webp`),root=path.resolve(process.env.UPLOAD_DIR||'./private-uploads'),target=path.join(root,...storageKey.split('/'));await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  const safeBytes=await sharp(file.buffer,{limitInputPixels:MAX_PIXELS}).rotate().webp({lossless:true,effort:6}).toBuffer();if(safeBytes.length>20*1024*1024){res.status(413).json({error:'Sanitized image exceeds 20 MB'});return;}const outputMeta=await sharp(safeBytes).metadata();
  const encrypted=encryptAssetBytes(safeBytes);await writeFile(target,encrypted.ciphertext,{flag:'wx',mode:0o600});
  try{await prisma.uploadedAsset.create({data:{id,purpose,storageKey,contentType:'image/webp',sizeBytes:encrypted.ciphertext.length,widthPixels:outputMeta.width!,heightPixels:outputMeta.height!,encryptionIv:encrypted.iv,encryptionAuthTag:encrypted.authTag}});}catch(error){await unlink(target).catch(()=>undefined);throw error;}
  const origin=(process.env.PUBLIC_API_ORIGIN||`http://localhost:${process.env.PORT||4000}`).replace(/\/$/,'');res.status(201).json({id,url:`${origin}/api/v1/store/assets/${id}`,contentType:'image/webp',width:outputMeta.width,height:outputMeta.height});
}
export const uploadCustomerPhoto=asyncRoute(async(req:Request,res:Response)=>saveUploadedPhoto(req,res,'ORDER_CUSTOMIZATION'));
export const uploadAdminAsset=asyncRoute(async(req:Request,res:Response)=>{const purpose=req.params.purpose as UploadPurpose;if(!['PRODUCT_REFERENCE','COLLECTION_REFERENCE','SYSTEM_CUSTOMIZATION'].includes(purpose)){res.status(400).json({error:'Invalid catalog asset purpose'});return;}await saveUploadedPhoto(req,res,purpose);});
async function readAsset(assetId:string){const asset=await prisma.uploadedAsset.findUnique({where:{id:assetId}});if(!asset)return null;const root=path.resolve(process.env.UPLOAD_DIR||'./private-uploads'),file=path.join(root,...asset.storageKey.split('/'));return{asset,bytes:decryptAssetBytes(await readFile(file),asset.encryptionIv,asset.encryptionAuthTag)};}
export const getPhoto=asyncRoute(async(req:Request,res:Response)=>{
  const id=z.string().uuid().parse(req.params.asset_id),stored=await readAsset(id);if(!stored){res.status(404).json({error:'Asset not found'});return;}
  res.type(stored.asset.contentType).set('Cache-Control','private, max-age=86400').set('X-Content-Type-Options','nosniff').send(stored.bytes);
});
export const getAdminAsset=asyncRoute(async(req:Request,res:Response)=>{const id=z.string().uuid().parse(req.params.asset_id),stored=await readAsset(id);if(!stored){res.status(404).json({error:'Asset not found'});return;}res.type(stored.asset.contentType).set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff').send(stored.bytes);});
