import { cache } from 'react';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { TRPCError, initTRPC } from '@trpc/server';
import { eq } from 'drizzle-orm';
import superjson from 'superjson';

import { db } from '@/db';
import { users } from '@/db/schema';

export const createTRPCContext = cache(async () => {
	const { userId } = await auth();

	return { clerkUserId: userId };
});

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
	/**
	 * @see https://trpc.io/docs/server/data-transformers
	 */
	transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async (opts) => {
	const { ctx } = opts;

	if (!ctx.clerkUserId) throw new TRPCError({ code: 'UNAUTHORIZED' });

	let [user] = await db.select().from(users).where(eq(users.clerkId, ctx.clerkUserId)).limit(1);

	// Auto-create user if they don't exist in the database
	if (!user) {
		try {
			const clerkClientInstance = await clerkClient();
			const clerkUser = await clerkClientInstance.users.getUser(ctx.clerkUserId);
			const name = clerkUser.fullName || clerkUser.firstName || 'User';
			const clerkUserProfile = clerkUser as { profileImageUrl?: string; imageUrl?: string };
			const imageUrl = clerkUserProfile.profileImageUrl || clerkUserProfile.imageUrl || '';

			const [newUser] = await db
				.insert(users)
				.values({
					clerkId: ctx.clerkUserId,
					name,
					imageUrl,
				})
				.returning();

			user = newUser;
		} catch {
			throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Failed to create user' });
		}
	}

	if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

	return opts.next({
		ctx: {
			...ctx,
			user,
		},
	});
});
