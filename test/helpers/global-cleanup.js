import { killAllTestChromes } from './chrome-test-helper.js';

let cleanupRegistered = false;

function registerGlobalCleanup() {
    if (cleanupRegistered) return;
    cleanupRegistered = true;

    const cleanup = async (signal) => {
        console.log(`\n🧹 Global cleanup triggered by ${signal}`);
        try {
            await killAllTestChromes();
            console.log('✅ Chrome cleanup completed');
        } catch (error) {
            console.error('❌ Chrome cleanup failed:', error);
        }

        // Force exit after cleanup attempt
        setTimeout(() => {
            console.log('🔴 Force exiting after cleanup timeout');
            process.exit(1);
        }, 2000);
    };

    // Register cleanup handlers for various exit conditions
    process.on('exit', () => cleanup('exit'));
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
        cleanup('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled rejection:', reason);
        cleanup('unhandledRejection');
    });
}

// Auto-register when this module is imported
registerGlobalCleanup();

export { registerGlobalCleanup };