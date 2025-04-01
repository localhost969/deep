document.addEventListener('DOMContentLoaded', () => {
    const solveBtn = document.getElementById('solveBtn');
    const hintBtn = document.getElementById('hintBtn');
    const pasteEndBtn = document.getElementById('pasteEndBtn');
    const pasteInput = document.getElementById('pasteInput');
    const extractedContent = document.getElementById('extractedContent');
    const apiResponse = document.getElementById('apiResponse');
    const finalStatus = document.getElementById('finalStatus');
    const stagesContainer = document.querySelector('.stages');
    const hintSection = document.querySelector('.hint-section');
    const hintResponse = document.getElementById('hintResponse');
    const pasteFeedback = document.getElementById('pasteFeedback');
    const feedbackMessage = document.getElementById('feedbackMessage');

    // New fullscreen hint elements
    const fullscreenHintOverlay = document.getElementById('fullscreenHintOverlay');
    const fullscreenHintContent = document.getElementById('fullscreenHintContent');
    const closeFullscreenBtn = document.getElementById('closeFullscreenBtn');

    // Load stored state on popup open
    const loadStoredState = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentUrl = tabs[0]?.url || '';
            const currentPageIdentifier = getPageIdentifier(currentUrl);
            
            // Only load state if we have a valid URL
            if (currentPageIdentifier) {
                chrome.storage.local.get([currentPageIdentifier], (result) => {
                    const storedState = result[currentPageIdentifier];
                    
                    if (storedState) {
                        // Restore paste input
                        if (storedState.pasteInput) {
                            pasteInput.value = storedState.pasteInput;
                        }
                        
                        // Restore hint section
                        if (storedState.hintVisible && storedState.hintContent) {
                            hintSection.style.display = 'block';
                            hintResponse.textContent = storedState.hintContent;
                        } else {
                            hintSection.style.display = 'none';
                        }
                        
                        // Restore stages section
                        if (storedState.stagesVisible) {
                            stagesContainer.classList.add('visible');
                            
                            if (storedState.extractedContent) {
                                extractedContent.textContent = storedState.extractedContent;
                            }
                            
                            if (storedState.apiResponse) {
                                apiResponse.textContent = storedState.apiResponse;
                            }
                            
                            if (storedState.finalStatus) {
                                finalStatus.textContent = storedState.finalStatus;
                            }
                        } else {
                            stagesContainer.classList.remove('visible');
                        }
                    } else {
                        // No stored state for this page, initialize empty
                        resetPopupState();
                    }
                });
            } else {
                // No valid URL, reset popup
                resetPopupState();
            }
        });
    };

    // Save current state when content changes
    const saveState = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentUrl = tabs[0]?.url || '';
            const currentPageIdentifier = getPageIdentifier(currentUrl);
            
            // Only save if we have a valid URL
            if (currentPageIdentifier) {
                const state = {
                    pasteInput: pasteInput.value,
                    hintVisible: hintSection.style.display === 'block',
                    hintContent: hintResponse.textContent,
                    stagesVisible: stagesContainer.classList.contains('visible'),
                    extractedContent: extractedContent.textContent,
                    apiResponse: apiResponse.textContent,
                    finalStatus: finalStatus.textContent,
                    timestamp: Date.now() // Add timestamp for potential cleanup later
                };
                
                // Store using the page identifier as the key
                const stateObj = {};
                stateObj[currentPageIdentifier] = state;
                chrome.storage.local.set(stateObj);
            }
        });
    };

    // Get a unique identifier for the current page
    // This creates a more specific identifier than just the URL
    const getPageIdentifier = (url) => {
        if (!url) return null;
        
        try {
            const urlObj = new URL(url);
            // Create a unique key based on hostname, pathname and any identifiers in the query string
            // This ensures different problems/assignments get different storage
            const pathKey = urlObj.pathname.replace(/\//g, '_');
            
            // If there are query parameters that identify the specific problem, include those
            const problemId = urlObj.searchParams.get('problem') || 
                              urlObj.searchParams.get('id') || 
                              urlObj.searchParams.get('assignment');
            
            // Combine hostname and path for a unique identifier
            let pageKey = `page_${urlObj.hostname}${pathKey}`;
            
            // If there's a problem ID, make the key even more specific
            if (problemId) {
                pageKey += `_${problemId}`;
            }
            
            return pageKey;
        } catch (e) {
            console.error('Error parsing URL:', e);
            // Fallback - use the whole URL as a key, but sanitize it
            return 'page_' + url.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
        }
    };

    // Reset popup to initial state
    const resetPopupState = () => {
        pasteInput.value = '';
        hintSection.style.display = 'none';
        stagesContainer.classList.remove('visible');
        extractedContent.textContent = '';
        apiResponse.textContent = '';
        finalStatus.textContent = '';
    };

    // Function to show paste feedback
    const showPasteFeedback = (message, isSuccess) => {
        feedbackMessage.textContent = message;
        
        // First remove any existing classes
        pasteFeedback.classList.remove('success', 'error');
        
        // Update icon and add appropriate class
        const iconElement = pasteFeedback.querySelector('i');
        if (isSuccess) {
            pasteFeedback.classList.add('success');
            iconElement.className = 'fas fa-check-circle';
        } else {
            pasteFeedback.classList.add('error');
            iconElement.className = 'fas fa-exclamation-circle';
        }
        
        // Show feedback
        pasteFeedback.style.display = 'flex';
        
        // Hide feedback after 3 seconds
        setTimeout(() => {
            pasteFeedback.style.display = 'none';
        }, 3000);
    };

    const injectContent = async (tab, content) => {
        return chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (solution) => {
                try {
                    const editors = document.querySelectorAll('.ace_editor');
                    for (const editor of editors) {
                        if (editor.id && window.ace) {
                            const aceEditor = window.ace.edit(editor.id);
                            if (aceEditor && typeof aceEditor.setValue === 'function') {
                                // Move cursor to end and insert the new content
                                aceEditor.navigateFileEnd();
                                aceEditor.insert('\n\n' + solution);
                                aceEditor.clearSelection();
                                return true;
                            }
                        }
                    }
                    
                    // Fallback method if ace editor not found
                    const editorArea = document.querySelector('.ace_text-input');
                    if (editorArea) {
                        const currentContent = editorArea.value || '';
                        
                        // Only append if there's existing content
                        if (currentContent && currentContent.trim().length > 0) {
                            const newContent = currentContent + '\n\n' + solution;
                            
                            // Try to use the proper way to update the Ace editor content
                            const event = new InputEvent('input', { bubbles: true });
                            editorArea.value = newContent;
                            editorArea.dispatchEvent(event);
                        } else {
                            editorArea.value = solution;
                            const event = new InputEvent('input', { bubbles: true });
                            editorArea.dispatchEvent(event);
                        }
                        return true;
                    }
                    
                    throw new Error('No injection method worked');
                } catch (e) {
                    console.error('Injection error:', e);
                    return false;
                }
            },
            args: [content]
        });
    };

    // Show fullscreen hint view
    const showFullscreenHint = (content) => {
        fullscreenHintContent.textContent = content;
        fullscreenHintOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent scrolling when fullscreen is active
    };

    // Close fullscreen hint view
    closeFullscreenBtn.addEventListener('click', () => {
        fullscreenHintOverlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    // Close overlay when clicking outside the content
    fullscreenHintOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'fullscreenHintOverlay') {
            fullscreenHintOverlay.style.display = 'none';
        }
    });

    // Initialize expand button functionality
    const expandButton = document.querySelector('.expand-btn');
    expandButton.addEventListener('click', () => {
        const hintContent = document.getElementById('hintResponse').innerHTML;
        document.getElementById('fullscreenHintContent').innerHTML = hintContent;
        document.getElementById('fullscreenHintOverlay').style.display = 'flex';
    });

    // Load stored state when popup opens
    loadStoredState();
    
    // Add a listener for when input changes to save state
    pasteInput.addEventListener('input', saveState);
    
    // Add button functionality
    hintBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    try {
                        const textLayers = document.querySelectorAll('.ace_text-layer');
                        if (textLayers.length > 0) {
                            let content = '';
                            for (const layer of textLayers) {
                                const lines = Array.from(layer.querySelectorAll('.ace_line'));
                                content = lines.map(line => line.textContent).join('\n');
                            }
                            if (content) return content;
                        }

                        const editorElement = document.querySelector('.vpl_ide_file.ace_editor');
                        if (editorElement && window.ace) {
                            const aceId = editorElement.id;
                            const editor = window.ace.edit(aceId);
                            return editor.getValue();
                        }

                        const editorContent = document.querySelector('.ace_content');
                        if (editorContent) return editorContent.textContent;

                        throw new Error('Could not find editor content');
                    } catch (e) {
                        console.error('Editor access error:', e);
                        return null;
                    }
                }
            });

            const content = results?.[0]?.result;
            if (!content) throw new Error('Could not extract code from editor');

            // Hide stages section if visible
            stagesContainer.classList.remove('visible');

            // Show hint section and set loading state
            hintSection.style.display = 'block';
            hintResponse.textContent = 'Getting hint...';

            const payload = {
                actualQuestion: content,
                rules: [
                    "provide only hints with actual code syntaxes only",
                    "give hint which conecpt is used",
                    "give him worl flow like first what to do",
                    "dont use any complex funection unless asked and give resopnse as simple plain text ",
                    "keep it short and think he is very beginer of python so pls give him in very basic verison"
                ]
            };

            const apiUrl = 'https://deep.89determined.workers.dev/gemini-pro/hint';
            const hintApiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!hintApiResponse.ok) throw new Error('Failed to get hint');
            const hintResult = await hintApiResponse.text();
            
            // Clean and display the hint
            const cleanHint = hintResult.replace(/```\w*\n?|```/g, '').trim();
            hintResponse.textContent = cleanHint;
            
            // Automatically show fullscreen hint
            document.getElementById('fullscreenHintContent').innerHTML = cleanHint;
            document.getElementById('fullscreenHintOverlay').style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // Save the updated state
            saveState();

        } catch (error) {
            console.error('Hint error:', error);
            hintSection.style.display = 'block';
            hintResponse.textContent = 'Error: ' + error.message;
            saveState();
        }
    });

    pasteEndBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const content = pasteInput.value.trim();
            if (!content) {
                showPasteFeedback('Please paste some code to insert', false);
                return;
            }

            const injectionResult = await injectContent(tab, content);
            
            if (injectionResult?.[0]?.result) {
                showPasteFeedback('Code pasted successfully!', true);
                pasteInput.value = '';
            } else {
                showPasteFeedback('Failed to paste content', false);
            }

            // Save state after pasting
            saveState();
        } catch (error) {
            console.error('Paste at end error:', error);
            showPasteFeedback(`Error: ${error.message}`, false);
        }
    });

    solveBtn.addEventListener('click', async () => {
        // Hide hint section if visible
        hintSection.style.display = 'none';
        try {
            // Show stages when solve button is clicked
            stagesContainer.classList.add('visible');
            
            extractedContent.textContent = 'Extracting...';
            apiResponse.textContent = 'Waiting...';
            finalStatus.textContent = 'Waiting...';

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error('No active tab found');

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    try {
                        const textLayers = document.querySelectorAll('.ace_text-layer');
                        if (textLayers.length > 0) {
                            let content = '';
                            for (const layer of textLayers) {
                                const lines = Array.from(layer.querySelectorAll('.ace_line'));
                                content = lines.map(line => line.textContent).join('\n');
                            }
                            if (content) return content;
                        }

                        const editorElement = document.querySelector('.vpl_ide_file.ace_editor');
                        if (editorElement && window.ace) {
                            const aceId = editorElement.id;
                            const editor = window.ace.edit(aceId);
                            return editor.getValue();
                        }

                        const editorContent = document.querySelector('.ace_content');
                        if (editorContent) return editorContent.textContent;

                        throw new Error('Could not find editor content');
                    } catch (e) {
                        console.error('Editor access error:', e);
                        return null;
                    }
                }
            });

            const content = results?.[0]?.result;
            if (!content) throw new Error('Could not extract code from editor');

            extractedContent.textContent = content;
            apiResponse.textContent = 'Getting solution...';

            const payload = {
                actualQuestion: content,
                rules: [
                    "and mainly just give only one version of the code, never every give multiple codes",
                    "python code without comments or extra text",
                    "very easiest simple beginner version",
                    "no complex functions when not asked",
                    "normal python without AI syntaxes",
                    
                ]
            };

            const apiUrl = 'https://deep.89determined.workers.dev/gemini-pro';
            const solutionResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!solutionResponse.ok) throw new Error('Solution fetch failed');
            const solutionResult = await solutionResponse.text();

            apiResponse.textContent = 'Getting test cases...';
            const testCaseResponse = await fetch(apiUrl + 'test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!testCaseResponse.ok) throw new Error('Test case fetch failed');
            const testCaseResult = await testCaseResponse.text();

            const combinedResult = solutionResult.trim() + '\n\n' + testCaseResult.trim();
            const cleanResult = combinedResult.replace(/```python\n?|```/g, '');

            const injectionResult = await injectContent(tab, cleanResult);
            if (!injectionResult?.[0]?.result) throw new Error('Failed to inject solution');

            apiResponse.textContent = cleanResult;
            finalStatus.textContent = 'Solved successfully!';
        } catch (error) {
            console.error('Error:', error);
            finalStatus.textContent = 'Error: ' + error.message;
            
            // Keep stages visible to show the error
            stagesContainer.classList.add('visible');
            saveState();
        }
    });
});