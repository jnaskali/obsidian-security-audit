import { SecurityAuditSettings } from './types';

export const DEFAULT_SETTINGS: SecurityAuditSettings = {
	githubAccessToken: undefined,
	debugLogging: false,
	doNotDeleteCacheOnDisable: false,
	showDebugOptionsInMenu: false,
	debugOptions: false
}