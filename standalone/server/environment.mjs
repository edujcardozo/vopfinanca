import project from '../project.json' with {type:'json'};

// The browser build and registration functions target the same public project.
// Keep private credentials in Netlify; an unrelated/obsolete SUPABASE_URL must
// never redirect the server key to a different backend.
export function registrationEnvironment(env){
  return {...env,SUPABASE_URL:env.VPO_SUPABASE_URL??project.url};
}
