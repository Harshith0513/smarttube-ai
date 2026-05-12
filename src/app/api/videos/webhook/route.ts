export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { and, eq } from 'drizzle-orm';
import { UTApi } from 'uploadthing/server';

import { db } from '@/db';
import { videos, MuxStatus } from '@/db/schema';
import { updateVideoAsset } from '@/modules/videos/server/actions';
import { mux } from '@/lib/mux';

export const POST = async (req: NextRequest) => {
	try {
		const headersList = await headers();
		const body = await req.text();

		// Verify webhook signature
		const event = await mux.webhooks.unwrap(body, headersList);

		console.log('📩 MUX WEBHOOK:', event.type, event.data.id);

		switch (event.type) {
			case 'video.upload.created': {
				const data = event.data as { id: string };

				await db
					.update(videos)
					.set({
						muxUploadId: data.id,
						muxStatus: MuxStatus.WAITING,
					})
					.where(eq(videos.muxUploadId, data.id));

				break;
			}

			case 'video.upload.asset_created': {
				const data = event.data as { id: string; asset_id?: string };
				const uploadId = data.id;

				await db
					.update(videos)
					.set({
						muxUploadId: uploadId,
						muxAssetId: data.asset_id ?? undefined,
						muxStatus: MuxStatus.PREPARING,
					})
					.where(eq(videos.muxUploadId, uploadId));

				break;
			}

			case 'video.asset.created': {
				const data = event.data as { id: string; upload_id?: string };
				const uploadId = data.upload_id;

				const query = db.update(videos).set({
					muxAssetId: data.id,
					muxStatus: MuxStatus.PREPARING,
				});

				if (uploadId) {
					await query.where(eq(videos.muxUploadId, uploadId));
				} else {
					await query.where(eq(videos.muxAssetId, data.id));
				}

				break;
			}

			case 'video.asset.ready': {
				const data = event.data;

				const [video] = await db
					.select()
					.from(videos)
					.where(eq(videos.muxAssetId, data.id));

				if (video) {
					const muxUploadId = video.muxUploadId || (data as { upload_id?: string }).upload_id || data.id;
					if (muxUploadId) {
						try {
							await updateVideoAsset(muxUploadId);
						} catch (error) {
							console.error('❌ Failed to sync ready asset:', error);
							await db
								.update(videos)
								.set({ muxStatus: MuxStatus.ERRORED })
								.where(eq(videos.muxAssetId, data.id));
						}
					} else {
						console.error('❌ Ready event received but muxUploadId is missing for asset:', data.id);
						await db
							.update(videos)
							.set({ muxStatus: MuxStatus.ERRORED })
							.where(eq(videos.muxAssetId, data.id));
					}
				}

				break;
			}

			case 'video.asset.errored': {
				const data = event.data;

				await db
					.update(videos)
					.set({
						muxStatus: MuxStatus.ERRORED,
					})
					.where(eq(videos.muxAssetId, data.id));

				break;
			}

			case 'video.asset.deleted': {
				const data = event.data;

				const utapi = new UTApi();

				const [deletedVideo] = await db
					.delete(videos)
					.where(eq(videos.muxAssetId, data.id))
					.returning();

				if (deletedVideo) {
					if (deletedVideo.thumbnailKey) {
						await utapi.deleteFiles(deletedVideo.thumbnailKey);
					}

					if (deletedVideo.previewKey) {
						await utapi.deleteFiles(deletedVideo.previewKey);
					}
				}

				break;
			}

			case 'video.asset.track.ready': {
				const data = event.data;

				if (!data.asset_id) {
					return NextResponse.json(
						{ error: 'No asset id found' },
						{ status: 400 }
					);
				}

				await db
					.update(videos)
					.set({
						muxTrackId: data.id,
						muxTrackStatus: MuxStatus.READY,
					})
					.where(eq(videos.muxAssetId, data.asset_id));

				break;
			}

			default: {
				console.log('⚠️ Unhandled event:', event.type);
			}
		}

		return NextResponse.json({ received: true }, { status: 200 });
	} catch (error) {
		console.error('❌ Webhook Error:', error);
		return NextResponse.json(
			{ error: 'Webhook failed' },
			{ status: 500 }
		);
	}
};