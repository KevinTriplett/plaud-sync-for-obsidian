export type SyncTrigger = 'manual' | 'startup';

export interface PlaudSyncRuntimeOptions {
	isStartupEnabled: () => boolean;
	runSync: (trigger: SyncTrigger) => Promise<void>;
	onLocked: (message: string) => void;
}

const LOCKED_MESSAGE = 'Plaud sync already running. Please wait for current run to finish.';

export interface PlaudSyncRuntime {
	runManualSync(): Promise<boolean>;
	runStartupSync(): Promise<boolean>;
	cancel(): Promise<void>;
	isRunning(): boolean;
}

export function createPlaudSyncRuntime(options: PlaudSyncRuntimeOptions): PlaudSyncRuntime {
	let inFlight: Promise<void> | null = null;
	let cancelled = false;

	const runWithLock = async (trigger: SyncTrigger): Promise<boolean> => {
		if (cancelled) {
			return false;
		}

		if (inFlight) {
			options.onLocked(LOCKED_MESSAGE);
			return false;
		}

		const runPromise = options.runSync(trigger);
		inFlight = runPromise;

		try {
			await runPromise;
			return true;
		} finally {
			if (inFlight === runPromise) {
				inFlight = null;
			}
		}
	};

	return {
		runManualSync: () => runWithLock('manual'),
		runStartupSync: () => {
			if (!options.isStartupEnabled()) {
				return Promise.resolve(false);
			}

			return runWithLock('startup');
		},
		cancel: async () => {
			cancelled = true;
			// Wait for any in-flight sync to complete
			if (inFlight) {
				try {
					await inFlight;
				} catch {
					// Ignore errors during cancellation
				}
			}
			inFlight = null;
		},
		isRunning: () => inFlight !== null
	};
}
