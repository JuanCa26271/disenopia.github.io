import type { Request,Response,NextFunction } from 'express';
import jwt,{JwtPayload} from 'jsonwebtoken';
import {prisma} from '../lib/prisma';

export type AdminClaims=JwtPayload&{sub:string;role:'admin'};
declare global { namespace Express { interface Request { admin?:AdminClaims } } }
export function requireAdmin(req:Request,res:Response,next:NextFunction){
  const token=req.cookies?.maga_admin_access as string|undefined;
  if(!token){res.status(401).json({error:'Authentication required'});return;}
  try{
    const secret=process.env.JWT_SECRET;if(!secret)throw new Error('JWT_SECRET missing');
    const claims=jwt.verify(token,secret,{issuer:process.env.JWT_ISSUER||'maga-api',audience:process.env.JWT_AUDIENCE||'maga-admin'}) as AdminClaims;
    if(claims.role!=='admin'||typeof claims.sub!=='string')throw new Error('Invalid claims');
    req.admin=claims;next();
  }catch{res.clearCookie('maga_admin_access',{path:'/api/v1/admin',httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict'});res.status(401).json({error:'Invalid or expired session'});}
}
export function requireSameOrigin(req:Request,res:Response,next:NextFunction){
  const origin=req.get('origin');const allow=[process.env.ADMIN_ORIGIN].filter(Boolean);
  if(origin&&allow.includes(origin)){next();return;}
  res.status(403).json({error:'Origin not allowed'});
}
export async function requirePasswordRotation(req:Request,res:Response,next:NextFunction){try{const admin=await prisma.adminUser.findUnique({where:{id:req.admin!.sub},select:{mustChangePassword:true}});if(!admin){res.status(401).json({error:'Admin account not found'});return;}if(admin.mustChangePassword){res.status(403).json({error:'Change the initial password before using the admin API',code:'PASSWORD_CHANGE_REQUIRED'});return;}next();}catch(error){next(error);}}
