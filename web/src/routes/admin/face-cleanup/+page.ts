import { redirect } from '@sveltejs/kit';
import { Route } from '$lib/route';
import type { PageLoad } from './$types';

// Temporary: slice 5 replaces this with the mode chooser.
export const load = (() => redirect(307, Route.faceCleanupScan())) satisfies PageLoad;
