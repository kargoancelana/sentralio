/**
 * Minimal helper script for env-validation tests.
 *
 * This script simply imports the env config module. When env validation
 * fails (missing/short AUTH_JWT_SECRET or missing/invalid AUTH_ALLOWED_ORIGINS),
 * the module calls process.exit(1), causing this process to exit non-zero.
 * When all env vars are valid, the import succeeds and the process exits 0.
 */

// Dynamically import so we get the full module initialization (including
// the fail-fast validation logic that runs at module load time).
// Path: helpers/ → __tests__/ → auth/ → modules/ → src/, then config/env
await import("../../../../config/env");
