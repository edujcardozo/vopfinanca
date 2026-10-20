// The existing hosted app continues using Sites identity and its D1 API.
// The independent build substitutes this module with standalone/platform.js.
export const platform={independent:false,example:true,get storage(){return globalThis.localStorage;},fetcher:(...args)=>fetch(...args)};
