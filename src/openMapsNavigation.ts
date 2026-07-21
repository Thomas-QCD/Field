import { Capacitor } from '@capacitor/core';

/** Open the device maps / navigation app for an address (or Google Maps in browser). */
export function openMapsNavigation(address: string): void {
	const query = address.trim();
	if (!query) return;

	const encoded = encodeURIComponent(query);
	const platform = Capacitor.getPlatform();

	let url: string;
	if (platform === 'ios') {
		url = `maps://?daddr=${encoded}`;
	} else if (platform === 'android') {
		url = `geo:0,0?q=${encoded}`;
	} else {
		url = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
	}

	window.location.assign(url);
}
