export interface SecurityAuditSettings {
	debugLogging: boolean;
	doNotDeleteCacheOnDisable: boolean;
	showDebugOptionsInMenu: boolean;
	lastAuditTimestamp?: number;
	lastAuditSummary?: {
		critical: number;
		high: number;
		moderate: number;
		low: number;
		info: number;
		noIssues: number;
		failedDownload: number;
		auditIncomplete: number;
		noRepo: number;
	};
	lastAuditLog?: string;
}

export interface PluginManifestEntry {
	id: string;
	name: string;
	author: string;
	description: string;
	repo?: string;
	defaultBranch?: string;
	supportLink?: string;
	lastUpdated?: number;
}

export interface CacheMetadata {
	[key: string]: {
		lastModified?: string;
		size?: number;
	};
}