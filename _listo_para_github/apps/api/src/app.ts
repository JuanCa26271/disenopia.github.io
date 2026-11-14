import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import storeRoutes from './routes/store.routes';
import adminRoutes from './routes/admin.routes';
import {errorHandler,notFound} from './middleware/errors';
import {prisma} from './lib/prisma';
import {validateAssetDataKey,validateCustomerDataKey} from './services/security.service';

if(!process.env.JWT_SECRET||Buffer.byteLength(process.env.JWT_SECRET)<32)throw new Error('JWT_SECRET must be set to at least 32 bytes');
validateCustomerDataKey();
validateAssetDataKey();
if(!process.env.STORE_ORIGIN||!process.env.ADMIN_ORIGIN||process.env.STORE_ORIGIN.includes('*')||process.env.ADMIN_ORIGIN.includes('*'))throw new Error('Set exact STORE_ORIGIN and ADMIN_ORIGIN values');
export const app=express();
app.disable('x-powered-by');app.set('trust proxy',1);
const production=process.env.NODE_ENV==='production';
app.use(helmet({hsts:production?{maxAge:31_536_000,includeSubDomains:true,preload:true}:false,contentSecurityPolicy:{directives:{defaultSrc:["'none'"],frameAncestors:["'none'"],formAction:["'self'"],baseUri:["'none'"]}}}));
const origins=[process.env.STORE_ORIGIN,process.env.ADMIN_ORIGIN].filter((v):v is string=>Boolean(v));
app.use(cors({origin(origin,callback){callback(null,!origin||origins.includes(origin));},credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-Request-Id']}));
// Handle browser preflight before admin authentication middleware. In particular,
// OPTIONS /admin/login must not fall through to requireAdmin in the router.
app.options('/api/v1/admin/*',(req,res)=>{
  const origin=req.get('origin');
  if(!origin||origin!==process.env.ADMIN_ORIGIN){res.status(403).end();return;}
  res.set('Access-Control-Allow-Origin',origin);
  res.set('Access-Control-Allow-Credentials','true');
  res.set('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers','Content-Type,X-Request-Id');
  res.vary('Origin').status(204).end();
});
app.use(express.json({limit:'1mb',strict:true}));app.use(cookieParser());
app.use('/api',rateLimit({windowMs:60_000,max:180,standardHeaders:true,legacyHeaders:false}));
app.get('/health',async(_req,res)=>{try{await prisma.$queryRaw`SELECT 1`;res.json({status:'ok'});}catch{res.status(503).json({status:'unavailable'});}});
app.use('/api/v1/store',storeRoutes);app.use('/api/v1/admin',adminRoutes);app.use(notFound);app.use(errorHandler);
