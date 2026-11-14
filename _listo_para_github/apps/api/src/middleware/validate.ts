import type { Request,Response,NextFunction } from 'express';
import { z,ZodSchema } from 'zod';
export function validateBody<T>(schema:ZodSchema<T>){return(req:Request,res:Response,next:NextFunction)=>{const parsed=schema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:'Invalid request',details:parsed.error.flatten()});return;}req.body=parsed.data;next();}}
export const uuid=z.string().uuid();
