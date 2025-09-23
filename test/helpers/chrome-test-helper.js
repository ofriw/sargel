import { launch } from 'chrome-launcher';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';

let testChromeInstances = [];

/**
 * Launches a Chrome instance for testing using chrome-launcher
 * Respects HEADLESS environment variable and uses proper isolation
 */
export async function launchTestChrome(options = {}) {
    const {
        url = null,
        windowSize = '1280,1024',
        additionalFlags = []
    } = options;

    // Create unique temp directory for this Chrome instance
    const userDataDir = await mkdtemp(join(tmpdir(), 'sargel-test-chrome-'));

    // Pre-create log files to prevent ENOENT errors
    writeFileSync(join(userDataDir, 'chrome-out.log'), '', { flag: 'a' });
    writeFileSync(join(userDataDir, 'chrome-err.log'), '', { flag: 'a' });

    const chromeFlags = [
        // Explicitly add headless flag when HEADLESS env var is set
        ...(process.env.HEADLESS === 'true' ? ['--headless=new'] : []),
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--enable-automation',
        '--disable-features=ChromeWhatsNewUI',
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--window-size=${windowSize}`,
        ...additionalFlags
    ];

    // Add initial URL if provided
    if (url) {
        chromeFlags.push(url);
    }

    try {
        const chromeInstance = await launch({
            port: 0, // Dynamic port allocation - no conflicts
            chromeFlags,
            userDataDir,
            connectionPollInterval: 500,
            maxConnectionRetries: 20,
            handleSIGINT: false
        });

        // Track this instance for cleanup
        const testInstance = {
            chrome: chromeInstance,
            userDataDir,
            port: chromeInstance.port
        };
        testChromeInstances.push(testInstance);

        console.log(`Test Chrome launched on port ${chromeInstance.port} (HEADLESS=${process.env.HEADLESS})`);

        return testInstance;
    } catch (error) {
        // Clean up user data dir if Chrome failed to launch
        try {
            await rm(userDataDir, { recursive: true, force: true });
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        throw error;
    }
}

/**
 * Waits for Chrome CDP to be ready on the given port
 */
export async function waitForChromeReady(port, maxAttempts = 15) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        try {
            const response = await fetch(`http://localhost:${port}/json/version`);
            if (response.ok) {
                console.log(`Chrome CDP ready on port ${port}`);
                return true;
            }
            throw new Error('CDP not ready');
        } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) {
                throw new Error(`Chrome CDP failed to be ready after ${maxAttempts} attempts`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return false;
}

/**
 * Kills a specific test Chrome instance and cleans up its data
 */
export async function killTestChrome(testInstance) {
    if (!testInstance) return;

    try {
        // Kill the Chrome instance
        if (testInstance.chrome) {
            await testInstance.chrome.kill();
        }
    } catch (error) {
        console.warn('Error killing Chrome instance:', error.message);
    }

    try {
        // Clean up user data directory
        if (testInstance.userDataDir) {
            await rm(testInstance.userDataDir, { recursive: true, force: true });
        }
    } catch (error) {
        console.warn('Error cleaning up user data dir:', error.message);
    }

    // Remove from tracking
    const index = testChromeInstances.indexOf(testInstance);
    if (index > -1) {
        testChromeInstances.splice(index, 1);
    }
}

/**
 * Kills all test Chrome instances launched by this helper
 * Only affects Chrome instances launched through this module
 */
export async function killAllTestChromes() {
    const instances = [...testChromeInstances]; // Copy array to avoid modification during iteration

    await Promise.all(instances.map(instance => killTestChrome(instance)));

    testChromeInstances.length = 0; // Clear the array
    console.log('All test Chrome instances cleaned up');
}

/**
 * Creates a combined setup that launches Chrome and waits for it to be ready
 */
export async function setupTestChrome(options = {}) {
    const testInstance = await launchTestChrome(options);
    await waitForChromeReady(testInstance.port);
    return testInstance;
}