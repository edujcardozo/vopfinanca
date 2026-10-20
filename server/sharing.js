// Plan access is independent of the Site's sign-in gate. Never trust an owner ID
// from a document: membership and the active plan are resolved from D1.
export const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const tokenPattern=/^[a-f0-9]{64}$/;
export async function resolveScope(db,user){
  const preference=await db.prepare('SELECT active_owner_id FROM plan_preferences WHERE user_id = ?').bind(user.id).first();
  const ownerId=preference?.active_owner_id||user.id;
  if(ownerId===user.id)return {id:ownerId,role:'owner',ownerEmail:user.email,revoked:false};
  const member=await db.prepare('SELECT owner_email FROM plan_members WHERE owner_id = ? AND member_id = ?').bind(ownerId,user.id).first();
  return {id:ownerId,role:'editor',ownerEmail:member?.owner_email||null,revoked:!member};
}
export async function sharingAPI(request,db,user,body={}){
  const path=new URL(request.url).pathname,method=request.method,scope=await resolveScope(db,user);
  if(path==='/api/sharing'&&method==='GET'){
    const {results:joined}=await db.prepare('SELECT owner_id, owner_email FROM plan_members WHERE member_id = ?').bind(user.id).all();
    const plans=[{id:user.id,role:'owner',label:'Meu plano pessoal'},...joined.map(m=>({id:m.owner_id,role:'editor',label:'Plano compartilhado',ownerEmail:m.owner_email}))];
    const members=scope.revoked?[]:(await db.prepare('SELECT member_id, email, joined_at FROM plan_members WHERE owner_id = ? ORDER BY joined_at').bind(scope.id).all()).results;
    const invites=scope.role!=='owner'?[]:(await db.prepare('SELECT id, expires_at FROM plan_invites WHERE owner_id = ? AND accepted_by IS NULL AND revoked = 0 AND expires_at > ?').bind(scope.id,new Date().toISOString()).all()).results;
    return reply({user,scope,plans,members:members.map(m=>({id:m.member_id,email:m.email,joinedAt:m.joined_at})),invites});
  }
  if(path==='/api/sharing/switch'&&method==='POST'){
    if(typeof body.scopeId!=='string')return reply({error:'Escolha um plano válido.'},400);
    if(body.scopeId!==user.id&&!await db.prepare('SELECT 1 FROM plan_members WHERE owner_id = ? AND member_id = ?').bind(body.scopeId,user.id).first())return reply({error:'Você não tem acesso a este plano.'},403);
    await db.prepare('INSERT INTO plan_preferences (user_id, active_owner_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET active_owner_id = excluded.active_owner_id').bind(user.id,body.scopeId).run();
    return reply({ok:true});
  }
  if(['/api/sharing/preview','/api/sharing/accept'].includes(path)&&method==='POST'){
    if(!tokenPattern.test(body.token||''))return reply({error:'Este convite não é válido.'},400);
    const tokenHash=await hash(body.token),invite=await db.prepare('SELECT * FROM plan_invites WHERE token_hash = ?').bind(tokenHash).first();
    if(!invite||invite.revoked||invite.expires_at<=new Date().toISOString()||invite.accepted_by&&invite.accepted_by!==user.id)return reply({error:'Este convite expirou, foi cancelado ou já foi usado. Peça um novo convite.'},410);
    if(invite.owner_id===user.id)return reply({error:'Este é o convite do seu próprio plano. Envie o link para a outra pessoa.'},400);
    if(path.endsWith('/preview'))return reply({ownerEmail:invite.owner_email,expiresAt:invite.expires_at,canEdit:true});
    const now=new Date().toISOString();
    // Claim and join in one transaction. Only one invited editor per couple.
    await db.batch([
      db.prepare('UPDATE plan_invites SET accepted_by = ? WHERE token_hash = ? AND revoked = 0 AND expires_at > ? AND (accepted_by IS NULL OR accepted_by = ?) AND NOT EXISTS (SELECT 1 FROM plan_members WHERE owner_id = plan_invites.owner_id AND member_id != ?)').bind(user.id,tokenHash,now,user.id,user.id),
      db.prepare('INSERT INTO plan_members (owner_id, member_id, email, owner_email, joined_at) SELECT owner_id, ?, ?, owner_email, ? FROM plan_invites WHERE token_hash = ? AND accepted_by = ? AND revoked = 0 AND expires_at > ? ON CONFLICT(owner_id,member_id) DO NOTHING').bind(user.id,user.email,now,tokenHash,user.id,now),
      db.prepare('INSERT INTO plan_preferences (user_id, active_owner_id) SELECT ?, owner_id FROM plan_invites WHERE token_hash = ? AND accepted_by = ? AND revoked = 0 AND EXISTS (SELECT 1 FROM plan_members WHERE owner_id = plan_invites.owner_id AND member_id = ?) ON CONFLICT(user_id) DO UPDATE SET active_owner_id = excluded.active_owner_id').bind(user.id,tokenHash,user.id,user.id)
    ]);
    const joined=await db.prepare('SELECT 1 FROM plan_members WHERE owner_id = ? AND member_id = ?').bind(invite.owner_id,user.id).first();
    return joined?reply({ok:true,scopeId:invite.owner_id}):reply({error:'O convite não está mais disponível. Peça um novo link.'},410);
  }
  if(scope.revoked)return reply({error:'O acesso ao plano foi removido. Abra seu plano pessoal em Ajustes.',code:'PLAN_ACCESS_REVOKED'},403);
  if(scope.role!=='owner')return reply({error:'Somente o dono do plano pode gerenciar convites e acessos.'},403);
  if(path==='/api/sharing/invites'&&method==='POST'){
    const plan=await db.prepare('SELECT version_id FROM sync_plans WHERE user_id = ?').bind(scope.id).first();
    if(!plan?.version_id)return reply({error:'Sincronize seu plano antes de criar o convite.'},409);
    if(await db.prepare('SELECT 1 FROM plan_members WHERE owner_id = ?').bind(scope.id).first())return reply({error:'Este plano já está compartilhado. Gerencie o acesso em Ajustes.'},409);
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),inviteId=crypto.randomUUID(),now=new Date().toISOString(),expiresAt=new Date(Date.now()+86400000).toISOString();
    await db.batch([
      db.prepare('UPDATE plan_invites SET revoked = 1 WHERE owner_id = ? AND accepted_by IS NULL').bind(scope.id),
      db.prepare('INSERT INTO plan_invites (id, owner_id, owner_email, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(inviteId,scope.id,user.email,await hash(token),now,expiresAt)
    ]);
    return reply({id:inviteId,token,expiresAt},201);
  }
  if(path==='/api/sharing/revoke-invite'&&method==='POST'){
    await db.prepare('UPDATE plan_invites SET revoked = 1 WHERE id = ? AND owner_id = ?').bind(String(body.id||''),scope.id).run();return reply({ok:true});
  }
  if(path==='/api/sharing/remove-member'&&method==='POST'){
    if(typeof body.memberId!=='string'||body.memberId===user.id)return reply({error:'Selecione a pessoa convidada.'},400);
    await db.batch([
      db.prepare('DELETE FROM plan_members WHERE owner_id = ? AND member_id = ?').bind(scope.id,body.memberId),
      db.prepare('UPDATE plan_invites SET revoked = 1 WHERE owner_id = ? AND accepted_by = ?').bind(scope.id,body.memberId)
    ]);return reply({ok:true});
  }
  return reply({error:'Não encontrado.'},404);
}
