import {Notice} from 'obsidian';
import type {ProgressReporter} from './progress-reporter';

/**
 * Obsidian-specific progress reporter that uses Notice and status bar.
 */
export class ObsidianProgressReporter implements ProgressReporter {
	private readonly operation: string;
	private statusBarItem: HTMLElement | null;
	private currentNotice: Notice | null = null;
	private lastNoticeTime = 0;
	private readonly noticeThrottleMs = 2000; // Update notice every 2 seconds

	constructor(operation: string, statusBarItem: HTMLElement | null) {
		this.operation = operation;
		this.statusBarItem = statusBarItem;
	}

	report(current: number, total: number, message?: string): void {
		const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
		const statusText = message 
			? `${this.operation}: ${message}` 
			: `${this.operation}: ${current}/${total} (${percentage}%)`;

		// Update status bar
		if (this.statusBarItem) {
			this.statusBarItem.setText(statusText);
		}

		// Throttle notice updates to avoid spam
		const now = Date.now();
		if (now - this.lastNoticeTime >= this.noticeThrottleMs) {
			this.lastNoticeTime = now;
			
			// Hide previous notice if it exists
			if (this.currentNotice) {
				this.currentNotice.hide();
			}
			
			// Show new notice with progress
			this.currentNotice = new Notice(statusText, 0); // 0 = don't auto-hide
		}

		// Log to console for debugging
		console.log(`[${this.operation}] ${current}/${total} (${percentage}%)${message ? ` - ${message}` : ''}`);
	}

	complete(message?: string): void {
		const statusText = message || `${this.operation} complete`;

		// Clear status bar
		if (this.statusBarItem) {
			this.statusBarItem.setText('');
		}

		// Hide progress notice
		if (this.currentNotice) {
			this.currentNotice.hide();
			this.currentNotice = null;
		}

		// Show completion notice (auto-hide after 4 seconds)
		new Notice(statusText, 4000);

		console.log(`[${this.operation}] Complete${message ? ` - ${message}` : ''}`);
	}

	error(message: string): void {
		// Clear status bar
		if (this.statusBarItem) {
			this.statusBarItem.setText('');
		}

		// Hide progress notice
		if (this.currentNotice) {
			this.currentNotice.hide();
			this.currentNotice = null;
		}

		// Show error notice (auto-hide after 6 seconds)
		new Notice(`${this.operation} error: ${message}`, 6000);

		console.error(`[${this.operation}] Error: ${message}`);
	}
}

// Made with Bob
