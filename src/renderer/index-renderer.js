const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const licenseModal = document.getElementById('license-validation-modal');
    const validateLicenseButton = document.getElementById('validate-license-button');
    const licenseEmailInput = document.getElementById('license-email-input');
    const licenseStatusMessage = document.getElementById('license-status-message');
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbwmGi2weLlmJTED6w_UurRXhys2a0HUo0yjf2vDjxyzT87EIIRUC-lXJ7hmbP8s1kZ1/exec'; // Replace with your actual web app URL

    function showLicenseModal() {
        licenseModal.style.display = 'flex';
    }

    function hideLicenseModal() {
        licenseModal.style.display = 'none';
    }

    // Show the license modal when the page loads
    showLicenseModal();

    if (validateLicenseButton) {
        validateLicenseButton.addEventListener('click', async () => {
            const email = licenseEmailInput.value;
            if (!email) {
                licenseStatusMessage.textContent = 'Please enter your email.';
                return;
            }

            licenseStatusMessage.textContent = 'Validating...';

            try {
                const result = await ipcRenderer.invoke('validate-license', email, webAppUrl);
                if (result.status === 'valid' || result.status === 'success') {
                    licenseStatusMessage.textContent = 'License validated successfully!';
                    setTimeout(() => {
                        hideLicenseModal();
                        // Optionally, redirect or show main application content
                        console.log('License validated, proceeding to main app.');
                    }, 1500);
                } else {
                    licenseStatusMessage.textContent = `Validation failed: ${result.message}`;
                }
            } catch (error) {
                licenseStatusMessage.textContent = `Error: ${error.message}`;
            }
        });
    }
});