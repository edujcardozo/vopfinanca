import {sqliteTable,text,integer,primaryKey,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const syncPlans=sqliteTable('sync_plans',{
  userId:text('user_id').primaryKey(),revision:integer('revision').notNull().default(0),
  versionId:text('version_id'),mutationId:text('mutation_id'),documentHash:text('document_hash'),
  chunkCount:integer('chunk_count').notNull().default(0),updatedAt:text('updated_at').notNull()
});
export const syncVersions=sqliteTable('sync_versions',{
  userId:text('user_id').notNull(),revision:integer('revision').notNull(),versionId:text('version_id').notNull(),
  mutationId:text('mutation_id').notNull(),documentHash:text('document_hash').notNull(),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.userId,t.revision]}),uniqueIndex('sync_versions_mutation').on(t.userId,t.mutationId)]);
export const syncChunks=sqliteTable('sync_chunks',{
  userId:text('user_id').notNull(),versionId:text('version_id').notNull(),part:integer('part').notNull(),content:text('content').notNull()
},t=>[primaryKey({columns:[t.userId,t.versionId,t.part]})]);
export const planMembers=sqliteTable('plan_members',{
  ownerId:text('owner_id').notNull(),memberId:text('member_id').notNull(),email:text('email'),
  ownerEmail:text('owner_email'),joinedAt:text('joined_at').notNull()
},t=>[primaryKey({columns:[t.ownerId,t.memberId]})]);
export const planInvites=sqliteTable('plan_invites',{
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),ownerEmail:text('owner_email'),
  tokenHash:text('token_hash').notNull().unique(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
  acceptedBy:text('accepted_by'),revoked:integer('revoked').notNull().default(0)
});
export const planPreferences=sqliteTable('plan_preferences',{
  userId:text('user_id').primaryKey(),activeOwnerId:text('active_owner_id').notNull()
});
