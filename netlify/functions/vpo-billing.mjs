import {createBillingHandler} from '../../standalone/server/http.mjs';

export default async function handler(request){
  return createBillingHandler({env:process.env,logger:entry=>console.error('VPO billing:',entry.code)})(request);
}
