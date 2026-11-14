import type {ErrorRequestHandler,Request,Response,NextFunction} from 'express';
import {ZodError} from 'zod';
import {Prisma} from '@prisma/client';
export function notFound(_req:Request,res:Response){res.status(404).json({error:'Not found'});}
export const errorHandler:ErrorRequestHandler=(err,req,res,_next)=>{console.error({path:req.path,message:err instanceof Error?err.message:'Unknown error'});if(res.headersSent)return;if(err instanceof ZodError){res.status(400).json({error:'Invalid request',details:err.flatten()});return;}if(err instanceof Prisma.PrismaClientKnownRequestError){const status=err.code==='P2025'?404:err.code==='P2002'||err.code==='P2034'?409:500;res.status(status).json({error:status===500?'Database operation failed':'Request conflicts with current data'});return;}const status=typeof err?.status==='number'&&err.status>=400&&err.status<500?err.status:500;res.status(status).json({error:status===500?'Internal server error':err.message,minimumDate:err.minimumDate});};
export function asyncRoute(fn:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>){return(req:Request,res:Response,next:NextFunction)=>{void fn(req,res,next).catch(next);};}
