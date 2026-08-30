// ============ CONSTANTS ============

export const WORKERS_PER_SESSION = 2;   // Workers per cookie session
export const PER_TARGET = 5000;         // Max followers per user (jitna mile utna)
export const PER_PAGE = 75;             // Items per API call
export const BATCH_FLUSH = 1000;        // Disk write every N lines
export const MAX_RUNTIME_MIN = 800;     // Safety cutoff
export const MAPPINGS_FILE = 'mappings.txt';

// Legacy GraphQL hashes (fallback)
export const GQL_HASHES = {
    followers: '37479f2b8209594dde7facb0d904896a',
    following: 'd04edd2229b57d9a3754f00d82f6f342',
};
