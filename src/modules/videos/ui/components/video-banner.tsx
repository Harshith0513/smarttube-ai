import { AlertTriangleIcon } from 'lucide-react';

import type { VideoGetOneOutput } from '@/modules/videos/types';

import { MuxStatus } from '@/db/schema';

interface VideoBannerProps {
	status: VideoGetOneOutput['muxStatus'];
}

export const VideoBanner = ({ status }: VideoBannerProps) => {
	if (status === MuxStatus.READY) return null;

	const isError = status === MuxStatus.ERRORED || status === MuxStatus.TIMED_OUT || status === MuxStatus.CANCELLED;

	if (!isError) {
		return (
			<div className='flex items-center gap-2 rounded-b-xl bg-blue-500 px-4 py-3'>
				<AlertTriangleIcon className='size-4 shrink-0 text-white' />

				<p className='line-clamp-1 text-xs font-medium text-white md:text-sm'>
					Video is being processed.{' '}
					<span className='hidden sm:inline'>Please wait, it will be available soon.</span>
				</p>
			</div>
		);
	}

	return (
		<div className='flex items-center gap-2 rounded-b-xl bg-red-500 px-4 py-3'>
			<AlertTriangleIcon className='size-4 shrink-0 text-white' />

			<p className='line-clamp-1 text-xs font-medium text-white md:text-sm'>
				Video processing encountered an error.{' '}
				<span className='hidden sm:inline'>Please try uploading again.</span>
			</p>
		</div>
	);
};
