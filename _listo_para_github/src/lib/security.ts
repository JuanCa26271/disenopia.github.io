import { cookies } from 'next/headers';

/** Set only after successful server-side authentication; never expose tokens to browser JS. */
export async function setSessionCookies(accessToken:string,refreshToken:string){
  const jar=await cookies(); const common={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/'};
  jar.set('maga_access',accessToken,{...common,maxAge:10*60});
  jar.set('maga_refresh',refreshToken,{...common,maxAge:60*60*24*14});
}
export async function clearSessionCookies(){const jar=await cookies();jar.delete('maga_access');jar.delete('maga_refresh');}

/** Exact origin allowlist. Configure API separately; do not use wildcard CORS with cookies. */
export function assertAllowedOrigin(origin:string|null){
  const allowed=(process.env.ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!origin||!allowed.includes(origin))throw new Error('Origin not allowed');
}
