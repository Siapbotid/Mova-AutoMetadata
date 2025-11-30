class UIComponents {
    constructor() {
        this.isProcessing = false;
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
            }
        }
        
        // Handle splash toggle change
        if (splashToggle) {
            splashToggle.addEventListener('change', (e) => {
                localStorage.setItem('splashEnabled', e.target.checked);
                if (!e.target.checked) {
                    // If disabled, hide splash and show main app immediately
                    splashScreen.style.display = 'none';
                    mainApp.classList.remove('hidden');
                    this.initializeMainAppToggle();
                }
            });
        }
        
        // Handle get started button
        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => {
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
        const mainAppToggle = document.getElementById('mainAppToggle');
        if (mainAppToggle) {
            // Load main app preference
            const mainAppEnabled = localStorage.getItem('mainAppEnabled');
            if (mainAppEnabled !== null) {
                mainAppToggle.checked = mainAppEnabled === 'true';
            }
            
            // Handle main app toggle change
            mainAppToggle.addEventListener('change', (e) => {
                localStorage.setItem('mainAppEnabled', e.target.checked);
            });
        }
    }

    initializeButtonStates() {
        this.updateButtonStates(false, false);
    }

    updateButtonStates(isProcessing = false, isPaused = false) {
        const generateBtn = document.getElementById('generateBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (isProcessing) {
            if (generateBtn) generateBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;
        } else {
            if (generateBtn) generateBtn.disabled = false;
            if (pauseBtn) pauseBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = true;
        }
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

    showCompletionModal(processed, total) {
        const modal = document.getElementById('completionModal');
        const closeBtn = document.getElementById('modalCloseBtn');
        const processedCountElement = document.getElementById('processedCount');
        const totalCountElement = document.getElementById('totalCount');
        
        // Set the completion counts
        if (processedCountElement) {
            processedCountElement.textContent = processed;
        }
        if (totalCountElement) {
            totalCountElement.textContent = total;
        }
        
        // Show modal with animation
        if (modal) {
            modal.classList.add('show');
        }

        // Close modal function
        const closeModal = () => {
            if (modal) {
                modal.classList.remove('show');
            }
        };

        // Close on button clicks
        if (closeBtn) closeBtn.onclick = closeModal;

        // Close on overlay click
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            };
        }

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    openApiKeyUrl() {
        require('electron').shell.openExternal('https://platform.openai.com/api-keys');
    }

    openBillingUrl() {
        require('electron').shell.openExternal('https://platform.openai.com/account/billing');
    }

    setProcessingState(isProcessing) {
        this.updateButtonStates(isProcessing, false);
    }

    getMultiApiKeyInput() {
        const multiApiKeyInput = document.getElementById('multiApiKeyInput');
        return multiApiKeyInput ? multiApiKeyInput.value : '';
    }

    setMultiApiKeyInput(value) {
        const multiApiKeyInput = document.getElementById('multiApiKeyInput');
        if (multiApiKeyInput) {
            multiApiKeyInput.value = value || '';
        }
    }

    getKeyUsageMethod() {
        const keyUsageMethod = document.getElementById('keyUsageMethod');
        return keyUsageMethod ? keyUsageMethod.value : 'rotation';
    }

    setKeyUsageMethod(value) {
        const keyUsageMethod = document.getElementById('keyUsageMethod');
        if (keyUsageMethod) {
            keyUsageMethod.value = value || 'rotation';
        }
    }

    getApiKeyValue() {
        const apiKeyInput = document.getElementById('apiKeyInput');
        return apiKeyInput ? apiKeyInput.value : '';
    }

    setApiKeyInput(value) {
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) {
            apiKeyInput.value = value || '';
        }
    }

    clearApiKeyInput() {
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) {
            apiKeyInput.value = '';
        }
    }

    cleanupOldResults(maxVisibleResults) {
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer && resultsContainer.children.length > maxVisibleResults) {
            // Remove oldest results
            const toRemove = resultsContainer.children.length - maxVisibleResults;
            for (let i = 0; i < toRemove; i++) {
                resultsContainer.removeChild(resultsContainer.firstChild);
            }
        }
    }

    toggleKeyMode(isMultiMode) {
        const singleKeySection = document.getElementById('singleKeySection');
        const multiKeySection = document.getElementById('multiKeySection');
        
        if (singleKeySection && multiKeySection) {
            if (isMultiMode) {
                singleKeySection.style.display = 'none';
                multiKeySection.style.display = 'block';
            } else {
                singleKeySection.style.display = 'block';
                multiKeySection.style.display = 'none';
            }
        }
    }

    setApiKeyDataset(apiKey) {
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) {
            apiKeyInput.dataset.apiKey = apiKey || '';
        }
    }

    updateFilePathInput(text) {
        const filePathInput = document.getElementById('filePathInput');
        if (filePathInput) {
            filePathInput.value = text || '';
        }
    }

    clearResultsContainer() {
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
        }
    }

    appendToResultsContainer(resultItem) {
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer && resultItem) {
            resultsContainer.appendChild(resultItem);
        }
    }

    updateResultThumbnail(resultItem, thumbnail) {
        if (resultItem && thumbnail) {
            const thumbnailContainer = resultItem.querySelector('.result-thumbnail');
            if (thumbnailContainer) {
                thumbnailContainer.innerHTML = `<img src="${thumbnail}" alt="Thumbnail">`;
                thumbnailContainer.classList.remove('placeholder-thumbnail');
            }
        }
    }

    updateResultContent(resultItem, analysis, filePath) {
        if (!resultItem || !analysis) return;
        
        // Update title
        const titleElement = resultItem.querySelector('.result-title');
        if (titleElement) {
            titleElement.textContent = analysis.title || 'Untitled';
            titleElement.classList.remove('loading-text');
        }
        
        // Update description
        const descriptionElement = resultItem.querySelector('.result-description');
        if (descriptionElement) {
            descriptionElement.textContent = `Description: ${analysis.description || 'No description available'}`;
        }
        
        // Update keywords
        const keywordsElement = resultItem.querySelector('.result-keywords');
        if (keywordsElement && analysis.keywords) {
            // Format keywords with the first 5 highlighted (matching reference version)
            keywordsElement.innerHTML = `Keywords (${analysis.keywords.length}): `;
            
            // Create keyword elements
            analysis.keywords.forEach((keyword, index) => {
                const keywordSpan = document.createElement('span');
                keywordSpan.textContent = keyword;
                keywordSpan.className = 'keyword';
                
                // Add highlight class to first 5 keywords
                if (index < 5) {
                    keywordSpan.classList.add('keyword-highlight');
                }
                
                keywordsElement.appendChild(keywordSpan);
                
                // Add space after each keyword except the last one
                if (index < analysis.keywords.length - 1) {
                    keywordsElement.appendChild(document.createTextNode(' '));
                }
            });
            
            // Create model and API key info element and add it AFTER keywords
            const modelKeyInfo = document.createElement('div');
            modelKeyInfo.className = 'result-model-key-info';
            
            // Mask API key: show first 10 and last 10 characters, asterisks in between
            const maskedApiKey = this.maskApiKey(analysis.apiKey);
            
            modelKeyInfo.textContent = `Model: ${analysis.model || 'Unknown'} | Key: ${maskedApiKey}`;
            
            // Add model-key-info after the keywords element
            keywordsElement.parentNode.insertBefore(modelKeyInfo, keywordsElement.nextSibling);
        }
        
        // Update status to completed
        this.updateResultStatus(resultItem, 'completed', 'Completed');
    }

    createResultItem(filePath) {
        const item = document.createElement('div');
        item.className = 'result-item';
        
        const filename = require('path').basename(filePath);
        const ext = require('path').extname(filePath).toLowerCase();
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
                <div class="result-description">Description: Generating...</div>
                <div class="result-keywords">Keywords: Generating...</div>
            </div>
        `;
        
        return item;
    }

    limitVisibleResults(maxConcurrent) {
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer && resultsContainer.children.length > maxConcurrent * 2) {
            // Keep only the most recent results
            const toRemove = resultsContainer.children.length - maxConcurrent;
            for (let i = 0; i < toRemove; i++) {
                resultsContainer.removeChild(resultsContainer.firstChild);
            }
        }
    }

    updateResultStatus(resultItem, status, message) {
        if (resultItem) {
            const statusContainer = resultItem.querySelector('.result-status');
            if (statusContainer) {
                // Clear existing content
                statusContainer.innerHTML = '';
                
                if (status === 'processing') {
                    statusContainer.innerHTML = `
                        <div class="loading"></div>
                        <span class="status-processing">${message || 'Processing...'}</span>
                    `;
                } else if (status === 'completed') {
                    statusContainer.innerHTML = `
                        <span class="status-completed">✓ ${message || 'Completed'}</span>
                    `;
                } else if (status === 'error') {
                    statusContainer.innerHTML = `
                        <span class="status-error">✗ ${message || 'Error'}</span>
                    `;
                } else {
                    statusContainer.innerHTML = `
                        <span class="status-${status.toLowerCase()}">${message || status}</span>
                    `;
                }
            }
        }
    }

    updateResultPlatformLogo(resultItem, platform) {
        if (resultItem) {
            const logoContainer = resultItem.querySelector('.result-platform-logo');
            if (logoContainer) {
                const logoImg = logoContainer.querySelector('.platform-logo');
                
                if (logoImg) {
                    if (platform === 'openai') {
                        logoImg.src = './assets/openai.svg';
                        logoImg.alt = 'OpenAI';
                        logoImg.style.display = 'block';
                    } else if (platform === 'gemini') {
                        logoImg.src = './assets/gemini.svg';
                        logoImg.alt = 'Gemini';
                        logoImg.style.display = 'block';
                    } else {
                        logoImg.style.display = 'none';
                    }
                }
            }
        }
    }

    updatePauseButton(isPaused) {
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
        }
    }

    // Mask API key: show first 10 and last 10 characters, asterisks in between
    maskApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            return 'Unknown';
        }
        
        // If API key is too short (less than 20 characters), show first 5 and last 5
        if (apiKey.length <= 20) {
            if (apiKey.length <= 10) {
                // For very short keys, mask middle characters
                return apiKey.length <= 6 ? 
                    '*'.repeat(apiKey.length) : 
                    apiKey.substring(0, 2) + '*'.repeat(apiKey.length - 4) + apiKey.substring(apiKey.length - 2);
            }
            // For keys 11-20 characters, show first 5 and last 5
            const start = apiKey.substring(0, 5);
            const end = apiKey.substring(apiKey.length - 5);
            const middle = '*'.repeat(apiKey.length - 10);
            return start + middle + end;
        }
        
        // For keys longer than 20 characters, show first 10 and last 10
        const start = apiKey.substring(0, 10);
        const end = apiKey.substring(apiKey.length - 10);
        const middle = '*'.repeat(apiKey.length - 20);
        return start + middle + end;
    }
}

module.exports = UIComponents;