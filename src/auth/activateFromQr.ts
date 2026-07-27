import { Capacitor } from '@capacitor/core';
import {
	BarcodeScanner,
	BarcodeFormat,
	GoogleBarcodeScannerModuleInstallState,
} from '@capacitor-mlkit/barcode-scanning';
import { activateMobile } from '../api/mobile';
import { apiUrl } from '../api/client';
import { saveMobileSession } from './mobileSession';

export const ACTIVATION_CODE_PATTERN = /^field1\.[A-Za-z0-9_-]+$/;

/** True when the native ML Kit scan UI is available (Android). iOS uses paste — Google ML Kit is not linked on iOS (blocks Apple Silicon simulators). */
export function canScanActivationQr(): boolean {
	return (
		Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
	);
}

function normalizeActivationInput(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new Error('Enter an activation code (field1.…)');
	}
	if (!ACTIVATION_CODE_PATTERN.test(trimmed)) {
		throw new Error('Not a Field activation code (expected field1.…)');
	}
	return trimmed;
}

/** Activate with a pasted/typed `field1.…` code and persist the device session. */
export async function activateWithCode(
	rawCode: string,
): Promise<{ displayName: string }> {
	const code = normalizeActivationInput(rawCode);

	const result = await activateMobile(code, {
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

/** Scan an activation QR (Android) and persist the device session. */
export async function activateFromQrScan(): Promise<{ displayName: string }> {
	if (!canScanActivationQr()) {
		throw new Error(
			'Camera QR scan is Android-only here. Paste the field1.… code instead.',
		);
	}

	await ensureAndroidScannerModule();

	const { barcodes } = await BarcodeScanner.scan({
		formats: [BarcodeFormat.QrCode],
	});

	const raw = barcodes[0]?.rawValue?.trim() ?? '';
	if (!raw) {
		throw new Error('No QR code detected');
	}

	return activateWithCode(raw);
}
