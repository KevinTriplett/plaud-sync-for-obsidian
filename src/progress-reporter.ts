/**
 * Progress reporter interface for long-running operations.
 * Provides user feedback through status bar and notices.
 */
export interface ProgressReporter {
	/**
	 * Report progress with current and total counts.
	 * @param current Current progress (e.g., files processed)
	 * @param total Total items to process
	 * @param message Optional message to display
	 */
	report(current: number, total: number, message?: string): void;

	/**
	 * Complete the progress reporting.
	 * @param message Optional completion message
	 */
	complete(message?: string): void;

	/**
	 * Report an error during the operation.
	 * @param message Error message
	 */
	error(message: string): void;
}

/**
 * No-op progress reporter for operations that don't need progress feedback.
 */
export class NoOpProgressReporter implements ProgressReporter {
	report(): void {
		// No-op
	}

	complete(): void {
		// No-op
	}

	error(): void {
		// No-op
	}
}

/**
 * Console-based progress reporter for testing and debugging.
 */
export class ConsoleProgressReporter implements ProgressReporter {
	private readonly operation: string;

	constructor(operation: string) {
		this.operation = operation;
	}

	report(current: number, total: number, message?: string): void {
		const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
		const msg = message ? ` - ${message}` : '';
		console.log(`[${this.operation}] Progress: ${current}/${total} (${percentage}%)${msg}`);
	}

	complete(message?: string): void {
		const msg = message ? ` - ${message}` : '';
		console.log(`[${this.operation}] Complete${msg}`);
	}

	error(message: string): void {
		console.error(`[${this.operation}] Error: ${message}`);
	}
}

// Made with Bob
