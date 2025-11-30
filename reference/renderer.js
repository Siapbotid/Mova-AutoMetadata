const { ipcRenderer } = require('electron');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { ExifTool, DefaultExiftoolArgs, DefaultExifToolOptions } = require('exiftool-vendored');

// Fix FFmpeg path for both development and production
let ffmpegPath;
let ffprobePath;
let ffmpegAvailable = false;

try {
    // Check if we're in development or production
    const isDev = process.env.NODE_ENV === 'development' || !process.resourcesPath;
    
    console.log('=== FFmpeg Detection Debug ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('process.resourcesPath:', process.resourcesPath);
    console.log('isDev:', isDev);
    console.log('process.execPath:', process.execPath);
    
    // Try development mode first (ffmpeg-static/ffprobe-static)
    let foundInDev = false;
    try {
        ffmpegPath = require('ffmpeg-static');
        ffprobePath = require('ffprobe-static').path;
        console.log('Development ffmpegPath:', ffmpegPath);
        console.log('Development ffprobePath:', ffprobePath);
        
        // Verify files exist
        if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
            ffmpegAvailable = true;
            foundInDev = true;
            console.log('Development mode: FFmpeg and ffprobe found successfully');
        }
    } catch (devError) {
        console.warn('Development mode: Failed to load ffmpeg-static or ffprobe-static:', devError.message);
    }
    
    // If development mode failed, try production mode (bundled executables)
    if (!foundInDev) {
        console.log('Trying production mode: Looking for bundled FFmpeg and ffprobe...');
        
        // Reset paths
        ffmpegPath = null;
        ffprobePath = null;
        
        // Try to find bundled FFmpeg and ffprobe
        const possibleFFmpegPaths = [
            path.join(process.resourcesPath, 'ffmpeg.exe'),
            path.join(path.dirname(process.execPath), 'resources', 'ffmpeg.exe'),
            path.join(process.resourcesPath, '..', 'ffmpeg.exe'),
            path.join(path.dirname(process.execPath), 'ffmpeg.exe')
        ];
        
        const possibleFFprobePaths = [
            path.join(process.resourcesPath, 'ffprobe.exe'),
            path.join(path.dirname(process.execPath), 'resources', 'ffprobe.exe'),
            path.join(process.resourcesPath, '..', 'ffprobe.exe'),
            path.join(path.dirname(process.execPath), 'ffprobe.exe')
        ];
        
        console.log('Checking FFmpeg paths:', possibleFFmpegPaths);
        console.log('Checking ffprobe paths:', possibleFFprobePaths);
        
        // Find FFmpeg
        for (const testPath of possibleFFmpegPaths) {
            console.log('Testing FFmpeg path:', testPath, 'exists:', fs.existsSync(testPath));
            if (fs.existsSync(testPath)) {
                ffmpegPath = testPath;
                console.log('Found bundled FFmpeg at:', testPath);
                break;
            }
        }
        
        // Find ffprobe
        for (const testPath of possibleFFprobePaths) {
            console.log('Testing ffprobe path:', testPath, 'exists:', fs.existsSync(testPath));
            if (fs.existsSync(testPath)) {
                ffprobePath = testPath;
                console.log('Found bundled ffprobe at:', testPath);
                break;
            }
        }
        
        // Both are required
        if (ffmpegPath && ffprobePath) {
            ffmpegAvailable = true;
            console.log('Production mode: Both FFmpeg and ffprobe found successfully');
        } else {
            console.warn('Production mode: FFmpeg or ffprobe not found in packaged app. Video processing will be disabled.');
            console.warn('FFmpeg found:', !!ffmpegPath, 'at:', ffmpegPath);
            console.warn('ffprobe found:', !!ffprobePath, 'at:', ffprobePath);
        }
    }
} catch (error) {
    console.warn('FFmpeg setup failed:', error.message);
    console.error('FFmpeg setup error details:', error);
    ffmpegAvailable = false;
}

console.log('=== Final FFmpeg Status ===');
console.log('ffmpegAvailable:', ffmpegAvailable);
console.log('ffmpegPath:', ffmpegPath);
console.log('ffprobePath:', ffprobePath);

// Only set up fluent-ffmpeg if both FFmpeg and ffprobe are available
let ffmpeg;
if (ffmpegAvailable) {
    try {
        ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpeg.setFfprobePath(ffprobePath);
        console.log('FFmpeg configured successfully with path:', ffmpegPath);
        console.log('ffprobe configured successfully with path:', ffprobePath);
    } catch (error) {
        console.warn('Failed to configure fluent-ffmpeg:', error.message);
        ffmpegAvailable = false;
    }
}

