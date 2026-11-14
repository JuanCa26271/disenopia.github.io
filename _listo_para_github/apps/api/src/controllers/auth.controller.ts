import type {Request,Response} from 'express';
import {z} from 'zod';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import {prisma} from '../lib/prisma';
import {asyncRoute} from '../middleware/errors';

export const loginSchema=z.object({username:z.string().min(1).max(120),password:z.string().min(1).max(200)}).strict();
export const login=asyncRoute(async(req:Request,res:Response)=>{
  const {username,password}=req.body as z.infer<typeof loginSchema>;
  const admin=await prisma.adminUser.findUnique({where:{username}});const now=new Date();
  if(!admin){await argon2.hash(password);res.status(401).json({error:'Invalid credentials'});return;}
  if(admin.lockedUntil&&admin.lockedUntil>now){res.status(429).json({error:'Account temporarily locked'});return;}
  let valid=false;try{valid=await argon2.verify(admin.passwordHash,password)}catch{valid=false;}
  if(!valid){const attempts=admin.failedLoginAttempts+1;await prisma.adminUser.update({where:{id:admin.id},data:{failedLoginAttempts:attempts,lockedUntil:attempts>=5?new Date(now.getTime()+30*60*1000):null}});res.status(401).json({error:'Invalid credentials'});return;}
  await prisma.adminUser.update({where:{id:admin.id},data:{failedLoginAttempts:0,lockedUntil:null}});
  const secret=process.env.JWT_SECRET;if(!secret)throw new Error('JWT_SECRET is not configured');
  const token=jwt.sign({role:'admin'},secret,{subject:admin.id,issuer:process.env.JWT_ISSUER||'maga-api',audience:process.env.JWT_AUDIENCE||'maga-admin',expiresIn:'15m'});
  res.cookie('maga_admin_access',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/v1/admin',maxAge:15*60*1000});
  res.json({authenticated:true,expiresIn:900,passwordChangeRequired:admin.mustChangePassword});
});
export const changePasswordSchema=z.object({currentPassword:z.string().min(1).max(200),newPassword:z.string().min(12).max(200).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/)}).strict();
export const changePassword=asyncRoute(async(req:Request,res:Response)=>{const {currentPassword,newPassword}=req.body as z.infer<typeof changePasswordSchema>,id=req.admin!.sub,admin=await prisma.adminUser.findUnique({where:{id}});if(!admin||!await argon2.verify(admin.passwordHash,currentPassword)){res.status(400).json({error:'Current password is incorrect'});return;}if(currentPassword===newPassword){res.status(400).json({error:'Choose a different password'});return;}await prisma.adminUser.update({where:{id},data:{passwordHash:await argon2.hash(newPassword,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1}),mustChangePassword:false}});res.json({passwordChanged:true});});
export function logout(_req:Request,res:Response){res.clearCookie('maga_admin_access',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/v1/admin'});res.status(204).end();}
export const session=asyncRoute(async(req:Request,res:Response)=>{const admin=await prisma.adminUser.findUnique({where:{id:req.admin!.sub},select:{mustChangePassword:true}});res.json({authenticated:Boolean(admin),passwordChangeRequired:admin?.mustChangePassword??true});});
