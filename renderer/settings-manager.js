class SettingsManager {
    constructor() {
        this.defaultSettings = {
            autoCleanUp: true,
            keywordsCount: 10,
            titleLength: 60,
            titleFileRename: 'no',
            useFilenameAnalysis: 'yes',
            maxConcurrent: 3,
            editorialMode: false,
            editorialPlace: '',
            editorialDate: '',
            commercialMode: false,
            mainSubject: '',
            mainSubjectCategory: 'Default',
            additionalSubject: '',
            additionalSubjectCategory: 'Default'
        };
    }

    loadSettings() {
        const settings = {};
        
        // Load each setting from localStorage with fallback to defaults
        Object.keys(this.defaultSettings).forEach(key => {
            const stored = localStorage.getItem(key);
            if (stored !== null) {
                // Parse boolean and number values
                if (typeof this.defaultSettings[key] === 'boolean') {
                    settings[key] = stored === 'true';
                } else if (typeof this.defaultSettings[key] === 'number') {
                    settings[key] = parseInt(stored, 10);
                } else {
                    settings[key] = stored;
                }
            } else {
                settings[key] = this.defaultSettings[key];
            }
        });
        
        return settings;
    }

    saveSettings(settings) {
        Object.keys(settings).forEach(key => {
            localStorage.setItem(key, settings[key].toString());
        });
    }

    getSetting(key) {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
            // Parse boolean and number values
            if (typeof this.defaultSettings[key] === 'boolean') {
                return stored === 'true';
            } else if (typeof this.defaultSettings[key] === 'number') {
                return parseInt(stored, 10);
            } else {
                return stored;
            }
        }
        return this.defaultSettings[key];
    }

    setSetting(key, value) {
        localStorage.setItem(key, value.toString());
    }

    getMaxConcurrent() {
        const maxConcurrentInput = document.getElementById('maxConcurrent');
        return maxConcurrentInput ? parseInt(maxConcurrentInput.value, 10) || 3 : 3;
    }

    getKeyModeToggle() {
        const keyModeToggle = document.getElementById('keyModeToggle');
        return keyModeToggle ? keyModeToggle.checked : false;
    }

    getPlatformSelection() {
        const platformSelect = document.getElementById('platformSelect');
        return platformSelect ? platformSelect.value : 'openai';
    }

    getApiKeyValue() {
        const apiKeyInput = document.getElementById('apiKeyInput');
        return apiKeyInput ? apiKeyInput.value : '';
    }

    getTitleFileRename() {
        return this.getSetting('titleFileRename') || 'no';
    }

    getKeywordsCount() {
        return this.getSetting('keywordsCount');
    }

    getTitleLength() {
        return this.getSetting('titleLength');
    }

    getUseFilenameAnalysis() {
        return this.getSetting('useFilenameAnalysis') || 'no';
    }

    getEditorialMode() {
        return this.getSetting('editorialMode') || false;
    }

    getEditorialPlace() {
        return this.getSetting('editorialPlace') || '';
    }

    getEditorialDate() {
        return this.getSetting('editorialDate') || '';
    }

    getCommercialMode() {
        return this.getSetting('commercialMode') || false;
    }

    getMainSubject() {
        return this.getSetting('mainSubject') || '';
    }

    getMainSubjectCategory() {
        return this.getSetting('mainSubjectCategory') || 'Default';
    }

    getAdditionalSubject() {
        return this.getSetting('additionalSubject') || '';
    }

    getAdditionalSubjectCategory() {
        return this.getSetting('additionalSubjectCategory') || 'Default';
    }

    getModelSelection() {
        const modelSelect = document.getElementById('modelSelect');
        return modelSelect ? modelSelect.value : 'gpt-4o-mini';
    }

    initializeSettingsEventListeners() {
        // Auto cleanup toggle
        const autoCleanUpToggle = document.getElementById('autoCleanUp');
        if (autoCleanUpToggle) {
            autoCleanUpToggle.checked = this.getSetting('autoCleanUp');
            autoCleanUpToggle.addEventListener('change', (e) => {
                this.setSetting('autoCleanUp', e.target.checked);
            });
        }

        // Keywords count
        const keywordsCountInput = document.getElementById('keywordsCount');
        if (keywordsCountInput) {
            keywordsCountInput.value = this.getSetting('keywordsCount');
            keywordsCountInput.addEventListener('change', (e) => {
                this.setSetting('keywordsCount', parseInt(e.target.value, 10));
            });
        }

        // Title length
        const titleLengthInput = document.getElementById('titleLength');
        if (titleLengthInput) {
            titleLengthInput.value = this.getSetting('titleLength');
            titleLengthInput.addEventListener('change', (e) => {
                this.setSetting('titleLength', parseInt(e.target.value, 10));
            });
        }

        // Title file rename dropdown
        const titleFileRenameSelect = document.getElementById('titleFileRename');
        if (titleFileRenameSelect) {
            titleFileRenameSelect.value = this.getSetting('titleFileRename');
            titleFileRenameSelect.addEventListener('change', (e) => {
                this.setSetting('titleFileRename', e.target.value);
            });
        }

        // Use filename analysis dropdown
        const useFilenameAnalysisSelect = document.getElementById('useFilenameAnalysis');
        if (useFilenameAnalysisSelect) {
            useFilenameAnalysisSelect.value = this.getSetting('useFilenameAnalysis');
            useFilenameAnalysisSelect.addEventListener('change', (e) => {
                this.setSetting('useFilenameAnalysis', e.target.value);
            });
        }

        // Max concurrent
        const maxConcurrentInput = document.getElementById('maxConcurrent');
        if (maxConcurrentInput) {
            maxConcurrentInput.value = this.getSetting('maxConcurrent');
            maxConcurrentInput.addEventListener('change', (e) => {
                this.setSetting('maxConcurrent', parseInt(e.target.value, 10));
            });
        }

        // Editorial mode toggle
        const editorialModeToggle = document.getElementById('editorialModeToggle');
        const editorialInputs = document.getElementById('editorialInputs');
        if (editorialModeToggle && editorialInputs) {
            editorialModeToggle.checked = this.getSetting('editorialMode') || false;
            editorialInputs.style.display = editorialModeToggle.checked ? 'flex' : 'none';
            
            editorialModeToggle.addEventListener('change', (e) => {
                this.setSetting('editorialMode', e.target.checked);
                editorialInputs.style.display = e.target.checked ? 'flex' : 'none';
                this.updateEditorialPreview();
            });
        }

        // Editorial place input
        const editorialPlaceInput = document.getElementById('editorialPlace');
        if (editorialPlaceInput) {
            editorialPlaceInput.value = this.getSetting('editorialPlace') || '';
            editorialPlaceInput.addEventListener('input', (e) => {
                this.setSetting('editorialPlace', e.target.value);
                this.updateEditorialPreview();
            });
        }

        // Editorial date input
        const editorialDateInput = document.getElementById('editorialDate');
        if (editorialDateInput) {
            editorialDateInput.value = this.getSetting('editorialDate') || '';
            editorialDateInput.addEventListener('change', (e) => {
                this.setSetting('editorialDate', e.target.value);
                this.updateEditorialPreview();
            });
        }

        // Initialize editorial preview
        this.updateEditorialPreview();

        // Commercial mode toggle
        const commercialModeToggle = document.getElementById('commercialModeToggle');
        const commercialInputs = document.getElementById('commercialInputs');
        if (commercialModeToggle && commercialInputs) {
            commercialModeToggle.checked = this.getSetting('commercialMode') || false;
            commercialInputs.style.display = commercialModeToggle.checked ? 'flex' : 'none';
            
            commercialModeToggle.addEventListener('change', (e) => {
                this.setSetting('commercialMode', e.target.checked);
                commercialInputs.style.display = e.target.checked ? 'flex' : 'none';
            });
        }

        // Main subject input
        const mainSubjectInput = document.getElementById('mainSubject');
        if (mainSubjectInput) {
            mainSubjectInput.value = this.getSetting('mainSubject') || '';
            mainSubjectInput.addEventListener('input', (e) => {
                this.setSetting('mainSubject', e.target.value);
            });
        }

        // Main subject category dropdown
        const mainSubjectCategorySelect = document.getElementById('mainSubjectCategory');
        if (mainSubjectCategorySelect) {
            mainSubjectCategorySelect.value = this.getSetting('mainSubjectCategory') || 'Default';
            mainSubjectCategorySelect.addEventListener('change', (e) => {
                this.setSetting('mainSubjectCategory', e.target.value);
            });
        }

        // Additional subject input
        const additionalSubjectInput = document.getElementById('additionalSubject');
        if (additionalSubjectInput) {
            additionalSubjectInput.value = this.getSetting('additionalSubject') || '';
            additionalSubjectInput.addEventListener('input', (e) => {
                this.setSetting('additionalSubject', e.target.value);
            });
        }

        // Additional subject category dropdown
        const additionalSubjectCategorySelect = document.getElementById('additionalSubjectCategory');
        if (additionalSubjectCategorySelect) {
            additionalSubjectCategorySelect.value = this.getSetting('additionalSubjectCategory') || 'Default';
            additionalSubjectCategorySelect.addEventListener('change', (e) => {
                this.setSetting('additionalSubjectCategory', e.target.value);
            });
        }
    }

    updateEditorialPreview() {
        const previewElement = document.getElementById('editorialPreview');
        const place = this.getSetting('editorialPlace') || '[Location]';
        const date = this.getSetting('editorialDate') || '[Date]';
        
        if (previewElement) {
            if (place === '[Location]' && date === '[Date]') {
                previewElement.textContent = '[Location] - [Date]: [AI Generated Description] (Max 200 chars total)';
            } else {
                // Format the date if it's provided
                let formattedDate = date;
                if (date && date !== '[Date]') {
                    const dateObj = new Date(date);
                    formattedDate = dateObj.toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                    });
                }
                
                const editorialPrefix = `${place} - ${formattedDate}: `;
                const remainingChars = 200 - editorialPrefix.length;
                previewElement.textContent = `${editorialPrefix}[AI Generated Description] (${remainingChars} chars available)`;
            }
        }
    }
}

module.exports = SettingsManager;