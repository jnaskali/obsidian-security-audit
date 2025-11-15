function createSummaryTable(container: HTMLElement, header1: string, header2: string, summary: {critical: number, high: number, moderate: number, low: number, info: number, noIssues: number, failedDownload: number, auditIncomplete: number, noRepo: number}): HTMLElement {
	const severities = [
		{text: 'Critical issues', count: summary.critical},
		{text: 'High issues', count: summary.high},
		{text: 'Moderate issues', count: summary.moderate},
		{text: 'Low issues', count: summary.low},
		{text: 'Info issues', count: summary.info},
		{text: 'No issues', count: summary.noIssues},
		{text: 'Unable to download', count: summary.failedDownload},
		{text: 'Audit incomplete', count: summary.auditIncomplete},
		{text: 'No online repository', count: summary.noRepo}
	];
	const table = container.createEl('table', { cls: 'modal-table' });
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	headerRow.createEl('th', {text: header1});
	headerRow.createEl('th', {text: header2});
	const tbody = table.createEl('tbody');
	for (let index = 0; index < severities.length; index++) {
		const sev = severities[index];
		const row = tbody.createEl('tr');
		row.createEl('td', {text: sev.text});
		row.createEl('td', {text: sev.count.toString()});
		if (index === 5) {
			row.classList.add('spaced-row');
			// Add empty row after 'No issues'
			const emptyRow = tbody.createEl('tr');
			emptyRow.style.height = '1em';
		}
	}
	return table;
}

function getMaxSeverity(vulnerabilities: any): {maxSeverity: string, libraries: {name: string, severity: string}[]} {
	let maxSeverity = 'none';
	const libraries: {name: string, severity: string}[] = [];
	for (const [lib, vuln] of Object.entries(vulnerabilities)) {
		const sev = (vuln as any).severity;
		libraries.push({name: lib, severity: sev});
		if (sev === 'critical') maxSeverity = 'critical';
		else if (sev === 'high' && maxSeverity !== 'critical') maxSeverity = 'high';
		else if (sev === 'moderate' && !['critical', 'high'].includes(maxSeverity)) maxSeverity = 'moderate';
		else if (sev === 'low' && !['critical', 'high', 'moderate'].includes(maxSeverity)) maxSeverity = 'low';
		else if (sev === 'info' && maxSeverity === 'none') maxSeverity = 'info';
	}
	return {maxSeverity, libraries};
}

export { createSummaryTable, getMaxSeverity };