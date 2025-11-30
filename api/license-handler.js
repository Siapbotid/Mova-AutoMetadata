const { machineIdSync } = require('node-machine-id');


async function validateEmailLicense(email, webAppUrl, machineId, action = 'login') {
  console.log('License Handler: Starting validation...');
  console.log('License Handler: webAppUrl:', webAppUrl);
  console.log('License Handler: email:', email);
  console.log('License Handler: machineId:', machineId);
  console.log('License Handler: action:', action);

  if (!email) {
    console.error('License Handler: Email is required.');
    return { status: 'error', message: 'Email is required.' };
  }

  if (!webAppUrl || webAppUrl === 'YOUR_WEB_APP_URL_HERE') {
    console.error('License Handler: Web App URL not configured.');
    return { status: 'error', message: 'License server URL is not configured.' };
  }

  try {
    // const machineId = machineIdSync({ original: true }); // Removed redundant machineId generation
    const validationUrl = `${webAppUrl}?email=${encodeURIComponent(email)}&machineId=${encodeURIComponent(machineId)}&action=${encodeURIComponent(action)}`;
    console.log('License Handler: Constructed validationUrl:', validationUrl);

    const response = await fetch(validationUrl);
    console.log('License Handler: Fetch response received. Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('License Handler: HTTP error! Status:', response.status, 'Response:', errorText);
      return { status: 'error', message: `Failed to contact license server. HTTP status: ${response.status}. Response: ${errorText}` };
    }

    const data = await response.json();
    console.log('License Handler: Response data:', data);
    return data;
  } catch (error) {
    console.error('License Handler: Error during license validation:', error);
    console.error('License Handler: Detailed error:', error);
    return { status: 'error', message: `Failed to contact license server. Please check your internet connection or license URL. Error: ${error.message}` };
  }
}

module.exports = { validateEmailLicense };