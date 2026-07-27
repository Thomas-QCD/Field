/** True when Vite Entra env is set — web uses MSAL SSO instead of stub user picker. */
export function isEntraConfigured(): boolean {
	const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;
	const tenantId = import.meta.env.VITE_AZURE_TENANT_ID as string | undefined;
	return Boolean(clientId?.trim() && tenantId?.trim());
}
