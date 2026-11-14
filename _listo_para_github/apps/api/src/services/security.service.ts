import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

function customerKey(): Buffer {
  const value = process.env.CUSTOMER_DATA_KEY;
  if (!value) throw new Error('CUSTOMER_DATA_KEY is required');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('CUSTOMER_DATA_KEY must be a base64 encoded 32-byte key');
  return key;
}
export function validateCustomerDataKey(){void customerKey();}
function assetKey():Buffer{const value=process.env.ASSET_DATA_KEY;if(!value)throw new Error('ASSET_DATA_KEY is required');const key=Buffer.from(value,'base64');if(key.length!==32)throw new Error('ASSET_DATA_KEY must be a base64 encoded 32-byte key');return key;}
export function validateAssetDataKey(){void assetKey();}
export function encryptAssetBytes(plain:Buffer){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',assetKey(),iv),ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);return{ciphertext,iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64')};}
export function decryptAssetBytes(ciphertext:Buffer,iv:string,authTag:string){const decipher=createDecipheriv('aes-256-gcm',assetKey(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(authTag,'base64'));return Buffer.concat([decipher.update(ciphertext),decipher.final()]);}
export type EncryptedCustomer = { firstNameEncrypted:string; lastNameEncrypted:string; phoneEncrypted:string; encryptionIv:string; encryptionAuthTag:string };
export function encryptCustomerData(value:string):{ciphertext:string;iv:string;authTag:string} {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',customerKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64')};
}
export function decryptCustomerData(encryptedText:string,iv:string,authTag:string):string {
  const decipher=createDecipheriv('aes-256-gcm',customerKey(),Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(authTag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText,'base64')),decipher.final()]).toString('utf8');
}
/** Each PII field gets a unique GCM nonce; the existing IV/tag columns store their field maps. */
export function encryptCustomer(firstName:string,lastName:string,phone:string):EncryptedCustomer {
  const first=encryptCustomerData(firstName), last=encryptCustomerData(lastName), tel=encryptCustomerData(phone);
  return {firstNameEncrypted:first.ciphertext,lastNameEncrypted:last.ciphertext,phoneEncrypted:tel.ciphertext,
    encryptionIv:JSON.stringify({first:first.iv,last:last.iv,phone:tel.iv}),
    encryptionAuthTag:JSON.stringify({first:first.authTag,last:last.authTag,phone:tel.authTag})};
}
export function decryptCustomer(customer:{firstNameEncrypted:string;lastNameEncrypted:string;phoneEncrypted:string;encryptionIv:string;encryptionAuthTag:string}) {
  const iv=JSON.parse(customer.encryptionIv) as Record<string,string>, tag=JSON.parse(customer.encryptionAuthTag) as Record<string,string>;
  if(!iv.first||!iv.last||!iv.phone||!tag.first||!tag.last||!tag.phone)throw new Error('Customer encryption metadata is invalid');
  return {firstName:decryptCustomerData(customer.firstNameEncrypted,iv.first,tag.first),lastName:decryptCustomerData(customer.lastNameEncrypted,iv.last,tag.last),phone:decryptCustomerData(customer.phoneEncrypted,iv.phone,tag.phone)};
}
export function constantTimeStringEqual(a:string,b:string):boolean {const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}
