const { ipcRenderer } = require('electron');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { ExifTool, DefaultExiftoolArgs, DefaultExifToolOptions } = require('exiftool-vendored');
const { generateGeminiPrompt, makeGeminiAPICall, parseGeminiResponse } = require('./gemini');
const { generateOpenAIPrompt, makeOpenAIAPICall, parseOpenAIResponse } = require('./openai');

// Import new modules
const { ffmpegConfig, ffmpegAvailable, ffmpeg } = require('./renderer/ffmpeg-config');
const SettingsManager = require('./renderer/settings-manager');
const FileUtils = require('./renderer/file-utils');
const CSVManager = require('./renderer/csv-manager');
const { 
    MODEL_CONFIGS, 
    initializePlatformSelection, 
    updateModelOptions, 
    updateApiKeyPlaceholder 
} = require('./renderer/model-config');
const UIComponents = require('./renderer/ui-components');
const ProgressManager = require('./renderer/progress-manager');
const MetadataProcessor = require('./renderer/metadata-processor');

class AutoMetadataApp {
    constructor() {
        this.selectedFiles = [];
        this.isProcessing = false;
        this.isPaused = false;
        this.currentFolderPath = null;
        this.currentIndex = 0;
        this.totalTokens = 0;
        this.exiftool = null;
        this.openai = null;
        this.processedCount = 0;
        this.totalCount = 0;
        this.processingQueue = [];
        this.apiKeys = [];
        this.keyUsageMethod = 'rotation';
        this.currentKeyIndex = 0;
        this.maxVisibleResults = 20;
        this.autoCleanUp = true; // Default to YES

        // Initialize modules
        this.settingsManager = new SettingsManager();
        this.fileUtils = new FileUtils();
        this.uiComponents = new UIComponents();
        this.progressManager = new ProgressManager();
        
        // Initialize ExifTool first
        this.initializeExifTool();
        
        // Then initialize components that need ExifTool
        this.csvManager = new CSVManager(this.exiftool);
        this.metadataProcessor = new MetadataProcessor(this.exiftool);

        // Add event listener for stopping processing due to critical errors
        window.addEventListener('stop-processing', (event) => {
            if (this.isProcessing) {
                this.isProcessing = false;
                this.isPaused = false;
                alert(`Processing stopped: ${event.detail.reason}`);
                this.updateButtonStates();
            }
        });
        
        // Initialize splash screen first
        this.uiComponents.initializeSplashScreen();
        
        // Load settings on startup
        this.loadSettings();
        
        // Initialize settings event listeners
        this.settingsManager.initializeSettingsEventListeners();
        
        // Load API key on startup
        this.loadApiKey();
        
        // Initialize button states
        this.initializeButtonStates();
        
        // Initialize event listeners
        this.initializeEventListeners();
        
        // Handle app cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    initializeExifTool() {
        this.exiftool = new ExifTool({
            ...DefaultExifToolOptions,
            exiftoolArgs: [
                ...DefaultExiftoolArgs,
                '-overwrite_original'
            ],
            taskTimeoutMillis: 30000,
            maxProcs: 1
        });
    }
    
    // Splash screen initialization is now handled by UIComponents module
    
    // Main app toggle is now handled by UIComponents module

    initializeButtonStates() {
        // Disable pause and stop buttons on app launch
        this.uiComponents.initializeButtonStates();
    }

    updateButtonStates() {
        this.uiComponents.updateButtonStates(this.isProcessing, this.isPaused);
    }

    initializeEventListeners() {
        // Save API key button
        document.getElementById('saveKeyBtn').addEventListener('click', () => {
            if (document.getElementById('keyModeToggle').checked) {
                this.saveMultiApiKeys();
            } else {
                this.saveApiKey();
            }
        });

        // Get API key button (if exists)
        const getApiKeyBtn = document.getElementById('getApiKeyBtn');
        if (getApiKeyBtn) {
            getApiKeyBtn.addEventListener('click', () => {
                this.openApiKeyUrl();
            });
        }
        
        document.getElementById('tutorialBtn').addEventListener('click', () => this.showTutorial());
        
        // File Selection
        document.getElementById('browseBtn').addEventListener('click', () => this.selectFiles());
        
        // Generate Metadata
        document.getElementById('generateBtn').addEventListener('click', () => this.generateMetadata());
        
        // Control Buttons
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseProcessing());
        document.getElementById('stopBtn').addEventListener('click', async () => await this.stopProcessing());
        
        // Key Mode Toggle
        const keyModeToggle = document.getElementById('keyModeToggle');
        if (keyModeToggle) {
            keyModeToggle.addEventListener('change', (e) => {
                this.toggleKeyMode(e.target.checked);
            });
        }
        
        // API Key URL buttons (with null checks)
        const getApiKeyBtn2 = document.getElementById('getApiKeyBtn');
        if (getApiKeyBtn2) {
            getApiKeyBtn2.addEventListener('click', () => this.openApiKeyUrl());
        }
        
        const billingBtn = document.getElementById('billingBtn');
        if (billingBtn) {
            billingBtn.addEventListener('click', () => this.openBillingUrl());
        }
        
