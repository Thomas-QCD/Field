import { apiFetch, expectOk } from './client';

export type CrewLocationEventType = 'started' | 'ended';

export interface CrewLocation {
	userId: string;
	displayName: string;
	eventType: CrewLocationEventType;
	latitude: number;
	longitude: number;
	accuracyMeters: number | null;
	recordedAt: string;
	taskId: number;
	taskDesc: string | null;
}

export async function listCrewLocations(
	signal?: AbortSignal,
): Promise<CrewLocation[]> {
	const res = await apiFetch('/api/crew-locations', { signal });
	const data = await expectOk<{ locations?: CrewLocation[] }>(
		res,
		'Crew locations failed',
	);
	return data.locations ?? [];
}
