const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const communityLoginButton = document.getElementById('community-login-button');
    const emailInput = document.getElementById('email-input');
    const loginStatusMessage = document.getElementById('login-status-message');
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbxvjeySEyur3D3_HPM_LXwrjn-zURMraaIHGIU7YnsSYJuajip3yV0pZ26m-HJ9S_PIqw/exec';

    function getEnglishLicenseMessage(result, action) {
        if (!result) return '';

        const code = (result.code || '').toString().toUpperCase();
        const status = (result.status || '').toString().toLowerCase();
        const normalizedAction = (action || 'login').toString().toLowerCase();

        if (code === 'OK_SAME_DEVICE' || code === 'OK_FIRST_DEVICE' || code === 'OK_NO_DEVICE_ID') {
            return 'License validated successfully. Welcome back! Redirecting...';
        }

        if (code === 'EMAIL_NOT_FOUND') {
            return 'This email is not registered as a licensed user. Please contact the admin if this seems incorrect.';
        }

        if (code === 'LICENSE_EXPIRED') {
            return 'Your license has expired. Please contact the admin to renew your access.';
        }

        if (code === 'MACHINE_MISMATCH') {
            if (normalizedAction === 'info') {
                return 'This license is currently active on another device. Full license information can only be viewed from that device.';
            }
            return 'This license is already active on other devices. Please contact the admin if you need to move it.';
        }

        if (code === 'CONFIG_ERROR') {
            return 'The license server is not fully configured. Please contact the admin.';
        }

        if (code === 'BAD_REQUEST') {
            return 'The license request is not valid. Please make sure your email is correct and try again.';
        }

        if (code === 'SERVER_ERROR') {
            return 'The license server is currently having issues. Please try again later or contact the admin.';
        }

        if (!code && status === 'success') {
            return 'License validated successfully. Redirecting...';
        }

        if (!code && status === 'error') {
            return 'License validation failed. Please try again or contact support.';
        }

        return '';
    }

    if (communityLoginButton) {
        communityLoginButton.addEventListener('click', async (event) => {
            event.preventDefault();
            const email = emailInput.value;

            if (!email) {
                loginStatusMessage.textContent = 'Please enter your email.';
                return;
            }

            loginStatusMessage.textContent = 'Validating...';

            try {
                const result = await ipcRenderer.invoke('validate-license', email, webAppUrl);
                console.log('Login validation result:', result);

                const code = result && typeof result.code === 'string' ? result.code : '';
                const normalizedCode = code.toUpperCase();

                const isSuccess =
                    (result && result.ok === true) ||
                    (result && result.success === true) ||
                    (result && (result.status === 'valid' || result.status === 'success')) ||
                    (normalizedCode.startsWith('OK_') || normalizedCode === 'INFO_OK');

                if (isSuccess) {
                    try {
                        if (window && window.localStorage) {
                            window.localStorage.setItem('licenseEmail', email);
                        }
                    } catch (e) {
                        console.warn('Failed to store license email:', e);
                    }

                    const successMessage = getEnglishLicenseMessage(result, 'login')
                        || 'License validated successfully. Redirecting...';
                    loginStatusMessage.textContent = successMessage;

                    setTimeout(() => {
                        ipcRenderer.send('load-dashboard'); // Assuming 'load-dashboard' will load index.html
                    }, 1500);
                } else {
                    const friendlyMessage = getEnglishLicenseMessage(result, 'login')
                        || 'License validation failed. Please try again or contact support.';
                    loginStatusMessage.textContent = friendlyMessage;
                }
            } catch (error) {
                loginStatusMessage.textContent = 'An error occurred. Please try again.';
            }
        });
    }

    if (emailInput) {
        emailInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                communityLoginButton.click();
            }
        });
    }
});