        // API Key Input
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) {
            apiKeyInput.addEventListener('input', function() {
                if (this.value && this.value.trim()) {
                    // Use arrow function to maintain proper 'this' context for the class
                    const app = this;
                    setTimeout(() => {
                        app.initializeAPI(apiKeyInput.value.trim());
                    }, 0);
                }
            }.bind(this));
        }
        
        // Auto Clean Up toggle event listener
        const autoCleanUpSelect = document.getElementById('autoCleanUp');
        if (autoCleanUpSelect) {
            autoCleanUpSelect.addEventListener('change', () => {
                this.autoCleanUp = autoCleanUpSelect.value === 'yes';
                localStorage.setItem('autoCleanUp', autoCleanUpSelect.value);
            });
        }
        
        // License buttons
        const checkLicenseBtn = document.getElementById('checkLicenseBtn');
        if (checkLicenseBtn) {
            checkLicenseBtn.addEventListener('click', () => this.checkLicenseInfo());
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
        
        // Save settings when other inputs change
        const settingsInputs = [
            'keywordsCount', 'titleLength', 'titleFileRename', 
            'useFilenameAnalysis', 'maxConcurrent'
        ];
        
        settingsInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('change', () => {
                    this.saveSettings();
                });
            }
        });
        
        // Add real-time validation for title length
        const titleLengthInput = document.getElementById('titleLength');
        if (titleLengthInput) {
            titleLengthInput.addEventListener('input', () => {
                this.validateTitleLength();
            });
            titleLengthInput.addEventListener('blur', () => {
                this.validateTitleLength();
            });
        }
    }

    getLicenseMessageInEnglish(result, action) {
        if (!result) return '';

        const code = (result.code || '').toString().toUpperCase();
        const status = (result.status || '').toString().toLowerCase();
        const normalizedAction = (action || 'login').toString().toLowerCase();

        if (code === 'OK_SAME_DEVICE' || code === 'OK_FIRST_DEVICE' || code === 'OK_NO_DEVICE_ID') {
            return 'License validated successfully. Welcome back!';
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
            return 'License validated successfully.';
        }

        if (!code && status === 'error') {
            return 'Failed to validate license. Please try again or contact support.';
        }

        return '';
    }

    async checkLicenseInfo() {
        try {
            const storedEmail = (window.localStorage && window.localStorage.getItem('licenseEmail')) || '';
            if (!storedEmail) {
                alert('No license email stored. Please log in again to save your license email.');
                return;
            }

            const webAppUrl = 'https://script.google.com/macros/s/AKfycbxvjeySEyur3D3_HPM_LXwrjn-zURMraaIHGIU7YnsSYJuajip3yV0pZ26m-HJ9S_PIqw/exec';
            const result = await ipcRenderer.invoke('validate-license', storedEmail, webAppUrl, 'info');
            console.log('License info result:', result);

            if (result && (result.ok === true || result.code === 'INFO_OK')) {
                const lic = result.license || {};
                const lines = [
                    `Email: ${lic.email || storedEmail}`,
                    `Join Date: ${lic.tanggalJoin || '-'}`,
                    `License Expired: ${lic.tanggalBerakhir || '-'}`,
                    `Machine ID 1: ${lic.mesinId1 || '-'}`,
                    `Machine ID 2: ${lic.mesinId2 || '-'}`,
                    `Machine ID 3: ${lic.mesinId3 || '-'}`,
                    `Ultra: ${lic.ultra || '-'}`,
                    `Pass: ${lic.pass || '-'}`,
                    `Ultra Expired: ${lic.expiredDate || '-'}`,
                    `Ultra Delivery Status: ${lic.statusDeliveryUltra || '-'}`
                ];
                alert(lines.join('\n'));
            } else {
                const msg = this.getLicenseMessageInEnglish(result, 'info')
                    || 'Failed to fetch license info. Please try again or contact support.';
                alert(msg);
            }
        } catch (error) {
            alert('An error occurred while fetching license info: ' + error.message);
        }
    }

    logout() {
        try {
            if (window.localStorage) {
                window.localStorage.removeItem('licenseEmail');
            }
        } catch (e) {
            console.warn('Failed to clear license email:', e);
        }
        ipcRenderer.send('navigate-to-login');
    }

    validateTitleLength() {
        const titleLengthInput = document.getElementById('titleLength');
        const titleLength = parseInt(titleLengthInput.value);
        
        // Validate title length requirements
        if (isNaN(titleLength) || titleLength < 70) {
            return false;
        }
        
        if (titleLength > 200) {
            return false;
        }
        
        return true;
    }

    toggleKeyMode(isMultiMode) {
        this.uiComponents.toggleKeyMode(isMultiMode);
        
        if (isMultiMode) {
            // Load multiple keys if available
            this.loadMultiApiKeys();
        } else {
            // Load single key if available
            this.loadApiKey();
        }
    }

    async loadApiKey() {
        try {
            const platform = this.settingsManager.getPlatformSelection();
            console.log('Loading API key for platform:', platform);
            const result = await ipcRenderer.invoke('get-api-key', platform);
            console.log('Get API key result:', result);
            
            if (result.success) {
                const fullApiKey = result.apiKey || ''; // Handle empty string case
                console.log('Full API key type:', typeof fullApiKey, 'value:', fullApiKey);
                
                // Clear any previous platform's key data
                this.uiComponents.setApiKeyInput(fullApiKey);
                
                // Only initialize API if there's actually a key
                if (fullApiKey) {
                    this.initializeAPI(fullApiKey);
                }
            }
        } catch (error) {
            console.error('Error loading API key:', error);
        }
    }
    
    async loadMultiApiKeys() {
        try {
            // Get the current platform
            const platform = this.settingsManager.getPlatformSelection() || 'openai';
            
            const result = await ipcRenderer.invoke('get-multi-api-keys', platform);
            if (result.success && result.apiKeys) {
                const { keys, method } = result.apiKeys;
                
                // Set the keys in the textarea (one per line)
                this.uiComponents.setMultiApiKeyInput(keys.join('\n'));
                
                // Set the usage method
                this.uiComponents.setKeyUsageMethod(method);
                
                // Store the keys and method in the app
                this.apiKeys = keys;
                this.keyUsageMethod = method;
                this.currentKeyIndex = 0;
            }
        } catch (error) {
            console.error('Error loading multiple API keys:', error);
        }
    }

    async saveApiKey() {
        // Check if in multi-key mode
        const keyModeToggle = this.settingsManager.getKeyModeToggle();
        if (keyModeToggle) {
            this.saveMultiApiKeys();
            return;
        }
        
        const apiKey = this.settingsManager.getApiKeyValue();
        const platform = this.settingsManager.getPlatformSelection();
        
        try {
            console.log('Saving API key for platform:', platform, '- type:', typeof apiKey, 'value:', apiKey);
            
            if (apiKey) {
                const result = await ipcRenderer.invoke('save-api-key', apiKey, platform);
                console.log('Save API key result:', result);
                
                if (result.success) {
                    // Update the dataset to match the saved key
                    this.uiComponents.setApiKeyDataset(apiKey);
                    
                    // Initialize API with the saved key
                    this.initializeAPI(apiKey);
                } else {
                    alert('Error saving API key: ' + result.error);
                }
            }
        } catch (error) {
            console.error('Error saving API key:', error);
            alert('Error saving API key: ' + error.message);
        }
    }
    
    async clearApiKey() {
        try {
            const platform = this.settingsManager.getPlatformSelection();
            const result = await ipcRenderer.invoke('clear-api-key', platform);
            if (result.success) {
                this.uiComponents.clearApiKeyInput();
                console.log('API key cleared successfully');
            }
        } catch (error) {
            console.error('Error clearing API key:', error);
        }
    }
    
    async saveMultiApiKeys() {
        const multiApiKeyValue = this.uiComponents.getMultiApiKeyInput();
        const keyUsageMethod = this.uiComponents.getKeyUsageMethod();
        
        // Get the keys (one per line) and filter out empty lines
        const keys = multiApiKeyValue.split('\n')
            .map(key => key.trim())
            .filter(key => key.length > 0);
        
        if (keys.length === 0) {
            alert('Please enter at least one API key');
            return;
        }
        
        // Get the current platform
        const platform = this.settingsManager.getPlatformSelection() || 'openai';
        
        try {
            const result = await ipcRenderer.invoke('save-multi-api-keys', {
                keys,
                method: keyUsageMethod
            }, platform);
            
            if (result.success) {
                alert(`${keys.length} API keys saved successfully!`);
                
                // Store the keys and method in the app
                this.apiKeys = keys;
                this.keyUsageMethod = keyUsageMethod;
                this.currentKeyIndex = 0;
                
                // Initialize API with the first key
                if (keys.length > 0) {
                    this.initializeAPI(keys[0]);
                }
            } else {
                alert('Error saving API keys: ' + result.error);
            }
        } catch (error) {
            alert('Error saving API keys: ' + error.message);
        }
    }
    
    // Get the next API key based on the usage method
    getApiKey() {
        // If in single key mode or no keys available, use the single key
        const keyModeToggle = this.settingsManager.getKeyModeToggle();
        if (!keyModeToggle || this.apiKeys.length === 0) {
            return this.uiComponents.getApiKeyValue();
        }
        
        // For rotation method, return the next key in sequence
        if (this.keyUsageMethod === 'rotation') {
            const key = this.apiKeys[this.currentKeyIndex];
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
            return key;
        }
        
        // For simultaneous method, return a key based on the image index
        // This will be used in the generateMetadata method
        return null;
    }

    async initializeAPI(apiKey) {
        try {
            // Get the current platform
            const platform = this.settingsManager.getPlatformSelection() || 'openai';
            
            if (platform === 'openai') {
                // Dynamic import for OpenAI
                const OpenAI = require('openai');
                this.openai = new OpenAI({
                    apiKey: apiKey,
                    dangerouslyAllowBrowser: true
                });
            }
            // For Gemini, we don't need to initialize a client library
            // as we're using fetch API directly in makeAPICall
        } catch (error) {
            console.error('Error initializing API client:', error);
        }
    }

    openApiKeyUrl() {
        this.uiComponents.openApiKeyUrl();
    }

    openBillingUrl() {
        this.uiComponents.openBillingUrl();
    }

    showTutorial() {
        this.uiComponents.showTutorial();
    }

    async selectFiles() {
        console.log('Browse button clicked'); // Add this line
        try {
            // Direct folder selection only
            const result = await ipcRenderer.invoke('select-folder');
            console.log('Dialog result:', result); // Add this line
            
            if (result.success && result.filePaths.length > 0) {
                this.selectedFiles = result.filePaths;
                // Store the folder path for rescanning
                this.currentFolderPath = result.filePaths.length > 0 ? 
                    require('path').dirname(result.filePaths[0]) : null;
                
                this.uiComponents.updateFilePathInput(`${result.filePaths.length} media found in folder`);
                
                this.updateProgress(0, result.filePaths.length);
            } else {
                alert('No media found in the selected folder');
            }
        } catch (error) {
            console.error('selectFiles error:', error); // Add this line
            alert('Error selecting folder: ' + error.message);
        }
    }

    // Add new method to rescan and update only the media counter
    async updateMediaCounter() {
        if (!this.currentFolderPath) {
            return;
        }

        try {
            const fs = require('fs').promises; // Use async fs operations
            const path = require('path');
            const files = [];
            
            // Check if folder still exists
            try {
                await fs.access(this.currentFolderPath);
            } catch {
                console.log('Current folder no longer exists');
                return;
            }
            
            // Scan the folder for media files asynchronously
            const items = await fs.readdir(this.currentFolderPath);
            
            // Process files in chunks to avoid blocking
            for (let i = 0; i < items.length; i += 10) {
                const chunk = items.slice(i, i + 10);
                
                for (const item of chunk) {
                    try {
                        const fullPath = path.join(this.currentFolderPath, item);
                        const stat = await fs.stat(fullPath);
                        
                        // Only process files, skip directories entirely
                        const isSupported = this.fileUtils.getAllSupportedExtensions()
                            .includes(path.extname(item).toLowerCase());
                        if (stat.isFile() && isSupported) {
                            files.push(fullPath);
                        }
                    } catch (error) {
                        // Skip files that can't be accessed
                        continue;
                    }
                }
                
                // Yield control back to the event loop every 10 files
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            // Update only the file input display with current count
            this.uiComponents.updateFilePathInput(`${files.length} media found in folder`);
            
            // Update the selectedFiles array for accuracy
            this.selectedFiles = files;
            
            console.log(`Updated media counter: ${files.length} media files`);
            
        } catch (error) {
            console.error('Error updating media counter:', error);
        }
    }

    async generateMetadata() {
        try {
            // Validate title length before processing
            if (!this.validateTitleLength()) {
                alert('Please fix the title length validation errors before proceeding.');
                return;
            }
            
            const titleLength = parseInt(document.getElementById('titleLength').value);
            
            // Additional validation for title length requirements
            if (titleLength < 70) {
                alert('Title length must be at least 70 characters for AI processing.');
                return;
            }
            
            if (titleLength > 200) {
                alert('Title length cannot exceed 200 characters.');
                return;
            }
            
            // Check if we have a valid API key based on the selected platform
            const platform = this.settingsManager.getPlatformSelection();
            const isMultiMode = this.settingsManager.getKeyModeToggle();
        
        // For OpenAI, check if this.openai is initialized
        // For Gemini, check if we have a key available
        let hasValidKey = false;
        
        if (platform === 'openai') {
            hasValidKey = !!this.openai;
        } else if (platform === 'gemini') {
            // For Gemini, check if we have a key in single or multi mode
            if (isMultiMode) {
                hasValidKey = this.apiKeys && this.apiKeys.length > 0;
            } else {
                hasValidKey = !!this.settingsManager.getApiKeyValue();
            }
        }
        
        if (!hasValidKey) {
            alert('Please enter and save your API key first');
            return;
        }

        if (this.selectedFiles.length === 0) {
            alert('Please select images first');
            return;
        }

        if (this.isProcessing) {
            alert('Processing is already in progress');
            return;
        }

        this.isProcessing = true;
        this.isPaused = false;
        this.processedCount = 0;
        
        // Reset progress stats
        this.resetProgressStats();
        
        // Filter out files that no longer exist
        const fs = require('fs');
        const existingFiles = this.selectedFiles.filter(filePath => {
            const exists = fs.existsSync(filePath);
            if (!exists) {
                console.log(`Skipping non-existent file: ${filePath}`);
            }
            return exists;
        });
        
        this.totalCount = existingFiles.length;
        
        if (this.totalCount === 0) {
            alert('No valid files to process. Files may have been moved or deleted.');
            this.isProcessing = false;
            return;
        }
        
        // Remove existing CSV files before starting
        await this.csvManager.removeExistingCSVFiles(existingFiles);
        
        // Update button states during processing
        this.uiComponents.updateButtonStates(true, false);
        
        // Clear previous results
        this.uiComponents.clearResultsContainer();
        
        // Add concurrency control
        const maxConcurrent = this.settingsManager.getSetting('maxConcurrent') || 3;
        const concurrencyLimit = parseInt(maxConcurrent);
        
        // Check if using simultaneous method with multiple keys
        if (isMultiMode && 
            this.keyUsageMethod === 'simultaneous' && 
            this.apiKeys.length > 0) {
            
            // Distribute files among available API keys
            const filesPerKey = Math.ceil(existingFiles.length / this.apiKeys.length);
            const allPromises = [];
            
            for (let i = 0; i < this.apiKeys.length; i++) {
                const startIndex = i * filesPerKey;
                const endIndex = Math.min(startIndex + filesPerKey, existingFiles.length);
                const filesForThisKey = existingFiles.slice(startIndex, endIndex);
                
                if (filesForThisKey.length > 0) {
                    // Process this batch with the current key
                    const apiKey = this.apiKeys[i];
                    // Initialize API with this key
                    this.initializeAPI(apiKey);
                    
                    // Process files with this key (using the same concurrency approach)
                    const keyPromise = this.processFilesWithKey(filesForThisKey, concurrencyLimit);
                    allPromises.push(keyPromise);
                }
            }
            
            // Wait for all batches to complete
            await Promise.all(allPromises);
            
        } else {
            // Process images with concurrency limit (rotation method or single key)
            const queue = [...existingFiles]; // Use filtered files
            let activeCount = 0;
            const inProgress = new Set();
            
            // Process files with concurrency limit
            while (queue.length > 0 && this.isProcessing) {
                // Wait while paused
                while (this.isPaused && this.isProcessing) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // Check if stopped
                if (!this.isProcessing) break;
                
                // Fill up to concurrency limit
                while (activeCount < concurrencyLimit && queue.length > 0 && this.isProcessing) {
                    const filePath = queue.shift();
                    
                    // Process file and track promise
                    const processPromise = (async () => {
                        activeCount++;
                        try {
                            await this.processImage(filePath);
                        } catch (error) {
                            console.error('Error processing image:', error);
                        } finally {
                            activeCount--;
                            inProgress.delete(processPromise);
                        }
                    })();
                    
                    inProgress.add(processPromise);
                }
                
                // Wait a bit before checking again
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Wait for all remaining promises to complete
            if (inProgress.size > 0) {
                await Promise.all(Array.from(inProgress));
            }

        }
        
        // CSV files are now generated in real-time during processing
        // No need to generate them here anymore
        
        // Reset everything when done or stopped
        this.isProcessing = false;
        this.isPaused = false;
        this.uiComponents.updateButtonStates(false, false);
        
        // Reset progress stats
        this.progressManager.resetProgressStats();
        
        // Show completion modal immediately
        if (this.processedCount > 0) {
            this.uiComponents.showCompletionModal(this.processedCount, this.totalCount);
        }
        
        // Remove the updateMediaCounter call entirely from completion
        // It will be updated when user selects files next time
        // setTimeout(() => {
        //     this.updateMediaCounter();
        // }, 100);
        } catch (error) {
            console.error('Error in generateMetadata:', error);
            alert('An error occurred during processing: ' + error.message);
            
            // Reset processing state on error
            this.isProcessing = false;
            this.isPaused = false;
            this.uiComponents.updateButtonStates(false, false);
            this.progressManager.resetProgressStats();
        }
    }
    
    async processFilesWithKey(files, concurrencyLimit) {
        const queue = [...files];
        let activeCount = 0;
        const inProgress = new Set();
        
        // Process files with concurrency limit
        while (queue.length > 0 && this.isProcessing) {
            // Wait while paused
            while (this.isPaused && this.isProcessing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Check if stopped
            if (!this.isProcessing) break;
            
            // Fill up to concurrency limit
            while (activeCount < concurrencyLimit && queue.length > 0 && this.isProcessing) {
                const filePath = queue.shift();
                
                const processPromise = (async () => {
                    activeCount++;
                    try {
                        await this.processImage(filePath);
                    } catch (error) {
                        console.error('Error processing image:', error);
                    } finally {
                        activeCount--;
                        inProgress.delete(processPromise);
                    }
                })();
                
                inProgress.add(processPromise);
            }
            
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Wait for all remaining promises to complete
        if (inProgress.size > 0) {
            await Promise.all(Array.from(inProgress));
        }
    }

    async processImage(filePath, retryCount = 0) {
        const maxRetries = 3; // Maximum number of retries per file
        const resultItem = this.createResultItem(filePath);
        this.uiComponents.appendToResultsContainer(resultItem);
        
        try {
            // Update status to processing (show retry count if > 0)
            const statusMessage = retryCount > 0 
                ? `Processing... (Retry ${retryCount}/${maxRetries})` 
                : 'Processing...';
            this.updateResultStatus(resultItem, 'processing', statusMessage);
            
            // Generate thumbnail and replace placeholder
            const thumbnail = await this.generateThumbnail(filePath);
            this.uiComponents.updateResultThumbnail(resultItem, thumbnail);
            
            // Get image analysis from OpenAI
            const analysis = await this.analyzeMedia(filePath);
            
            // Update UI with results
            this.uiComponents.updateResultContent(resultItem, analysis, filePath);
            
            // Update platform logo
            const currentPlatform = document.getElementById('platformSelect').value;
            this.uiComponents.updateResultPlatformLogo(resultItem, currentPlatform);
            
            // Debug: Log the analysis object to see if description is present
            console.log('Analysis object:', {
                title: analysis.title,
                description: analysis.description,
                keywords: analysis.keywords?.slice(0, 3) // Just first 3 keywords for brevity
            });
            
            // Write metadata to image
            await this.writeMetadata(filePath, analysis);
            
            // Check if file should be renamed based on title
            const shouldRename = this.settingsManager.getTitleFileRename() === 'yes';
            let finalFilePath = filePath;
            
            if (shouldRename) {
                finalFilePath = await this.renameFileByTitle(filePath, analysis.title);
            }
            
            // Update status to completed
            this.updateResultStatus(resultItem, 'completed', 'Completed');
            
            // Move successful file to success folder (use final path after potential rename)
            await this.moveFileToFolder(finalFilePath, 'success');
            
            // Immediately update CSV with this single file
            try {
                const sourceDir = path.dirname(finalFilePath);
                const successDir = path.join(sourceDir, 'success');
                const fileName = path.basename(finalFilePath);
                const successFilePath = path.join(successDir, fileName);
                
                // Initialize CSV if this is the first file
                const csvDir = path.join(successDir, 'CSV');
                if (!fs.existsSync(csvDir)) {
                    fs.mkdirSync(csvDir, { recursive: true });
                }
                
                const metadataPath = path.join(csvDir, 'metadata.csv');
                if (!fs.existsSync(metadataPath)) {
                    fs.writeFileSync(metadataPath, 'Filename,Title,Description,Keywords\n');
                }
                
                // Add this file to CSV immediately
                await this.appendToCSV([successFilePath], successDir, analysis);
                
            } catch (csvError) {
                console.error('Error updating CSV:', csvError);
                // Don't fail the whole process for CSV errors
            }
            
            this.processedCount++;
            this.updateProgress(this.processedCount, this.totalCount);
            
            // Add DOM cleanup to prevent memory bloat (only if auto cleanup is enabled)
            if (this.autoCleanUp) {
                const resultsContainer = document.getElementById('resultsContainer');
                const maxConcurrent = parseInt(document.getElementById('maxConcurrent')?.value || 3);
                const maxVisibleResults = maxConcurrent * 2; // concurrent * 2 (completed + processing)
                
                if (resultsContainer.children.length > maxVisibleResults) {
                    // Remove oldest results
                    const toRemove = resultsContainer.children.length - maxVisibleResults;
                    for (let i = 0; i < toRemove; i++) {
                        resultsContainer.removeChild(resultsContainer.firstChild);
                    }
                }
            }
            
        } catch (error) {
            console.error(`Error processing image (attempt ${retryCount + 1}):`, error);
            
            // Check if we should retry
            if (retryCount < maxRetries && this.shouldRetry(error)) {
                // Wait before retrying (exponential backoff)
                const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Log retry attempt
                const retryMessage = `Retrying file ${path.basename(filePath)} ` +
                    `(attempt ${retryCount + 2}/${maxRetries + 1}): ${error.message}`;
                await this.logToProcess(retryMessage);
                
                // Update status to show retry instead of removing the item
                this.updateResultStatus(resultItem, 'processing', `Retrying (${retryCount + 2}/${maxRetries + 1})...`);
                return this.processImage(filePath, retryCount + 1);
            } else {
                // Max retries reached or non-retryable error
                const errorMessage = `Failed after ${retryCount + 1} attempts: ${error.message}`;
                this.updateResultStatus(resultItem, 'error', errorMessage);
                await this.moveFileToFolder(filePath, 'failed');
                
                const logMessage = `File failed permanently: ${path.basename(filePath)} - ${error.message}`;
                await this.logToProcess(logMessage, 'ERROR');
                
                // Update status to show file was moved to failed folder
                this.updateResultStatus(resultItem, 'error', `Moved to failed folder: ${errorMessage}`);
            }
        }
    }
    
    // Helper method to determine if an error should be retried
    shouldRetry(error) {
        const retryableErrors = [
            'ENOENT',           // File not found (temporary file issues)
            'ECONNRESET',       // Network connection reset
            'ETIMEDOUT',        // Network timeout
            'rate limit',       // API rate limiting
            'service unavailable', // API service issues
            'JSON parsing',     // JSON response issues
            'temporary file',   // Temporary file issues
            'FFmpeg',          // FFmpeg processing issues
        ];
        
        return retryableErrors.some(errorType => 
            error.message.toLowerCase().includes(errorType.toLowerCase())
        );
    }

    // Add new method for file renaming
    async renameFileByTitle(filePath, title) {
        try {
            const dir = path.dirname(filePath);
            const ext = path.extname(filePath);
            
            // Clean title for filename
            const cleanTitle = title
                .toLowerCase()
                .replace(/[<>:"/\\|?*]/g, '')
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_.-]/g, '')
                .trim()
                .substring(0, 100);
            
            const newFilePath = path.join(dir, cleanTitle + ext);
            
            // Simply rename - no duplicate checking since titles should be unique
            fs.renameSync(filePath, newFilePath);
            return newFilePath;
        } catch (error) {
            console.error('Error renaming file:', error);
            return filePath;
        }
    }

    // Add this new method after the processImage function
    async moveFileToFolder(filePath, folderType) {
        try {
            const sourceDir = path.dirname(filePath);
            const fileName = path.basename(filePath);
            const targetDir = path.join(sourceDir, folderType);
            const targetPath = path.join(targetDir, fileName);
            
            // Create target directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // Move the file
            fs.renameSync(filePath, targetPath);
            console.log(`File moved to ${folderType}: ${targetPath}`);
            
            // CSV generation is now handled at the end of processing to prevent race conditions
            
        } catch (error) {
            console.error(`Error moving file to ${folderType} folder:`, error);
            // Don't throw error here to avoid breaking the main process
        }
    }

    createResultItem(filePath) {
        const item = this.uiComponents.createResultItem(filePath);
        
        // Limit visible results for performance (only if auto cleanup is enabled)
        const resultsContainer = document.getElementById('resultsContainer');
        
        if (this.autoCleanUp) {
            const maxConcurrent = parseInt(document.getElementById('maxConcurrent')?.value || 3);
            const maxVisibleResults = maxConcurrent * 2; // concurrent * 2 (completed + processing)
            const currentResults = resultsContainer.children.length;
            
            if (currentResults >= maxVisibleResults) {
                // Remove older results to maintain performance
                const oldestResult = resultsContainer.firstElementChild;
                if (oldestResult) {
                    oldestResult.remove();
                }
            }
        }
        
        return item;
    }

    updateResultStatus(resultItem, status, message) {
        this.uiComponents.updateResultStatus(resultItem, status, message);
    }

    async generateThumbnail(filePath) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
            const vectorExtensions = ['.svg', '.eps', '.ai'];
            
            if (videoExtensions.includes(ext)) {
                return await this.generateVideoThumbnail(filePath);
            } else if (vectorExtensions.includes(ext)) {
                return await this.generateVectorThumbnail(filePath);
            } else {
                // Existing image thumbnail code
                const buffer = await sharp(filePath)
                    .resize(120, 120, { fit: 'cover' })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                
                return `data:image/jpeg;base64,${buffer.toString('base64')}`;
            }
        } catch (error) {
            console.error('Error generating thumbnail:', error);
            return '';
        }
    }

    async generateVideoThumbnail(filePath) {
        try {
            // Check if FFmpeg is available
            if (!ffmpegAvailable) {
                console.warn('FFmpeg not available, generating unique placeholder for:', path.basename(filePath));
                // Generate a unique placeholder based on filename to avoid duplicates
                const filename = path.basename(filePath, path.extname(filePath));
                const hash = filename.split('').reduce((a, b) => {
                    a = ((a << 5) - a) + b.charCodeAt(0);
                    return a & a;
                }, 0);
                const hue = Math.abs(hash) % 360;
                
                return 'data:image/svg+xml;base64,' + Buffer.from(`
                    <svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
                        <rect width="120" height="80" fill="hsl(${hue}, 70%, 85%)" stroke="#e0e0e0" stroke-width="1"/>
                        <text x="60" y="50" text-anchor="middle" font-size="24">📹</text>
                    </svg>
                `).toString('base64');
            }
            
            // Create a temporary file path for the thumbnail
            const tempDir = require('os').tmpdir();
            const randomId = Math.random().toString(36).substr(2, 9);
            const tempPath = path.join(tempDir, `thumbnail-${Date.now()}-${randomId}.jpg`);
            
            return new Promise((resolve, reject) => {
                const timemarks = ['10%', '25%', '50%', '75%'];
                let currentIndex = 0;
                
                const tryGenerateThumbnail = () => {
                    if (currentIndex >= timemarks.length) {
                        console.warn(`All timemarks failed for ${path.basename(filePath)}, using placeholder`);
                        // Generate placeholder if all timemarks fail
                        const filename = path.basename(filePath, path.extname(filePath));
                        const hash = filename.split('').reduce((a, b) => {
                            a = ((a << 5) - a) + b.charCodeAt(0);
                            return a & a;
                        }, 0);
                        const hue = Math.abs(hash) % 360;
                        
                        resolve('data:image/svg+xml;base64,' + Buffer.from(`
                            <svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
                                <rect width="120" height="80" 
                                      fill="hsl(${hue}, 70%, 85%)" 
                                      stroke="#e0e0e0" 
                                      stroke-width="1"/>
                                <text x="60" y="50" text-anchor="middle" font-size="24">📹</text>
                            </svg>
                        `).toString('base64'));
                        return;
                    }
                    
                    const currentTimemark = timemarks[currentIndex];
                    
                    ffmpeg(filePath)
                        .screenshots({
                            timestamps: [currentTimemark],
                            filename: path.basename(tempPath),
                            folder: path.dirname(tempPath),
                            size: '120x120'
                        })
                        .on('end', async () => {
                            try {
                                // Check if file exists and has content
                                const stats = await fs.promises.stat(tempPath);
                                if (stats.size === 0) {
                                    throw new Error('Generated thumbnail file is empty');
                                }
                                
                                // Read the generated thumbnail
                                const buffer = await fs.promises.readFile(tempPath);
                                const base64 = buffer.toString('base64');
                                
                                // Clean up temp file
                                try {
                                    await fs.promises.unlink(tempPath);
                                } catch (cleanupError) {
                                    console.warn('Could not clean up temp file:', cleanupError.message);
                                }
                                
                                resolve(`data:image/jpeg;base64,${base64}`);
                            } catch (error) {
                                console.error(
                                    `Error reading thumbnail at ${currentTimemark} for ${path.basename(filePath)}:`, 
                                    error.message
                                );
                                currentIndex++;
                                tryGenerateThumbnail(); // Try next timemark
                            }
                        })
                        .on('error', (err) => {
                            console.error(
                                `FFmpeg error at ${currentTimemark} for ${path.basename(filePath)}:`, 
                                err.message
                            );
                            currentIndex++;
                            tryGenerateThumbnail(); // Try next timemark
                        });
                };
                
                tryGenerateThumbnail();
            });
        } catch (error) {
            console.error('Error generating video thumbnail for', path.basename(filePath), ':', error.message);
            return '';
        }
    }

    async generateVectorThumbnail(filePath) {
        try {
            // For SVG files, we can use Sharp to convert to thumbnail
            const buffer = await sharp(filePath)
                .resize(120, 120, { 
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .jpeg({ quality: 80 })
                .toBuffer();
            
            return `data:image/jpeg;base64,${buffer.toString('base64')}`;
        } catch (error) {
            console.error('Error generating vector thumbnail:', error);
            // Generate a placeholder for vector files
            const filename = path.basename(filePath, path.extname(filePath));
            const hash = filename.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);
            const hue = Math.abs(hash) % 360;
            
            return 'data:image/svg+xml;base64,' + Buffer.from(`
                <svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
                    <rect width="120" height="120" fill="hsl(${hue}, 70%, 85%)" stroke="#e0e0e0" stroke-width="1"/>
                    <text x="60" y="70" text-anchor="middle" font-size="24">🎨</text>
                </svg>
            `).toString('base64');
        }
    }

    // Video thumbnail generation is now handled by FileUtils module

    // Vector thumbnail generation is now handled by FileUtils module

    async analyzeMedia(filePath) {
      try {
        await this.logToProcess(`Starting analysis for: ${path.basename(filePath)}`);
        
        const ext = path.extname(filePath).toLowerCase();
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        const vectorExtensions = ['.svg', '.eps', '.ai'];
        let imageBuffer;
        let imageBase64;
        
        if (videoExtensions.includes(ext)) {
          // For videos, extract a frame from the middle of the video
          if (!ffmpegAvailable) {
            await this.logToProcess(
                `Skipping video file (FFmpeg not available): ${path.basename(filePath)}`
            );
            throw new Error(
                'Video processing is not supported in this version. ' +
                'Please convert your video to an image format (JPG, PNG) first.'
            );
          }
          
          try {
            // Use os.tmpdir() instead of app.getPath('temp')
            const tempDir = require('os').tmpdir();
            const tempPath = path.join(tempDir, `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`);
            
            await new Promise((resolve, reject) => {
              ffmpeg(filePath)
                .on('error', reject)
                .on('end', resolve)
                .screenshots({
                  count: 1,
                  folder: path.dirname(tempPath),
                  filename: path.basename(tempPath),
                  size: '256x256',
                  timemarks: ['50%'] // Take screenshot from middle of video
                });
            });
            
            // Retry logic for reading the file
            const maxRetries = 5;
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
              try {
                // Check if file exists and has content
                const stats = await fs.promises.stat(tempPath);
                if (stats.size > 0) {
                  // File exists and has content, try to read it
                  imageBuffer = await fs.promises.readFile(tempPath);
                  break; // Success, exit retry loop
                } else {
                  throw new Error('Generated frame file is empty');
                }
              } catch (error) {
                retryCount++;
                if (retryCount >= maxRetries) {
                  throw new Error(`Failed to read frame file after ${maxRetries} attempts: ${error.message}`);
                }
                // Wait a bit before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
              }
            }
            
            // Clean up with retry logic
            let cleanupRetries = 3;
            while (cleanupRetries > 0) {
              try {
                await fs.promises.unlink(tempPath);
                break; // Success, exit cleanup loop
              } catch (unlinkError) {
                cleanupRetries--;
                if (cleanupRetries === 0) {
                  console.warn('Warning: Could not delete temporary frame file after retries:', unlinkError.message);
                } else {
                  // Wait before retrying cleanup
                  await new Promise(resolve => setTimeout(resolve, 50));
                }
              }
            }
          } catch (error) {
            await this.logToProcess(`Video processing failed: ${error.message}`);
            throw new Error(`Cannot process video file: ${error.message}`);
          }
        } else if (vectorExtensions.includes(ext)) {
          // For vector files, handle differently based on platform
          if (ext === '.svg') {
            // For both platforms, convert SVG to raster image using Sharp
            try {
              const svgBuffer = fs.readFileSync(filePath);
              imageBuffer = await sharp(svgBuffer)
                .resize(512, 512) // Higher resolution for better analysis
                .png() // Convert to PNG for better quality
                .toBuffer();
              await this.logToProcess(`Converted SVG to PNG for analysis: ${path.basename(filePath)}`);
            } catch (error) {
              await this.logToProcess(`Failed to convert SVG: ${error.message}`);
              throw new Error(`Cannot process SVG file: ${error.message}`);
            }
          } else {
            // For EPS and AI files, we'll analyze without image data
            imageBase64 = null;
          }
        } else {
          // Existing image resizing code
          imageBuffer = await sharp(filePath)
            .resize(256, 256)
            .jpeg({ quality: 50 })
            .toBuffer();
        }
        
        // Set base64Image based on processing type
        if (!imageBase64) {
          const base64Image = imageBuffer ? imageBuffer.toString('base64') : null;
          imageBase64 = base64Image;
        }
        const base64Image = imageBase64;
        
        // If no image data available (e.g., FFmpeg not available for video), use filename-based analysis
        if (!base64Image && videoExtensions.includes(ext)) {
          console.log('No video frame available, using filename-based analysis for:', path.basename(filePath));
          const logMessage = `Using filename-based analysis for video (FFmpeg unavailable): ${path.basename(filePath)}`;
          await this.logToProcess(logMessage);
        }
        const keywordsCount = this.settingsManager.getKeywordsCount();
        const titleLength = this.settingsManager.getTitleLength();
        const useFilename = this.settingsManager.getUseFilenameAnalysis() === 'yes';
        
        // Get selected platform and model
        const platform = this.settingsManager.getPlatformSelection();
        const model = this.settingsManager.getModelSelection();
        
        // Get API key using the key management system
        const apiKey = this.getApiKey();
        
        if (!apiKey) {
            throw new Error('Please enter your API key first');
        }
        
        const filename = path.basename(filePath, path.extname(filePath));
        
        // Get editorial settings to calculate available description space
        const editorialMode = this.settingsManager.getEditorialMode();
        let maxDescriptionLength = 200; // Default max length
        
        if (editorialMode) {
            const place = this.settingsManager.getEditorialPlace();
            const date = this.settingsManager.getEditorialDate();
            
            if (place && date) {
                // Format the date to calculate exact prefix length
                const dateObj = new Date(date);
                const formattedDate = dateObj.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
                
                // Calculate editorial prefix length: "Location - Date: "
                const editorialPrefix = `${place} - ${formattedDate}: `;
                maxDescriptionLength = 200 - editorialPrefix.length;
                
                // Ensure minimum description length
                if (maxDescriptionLength < 50) {
                    maxDescriptionLength = 50; // Minimum viable description
                }
            }
        }
        
        // Get commercial settings
        const commercialMode = this.settingsManager.getCommercialMode();
        const commercialSettings = commercialMode ? {
            mainSubject: this.settingsManager.getMainSubject(),
            mainSubjectCategory: this.settingsManager.getMainSubjectCategory(),
            additionalSubject: this.settingsManager.getAdditionalSubject(),
            additionalSubjectCategory: this.settingsManager.getAdditionalSubjectCategory()
        } : null;
        
        // Generate platform-specific prompt with editorial-aware description limit and commercial settings
        let prompt;
        if (platform === 'gemini') {
            prompt = generateGeminiPrompt(filename, useFilename, keywordsCount, titleLength, maxDescriptionLength, commercialSettings);
        } else {
            prompt = generateOpenAIPrompt(filename, useFilename, keywordsCount, titleLength, maxDescriptionLength, commercialSettings);
        }
        

        
        // Use the platform-specific API system
        let apiResponse;
        if (base64Image) {
            if (platform === 'gemini') {
                apiResponse = await makeGeminiAPICall(model, apiKey, prompt, base64Image);
            } else {
                apiResponse = await makeOpenAIAPICall(model, apiKey, prompt, base64Image);
            }
        } else {
            // For text-only analysis (when no image data is available)
            // Modify the prompt to indicate we're doing filename-based analysis
            let textOnlyPrompt = prompt.replace('Analyze this image', 'Analyze this media file based on its filename');
            textOnlyPrompt = textOnlyPrompt.replace('image with filename', 'media file with filename');
            textOnlyPrompt = textOnlyPrompt.replace('in the image', 'based on the filename and file type');
            
            if (platform === 'gemini') {
                apiResponse = await makeGeminiAPICall(model, apiKey, textOnlyPrompt, null);
            } else {
                apiResponse = await makeOpenAIAPICall(model, apiKey, textOnlyPrompt, null);
            }
        }
        
        // Extract the response data and the actual model used
        const response = apiResponse.data;
        const usedModel = apiResponse.usedModel || model;
        
        // Parse the response to get the text content using platform-specific parser
        let responseText;
        if (platform === 'gemini') {
            responseText = parseGeminiResponse(response);
        } else {
            responseText = parseOpenAIResponse(response);
        }
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            
            // Enforce keyword count limit and ensure single words only
            let keywords = analysis.keywords || [];
            
            // Filter to keep only single words
            keywords = keywords.map(keyword => {
                // If keyword contains spaces, take only the first word
                if (keyword.includes(' ')) {
                    return keyword.split(' ')[0];
                }
                return keyword;
            });
            
            // Remove duplicates that might have been created by splitting
            keywords = [...new Set(keywords)];
            
            // Trim to the requested count
            if (keywords.length > keywordsCount) {
                keywords = keywords.slice(0, keywordsCount);
                console.log(`Trimmed keywords from ${analysis.keywords.length} to ${keywordsCount}`);
            }
            
            const title = analysis.title || '';
            let description = analysis.description || '';
            
            // Apply editorial formatting if enabled (only to description, not title)
            const editorialMode = this.settingsManager.getEditorialMode();
            if (editorialMode) {
                const place = this.settingsManager.getEditorialPlace();
                const date = this.settingsManager.getEditorialDate();
                
                if (place && date) {
                    // Format the date
                    const dateObj = new Date(date);
                    const formattedDate = dateObj.toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    });
                    
                    // Create editorial prefix: "Location - Date: "
                    const editorialPrefix = `${place} - ${formattedDate}: `;
                    
                    // Calculate remaining space for description (200 char limit total)
                    const maxDescriptionLength = 200 - editorialPrefix.length;
                    
                    // Truncate AI description if needed to fit within limit
                    if (description.length > maxDescriptionLength) {
                        description = description.substring(0, maxDescriptionLength - 3) + '...';
                    }
                    
                    // Apply editorial format: "Location - Date: Description"
                    description = editorialPrefix + description;
                }
            }
            
            return {
                keywords: keywords,
                title: title,
                description: description,
                // Store the model and API key info for display
                model: usedModel, // Show the actual model used
                platform: platform,
                apiKey: apiKey // Show the full API key without masking
            };
        } else {
            throw new Error('Invalid response format from AI');
        }
        
    } catch (error) {
        console.error('Error analyzing image:', error);
        throw error;
    }
}

    async writeMetadata(filePath, analysis) {
        return await this.metadataProcessor.writeMetadata(filePath, analysis);
    }

    // Backup file cleanup is now handled by MetadataProcessor module

    async removeExistingCSVFiles() {
        return await this.csvManager.removeExistingCSVFiles(this.selectedFiles);
    }
    
    // CSV file generation is now handled by CSVManager module
    async generateCSVFiles(successDir) {
        return await this.csvManager.generateCSVFiles(successDir);
    }
    async appendToCSV(processedFiles, successDir, analysisData = null) {
        return await this.csvManager.appendToCSV(processedFiles, successDir, analysisData);
    }
    
    // CSV field escaping is now handled by CSVManager module

    updateProgress(current, total, status = 'Processing') {
        this.progressManager.updateProgress(current, total, status);
    }

    updateProgressStats(current, total) {
        this.progressManager.updateProgressStats(current, total);
    }

    resetProgressStats() {
        this.progressManager.resetProgressStats();
    }



    pauseProcessing() {
        this.isPaused = !this.isPaused;
        this.uiComponents.updatePauseButton(this.isPaused);
    }

    async stopProcessing() {
        this.isProcessing = false;
        this.isPaused = false;
        
        // Generate CSV files if any files were processed
        if (this.processedCount > 0) {
            try {
                const firstFile = this.selectedFiles[0];
                if (firstFile) {
                    const sourceDir = path.dirname(firstFile);
                    const successDir = path.join(sourceDir, 'success');
                    if (fs.existsSync(successDir)) {
                        await this.csvManager.generateCSVFiles(successDir);
                    }
                }
            } catch (error) {
                console.error('Error generating CSV files on stop:', error);
            }
        }
        
        // Reset UI states
        this.uiComponents.updateButtonStates(false, false);
        this.progressManager.resetProgressStats();
        
        // Update media counter in background (non-blocking)
        setTimeout(() => {
            this.updateMediaCounter();
        }, 100);
    }

    showCompletionModal(processed, total) {
        this.uiComponents.showCompletionModal(processed, total);
    }

    async logToProcess(message, level = 'INFO') {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = `${timestamp} [${level}] ${message}\n`;
            
            const logPath = path.join(process.cwd(), 'process.log');
            await fs.promises.appendFile(logPath, logEntry);
        } catch (error) {
            console.error('Error writing to process.log:', error);
        }
    }
    
    loadSettings() {
        try {
            // Load Auto Clean Up setting
            const autoCleanUp = localStorage.getItem('autoCleanUp');
            if (autoCleanUp !== null) {
                this.autoCleanUp = autoCleanUp === 'yes';
                const autoCleanUpSelect = document.getElementById('autoCleanUp');
                if (autoCleanUpSelect) autoCleanUpSelect.value = autoCleanUp;
            }
            
            // Load other settings via settings manager
            this.settingsManager.loadSettings();
            
            // Validate title length after settings are loaded
            setTimeout(() => {
                this.validateTitleLength();
            }, 100);
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    saveSettings() {
        // Settings are automatically saved via SettingsManager.setSetting() 
        // when individual inputs change, so this method can be empty
        console.log('Settings saved automatically via individual setSetting calls');
    }
    
    cleanup() {
        // Clean up ExifTool when app is closing
        if (this.exiftool) {
            this.exiftool.end().catch(console.error);
        }
    }
}

// Initialize platform selection and other utilities
const packageJson = require('./package.json');

// Set dynamic title
const appTitle = `AutoMeta v${packageJson.version} - Ultimate AI-Powered Metadata Generator`;
document.title = appTitle;

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new AutoMetadataApp();
    window.app = app;
    
    // Initialize platform selection
    initializePlatformSelection();
    
    // Platform selection change handler
    document.getElementById('platformSelect').addEventListener('change', (e) => {
        const platform = e.target.value;
        updateModelOptions(platform);
        updateApiKeyPlaceholder(platform);
        
        // Load the platform-specific API key when changing platforms
        app.loadApiKey();
    });
});

