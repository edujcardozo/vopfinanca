import {createRegistrationHandler} from '../../standalone/server/registration.mjs';
export default createRegistrationHandler({env:process.env,logger:entry=>console.error(entry.code)});
