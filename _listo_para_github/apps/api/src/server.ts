import 'dotenv/config';
import {app} from './app';
import {prisma} from './lib/prisma';
const port=Number(process.env.PORT||4000);
const host=process.env.HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
const server=app.listen(port,host,()=>{console.info(`MAGA API listening on http://${host}:${port}`)});
async function shutdown(){server.close(async()=>{await prisma.$disconnect();process.exit(0)});setTimeout(()=>process.exit(1),10_000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
