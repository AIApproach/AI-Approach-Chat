/**
 * Typing effect for assistant messages
 */

// Configuration for typing effect
const typingConfig = {
    baseSpeed: 20,        // Base typing speed in milliseconds
    randomVariation: 10,  // Random variation in typing speed
    pauseAfterPeriod: 300, // Pause after period
    pauseAfterComma: 150,  // Pause after comma
    pauseAfterNewline: 400, // Pause after newline
    pauseAfterParagraph: 600, // Pause after paragraph
    minDelay: 15,        // Minimum delay between characters
    maxDelay: 40         // Maximum delay between characters
};

/**
 * Completely new approach: convert the entire markdown to a single string
 * and type it character by character, preserving HTML structure
 */
function applyTypingEffectToMarkdown(markdownElement) {
    // Store the original HTML content
    const originalHTML = markdownElement.innerHTML;
    
    // Create a temporary container to work with
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = originalHTML;
    
    // Extract code blocks and tables to preserve them
    const preservedElements = [];
    let preservedCounter = 0;
    
    // Replace code blocks and tables with placeholders
    tempContainer.querySelectorAll('pre, table').forEach(element => {
        const placeholder = `__PRESERVED_ELEMENT_${preservedCounter}__`;
        preservedElements.push({
            placeholder: placeholder,
            content: element.outerHTML
        });
        element.outerHTML = placeholder;
        preservedCounter++;
    });
    
    // Get the HTML with placeholders
    let htmlWithPlaceholders = tempContainer.innerHTML;
    
    // Clear the markdown element
    markdownElement.innerHTML = '';
    
    // Create a container for the cursor
    const cursorElement = document.createElement('span');
    cursorElement.className = 'typing-cursor';
    
    // Create a container for the typed content
    const typedContentElement = document.createElement('span');
    markdownElement.appendChild(typedContentElement);
    markdownElement.appendChild(cursorElement);
    
    // Start typing
    let typedHTML = '';
    let currentIndex = 0;
    
    function typeNextCharacter() {
        // Check if we've reached the end
        if (currentIndex >= htmlWithPlaceholders.length) {
            // Restore preserved elements
            let finalHTML = typedHTML;
            preservedElements.forEach(element => {
                finalHTML = finalHTML.replace(element.placeholder, element.content);
            });
            
            // Set the final HTML
            typedContentElement.innerHTML = finalHTML;
            
            // Apply syntax highlighting to code blocks
            typedContentElement.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
            
            // Remove cursor after a delay
            setTimeout(() => {
                if (cursorElement.parentNode) {
                    cursorElement.parentNode.removeChild(cursorElement);
                }
            }, 2000);
            
            return;
        }
        
        // Check if we're at a preserved element placeholder
        for (const element of preservedElements) {
            if (htmlWithPlaceholders.startsWith(element.placeholder, currentIndex)) {
                // Add the entire placeholder at once
                typedHTML += element.placeholder;
                currentIndex += element.placeholder.length;
                
                // Update the display
                typedContentElement.innerHTML = typedHTML;
                
                // Continue typing after a short delay
                setTimeout(typeNextCharacter, 100);
                return;
            }
        }
        
        // Get the next character
        const nextChar = htmlWithPlaceholders[currentIndex];
        typedHTML += nextChar;
        currentIndex++;
        
        // Update the display
        typedContentElement.innerHTML = typedHTML;
        
        // Calculate delay for next character
        let delay = typingConfig.baseSpeed;
        
        // Check for HTML tags
        if (nextChar === '<') {
            // Find the end of this tag
            const tagEndIndex = htmlWithPlaceholders.indexOf('>', currentIndex);
            if (tagEndIndex !== -1) {
                // Add the entire tag at once
                const restOfTag = htmlWithPlaceholders.substring(currentIndex, tagEndIndex + 1);
                typedHTML += restOfTag;
                currentIndex = tagEndIndex + 1;
            }
        } else {
            // Add pauses for punctuation
            const lastChar = typedHTML.charAt(typedHTML.length - 1);
            if (lastChar === '.') {
                delay = typingConfig.pauseAfterPeriod;
            } else if (lastChar === ',') {
                delay = typingConfig.pauseAfterComma;
            } else if (lastChar === '\n') {
                delay = typingConfig.pauseAfterNewline;
            } else {
                // Add some randomness for natural typing
                delay += Math.floor(Math.random() * typingConfig.randomVariation);
            }
            
            // Check for paragraph breaks
            if (typedHTML.endsWith('</p>')) {
                delay = typingConfig.pauseAfterParagraph;
            }
        }
        
        // Ensure delay is within bounds
        delay = Math.max(typingConfig.minDelay, Math.min(delay, typingConfig.maxDelay));
        
        // Schedule the next character
        setTimeout(typeNextCharacter, delay);
    }
    
    // Start the typing process
    typeNextCharacter();
}
