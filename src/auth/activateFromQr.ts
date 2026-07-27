import { Capacitor } from '@capacitor/core';
import {
	BarcodeScanner,
	BarcodeFormat,
	GoogleBarcodeScannerModuleInstallState,
} from '@capacitor-mlkit/barcode-scanning';
import { activateMobile } from '../api/mobile';
import { apiUrl } from '../api/client';
import { saveMobileSession } from './mobileSession';

const ACTIVATION_CODE_PATTERN = /^field1\.[A-Za-z0-9_-]+$/;

async function ensureAndroidScannerModule(): Promise<void> {
	if (Capacitor.getPlatform() !== 'android') return;

	const { available } =
		await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
	if (available) return;

	await new Promise<void>((resolve, reject) => {
		void BarcodeScanner.addListener(
			'googleBarcodeScannerModuleInstallProgress',
			(event) => {
				if (
					event.state === GoogleBarcodeScannerModuleInstallState.COMPLETED
				) {
					resolve();
				} else if (
					event.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
					event.state === GoogleBarcodeScannerModuleInstallState.CANCELED
				) {
					reject(new Error('Could not install the barcode scanner module'));
				}
			},
		).then(() => BarcodeScanner.installGoogleBarcodeScannerModule());
	});
}

/** Scan an activation QR and persist the device session. */
export async function activateFromQrScan(): Promise<{ displayName: string }> {
	await ensureAndroidScannerModule();

	if (Capacitor.getPlatform() !== 'android') {
		const { camera } = await BarcodeScanner.requestPermissions();
		if (camera !== 'granted' && camera !== 'limited') {
			throw new Error('Camera permission is required to scan a QR code');
		}
	}

	const { barcodes } = await BarcodeScanner.scan({
		formats: [BarcodeFormat.QrCode],
	});

	const raw = barcodes[0]?.rawValue?.trim() ?? '';
	if (!raw) {
		throw new Error('No QR code detected');
	}
	if (!ACTIVATION_CODE_PATTERN.test(raw)) {
		throw new Error('Not a Field activation QR (expected field1.…)');
	}

	const result = await activateMobile(raw, {
		deviceLabel: `${Capacitor.getPlatform()} device`,
	});

	await saveMobileSession({
		deviceSessionToken: result.deviceSessionToken,
		userId: result.userId,
		displayName: result.displayName,
		role: result.role,
		apiBaseUrl: apiUrl('/api').replace(/\/api$/, ''),
	});

	return { displayName: result.displayName };
}
