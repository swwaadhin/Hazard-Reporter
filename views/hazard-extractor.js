class HazardExtractor {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    }

    async extractHazardType(chatbotResponse) {
        const extractionPrompt = `
Read this hazard analysis text and extract ONLY the hazard type mentioned. Return just the hazard type name or "NONE" if no hazard is mentioned.

Analysis text:
"${chatbotResponse}"

Rules:
1. Look for the "Type:" field in the text
2. Extract only the hazard type name (like "Pothole", "Road Damage", "Water leakage", etc.)
3. If no hazard type is found or if it says "no hazard", return "NONE"
4. Return only ONE word or short phrase - nothing else
5. Do not include asterisks, numbers, or extra formatting

Response:`;

        try {
            const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: extractionPrompt }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 10,
                        topP: 0.1,
                        topK: 1
                    }
                })
            });

            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                let result = data.candidates[0].content.parts[0].text.trim();
                
                // Clean the result - remove asterisks, numbers, extra formatting
                result = result.replace(/\*+/g, '').replace(/\d+\)/g, '').trim();
                
                // If result is empty or contains "none" or "no hazard", return NONE
                if (!result || result.toLowerCase().includes('none') || result.toLowerCase().includes('no hazard')) {
                    return "NONE";
                }
                
                return result;
            } else {
                return "NONE";
            }
        } catch (error) {
            console.error('Extraction error:', error);
            return "NONE";
        }
    }
}

// Global extractor instance
let hazardExtractor = null;

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Replace with your actual Gemini API key
    const GEMINI_API_KEY = 'YOUR_ACTUAL_API_KEY_HERE';
    hazardExtractor = new HazardExtractor(GEMINI_API_KEY);
});

// Global function to extract hazard from chatbot response
window.extractHazardFromResponse = async function(chatbotResponse) {
    if (!hazardExtractor) {
        console.error('Hazard extractor not initialized');
        return "NONE";
    }
    
    const hazardType = await hazardExtractor.extractHazardType(chatbotResponse);
    return hazardType;
};
