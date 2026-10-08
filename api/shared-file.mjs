import process from 'node:process';
import {sharedFileDownload} from '../scripts/shared-file-download.mjs';
export default async function handler(request,response){
 response.setHeader('Cache-Control','no-store');
 response.setHeader('X-Content-Type-Options','nosniff');
 response.setHeader('Allow','POST');
 const result=await sharedFileDownload({method:request.method,authorization:request.headers.authorization,body:request.body,env:process.env});
 response.status(result.status).json(result.body);
}
