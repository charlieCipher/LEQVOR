import process from 'node:process';
import { scheduledCleanup } from '../scripts/scheduled-cleanup.mjs';

export default async function handler(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Allow','GET');
  const result=await scheduledCleanup({method:request.method,authorization:request.headers.authorization,env:process.env});
  response.status(result.status).json(result.body);
}
