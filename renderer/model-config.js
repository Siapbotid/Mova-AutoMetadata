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
    if (apiKeyInput) {
        if (platform === 'openai') {
            apiKeyInput.placeholder = 'Enter your OpenAI API key';
        } else if (platform === 'gemini') {
            apiKeyInput.placeholder = 'Enter your Gemini API key';
        }
    }
}

module.exports = {
    MODEL_CONFIGS,
    initializePlatformSelection,
    updateModelOptions,
    updateApiKeyPlaceholder
};