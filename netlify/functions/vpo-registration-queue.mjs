import {registrationConfig,registrationDatabase,deliverRegistration} from '../../standalone/server/registration.mjs';
export default async()=>{
  let config;try{config=registrationConfig(process.env);}catch{return;}
  try{await deliverRegistration({config,db:registrationDatabase(config)});}catch(error){console.error(error.code||'EMAIL_UNAVAILABLE');}
};
export const config={schedule:'*/5 * * * *'};
