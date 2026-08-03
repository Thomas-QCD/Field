import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type CapturedGeo = {
	latitude: number;
	longitude: number;
	accuracyMeters: number | null;
	recordedAt: string;
};

function geoErrorMessage(err: unknown): string {
	if (err && typeof err === 'object') {
		const code =
			'code' in err && typeof err.code === 'number' ? err.code : null;
		// GeolocationPositionError: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
		if (code === 1) {
			return 'Location permission is required. Enable location for Field, then try again.';
		}
		if (code === 2) {
			return 'Location unavailable. Turn on GPS / location services and try again.';
		}
		if (code === 3) {
			return 'Timed out getting GPS. Move to an open area and try again.';
		}
		if (
			'message' in err &&
			typeof err.message === 'string' &&
			err.message.trim()
		) {
			const msg = err.message.trim();
			if (/permission|denied|disabled/i.test(msg)) {
				return 'Location permission is required. Enable location for Field, then try again.';
			}
			return msg;
		}
	}
	return 'Could not get GPS location. Location is required to continue.';
}

async function ensureNativePermission(): Promise<void> {
	const current = await Geolocation.checkPermissions();
	if (current.location === 'granted' || current.coarseLocation === 'granted') {
		return;
	}
	const requested = await Geolocation.requestPermissions({
		permissions: ['location'],
	});
	if (
		requested.location !== 'granted' &&
		requested.coarseLocation !== 'granted'
	) {
		throw Object.assign(
			new Error(
				'Location permission is required. Enable location for Field, then try again.',
			),
			{ code: 1 },
		);
	}
}

/**
 * Capture current GPS. Throws if permission is denied or a fix cannot be obtained.
 * Native: Capacitor Geolocation (runtime permission). Web: navigator.geolocation.
 */
export async function captureRequiredGeo(): Promise<CapturedGeo> {
	try {
		if (Capacitor.isNativePlatform()) {
			await ensureNativePermission();
			const pos = await Geolocation.getCurrentPosition({
				enableHighAccuracy: true,
				timeout: 15_000,
				maximumAge: 30_000,
			});
			return {
				latitude: pos.coords.latitude,
				longitude: pos.coords.longitude,
				accuracyMeters:
					typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
				recordedAt: new Date().toISOString(),
			};
		}

		if (!navigator.geolocation) {
			throw new Error('Geolocation is not supported in this browser.');
		}

		const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: true,
				timeout: 15_000,
				maximumAge: 30_000,
			});
		});

		return {
			latitude: pos.coords.latitude,
			longitude: pos.coords.longitude,
			accuracyMeters:
				typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
			recordedAt: new Date().toISOString(),
		};
	} catch (err: unknown) {
		throw new Error(geoErrorMessage(err));
	}
}
