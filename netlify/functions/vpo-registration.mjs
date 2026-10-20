import {createRegistrationHandler} from '../../standalone/server/registration.mjs';
import {registrationEnvironment} from '../../standalone/server/environment.mjs';
export default createRegistrationHandler({env:registrationEnvironment(process.env),logger:entry=>console.error(entry.code)});
