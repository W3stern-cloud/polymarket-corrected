// Configuration file for frontend-backend communication
// Update these URLs when deploying to different servers

// Environment detection
const ENV = (function() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
    } else if (hostname.includes('staging') || hostname.includes('dev')) {
        return 'staging';
    } else {
        return 'production';
    }
})();

// Environment-based configuration
const CONFIG = (function() {
    const configs = {
        development: {
            BACKEND_URL: 'http://localhost:3015',
            WS_URL: 'ws://localhost:3015',
            DEBUG: true
        },
        staging: {
            BACKEND_URL: 'http://45.137.214.30:3015',
            WS_URL: 'ws://45.137.214.30:3015',
            DEBUG: true
        },
        production: {
            BACKEND_URL: 'https://wendi-piratic-jimmy.ngrok-free.dev',
            WS_URL: 'wss://wendi-piratic-jimmy.ngrok-free.dev',
            DEBUG: false
        }
    };
    
    const config = configs[ENV];
    
    // Override with custom values if needed (for development)
    if (ENV === 'staging' && !config.BACKEND_URL.includes('localhost')) {
        // Temporary override for current setup
        config.BACKEND_URL = 'http://45.137.214.30:3015';
        config.WS_URL = 'ws://45.137.214.30:3015';
    }
    
    // Environment and backend URL configured - hidden from visitor
    
    return config;
})();

// Export for use in script.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
