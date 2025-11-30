const path = require('path');

/**
 * OpenAI API Module
 * Contains all OpenAI-specific prompt generation and API call functions
 */

/**
 * Generate OpenAI-specific prompt based on analysis parameters
 * @param {string} filename - The filename to analyze
 * @param {boolean} useFilename - Whether to use filename in analysis
 * @param {number} keywordsCount - Number of keywords to generate
 * @param {number} titleLength - Target title length
 * @param {number} maxDescriptionLength - Maximum description length (default 200)
 * @returns {string} - The formatted prompt for OpenAI
 */
function generateOpenAIPrompt(filename, useFilename, keywordsCount, titleLength, maxDescriptionLength = 200, commercialSettings = null) {
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

    // Determine title length instruction
    const titleLengthInstruction = titleLength === 200 
        ? "between 150-200 characters" 
        : `aim for ${titleLength} characters`;

    // Calculate description length instruction based on available space
    const descriptionLengthInstruction = maxDescriptionLength < 200 
        ? `max ${maxDescriptionLength} characters - aim for ${Math.max(maxDescriptionLength - 20, 30)}-${maxDescriptionLength} for maximum detail`
        : `max 200 characters - aim for 180-200 for maximum detail`;

    // Generate commercial instructions if commercial mode is enabled
    let commercialInstructions = '';
    if (commercialSettings && (commercialSettings.mainSubject || commercialSettings.additionalSubject)) {
        commercialInstructions = '\n\n🎯 COMMERCIAL REQUIREMENTS:\n';
        
        if (commercialSettings.mainSubject) {
            commercialInstructions += `- MANDATORY: The title and description MUST mention "${commercialSettings.mainSubject}" (Category: ${commercialSettings.mainSubjectCategory})\n`;
        }
        
        if (commercialSettings.additionalSubject) {
            commercialInstructions += `- MANDATORY: The title and description MUST also mention "${commercialSettings.additionalSubject}" (Category: ${commercialSettings.additionalSubjectCategory})\n`;
        }
        
        commercialInstructions += '- These subjects are critical for accurate identification and MUST be included in your response\n';
        commercialInstructions += '- Prioritize these subjects over generic descriptions to ensure specificity and commercial value\n';
    }

    let prompt;
    
    if (useFilename) {
        // Always use filename when user explicitly enables filename analysis
        prompt = `Analyze this image with filename "${filename}" and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (${titleLengthInstruction}) - MUST incorporate filename context
4. A detailed, engaging description (${descriptionLengthInstruction}) following this formula: [Descriptive Adjective(s)] + [Main Subject] + [Context or Setting] + [Emotive or Functional Hook]

🔥 CRITICAL: The filename "${filename}" contains important clues. You MUST use these clues in your title, description, and keywords.${commercialInstructions}

📝 DESCRIPTION FORMULA: Your description must follow this structure:
- Start with a complete, descriptive sentence that fully describes the main subject and context (NEVER start with "This", "A", "An", or just 1-3 adjectives)
- After the first comma, add an emotive or functional hook (Perfect for..., showcasing..., representing...)
- ALWAYS aim for ${Math.max(maxDescriptionLength - 20, 30)}-${maxDescriptionLength} characters to provide maximum detail and engagement
- Use rich, descriptive language and include specific visual details

Examples of good descriptions:
- "Vibrant virus being disrupted by antiviral medication in a digital environment represents scientific innovation, perfect for medical presentations."
- "Complex network of antibodies interacting with antigens against a dark background creates a stunning visualization, showcasing the intricate beauty of cellular life."
- "Colorful puzzle pieces scattered across a wooden surface create an engaging pattern, perfect for representing creativity and problem-solving concepts."

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 TITLE FORMAT: Structure: [Main Subject] [Action/State] [Context/Setting] [Notable Details]. Use practical, descriptive language.

⚠️ IMPORTANT: For the title, ONLY use alphanumeric characters, spaces, periods (.), and commas (,). DO NOT use any other special characters like colons (:), semicolons (;), ampersands (&), quotes, or any other symbols.`;
    } else {
        // Smart filename analysis when user doesn't enable filename analysis
        const isRelevant = isFilenameRelevant(filename);
        
        if (isRelevant) {
            prompt = `Analyze this image and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (${titleLengthInstruction})
4. A detailed, engaging description (${descriptionLengthInstruction}) following this formula: [Descriptive Adjective(s)] + [Main Subject] + [Context or Setting] + [Emotive or Functional Hook]

💡 FILENAME HINT: The filename "${filename}" may contain useful context clues (like food type, location, etc.). Use this as secondary reference for your title, description, and keywords if it helps identify specific details that might not be obvious from the image alone.${commercialInstructions}

📝 DESCRIPTION FORMULA: Your description must follow this structure:
- Start with a complete, descriptive sentence that fully describes the main subject and context (NEVER start with "This", "A", "An", or just 1-3 adjectives)
- After the first comma, add an emotive or functional hook (Perfect for..., showcasing..., representing...)

Examples of good descriptions:
- "Vibrant virus being disrupted by antiviral medication in a digital environment represents scientific innovation, perfect for medical presentations."
- "Complex network of antibodies interacting with antigens against a dark background creates a stunning visualization, showcasing the intricate beauty of cellular life."
- "Colorful puzzle pieces scattered across a wooden surface create an engaging pattern, perfect for representing creativity and problem-solving concepts."

🎯 MAIN SUBJECT FOCUS: Identify and prioritize the PRIMARY subject or focal point in the image. This could be:
- A person, animal, or group of people/animals
- An object, product, or item
- A building, landmark, or structure  
- A scene, landscape, or environment
- An action, event, or activity
- Food, vehicle, artwork, or any other main element

The title MUST clearly describe what the main subject IS and what it's DOING (if applicable).

📝 TITLE FORMAT: Structure: [Main Subject] [Action/State] [Context/Setting] [Notable Details]. Use practical, descriptive language.

⚠️ IMPORTANT: For the title, ONLY use alphanumeric characters, spaces, periods (.), and commas (,). DO NOT use any other special characters like colons (:), semicolons (;), ampersands (&), quotes, or any other symbols.`;
        } else {
            prompt = `Analyze this image and provide:
1. Exactly ${keywordsCount} relevant keywords - MUST be SINGLE WORDS ONLY (no phrases or multi-word terms)
2. The FIRST 5 keywords MUST be the most relevant, trending, and important keywords
3. A clear, descriptive title (${titleLengthInstruction})
4. A detailed, engaging description (${descriptionLengthInstruction}) following this formula: [Descriptive Adjective(s)] + [Main Subject] + [Context or Setting] + [Emotive or Functional Hook]${commercialInstructions}

📝 DESCRIPTION FORMULA: Your description must follow this structure:
- Start with a complete, descriptive sentence that fully describes the main subject and context (NEVER start with "This", "A", "An", or just 1-3 adjectives)
- After the first comma, add an emotive or functional hook (Perfect for..., showcasing..., representing...)

Examples of good descriptions:
- "Stunning close-up of fresh purple grapes in a silver bowl glistens with water droplets, perfect for food enthusiasts and healthy lifestyle themes."
- "Complex network of antibodies interacting with antigens against a dark background creates a captivating visualization, showcasing the beauty of cellular life."
- "Vibrant puzzle pieces scattered on a surface create an abstract design, perfect for representing creativity and problem-solving."

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
    
    prompt += `\n\nFormat your response as JSON:
{
  "keywords": ["keyword1", "keyword2", ...],
  "title": "Title here",
  "description": "Description here"
}`;
    
    return prompt;
}

/**
 * Format request payload for OpenAI API
 * @param {string} model - The OpenAI model to use
 * @param {string} prompt - The prompt text
 * @param {string|null} imageBase64 - Base64 encoded image data (optional)
 * @returns {Object} - Formatted request payload
 */
function formatOpenAIRequestPayload(model, prompt, imageBase64) {
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
}

/**
 * Parse OpenAI API response
 * @param {Object} response - The API response object
 * @returns {string} - Extracted text content
 */
function parseOpenAIResponse(response) {
    return response.choices[0].message.content;
}

/**
 * Make API call to OpenAI
 * @param {string} model - The OpenAI model to use
 * @param {string} apiKey - The API key
 * @param {string} prompt - The prompt text
 * @param {string|null} imageBase64 - Base64 encoded image data (optional)
 * @returns {Promise<Object>} - API response with data and used model
 */
async function makeOpenAIAPICall(model, apiKey, prompt, imageBase64) {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
    
    let currentModel = model;
    let jsonRetryCount = 0;
    const maxJsonRetries = 3;
    
    // Sanitize the imageBase64 data to ensure it's valid (only if imageBase64 exists)
    const sanitizedImageBase64 = imageBase64 ? imageBase64.replace(/[^A-Za-z0-9+/=]/g, '') : null;
    
    const payload = formatOpenAIRequestPayload(currentModel, prompt, sanitizedImageBase64);
    
    try {
        // Validate JSON before sending
        try {
            JSON.parse(JSON.stringify(payload));
        } catch (jsonError) {
            console.error('OpenAI JSON validation error before sending:', jsonError.message);
            throw new Error(`OpenAI payload validation failed: ${jsonError.message}`);
        }
        
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 2000;
        
        while (true) {
            console.log(`Trying OpenAI with model: ${currentModel}`);
            
            response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
            
            // Handle OpenAI-specific error responses
            if (response.status === 429) {
                console.log(`Rate limit (429) hit for OpenAI API with model ${currentModel}`);
                
                if (retryCount < maxRetries) {
                    console.log(`Retrying with same model (${retryCount + 1}/${maxRetries}) after ${retryDelay}ms...`);
                    
                    // Exponential backoff - increase delay for each retry
                    await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, retryCount)));
                    retryCount++;
                    continue;
                } else {
                    throw new Error(`OpenAI API rate limit exceeded after ${maxRetries} retries`);
                }
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API call failed: ${response.status} - ${errorData.error?.message || 'Unknown error'} for ${currentModel}`);
            }
            
            // If we got here, the request was successful
            break;
        }
        
        // Return both the response and the actual model used
        const responseData = await response.json();
        return {
            data: responseData,
            usedModel: currentModel
        };
    } catch (error) {
        if (error.message.includes('JSON') || error.message.includes('Unexpected token') || error.message.includes('Expected')) {
            console.error('OpenAI JSON parsing error:', error.message);
            
            // For JSON errors, retry with the same model up to 3 times
            if (jsonRetryCount < maxJsonRetries) {
                console.log(`OpenAI JSON error, retrying (${jsonRetryCount + 1}/${maxJsonRetries}) in 2 seconds...`);
                jsonRetryCount++;
                
                // Wait 2 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Try again with the same model and parameters
                return makeOpenAIAPICall(currentModel, apiKey, prompt, imageBase64);
            } else {
                throw new Error(`OpenAI JSON parsing failed after ${maxJsonRetries} retries: ${error.message}`);
            }
        }
        
        throw error;
    }
}

module.exports = {
    generateOpenAIPrompt,
    formatOpenAIRequestPayload,
    parseOpenAIResponse,
    makeOpenAIAPICall
};