class AutoMetadataApp {
    constructor() {
        this.selectedFiles = [];
        this.isProcessing = false;
        this.isPaused = false;
        this.currentFolderPath = null;
        this.progressStartTime = null;
        this.lastProgressUpdate = null;
        this.lastProcessedCount = 0;
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

        
        // Add event listener for stopping processing due to critical errors
        window.addEventListener('stop-processing', (event) => {
            if (this.isProcessing) {
                this.isProcessing = false;
                this.isPaused = false;
                alert(`Processing stopped: ${event.detail.reason}`);
                this.updateButtonStates();
            }
        });
        
        // Initialize ExifTool
        this.initializeExifTool();
        
        // Initialize splash screen first
        this.initializeSplashScreen();
        
        // Load settings on startup
        this.loadSettings();
        
        // Load API key on startup
        this.loadApiKey();
        
        // Initialize button states
        this.initializeButtonStates();
        
        // Initialize event listeners
        this.initializeEventListeners();
        
        // Handle app cleanup and save settings
        window.addEventListener('beforeunload', () => {
            this.saveSettings();
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
    
    initializeSplashScreen() {
        const getStartedBtn = document.getElementById('getStartedBtn');
        const splashScreen = document.getElementById('splashScreen');
        const mainApp = document.getElementById('mainApp');
        const splashToggle = document.getElementById('splashToggle');
        
        // Debug: Check if elements exist
        console.log('Elements found:', {
            getStartedBtn: !!getStartedBtn,
            splashScreen: !!splashScreen,
            mainApp: !!mainApp,
            splashToggle: !!splashToggle
        });
        
        // If splash screen elements don't exist, skip splash screen functionality
        if (!splashScreen || !mainApp) {
            console.log('Splash screen elements not found, skipping splash screen initialization');
            this.initializeMainAppToggle();
            return;
        }
        
        // Load splash screen preference
        const splashEnabled = localStorage.getItem('splashEnabled');
        if (splashEnabled !== null) {
            const isEnabled = splashEnabled === 'true';
            if (splashToggle) splashToggle.checked = isEnabled;
            
            // If splash is disabled, skip directly to main app
            if (!isEnabled) {
                splashScreen.style.display = 'none';
                mainApp.classList.remove('hidden');
                this.initializeMainAppToggle(); // Initialize main app toggle when skipping splash
                return;
            } else {
                // If splash is enabled, ensure splash screen is visible and main app is hidden
                splashScreen.style.display = 'flex';
                mainApp.classList.add('hidden');
            }
        } else {
            // Default behavior: show splash screen (first time users)
            splashScreen.style.display = 'flex';
            mainApp.classList.add('hidden');
            // Set default value in localStorage
            localStorage.setItem('splashEnabled', 'true');
            if (splashToggle) splashToggle.checked = true;
        }
        
        // Handle splash screen toggle change
        if (splashToggle) {
            splashToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                localStorage.setItem('splashEnabled', isEnabled.toString());
                // Sync with main app toggle if it exists
                const splashToggleMain = document.getElementById('splashToggleMain');
                if (splashToggleMain) {
                    splashToggleMain.checked = isEnabled;
                }
            });
        }
        
        // Handle "Let's Get Started" button
        if (getStartedBtn) {
            console.log('Adding click listener to getStartedBtn');
            getStartedBtn.addEventListener('click', () => {
                console.log('Get Started button clicked!');
                
                // Remove fade-out animation and transition immediately
                console.log('Transitioning to main app');
                splashScreen.style.display = 'none';
                mainApp.classList.remove('hidden');
                this.initializeMainAppToggle(); // Initialize main app toggle after showing main app
                console.log('Main app should now be visible');
            });
        } else {
            console.error('getStartedBtn element not found!');
        }
    }
    
    initializeMainAppToggle() {
        const splashToggleMain = document.getElementById('splashToggleMain');
        if (splashToggleMain) {
            // Set initial state from localStorage
            const splashEnabled = localStorage.getItem('splashEnabled');
            const isEnabled = splashEnabled === null ? true : splashEnabled === 'true';
            splashToggleMain.checked = isEnabled;
            
            // Add event listener for state changes
            splashToggleMain.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                localStorage.setItem('splashEnabled', enabled.toString());
                
                // Sync with splash screen toggle if it exists
                const splashToggle = document.getElementById('splashToggle');
                if (splashToggle) {
                    splashToggle.checked = enabled;
                }
            });
        }
    }

    initializeButtonStates() {
        // Disable pause and stop buttons on app launch
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('stopBtn').disabled = true;
    }

    updateButtonStates() {
        const generateBtn = document.getElementById('generateBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (this.isProcessing) {
            generateBtn.disabled = true;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
        } else {
            generateBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
        }
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
                this.saveSettings();
            });
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
    }

    toggleKeyMode(isMultiMode) {
        const singleKeyMode = document.getElementById('singleKeyMode');
        const multiKeyMode = document.getElementById('multiKeyMode');
        
        if (isMultiMode) {
            singleKeyMode.style.display = 'none';
            multiKeyMode.style.display = 'flex';
            // Load multiple keys if available
            this.loadMultiApiKeys();
        } else {
            singleKeyMode.style.display = 'block';
            multiKeyMode.style.display = 'none';
            // Load single key if available
            this.loadApiKey();
        }
    }

    async loadApiKey() {
        try {
            const platform = document.getElementById('platformSelect').value;
            console.log('Loading API key for platform:', platform);
            const result = await ipcRenderer.invoke('get-api-key', platform);
            console.log('Get API key result:', result);
            
            if (result.success) {
                const fullApiKey = result.apiKey || ''; // Handle empty string case
                console.log('Full API key type:', typeof fullApiKey, 'value:', fullApiKey);
                
                // Clear any previous platform's key data
                const apiKeyInput = document.getElementById('apiKeyInput');
                apiKeyInput.value = fullApiKey;
                apiKeyInput.dataset.fullApiKey = fullApiKey;
                
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
            const platform = document.getElementById('platformSelect').value || 'openai';
            
            const result = await ipcRenderer.invoke('get-multi-api-keys', platform);
            if (result.success && result.apiKeys) {
                const { keys, method } = result.apiKeys;
                
                // Set the keys in the textarea (one per line)
                document.getElementById('multiApiKeyInput').value = keys.join('\n');
                
                // Set the usage method
                document.getElementById('keyUsageMethod').value = method;
                
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
        const keyModeToggle = document.getElementById('keyModeToggle');
        if (keyModeToggle && keyModeToggle.checked) {
            this.saveMultiApiKeys();
            return;
        }
        
        const apiKeyInput = document.getElementById('apiKeyInput');
        const platform = document.getElementById('platformSelect').value;
        
        try {
            // Get the current input value, not the stored dataset value
            const apiKey = apiKeyInput.value.trim();
            console.log('Saving API key for platform:', platform, '- type:', typeof apiKey, 'value:', apiKey);
            
            if (apiKey) {
                const result = await ipcRenderer.invoke('save-api-key', apiKey, platform);
                console.log('Save API key result:', result);
                
                if (result.success) {
                    // Update the dataset to match the saved key
                    apiKeyInput.dataset.fullApiKey = apiKey;
                    
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
            const platform = document.getElementById('platformSelect').value;
            const result = await ipcRenderer.invoke('clear-api-key', platform);
            if (result.success) {
                document.getElementById('apiKeyInput').value = '';
                document.getElementById('apiKeyInput').dataset.fullApiKey = '';
                console.log('API key cleared successfully');
            }
        } catch (error) {
            console.error('Error clearing API key:', error);
        }
    }
    
    async saveMultiApiKeys() {
        const multiApiKeyInput = document.getElementById('multiApiKeyInput');
        const keyUsageMethod = document.getElementById('keyUsageMethod').value;
        
        // Get the keys (one per line) and filter out empty lines
        const keys = multiApiKeyInput.value.split('\n')
            .map(key => key.trim())
            .filter(key => key.length > 0);
        
        if (keys.length === 0) {
            alert('Please enter at least one API key');
            return;
        }
        
        // Get the current platform
        const platform = document.getElementById('platformSelect').value || 'openai';
        
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
        const keyModeToggle = document.getElementById('keyModeToggle');
        if (!keyModeToggle || !keyModeToggle.checked || this.apiKeys.length === 0) {
            const apiKeyInput = document.getElementById('apiKeyInput');
            const fullApiKey = apiKeyInput.dataset.fullApiKey;
            return fullApiKey || apiKeyInput.value.trim();
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
            const platform = document.getElementById('platformSelect').value || 'openai';
            
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
        require('electron').shell.openExternal('https://platform.openai.com/api-keys');
    }

    openBillingUrl() {
        require('electron').shell.openExternal('https://platform.openai.com/account/billing');
    }

    showTutorial() {
        const modal = document.getElementById('tutorialModal');
        const closeBtn = document.getElementById('tutorialCloseBtn');
        const gotItBtn = document.getElementById('tutorialGotItBtn');

        // Show modal with animation
        modal.classList.add('show');

        // Close modal function
        const closeModal = () => {
            modal.classList.remove('show');
        };

        // Close on button clicks
        closeBtn.onclick = closeModal;
        gotItBtn.onclick = closeModal;

        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
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
                
                document.getElementById('filePathInput').value = 
                    `${result.filePaths.length} media found in folder`;
                
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
            // Use the same logic as main.js getMediaFilesFromFolder
            const mediaExtensions = [
                // Image extensions
                '.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp',
                // Video extensions
                '.mp4', '.mov', '.avi', '.mkv', '.webm',
                // Vector extensions
                '.svg', '.eps', '.ai'
            ];
            
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
                        if (stat.isFile() && mediaExtensions.includes(path.extname(item).toLowerCase())) {
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
            document.getElementById('filePathInput').value = 
                `${files.length} media found in folder`;
            
            // Update the selectedFiles array for accuracy
            this.selectedFiles = files;
            
            console.log(`Updated media counter: ${files.length} media files`);
            
        } catch (error) {
            console.error('Error updating media counter:', error);
        }
    }

    async generateMetadata() {
        // Check if we have a valid API key based on the selected platform
        const platform = document.getElementById('platformSelect').value || 'openai';
        const keyModeToggle = document.getElementById('keyModeToggle');
        const isMultiMode = keyModeToggle && keyModeToggle.checked;
        
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
                const apiKeyInput = document.getElementById('apiKeyInput');
                hasValidKey = !!(apiKeyInput.dataset.fullApiKey || apiKeyInput.value.trim());
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
        await this.removeExistingCSVFiles();
        
        // Update button states during processing
        document.getElementById('generateBtn').disabled = true;
        document.getElementById('generateBtn').innerHTML = '<div class="loading"></div> Processing...';
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;
        
        // Clear previous results
        document.getElementById('resultsContainer').innerHTML = '';
        
        // Add concurrency control
        const maxConcurrent = document.getElementById('maxConcurrent')?.value || 3; // Default to 3 concurrent processes
        const concurrencyLimit = parseInt(maxConcurrent);
        
        // Check if using simultaneous method with multiple keys
        if (keyModeToggle && keyModeToggle.checked && 
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
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('generateBtn').innerHTML = 'Generate Metadata';
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('stopBtn').disabled = true;
        
        // Reset progress stats
        this.resetProgressStats();
        
        // Reset pause button appearance
        const pauseBtn = document.getElementById('pauseBtn');
        pauseBtn.textContent = 'Pause';
        pauseBtn.classList.remove('btn-secondary');
        pauseBtn.classList.add('btn-pause');
        
        // Show completion modal immediately
        if (this.processedCount > 0) {
            this.showCompletionModal(this.processedCount, this.totalCount);
        }
        
        // Remove the updateMediaCounter call entirely from completion
        // It will be updated when user selects files next time
        // setTimeout(() => {
        //     this.updateMediaCounter();
        // }, 100);
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
        document.getElementById('resultsContainer').appendChild(resultItem);
        
        try {
            // Update status to processing (show retry count if > 0)
            const statusMessage = retryCount > 0 ? `Processing... (Retry ${retryCount}/${maxRetries})` : 'Processing...';
            this.updateResultStatus(resultItem, 'processing', statusMessage);
            
            // Generate thumbnail and replace placeholder
            const thumbnail = await this.generateThumbnail(filePath);
            const thumbnailContainer = resultItem.querySelector('.result-thumbnail');
            if (thumbnail) {
                thumbnailContainer.innerHTML = `<img src="${thumbnail}" alt="Thumbnail">`;
                thumbnailContainer.classList.remove('placeholder-thumbnail');
            }
            
            // Get image analysis from OpenAI
            const analysis = await this.analyzeMedia(filePath);
            
            // Update UI with results while preserving the icon
            const titleElement = resultItem.querySelector('.result-title');
            const ext = path.extname(filePath).toLowerCase();
            const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
            const vectorExtensions = ['.svg', '.eps', '.ai'];
            const isVideo = videoExtensions.includes(ext);
            const isVector = vectorExtensions.includes(ext);
            
            // Remove loading animation class and set the actual title
            titleElement.classList.remove('loading-text');
            titleElement.textContent = `${isVideo ? '📹' : isVector ? '🎨' : '🖼️'} ${analysis.title}`;
            
            // Format keywords with the first 5 highlighted
            const keywordsContainer = resultItem.querySelector('.result-keywords');
            keywordsContainer.innerHTML = `Keywords (${analysis.keywords.length}): `;
            
            // Create keyword elements
            analysis.keywords.forEach((keyword, index) => {
                const keywordSpan = document.createElement('span');
                keywordSpan.textContent = keyword;
                keywordSpan.className = 'keyword';
                
                // Add highlight class to first 5 keywords
                if (index < 5) {
                    keywordSpan.classList.add('keyword-highlight');
                }
                
                keywordsContainer.appendChild(keywordSpan);
                
                // Add space after each keyword except the last one
                if (index < analysis.keywords.length - 1) {
                    keywordsContainer.appendChild(document.createTextNode(' '));
                }
            });
            
            // Create model and API key info element and add it AFTER keywords
            const modelKeyInfo = document.createElement('div');
            modelKeyInfo.className = 'result-model-key-info';
            
            // Truncate API key to 60 characters and add "......" if longer
            const truncatedApiKey = analysis.apiKey.length > 60 ? 
                analysis.apiKey.substring(0, 60) + '......' : 
                analysis.apiKey;
            
            modelKeyInfo.textContent = `Model: ${analysis.model} | Key: ${truncatedApiKey}`;
            
            // Add model-key-info after the keywords container
            keywordsContainer.parentNode.insertBefore(modelKeyInfo, keywordsContainer.nextSibling);
            
            // Add platform logo
            const platformLogo = resultItem.querySelector('.platform-logo');
            const logoPath = analysis.platform === 'gemini' ? 
                './assets/gemini.svg' : 
                './assets/openai.svg';
            platformLogo.src = logoPath;
            platformLogo.style.display = 'block';
            
            // Write metadata to image
            await this.writeMetadata(filePath, analysis);
            
            // Check if file should be renamed based on title
            const shouldRename = document.getElementById('titleFileRename').value === 'yes';
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
                    fs.writeFileSync(metadataPath, 'Filename,Title,Keywords\n');
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
                await this.logToProcess(`Retrying file ${path.basename(filePath)} (attempt ${retryCount + 2}/${maxRetries + 1}): ${error.message}`);
                
                // Remove the failed result item and retry
                resultItem.remove();
                return this.processImage(filePath, retryCount + 1);
            } else {
                // Max retries reached or non-retryable error
                this.updateResultStatus(resultItem, 'error', `Failed after ${retryCount + 1} attempts: ${error.message}`);
                await this.moveFileToFolder(filePath, 'failed');
                await this.logToProcess(`File failed permanently: ${path.basename(filePath)} - ${error.message}`, 'ERROR');
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
        const item = document.createElement('div');
        item.className = 'result-item';
        
        const filename = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        const vectorExtensions = ['.svg', '.eps', '.ai'];
        const isVideo = videoExtensions.includes(ext);
        const isVector = vectorExtensions.includes(ext);
        
        // Get the appropriate icon
        const icon = isVideo ? '📹' : isVector ? '🎨' : '🖼️';
        
        item.innerHTML = `
            <div class="result-left">
                <div class="result-thumbnail placeholder-thumbnail">
                    <span class="placeholder-icon">${icon}</span>
                </div>
                <div class="result-status status-processing">
                    <div class="loading"></div>
                    <span>Processing...</span>
                </div>
                <div class="result-platform-logo">
                    <img class="platform-logo" src="" alt="Platform" style="display: none;">
                </div>
            </div>
            <div class="result-right">
                <div class="result-title loading-text">${icon} Loading...</div>
                <div class="result-keywords">Keywords: Generating...</div>
            </div>
        `;
        
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
        const statusElement = resultItem.querySelector('.result-status');
        statusElement.className = `result-status status-${status}`;
        
        if (status === 'processing') {
            statusElement.innerHTML = `<div class="loading"></div><span>${message}</span>`;
        } else if (status === 'completed') {
            statusElement.innerHTML = `<span>✅ ${message}</span>`;
        } else if (status === 'error') {
            statusElement.innerHTML = `<span>❌ ${message}</span>`;
        }
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
          
          return 'data:image/svg+xml;base64,' + btoa(`
            <svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
              <rect width="120" height="80" fill="hsl(${hue}, 70%, 85%)" stroke="#e0e0e0" stroke-width="1"/>
              <text x="60" y="50" text-anchor="middle" font-size="24">📹</text>
            </svg>
          `);
        }
        
        // Create a temporary file path for the thumbnail
        const tempDir = require('os').tmpdir();
        const tempPath = path.join(tempDir, `thumbnail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`);
        
        return new Promise((resolve, reject) => {
          // Try multiple timemarks for better reliability
          const timemarks = ['10%', '25%', '50%', '75%', '90%', '1'];
          let currentTimemarkIndex = 0;
          
          const tryGenerateThumbnail = () => {
            if (currentTimemarkIndex >= timemarks.length) {
              console.error('All timemarks failed for video:', path.basename(filePath));
              // Generate unique fallback based on filename
              const filename = path.basename(filePath, path.extname(filePath));
              const hash = filename.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
              }, 0);
              const hue = Math.abs(hash) % 360;
              
              resolve('data:image/svg+xml;base64,' + btoa(`
                <svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
                  <rect width="120" height="80" fill="hsl(${hue}, 70%, 85%)" stroke="#e0e0e0" stroke-width="1"/>
                  <text x="60" y="50" text-anchor="middle" font-size="24">📹</text>
                </svg>
              `));
              return;
            }
            
            const currentTimemark = timemarks[currentTimemarkIndex];
            
            ffmpeg(filePath)
              .on('error', (err) => {
                console.error(`FFmpeg error at ${currentTimemark} for ${path.basename(filePath)}:`, err.message);
                currentTimemarkIndex++;
                tryGenerateThumbnail(); // Try next timemark
              })
              .on('end', async () => {
                try {
                  // Add a small delay to ensure file is fully written
                  await new Promise(resolve => setTimeout(resolve, 100));
                  
                  // Check if file exists and has content
                  const stats = await fs.promises.stat(tempPath);
                  if (stats.size === 0) {
                    throw new Error('Generated thumbnail file is empty');
                  }
                  
                  // Read the generated thumbnail
                  const buffer = await fs.promises.readFile(tempPath);
                  // Convert to base64
                  const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                  // Clean up the temporary file
                  fs.promises.unlink(tempPath).catch(console.error);
                  resolve(base64Image);
                } catch (error) {
                  console.error(`Error reading thumbnail at ${currentTimemark} for ${path.basename(filePath)}:`, error.message);
                  currentTimemarkIndex++;
                  tryGenerateThumbnail(); // Try next timemark
                }
              })
              .screenshots({
                count: 1,
                folder: path.dirname(tempPath),
                filename: path.basename(tempPath),
                size: '120x120',
                timemarks: [currentTimemark]
              });
          };
          
          tryGenerateThumbnail();
        });
      } catch (error) {
        console.error('Error generating video thumbnail for', path.basename(filePath), ':', error.message);
        // Generate unique fallback based on filename
        const filename = path.basename(filePath, path.extname(filePath));
        const hash = filename.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        const hue = Math.abs(hash) % 360;
        
        return 'data:image/svg+xml;base64,' + btoa(`
          <svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
            <rect width="120" height="80" fill="hsl(${hue}, 70%, 85%)" stroke="#e0e0e0" stroke-width="1"/>
            <text x="60" y="50" text-anchor="middle" font-size="24">📹</text>
          </svg>
        `);
      }
    }

    async generateVectorThumbnail(filePath) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            
            if (ext === '.svg') {
                // For SVG files, we can use Sharp to convert to thumbnail
                const buffer = await sharp(filePath)
                    .resize(120, 120, { fit: 'cover' })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                
                return `data:image/jpeg;base64,${buffer.toString('base64')}`;
            } else {
                // For EPS and AI files, return a generic vector icon
                // Create a simple vector icon as base64
                const canvas = document.createElement('canvas');
                canvas.width = 120;
                canvas.height = 120;
                const ctx = canvas.getContext('2d');
                
                // Draw a simple vector icon
                ctx.fillStyle = '#f0f0f0';
                ctx.fillRect(0, 0, 120, 120);
                ctx.fillStyle = '#666';
                ctx.font = '48px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('🎨', 60, 70);
                
                return canvas.toDataURL('image/jpeg', 0.8);
            }
        } catch (error) {
            console.error('Error generating vector thumbnail:', error);
            // Return a default vector icon
            const canvas = document.createElement('canvas');
            canvas.width = 120;
            canvas.height = 120;
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, 120, 120);
            ctx.fillStyle = '#666';
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎨', 60, 70);
            
            return canvas.toDataURL('image/jpeg', 0.8);
        }
    }

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
            await this.logToProcess(`Skipping video file (FFmpeg not available): ${path.basename(filePath)}`);
            throw new Error('Video processing is not supported in this version. Please convert your video to an image format (JPG, PNG) first.');
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
          await this.logToProcess(`Using filename-based analysis for video (FFmpeg unavailable): ${path.basename(filePath)}`);
        }
        const keywordsCount = parseInt(document.getElementById('keywordsCount').value) || 49;
        const titleLength = parseInt(document.getElementById('titleLength').value) || 70;
        const useFilename = document.getElementById('useFilenameAnalysis').value === 'yes';
        
        // Get selected platform and model
        const platform = document.getElementById('platformSelect').value;
        const model = document.getElementById('modelSelect').value;
        
        // Get API key using the key management system
        const apiKey = this.getApiKey();
        
        if (!apiKey) {
            throw new Error('Please enter your API key first');
        }
        
        const filename = path.basename(filePath, path.extname(filePath));
        
        // DEBUG: Log the dropdown state and filename
        console.log('=== FILENAME ANALYSIS DEBUG ===');
        console.log('Dropdown value:', useFilename);
        console.log('Original file path:', filePath);
        console.log('Extracted filename:', filename);
        
        // Build the prompt with filename context integrated properly
        let prompt;
        
        // Helper function to check if filename is relevant
        function isFilenameRelevant(filename) {
            // Check for irrelevant patterns
            const irrelevantPatterns = [
                /^\d+$/, // Only numbers
                /^IMG_\d+$/i, // IMG_123 format
                /^DSC\d+$/i, // DSC123 format
                /^\d{4}-\d{2}-\d{2}/, // Date format
                /^\d{8,}$/, // Long timestamp
                /^[A-Z0-9]{8,}$/i, // Random codes
                /^(event|meeting|conference|session)_?\d*$/i, // Generic event names
                /^(photo|image|pic|picture)_?\d*$/i, // Generic photo names
                /^untitled/i, // Untitled files
                /^new_file/i, // New file names
                /^copy_of/i, // Copy names
            ];
            
            return !irrelevantPatterns.some(pattern => pattern.test(filename));
        }
        
        if (useFilename) {
            // Always use filename when user explicitly enables filename analysis
            if (platform === 'gemini') {
                prompt = `Analyze this image with filename "${filename}" and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (aim for ${titleLength} characters) - MUST incorporate filename context

🔥 CRITICAL: The filename "${filename}" contains important clues. You MUST use these clues in your title and keywords.

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 GEMINI TITLE FORMAT: Write natural, descriptive titles using proper grammar. Include prepositions, articles, and connecting words to make titles flow naturally.
Examples: 
- "Happy student with backpack walking in bright sunlight"
- "Smiling woman celebrating graduation ceremony outdoors"
- "Young girl looking up at the sky with positive expression"

⚠️ STRICT RULE: For the title, use ONLY alphanumeric characters and spaces. NO symbols at all including periods, commas, ampersands, colons, quotes, or any other special characters.`;
            } else {
                prompt = `Analyze this image with filename "${filename}" and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (aim for ${titleLength} characters) - MUST incorporate filename context

🔥 CRITICAL: The filename "${filename}" contains important clues. You MUST use these clues in your title, not just keywords.

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 TITLE FORMAT: Structure: [Main Subject] [Action/State] [Context/Setting] [Notable Details]. Use practical, descriptive language.

⚠️ IMPORTANT: For the title, ONLY use alphanumeric characters, spaces, periods (.), commas (,), and ampersands (&). DO NOT use any other special characters like : ' " ; @ or any other symbols.`;
            }
            console.log('Filename context ADDED to prompt');
        } else {
            // Smart filename analysis when user doesn't enable filename analysis
            const isRelevant = isFilenameRelevant(filename);
            
            if (platform === 'gemini') {
                if (isRelevant) {
                    prompt = `Analyze this image and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (aim for ${titleLength} characters)

💡 FILENAME HINT: The filename "${filename}" may contain useful context clues (like food type, location, etc.). Use this as secondary reference if it helps identify specific details that might not be obvious from the image alone.

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 GEMINI TITLE FORMAT: Write natural, descriptive titles using proper grammar. Include prepositions, articles, and connecting words to make titles flow naturally.
Examples: 
- "Happy student with backpack walking in bright sunlight"
- "Smiling woman celebrating graduation ceremony outdoors"
- "Young girl looking up at the sky with positive expression"

⚠️ STRICT RULE: For the title, use ONLY alphanumeric characters and spaces. NO symbols at all including periods, commas, ampersands, colons, quotes, or any other special characters.`;
                } else {
                    prompt = `Analyze this image and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (aim for ${titleLength} characters)

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 GEMINI TITLE FORMAT: Write natural, descriptive titles using proper grammar. Include prepositions, articles, and connecting words to make titles flow naturally.
Examples: 
- "Happy student with backpack walking in bright sunlight"
- "Smiling woman celebrating graduation ceremony outdoors"
- "Young girl looking up at the sky with positive expression"

⚠️ STRICT RULE: For the title, use ONLY alphanumeric characters and spaces. NO symbols at all including periods, commas, ampersands, colons, quotes, or any other special characters.`;
                }
            } else {
                if (isRelevant) {
                    prompt = `Analyze this image and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (aim for ${titleLength} characters)

💡 FILENAME HINT: The filename "${filename}" may contain useful context clues (like food type, location, etc.). Use this as secondary reference if it helps identify specific details that might not be obvious from the image alone.

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 TITLE FORMAT: Structure: [Main Subject] [Action/State] [Context/Setting] [Notable Details]. Use practical, descriptive language.

⚠️ IMPORTANT: For the title, ONLY use alphanumeric characters, spaces, periods (.), commas (,), and ampersands (&). DO NOT use any other special characters like : ' " ; @ or any other symbols.`;
                } else {
                    prompt = `Analyze this image and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (aim for ${titleLength} characters)

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 TITLE FORMAT: Structure: [Main Subject] [Action/State] [Context/Setting] [Notable Details]. Use practical, descriptive language.

⚠️ IMPORTANT: For the title, ONLY use alphanumeric characters, spaces, periods (.), commas (,), and ampersands (&). DO NOT use any other special characters like : ' " ; @ or any other symbols.`;
                }
            }
            console.log(`Filename context ${isRelevant ? 'used as hint' : 'ignored (irrelevant)'} - checkbox unchecked`);
        }
        prompt += `\n\nJSON format: {"title": "your title here"}`;
        prompt += `\n\nFormat your response as JSON:
{
  "keywords": ["keyword1", "keyword2", ...],
  "title": "Title here"
}`;
        
        // DEBUG: Log the final prompt
        console.log('Final prompt sent to AI:');
        console.log(prompt);
        console.log('=== END DEBUG ===');
        
        // Use the multi-platform API system
        // For cases where we don't have image data, we'll need to handle it differently
        let apiResponse;
        if (base64Image) {
          apiResponse = await makeAPICall(platform, model, apiKey, prompt, base64Image);
        } else {
          // For text-only analysis (when no image data is available)
          // Modify the prompt to indicate we're doing filename-based analysis
          let textOnlyPrompt = prompt.replace('Analyze this image', 'Analyze this media file based on its filename');
          textOnlyPrompt = textOnlyPrompt.replace('image with filename', 'media file with filename');
          textOnlyPrompt = textOnlyPrompt.replace('in the image', 'based on the filename and file type');
          apiResponse = await makeAPICallTextOnly(platform, model, apiKey, textOnlyPrompt);
        }
        
        // Extract the response data and the actual model used
        const response = apiResponse.data;
        const usedModel = apiResponse.usedModel || model;
        
        // Parse the response to get the text content
        const content = parseResponse(platform, response);
        
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
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
            
            return {
                keywords: keywords,
                title: analysis.title || '',
                // Store the model and API key info for display
                model: model, // Show the actual model used
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
        try {
            const ext = path.extname(filePath).toLowerCase();
            
            // Define file types that should skip ExifTool
            const vectorExtensions = ['.svg', '.eps', '.ai'];
            const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
            
            // Skip ExifTool for vector and video files
            if (vectorExtensions.includes(ext)) {
                await this.logToProcess(`Skipping ExifTool for vector file (metadata will be in CSV): ${path.basename(filePath)}`);
                return; // Exit early, no ExifTool writing for vectors
            }
            
            if (videoExtensions.includes(ext)) {
                await this.logToProcess(`Skipping ExifTool for video file (metadata will be in CSV): ${path.basename(filePath)}`);
                return; // Exit early, no ExifTool writing for videos
            }
            
            // For image files only, proceed with ExifTool writing
            const metadata = {
                Keywords: analysis.keywords.join(', '),
                Title: analysis.title,
                Subject: analysis.keywords.join(', ')
            };

            try {
                await this.exiftool.write(filePath, metadata);
                
                // Clean up backup files immediately after writing
                await this.cleanupBackupFiles(filePath);
            } catch (exifError) {
                // Handle specific ExifTool errors gracefully
                if (exifError.message.includes('Not a valid PNG') || 
                    exifError.message.includes('looks more like a JPEG') ||
                    exifError.message.includes('format mismatch') ||
                    exifError.message.includes('movie fragments') ||
                    exifError.message.includes('Can\'t yet handle movie fragments')) {
                    
                    await this.logToProcess(`Warning: ExifTool cannot handle this file format for ${path.basename(filePath)}. Metadata will be included in CSV only.`);
                    console.warn(`ExifTool format issue for ${filePath}:`, exifError.message);
                    // Don't throw error, just skip ExifTool writing for this file
                    return;
                } else {
                    // For other ExifTool errors, still throw
                    throw exifError;
                }
            }
            
        } catch (error) {
            console.error('Error writing metadata:', error);
            throw error;
        }
    }

    // Add this new method to automatically clean up backup files
    async cleanupBackupFiles(filePath) {
        try {
            const dir = path.dirname(filePath);
            const filename = path.basename(filePath);
            const backupFile = path.join(dir, filename + '_original');
            
            // Check if backup file exists and delete it
            if (fs.existsSync(backupFile)) {
                fs.unlinkSync(backupFile);
                console.log(`Cleaned up backup file: ${backupFile}`);
            }
            
            // Also check for other possible backup patterns
            const nameWithoutExt = path.parse(filePath).name;
            const ext = path.parse(filePath).ext;
            const altBackupFile = path.join(dir, nameWithoutExt + '_original' + ext);
            
            if (fs.existsSync(altBackupFile)) {
                fs.unlinkSync(altBackupFile);
                console.log(`Cleaned up backup file: ${altBackupFile}`);
            }
        } catch (error) {
            console.warn('Error cleaning up backup files:', error);
            // Don't throw error - backup cleanup failure shouldn't stop the main process
        }
    }

    async removeExistingCSVFiles() {
        try {
            // Get the first selected file to determine the directory
            if (this.selectedFiles.length > 0) {
                const firstFile = this.selectedFiles[0];
                const sourceDir = path.dirname(firstFile);
                const successDir = path.join(sourceDir, 'success');
                const csvDir = path.join(successDir, 'CSV');
                
                // Only remove metadata CSV (shutterstock.csv is no longer generated)
                const metadataPath = path.join(csvDir, 'metadata.csv');
                
                if (fs.existsSync(metadataPath)) {
                    fs.unlinkSync(metadataPath);
                    console.log('Removed existing metadata.csv');
                }
            }
        } catch (error) {
            console.error('Error removing existing CSV files:', error);
        }
    }
    
    // Add this new method after the moveFileToFolder function
    async generateCSVFiles(successDir) {
        try {
            // Create CSV directory if it doesn't exist
            const csvDir = path.join(successDir, 'CSV');
            if (!fs.existsSync(csvDir)) {
                fs.mkdirSync(csvDir, { recursive: true });
            }
            
            // Initialize metadata CSV file with headers if it doesn't exist
            const metadataPath = path.join(csvDir, 'metadata.csv');
            
            // Get all files in the success directory (excluding the CSV directory)
            const files = fs.readdirSync(successDir)
                .filter(file => {
                    const filePath = path.join(successDir, file);
                    return fs.statSync(filePath).isFile() && !file.endsWith('.csv'); // Only include media files, not CSV files
                })
                .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())); // Sort alphabetically
            
            // Recreate the CSV file completely to avoid duplicates
            let csvContent = 'Filename,Title,Keywords\n';
            
            // Process all files in the success directory
            for (const file of files) {
                const filePath = path.join(successDir, file);
                
                try {
                    // Read metadata from the file
                    const metadata = await this.exiftool.read(filePath);
                    
                    // Extract relevant data
                    const filename = path.basename(filePath);
                    const title = metadata.Title || '';
                    const keywords = metadata.Keywords || '';
                    
                    // Escape fields for CSV (handle commas, quotes, etc.)
                    const escapedFilename = this.escapeCSV(filename);
                    const escapedTitle = this.escapeCSV(title);
                    const escapedKeywords = this.escapeCSV(keywords);
                    
                    // Add to CSV content
                    csvContent += `${escapedFilename},${escapedTitle},${escapedKeywords}\n`;
                    
                } catch (error) {
                    console.error(`Error processing metadata for CSV: ${file}`, error);
                    // Continue with other files even if one fails
                }
            }
            
            // Write the complete CSV file (this replaces any existing file)
            fs.writeFileSync(metadataPath, csvContent);
            
            console.log(`Generated metadata.csv with ${files.length} entries in ${csvDir}`);
            
        } catch (error) {
            console.error('Error generating CSV files:', error);
            // Don't throw error to avoid breaking the main process
        }
    }
    
    async appendToCSV(processedFiles, successDir, analysisData = null) {
        try {
            console.log('DEBUG: appendToCSV called with:', processedFiles.length, 'files');
            console.log('DEBUG: successDir:', successDir);
            
            // Create CSV directory if it doesn't exist
            const csvDir = path.join(successDir, 'CSV');
            console.log('DEBUG: csvDir path:', csvDir);
            
            if (!fs.existsSync(csvDir)) {
                fs.mkdirSync(csvDir, { recursive: true });
                console.log('DEBUG: Created CSV directory');
            }
            
            const metadataPath = path.join(csvDir, 'metadata.csv');
            console.log('DEBUG: CSV file path:', metadataPath);
            
            // Initialize CSV file with headers if it doesn't exist
            if (!fs.existsSync(metadataPath)) {
                fs.writeFileSync(metadataPath, 'Filename,Title,Keywords\n');
                console.log('Created new metadata.csv with headers');
            }
            
            let csvContent = '';
            
            // Process only the newly completed files
            for (const filePath of processedFiles) {
                try {
                    const filename = path.basename(filePath);
                    let title = '';
                    let keywords = '';
                    
                    // For single file processing with analysis data, use it directly
                    if (analysisData && processedFiles.length === 1) {
                        title = analysisData.title || '';
                        keywords = Array.isArray(analysisData.keywords) ? 
                            analysisData.keywords.join(', ') : 
                            (analysisData.keywords || '');
                    } else {
                        // For batch processing or when no analysis data, read from file
                        const metadata = await this.exiftool.read(filePath);
                        title = metadata.Title || '';
                        keywords = metadata.Keywords || '';
                    }
                    
                    // Escape fields for CSV (handle commas, quotes, etc.)
                    const escapedFilename = this.escapeCSV(filename);
                    const escapedTitle = this.escapeCSV(title);
                    const escapedKeywords = this.escapeCSV(keywords);
                    
                    // Add to CSV content
                    csvContent += `${escapedFilename},${escapedTitle},${escapedKeywords}\n`;
                    
                } catch (error) {
                    console.error(`Error processing metadata for CSV: ${path.basename(filePath)}`, error);
                    // Continue with other files even if one fails
                }
            }
            
            // Append the new entries to the CSV file
            if (csvContent) {
                fs.appendFileSync(metadataPath, csvContent);
                console.log(`Appended ${processedFiles.length} entries to metadata.csv`);
            }
            
        } catch (error) {
            console.error('Error appending to CSV file:', error);
            // Don't throw error to avoid breaking the main process
        }
    }
    
    // Helper method to escape CSV fields
    escapeCSV(field) {
        if (field === null || field === undefined) {
            return '';
        }
        
        const stringField = String(field);
        // If the field contains commas, quotes, or newlines, wrap it in quotes
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            // Double up any quotes within the field
            return '"' + stringField.replace(/"/g, '""') + '"';
        }
        return stringField;
    }

    updateProgress(current, total, status = 'Processing') {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        const progressContainer = document.querySelector('.progress-container');
        
        // Update progress fill
        document.getElementById('progressFill').style.width = `${percentage}%`;
        
        // Update text displays
        document.getElementById('progressText').textContent = `${current}/${total} Media`;
        document.getElementById('progressPercentage').textContent = `${Math.round(percentage)}%`;
        document.getElementById('progressStatus').textContent = status;
        
        // Update container state classes
        progressContainer.className = 'progress-container';
        if (current === total && total > 0) {
            progressContainer.classList.add('completed');
            document.getElementById('progressStatus').textContent = 'Completed';
        } else if (current > 0) {
            progressContainer.classList.add('processing');
        }
        
        // Calculate and display ETA and speed
        this.updateProgressStats(current, total);
    }

    updateProgressStats(current, total) {
        const now = Date.now();
        
        if (!this.progressStartTime) {
            this.progressStartTime = now;
            this.lastProgressUpdate = now;
            this.lastProcessedCount = 0;
            return;
        }
        
        const elapsed = (now - this.progressStartTime) / 1000; // seconds
        const processed = current - this.lastProcessedCount;
        const timeSinceLastUpdate = (now - this.lastProgressUpdate) / 1000;
        
        if (timeSinceLastUpdate >= 1 && processed > 0) { // Update every second
            const speed = processed / timeSinceLastUpdate; // files per second
            const speedPerMinute = Math.round(speed * 60);
            
            const remaining = total - current;
            const eta = remaining > 0 && speed > 0 ? remaining / speed : 0;
            
            // Update displays
            document.getElementById('progressSpeed').textContent = `${speedPerMinute} files/min`;
            
            if (eta > 0) {
                const etaMinutes = Math.floor(eta / 60);
                const etaSeconds = Math.round(eta % 60);
                document.getElementById('progressETA').textContent = 
                    `ETA: ${etaMinutes}:${etaSeconds.toString().padStart(2, '0')}`;
            } else {
                document.getElementById('progressETA').textContent = 'ETA: --';
            }
            
            this.lastProgressUpdate = now;
            this.lastProcessedCount = current;
        }
    }

    resetProgressStats() {
        this.progressStartTime = null;
        this.lastProgressUpdate = null;
        this.lastProcessedCount = 0;
        document.getElementById('progressETA').textContent = 'ETA: --';
        document.getElementById('progressSpeed').textContent = '-- files/min';
        document.getElementById('progressStatus').textContent = 'Ready';
        document.querySelector('.progress-container').className = 'progress-container';
    }



    pauseProcessing() {
        // Toggle pause state
        this.isPaused = !this.isPaused;
        const pauseBtn = document.getElementById('pauseBtn');
        
        if (this.isPaused) {
            pauseBtn.textContent = 'Resume';
            pauseBtn.classList.remove('btn-pause');
            pauseBtn.classList.add('btn-secondary');
        } else {
            pauseBtn.textContent = 'Pause';
            pauseBtn.classList.remove('btn-secondary');
            pauseBtn.classList.add('btn-pause');
        }
    }

    async stopProcessing() {
        this.isProcessing = false;
        this.isPaused = false;
        
        // Generate CSV files if any files were processed - SAME AS COMPLETION METHOD
        if (this.processedCount > 0) {
            try {
                // Find the success directory from the first selected file - SAME AS COMPLETION
                const firstFile = this.selectedFiles[0];
                if (firstFile) {
                    const sourceDir = path.dirname(firstFile);
                    const successDir = path.join(sourceDir, 'success');
                    if (fs.existsSync(successDir)) {
                        await this.generateCSVFiles(successDir);
                    }
                }
            } catch (error) {
                console.error('Error generating CSV files on stop:', error);
            }
        }
        
        // Reset button states
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('generateBtn').innerHTML = 'Generate Metadata';
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('stopBtn').disabled = true;
        
        // Reset pause button text
        const pauseBtn = document.getElementById('pauseBtn');
        pauseBtn.textContent = 'Pause';
        pauseBtn.classList.remove('btn-secondary');
        pauseBtn.classList.add('btn-pause');
        
        // Reset progress stats
        this.resetProgressStats();
        
        // Update media counter in background (non-blocking)
        setTimeout(() => {
            this.updateMediaCounter();
        }, 100);
    }
    


    showCompletionModal(processed, total) {
        const modal = document.getElementById('completionModal');
        const processedCountEl = document.getElementById('processedCount');
        const totalCountEl = document.getElementById('totalCount');
        const closeBtn = document.getElementById('modalCloseBtn');

        // Update the numbers
        processedCountEl.textContent = processed;
        totalCountEl.textContent = total;

        // Show modal with animation
        modal.classList.add('show');

        // Close modal handlers
        const closeModal = () => {
            modal.classList.remove('show');
        };

        // Close on button click
        closeBtn.onclick = closeModal;

        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Auto-close after 5 seconds (optional)
        setTimeout(() => {
            if (modal.classList.contains('show')) {
                closeModal();
            }
        }, 5000);
    }

    // Logging methods

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
            
            // Load other settings
            const keywordsCount = localStorage.getItem('keywordsCount');
            if (keywordsCount) {
                const keywordsInput = document.getElementById('keywordsCount');
                if (keywordsInput) keywordsInput.value = keywordsCount;
            }
            
            const titleLength = localStorage.getItem('titleLength');
            if (titleLength) {
                const titleLengthInput = document.getElementById('titleLength');
                if (titleLengthInput) titleLengthInput.value = titleLength;
            }
            
            const titleFileRename = localStorage.getItem('titleFileRename');
            if (titleFileRename) {
                const titleFileRenameSelect = document.getElementById('titleFileRename');
                if (titleFileRenameSelect) titleFileRenameSelect.value = titleFileRename;
            }
            
            const useFilenameAnalysis = localStorage.getItem('useFilenameAnalysis');
            if (useFilenameAnalysis) {
                const useFilenameAnalysisSelect = document.getElementById('useFilenameAnalysis');
                if (useFilenameAnalysisSelect) useFilenameAnalysisSelect.value = useFilenameAnalysis;
            }
            
            const maxConcurrent = localStorage.getItem('maxConcurrent');
            if (maxConcurrent) {
                const maxConcurrentInput = document.getElementById('maxConcurrent');
                if (maxConcurrentInput) maxConcurrentInput.value = maxConcurrent;
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    saveSettings() {
        try {
            // Save Auto Clean Up setting
            const autoCleanUpSelect = document.getElementById('autoCleanUp');
            if (autoCleanUpSelect) {
                localStorage.setItem('autoCleanUp', autoCleanUpSelect.value);
                this.autoCleanUp = autoCleanUpSelect.value === 'yes';
            }
            
            // Save other settings
            const keywordsInput = document.getElementById('keywordsCount');
            if (keywordsInput) localStorage.setItem('keywordsCount', keywordsInput.value);
            
            const titleLengthInput = document.getElementById('titleLength');
            if (titleLengthInput) localStorage.setItem('titleLength', titleLengthInput.value);
            
            const titleFileRenameSelect = document.getElementById('titleFileRename');
            if (titleFileRenameSelect) localStorage.setItem('titleFileRename', titleFileRenameSelect.value);
            
            const useFilenameAnalysisSelect = document.getElementById('useFilenameAnalysis');
            if (useFilenameAnalysisSelect) localStorage.setItem('useFilenameAnalysis', useFilenameAnalysisSelect.value);
            
            const maxConcurrentInput = document.getElementById('maxConcurrent');
            if (maxConcurrentInput) localStorage.setItem('maxConcurrent', maxConcurrentInput.value);
            
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }
    
    cleanup() {
        // Clean up ExifTool when app is closing
        if (this.exiftool) {
            this.exiftool.end().catch(console.error);
        }
    }
}

// Remove this extra closing brace on line 689
// }

// Initialize platform selection and other utilities
const { remote } = require('electron');
const packageJson = require('./package.json');

// Set dynamic title
document.title = `AutoMeta v${packageJson.version} - Microstock Booster 3X Edition (Unlimited)`;

// Model configurations for each platform
const MODEL_CONFIGS = {
    openai: {
        models: [
            { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', recommended: false },
            { value: 'gpt-4o', label: 'GPT-4o', recommended: false },
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)', recommended: true },
            { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', recommended: false },
            { value: 'gpt-4.1', label: 'GPT-4.1', recommended: false },
            { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', recommended: false },
            { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', recommended: false },
            { value: 'gpt-5', label: 'GPT-5', recommended: false },
            { value: 'gpt-5-mini', label: 'GPT-5 Mini', recommended: false },
            { value: 'gpt-5-nano', label: 'GPT-5 Nano', recommended: false }
        ],
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer '
        }
    },
    gemini: {
        models: [
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', recommended: false },
            { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', recommended: true },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', recommended: false },
            { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', recommended: false },
            { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', recommended: false }
        ],
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
        headers: {
            'Content-Type': 'application/json'
        }
    }
};

// Platform selection functions
function initializePlatformSelection() {
    const platformSelect = document.getElementById('platformSelect');
    const modelSelect = document.getElementById('modelSelect');
    
    // Update models when platform changes
    platformSelect.addEventListener('change', (e) => {
        const platform = e.target.value;
        updateModelOptions(platform);
        updateApiKeyPlaceholder(platform);
    });
    
    // Initialize with default platform
    updateModelOptions(platformSelect.value);
    updateApiKeyPlaceholder(platformSelect.value);
}

function updateModelOptions(platform) {
    const modelSelect = document.getElementById('modelSelect');
    const config = MODEL_CONFIGS[platform];
    
    // Clear existing options
    modelSelect.innerHTML = '';
    
    // Add new options
    config.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.label;
        if (model.recommended) {
            option.selected = true;
        }
        modelSelect.appendChild(option);
    });
}

function updateApiKeyPlaceholder(platform) {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const placeholders = {
        openai: 'Enter your OpenAI API key (sk-...)',
        gemini: 'Enter your Google AI API key'
        // Claude entry removed
    };
    apiKeyInput.placeholder = placeholders[platform] || 'Enter your API key';
}

// API call functions
function formatRequestPayload(platform, model, prompt, imageBase64) {
    switch (platform) {
        case 'openai':
            const content = [{
                type: "text",
                text: prompt
            }];
            
            // Only add image if imageBase64 is provided
            if (imageBase64) {
                content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBase64}`,
                        detail: "low"
                    }
                });
            }
            
            return {
                model: model,
                messages: [{
                    role: "user",
                    content: content
                }],
                max_tokens: 300
            };
        case 'gemini':
            const parts = [{ text: prompt }];
            
            // Only add image if imageBase64 is provided
            if (imageBase64) {
                parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
            }
            
            return {
                contents: [{
                    parts: parts
                }]
            };
        // Claude case removed
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

function parseResponse(platform, response) {
    switch (platform) {
        case 'openai':
            return response.choices[0].message.content;
        case 'gemini':
            return response.candidates[0].content.parts[0].text;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

// Add a new function for text-only API calls
async function makeAPICallTextOnly(platform, model, apiKey, prompt) {
    return makeAPICall(platform, model, apiKey, prompt, null);
}

async function makeAPICall(platform, model, apiKey, prompt, imageBase64) {
    const config = MODEL_CONFIGS[platform];
    let url = config.apiUrl;
    
    let currentModel = model;
    let jsonRetryCount = 0;
    const maxJsonRetries = 3; // Changed from 2 to 3 retries for JSON errors
    
    if (platform === 'gemini') {
        url += `${currentModel}:generateContent?key=${apiKey}`;
    }
    
    const headers = { ...config.headers };
    if (platform === 'openai') {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    // Sanitize the imageBase64 data to ensure it's valid (only if imageBase64 exists)
    const sanitizedImageBase64 = imageBase64 ? imageBase64.replace(/[^A-Za-z0-9+/=]/g, '') : null;
    
    const payload = formatRequestPayload(platform, currentModel, prompt, sanitizedImageBase64);
    
    try {
        // Validate JSON before sending
        try {
            JSON.parse(JSON.stringify(payload));
        } catch (jsonError) {
            console.error('JSON validation error before sending:', jsonError.message);
            // Sanitize the prompt to fix potential JSON issues
            if (platform === 'gemini') {
                const sanitizedPrompt = prompt.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
                const parts = [{ text: sanitizedPrompt }];
                
                // Only add image if sanitizedImageBase64 exists
                if (sanitizedImageBase64) {
                    parts.push({ inlineData: { mimeType: "image/jpeg", data: sanitizedImageBase64 } });
                }
                
                payload = {
                    contents: [{
                        parts: parts
                    }]
                };
                // Try validating again
                JSON.parse(JSON.stringify(payload));
            }
        }
        
        let response;
        let retryCount = 0;
        const maxRetries = 3; // Maximum number of retries for each model
        const retryDelay = 2000; // Initial delay in milliseconds (2 seconds)
        
        while (true) {
            console.log(`Trying with model: ${currentModel}`);
            
            response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
            
            // For Gemini API specifically
            if (platform === 'gemini') {
                // If we get a 429 (rate limit) error or 503 (service unavailable) error
                if (response.status === 429 || response.status === 503) {
                    console.log(`${response.status === 429 ? 'Rate limit (429)' : 'Service unavailable (503)'} hit for Gemini API with model ${currentModel}`);
                    
                    // Use the existing retry logic
                    if (retryCount < maxRetries) {
                        console.log(`Retrying with same model (${retryCount + 1}/${maxRetries}) after ${retryDelay}ms...`);
                        
                        // Exponential backoff - increase delay for each retry
                        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, retryCount)));
                        retryCount++;
                        continue; // Try again
                    } else {
                        throw new Error(`Gemini API ${response.status === 429 ? 'rate limit exceeded' : 'service unavailable'} after ${maxRetries} retries`);
                    }
                }
                
                // If we get a 400 error (bad request), stop processing immediately
                if (response.status === 400) {
                    console.error('Gemini API returned 400 Bad Request - stopping process');
                    // Signal to stop the entire process
                    window.dispatchEvent(new CustomEvent('stop-processing', {
                        detail: { reason: 'Gemini API returned 400 Bad Request - invalid input or configuration' }
                    }));
                    throw new Error('Gemini API returned 400 Bad Request - stopping process');
                }
            }
            
            // For any other error or platform
            if (!response.ok) {
                throw new Error(`API call failed: ${response.status} for ${currentModel}`);
            }
            
            // If we got here, the request was successful
            break;
        }
        
        // Return both the response and the actual model used
        const responseData = await response.json();
        return {
            data: responseData,
            usedModel: currentModel // Return the actual model used
        };
    } catch (error) {
        if (error.message.includes('JSON') || error.message.includes('Unexpected token') || error.message.includes('Expected')) {
            console.error('JSON parsing error:', error.message);
            
            // For JSON errors, retry with the same model up to 3 times
            if (jsonRetryCount < maxJsonRetries) {
                console.log(`JSON error, retrying (${jsonRetryCount + 1}/${maxJsonRetries}) in 2 seconds...`);
                jsonRetryCount++;
                
                // Wait 2 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Try again with the same model and parameters
                return makeAPICall(platform, currentModel, apiKey, prompt, imageBase64);
            } else {
                throw new Error(`JSON parsing failed after ${maxJsonRetries} retries: ${error.message}`);
            }
        }
        
        throw error;
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Make app globally accessible for debugging
    window.app = new AutoMetadataApp();
    const app = window.app;
    
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

async function generateVideoThumbnail(filePath) {
  try {
    // Check if FFmpeg is available
    if (!ffmpegAvailable) {
      console.warn('FFmpeg not available, returning video emoji');
      return '📹';
    }
    
    return new Promise((resolve, reject) => {
      // Create a temporary file path for the thumbnail
      const tempDir = require('os').tmpdir();
      const tempPath = path.join(tempDir, `thumbnail-${Date.now()}.jpg`);
      
      ffmpeg(filePath)
        .on('error', (err) => {
          console.error('Error generating video thumbnail:', err);
          resolve('📹'); // Return emoji instead of rejecting
        })
        .on('end', async () => {
          try {
            // Read the generated thumbnail and convert to base64
            const buffer = await fs.promises.readFile(tempPath);
            const base64Data = buffer.toString('base64');
            
            // Clean up the temporary file
            fs.promises.unlink(tempPath).catch(console.error);
            
            resolve(`data:image/jpeg;base64,${base64Data}`);
          } catch (error) {
            console.error('Error reading thumbnail:', error);
            resolve('📹'); // Return emoji instead of rejecting
          }
        })
        .screenshots({
          count: 1,
          folder: path.dirname(tempPath),
          filename: path.basename(tempPath),
          size: '120x120'
        });
    });
  } catch (error) {
    console.error('Error generating video thumbnail:', error);
    return '📹';
  }
}

