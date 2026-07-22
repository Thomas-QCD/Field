import { apiFetch } from './client';

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
	if (!res.ok) {
		throw new Error(`Crew locations failed (${res.status})`);
	}
	const data = (await res.json()) as { locations: CrewLocation[] };
	return data.locations ?? [];
}
