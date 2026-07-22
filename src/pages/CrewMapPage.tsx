import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Center, Loader, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
	listCrewLocations,
	type CrewLocation,
} from '../api/crewLocations';
import { useCurrentUser } from '../context/CurrentUserContext';

/** Downtown Las Vegas — hard-coded for MVP. */
const LAS_VEGAS_CENTER: [number, number] = [36.1699, -115.1398];
const DEFAULT_ZOOM = 11;

function initialsFromName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) {
		const token = parts[0];
		return token.slice(0, 2).toUpperCase();
	}
	const first = parts[0].charAt(0);
	const last = parts[parts.length - 1].charAt(0);
	return `${first}${last}`.toUpperCase();
}

function formatRecordedAt(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	});
}

function crewMarkerIcon(initials: string) {
	return divIcon({
		className: 'field-crew-marker',
		html: `<div class="field-crew-marker-circle">${initials}</div>`,
		iconSize: [36, 36],
		iconAnchor: [18, 18],
		popupAnchor: [0, -18],
	});
}

function CrewMapMarkers({ locations }: { locations: CrewLocation[] }) {
	const icons = useMemo(
		() =>
			Object.fromEntries(
				locations.map((loc) => [
					loc.userId,
					crewMarkerIcon(initialsFromName(loc.displayName)),
				]),
			),
		[locations],
	);

	return (
		<>
			{locations.map((loc) => (
				<Marker
					key={loc.userId}
					position={[loc.latitude, loc.longitude]}
					icon={icons[loc.userId]}
				>
					<Popup>
						<div className='field-crew-popup'>
							<strong>{loc.displayName}</strong>
							<div>
								{loc.eventType === 'started' ? 'Started' : 'Ended'} ·{' '}
								{formatRecordedAt(loc.recordedAt)}
							</div>
							<div>
								Task #{loc.taskId}
								{loc.taskDesc ? ` — ${loc.taskDesc}` : ''}
							</div>
							{loc.accuracyMeters != null ? (
								<div>±{Math.round(loc.accuracyMeters)} m</div>
							) : null}
						</div>
					</Popup>
				</Marker>
			))}
		</>
	);
}

function CrewMapView({ locations }: { locations: CrewLocation[] }) {
	return (
		<MapContainer
			center={LAS_VEGAS_CENTER}
			zoom={DEFAULT_ZOOM}
			className='field-crew-map'
			scrollWheelZoom
		>
			{/* Carto Voyager — softer than OSM, more contrast than Positron */}
			<TileLayer
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
				url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
			/>
			<CrewMapMarkers locations={locations} />
		</MapContainer>
	);
}

/** Desktop-only admin map of last known crew GPS from task_crew_events. */
export function CrewMapPage() {
	// Read matchMedia on first paint — Mantine coerces unset to false via `matches || false`,
	// which falsely redirects before the effect runs when getInitialValueInEffect is true.
	const isDesktop = useMediaQuery('(min-width: 48em)', true, {
		getInitialValueInEffect: false,
	});
	const { user, loading: userLoading } = useCurrentUser();
	const [locations, setLocations] = useState<CrewLocation[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isDesktop || user?.role !== 'admin') return;

		const controller = new AbortController();
		setError(null);
		listCrewLocations(controller.signal)
			.then(setLocations)
			.catch((err: unknown) => {
				if (controller.signal.aborted) return;
				setError(err instanceof Error ? err.message : 'Failed to load');
				setLocations([]);
			});

		return () => controller.abort();
	}, [isDesktop, user?.role]);

	if (userLoading) {
		return (
			<Center py='xl'>
				<Loader size='sm' />
			</Center>
		);
	}

	if (!isDesktop || user?.role !== 'admin') {
		return <Navigate to='/' replace />;
	}

	if (error) {
		return (
			<Center py='xl'>
				<Text c='red'>{error}</Text>
			</Center>
		);
	}

	if (locations == null) {
		return (
			<Center py='xl'>
				<Loader size='sm' />
			</Center>
		);
	}

	return (
		<div className='field-crew-map-page'>
			<CrewMapView locations={locations} />
		</div>
	);
}
