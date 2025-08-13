/**
 * AI Approach Chat - Main JavaScript
 * Handles UI interactions, API calls, and chat functionality
 */

// Global state
const state = {
    user: {
        username: window.username || '',
    },
    session: {
        id: '',
        activeConversation: null,
        activeFiles: [],
        chatMode: 'general',
        uiState: {
            theme: 'light',
            sidebarVisible: true,
        }
    },
    files: [],
    conversations: [],
    selectedFiles: [],
    isLoading: false,
    isUploading: false,
};

// DOM Elements
const elements = {
    // Sidebar elements
    sidebar: document.getElementById('sidebar'),
    toggleSidebar: document.getElementById('toggle-sidebar'),
    mobileSidebarToggle: document.getElementById('mobile-sidebar-toggle'),
    fileList: document.getElementById('file-list'),
    conversationList: document.getElementById('conversation-list'),
    uploadFileBtn: document.getElementById('upload-file-btn'),
    fileUploadArea: document.getElementById('file-upload-area'),
    fileUploadForm: document.getElementById('file-upload-form'),
    fileInput: document.getElementById('file-input'),
    cancelUpload: document.getElementById('cancel-upload'),
    uploadProgress: document.getElementById('upload-progress'),
    newConversationBtn: document.getElementById('new-conversation-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    
    // Mode buttons
    modeButtons: {
        general: document.getElementById('mode-general'),
        singleFile: document.getElementById('mode-single'),
        multiFile: document.getElementById('mode-multi'),
        library: document.getElementById('mode-library'),
    },
    
    // Chat area elements
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    sendMessageBtn: document.getElementById('send-message-btn'),
    activeConversationName: document.getElementById('active-conversation-name'),
    // Removed header rename button
    exportConversationBtn: document.getElementById('export-conversation-btn'),
    // Removed header delete button
    clearMessagesBtn: document.getElementById('clear-messages-btn'),
    
    // Selected files
    selectedFiles: document.getElementById('selected-files'),
    selectedFilesList: document.getElementById('selected-files-list'),
    clearSelectedFiles: document.getElementById('clear-selected-files'),
    
    // Modals
    renameModal: document.getElementById('rename-modal'),
    exportModal: document.getElementById('export-modal'),
    confirmModal: document.getElementById('confirm-modal'),
    renameForm: document.getElementById('rename-form'),
    newNameInput: document.getElementById('new-name'),
    exportMarkdown: document.getElementById('export-markdown'),
    exportHtml: document.getElementById('export-html'),
    exportPrint: document.getElementById('export-print'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmAction: document.getElementById('confirm-action'),
};

// Initialize the application
async function init() {
    // Disable automatic redirects to prevent refresh loops
    console.log('Initializing application, current path:', window.location.pathname);
    
    // Skip API calls if we're on the login or register page to prevent infinite loops
    if (window.location.pathname === '/login' || window.location.pathname === '/register') {
        console.log('On authentication page, skipping API initialization');
        return;
    }
    
    // Only proceed with initialization, no redirects
    try {
        // Load session data
        await loadSession();
        
        // Load files and conversations
        await Promise.all([
            loadFiles(),
            loadConversations()
        ]);
        
        // Restore UI state
        restoreUIState();
        
        // Set up event listeners
        setupEventListeners();
        
        // Auto-resize textarea
        setupTextareaAutoResize();
        
        // If there's an active conversation, load it
        if (state.session && state.session.activeConversation) {
            loadConversation(state.session.activeConversation);
        }
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// API Calls
async function api(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`/api/${endpoint}`, options);
        
        if (!response.ok) {
            console.error(`API error: ${response.status} ${response.statusText}`);
            if (response.status === 401) {
                // If unauthorized, redirect to login only if we're not already on an auth page
                if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
                    console.log('Not logged in, redirecting to login page');
                    window.location.href = '/login';
                }
                throw new Error('Not logged in');
            }
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message || 'An error occurred', 'error');
        throw error;
    }
}

// Session Management
async function loadSession() {
    try {
        const result = await api('session');
        if (result.success && result.session) {
            state.session = result.session;
            return result.session;
        } else {
            console.error('Invalid session data received:', result);
            return null;
        }
    } catch (error) {
        console.error('Failed to load session:', error);
        return null;
    }
}

async function updateSession(data) {
    try {
        const result = await api('session', 'PUT', data);
        state.session = result.session;
        return result.session;
    } catch (error) {
        console.error('Failed to update session:', error);
    }
}

// File Management
async function loadFiles() {
    try {
        const result = await api('files');
        state.files = result.files;
        renderFileList();
        return result.files;
    } catch (error) {
        console.error('Failed to load files:', error);
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    state.isUploading = true;
    updateUploadProgress(0);
    showElement(elements.uploadProgress);
    
    try {
        const xhr = new XMLHttpRequest();
        
        // Set up progress tracking
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const progress = Math.round((event.loaded / event.total) * 100);
                updateUploadProgress(progress);
            }
        });
        
        // Set up completion handler
        const uploadPromise = new Promise((resolve, reject) => {
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error || 'Upload failed'));
                        }
                    } catch (e) {
                        reject(new Error('Invalid response from server'));
                    }
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error('Network error during upload'));
            });
            
            xhr.addEventListener('abort', () => {
                reject(new Error('Upload aborted'));
            });
        });
        
        // Send the request
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
        
        // Wait for completion
        const result = await uploadPromise;
        
        // Update file list
        await loadFiles();
        
        // Hide upload form
        hideElement(elements.fileUploadArea);
        hideElement(elements.uploadProgress);
        
        showToast(`File "${result.filename}" uploaded successfully`, 'success');
        return result;
    } catch (error) {
        console.error('Upload failed:', error);
        showToast(error.message || 'Upload failed', 'error');
    } finally {
        state.isUploading = false;
    }
}

async function deleteFile(fileId) {
    try {
        await api(`files/${fileId}`, 'DELETE');
        
        // Remove from selected files if present
        state.selectedFiles = state.selectedFiles.filter(id => id !== fileId);
        
        // Update session if needed
        if (state.session.activeFiles.includes(fileId)) {
            state.session.activeFiles = state.session.activeFiles.filter(id => id !== fileId);
            await updateSession({ active_files: state.session.activeFiles });
        }
        
        // Reload files
        await loadFiles();
        
        // Update selected files display
        renderSelectedFiles();
        
        showToast('File deleted successfully', 'success');
    } catch (error) {
        console.error('Failed to delete file:', error);
    }
}

// Conversation Management
async function loadConversations() {
    try {
        const result = await api('conversations');
        state.conversations = result.conversations;
        renderConversationList();
        return result.conversations;
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

async function createConversation(name = null) {
    try {
        console.log('Creating conversation with name:', name);
        console.log('Selected files before creation:', state.selectedFiles);
        
        // Determine chat mode based on selected files if not already set
        if (!state.session.chatMode || state.session.chatMode === 'general') {
            if (state.selectedFiles.length === 1) {
                state.session.chatMode = 'single_file';
            } else if (state.selectedFiles.length > 1) {
                state.session.chatMode = 'multi_file';
            } else {
                state.session.chatMode = 'general';
            }
            console.log('Updated chat mode based on selection:', state.session.chatMode);
        }
        
        // Include the previous conversation ID to maintain context
        const data = {
            name: name,
            files: state.selectedFiles,
            mode: state.session.chatMode,
            previous_conversation_id: state.session.activeConversation // Pass the current active conversation as the previous one
        };
        
        console.log('Sending conversation creation request with data:', data);
        const result = await api('conversations', 'POST', data);
        console.log('Conversation creation response:', result);
        
        // Update state
        const previousConversationId = state.session.activeConversation;
        state.session.activeConversation = result.conversation_id;
        state.session.activeFiles = state.selectedFiles;
        state.session.previousConversationId = previousConversationId;
        
        // Update session
        await updateSession({
            active_conversation: result.conversation_id,
            active_files: state.selectedFiles,
            chat_mode: state.session.chatMode,
            previous_conversation_id: previousConversationId
        });
        
        // Update UI to reflect the chat mode
        updateChatModeUI(state.session.chatMode);
        
        // Just reload the conversations list without loading the conversation (which would clear messages)
        await loadConversations();
        
        // Update UI elements without reloading the entire conversation
        elements.activeConversationName.textContent = result.name || 'New Conversation';
        
        return result.conversation_id;
    } catch (error) {
        console.error('Failed to create conversation:', error);
        showToast('Failed to create conversation. Please try again.', 'error');
    }
}

async function loadConversation(conversationId) {
    try {
        const result = await api(`conversations/${conversationId}`);
        const conversation = result.conversation;
        
        // Update UI
        elements.activeConversationName.textContent = conversation.name;
        renderMessages(conversation.messages);
        
        // Update selected files based on conversation
        state.selectedFiles = conversation.files;
        renderSelectedFiles();
        
        // Update chat mode
        state.session.chatMode = conversation.mode;
        updateChatModeUI(conversation.mode);
        
        // Update active conversation in session
        if (state.session.activeConversation !== conversationId) {
            state.session.activeConversation = conversationId;
            await updateSession({ active_conversation: conversationId });
        }
        
        // Mark as active in the conversation list
        const conversationItems = document.querySelectorAll('.conversation-item');
        conversationItems.forEach(item => {
            item.classList.toggle('active', item.dataset.id === conversationId);
        });
        
        return conversation;
    } catch (error) {
        console.error('Failed to load conversation:', error);
    }
}

async function renameConversation(conversationId, newName) {
    try {
        await api(`conversations/${conversationId}`, 'PUT', { name: newName });
        
        // Update UI
        elements.activeConversationName.textContent = newName;
        
        // Reload conversations
        await loadConversations();
        
        showToast('Conversation renamed successfully', 'success');
    } catch (error) {
        console.error('Failed to rename conversation:', error);
    }
}

async function deleteConversation(conversationId) {
    try {
        console.log('Deleting conversation:', conversationId);
        await api(`conversations/${conversationId}`, 'DELETE');
        
        // Clear chat area if this was the active conversation
        if (state.session.activeConversation === conversationId) {
            // Reset state
            state.session.activeConversation = null;
            state.selectedFiles = [];
            
            // Update UI
            elements.activeConversationName.textContent = 'New Conversation';
            renderSelectedFiles();
            
            // Reset chat messages to welcome screen
            elements.chatMessages.innerHTML = `
                <div class="welcome-message">
                    <h2>Welcome to AI Approach Chat</h2>
                    <p>Upload files and start a conversation to get AI-powered responses based on your documents.</p>
                    <div class="welcome-instructions">
                        <div class="instruction">
                            <i class="fas fa-upload"></i>
                            <p>Upload PDF, Word, or PowerPoint files</p>
                        </div>
                        <div class="instruction">
                            <i class="fas fa-comments"></i>
                            <p>Choose a chat mode</p>
                        </div>
                        <div class="instruction">
                            <i class="fas fa-question-circle"></i>
                            <p>Ask questions about your documents</p>
                        </div>
                    </div>
                </div>
            `;
            
            // Update session state on the server
            await updateSessionState({
                activeConversation: null,
                selectedFiles: []
            });
        }
        
        // Reload conversations
        await loadConversations();
        
        showToast('Conversation deleted successfully', 'success');
    } catch (error) {
        console.error('Failed to delete conversation:', error);
        showToast('Failed to delete conversation', 'error');
    }
}

async function exportConversation(conversationId, format) {
    try {
        const result = await api(`conversations/${conversationId}/export?format=${format}`);
        return result.content;
    } catch (error) {
        console.error('Failed to export conversation:', error);
    }
}

async function sendMessage(conversationId, message) {
    try {
        console.log('Sending message, conversationId:', conversationId);
        console.log('Selected files:', state.selectedFiles);
        console.log('Chat mode:', state.session.chatMode);
        
        let isNewConversation = false;
        
        // If no active conversation, create one
        if (!conversationId) {
            console.log('Creating new conversation with selected files:', state.selectedFiles);
            conversationId = await createConversation();
            if (!conversationId) {
                console.error('Failed to create conversation');
                throw new Error('Failed to create conversation');
            }
            console.log('Created new conversation:', conversationId);
            isNewConversation = true;
            
            // Update state with the new conversation ID
            state.session.activeConversation = conversationId;
        }
        
        // Add user message to UI immediately
        addMessageToUI({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });
        
        // Clear input
        elements.chatInput.value = '';
        elements.chatInput.style.height = 'auto';
        
        // Show loading indicator
        const loadingMessage = addLoadingMessageToUI();
        
        // Send message to server
        const result = await api(`conversations/${conversationId}/message`, 'POST', { message });
        
        // Remove loading indicator
        loadingMessage.remove();
        
        // Add assistant message to UI
        addMessageToUI({
            role: 'assistant',
            content: result.response,
            timestamp: new Date().toISOString()
        });
        
        // Update conversation name if it changed
        if (result.conversation.name !== elements.activeConversationName.textContent) {
            elements.activeConversationName.textContent = result.conversation.name;
            await loadConversations();
        }
        
        // If this was a new conversation, we need to update the UI to show it's now active
        if (isNewConversation) {
            // Mark as active in the conversation list without reloading the entire conversation
            const conversationItems = document.querySelectorAll('.conversation-item');
            conversationItems.forEach(item => {
                item.classList.toggle('active', item.dataset.id === conversationId);
            });
        }
        
        // Handle RTL if needed
        if (result.language && result.language.is_rtl) {
            document.body.classList.add('rtl');
        } else {
            document.body.classList.remove('rtl');
        }
        
        return result;
    } catch (error) {
        console.error('Failed to send message:', error);
        showToast('Failed to send message', 'error');
    }
}

// UI Functions

// Render file list
function renderFileList() {
    const fileList = elements.fileList;
    
    if (!state.files || state.files.length === 0) {
        fileList.innerHTML = '<div class="empty-message">No files uploaded yet</div>';
        return;
    }
    
    fileList.innerHTML = '';
    
    state.files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.id = file.file_id;
        
        if (state.selectedFiles.includes(file.file_id)) {
            fileItem.classList.add('selected');
        }
        
        // Determine icon based on file extension
        let icon = 'fa-file';
        if (file.extension === '.pdf') {
            icon = 'fa-file-pdf';
        } else if (file.extension === '.docx') {
            icon = 'fa-file-word';
        } else if (file.extension === '.pptx') {
            icon = 'fa-file-powerpoint';
        }
        
        fileItem.innerHTML = `
            <div class="file-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="file-name" title="${file.filename}">${file.filename}</div>
            <div class="file-actions">
                <button class="btn-icon delete-file" title="Delete File">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        fileItem.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-file')) {
                toggleFileSelection(file.file_id);
            }
        });
        
        const deleteBtn = fileItem.querySelector('.delete-file');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showConfirmModal(
                'Delete File',
                `Are you sure you want to delete "${file.filename}"?`,
                () => deleteFile(file.file_id)
            );
        });
        
        fileList.appendChild(fileItem);
    });
}

// Render conversation list
function renderConversationList() {
    const conversationList = elements.conversationList;
    
    if (!state.conversations || state.conversations.length === 0) {
        conversationList.innerHTML = '<div class="empty-message">No conversations yet</div>';
        return;
    }
    
    conversationList.innerHTML = '';
    
    // Sort conversations by updated_at (newest first)
    const sortedConversations = [...state.conversations].sort((a, b) => {
        return new Date(b.updated_at) - new Date(a.updated_at);
    });
    
    sortedConversations.forEach(conversation => {
        const conversationItem = document.createElement('div');
        conversationItem.className = 'conversation-item';
        conversationItem.dataset.id = conversation.id;
        
        if (state.session.activeConversation === conversation.id) {
            conversationItem.classList.add('active');
        }
        
        // Determine icon based on mode
        let icon = 'fa-comments';
        if (conversation.mode === 'single_file') {
            icon = 'fa-file-alt';
        } else if (conversation.mode === 'multi_file') {
            icon = 'fa-copy';
        } else if (conversation.mode === 'full_library') {
            icon = 'fa-book';
        }
        
        conversationItem.innerHTML = `
            <div class="conversation-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="conversation-name" title="${conversation.name}">${conversation.name}</div>
            <div class="conversation-actions">
                <button class="action-btn rename-btn" title="Rename conversation">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete-btn" title="Delete conversation">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listener for clicking on the conversation (load conversation)
        conversationItem.addEventListener('click', (e) => {
            // Only load the conversation if the click wasn't on an action button
            if (!e.target.closest('.action-btn')) {
                loadConversation(conversation.id);
            }
        });
        
        // Add event listeners for action buttons
        const renameBtn = conversationItem.querySelector('.rename-btn');
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the conversation from being loaded
            const newName = prompt('Enter a new name for this conversation:', conversation.name);
            if (newName && newName.trim() !== '') {
                renameConversation(conversation.id, newName.trim());
            }
        });
        
        const deleteBtn = conversationItem.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the conversation from being loaded
            if (confirm('Are you sure you want to delete this conversation?')) {
                deleteConversation(conversation.id);
            }
        });
        
        conversationList.appendChild(conversationItem);
    });
}

// Render messages
function renderMessages(messages) {
    const chatMessages = elements.chatMessages;
    
    if (!messages || messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="welcome-message">
                <h2>Start a New Conversation</h2>
                <p>Type a message below to begin chatting.</p>
            </div>
        `;
        return;
    }
    
    chatMessages.innerHTML = '';
    
    messages.forEach(message => {
        addMessageToUI(message, false);
    });
    
    // Scroll to bottom
    scrollToBottom();
}

// Add a message to the UI
function addMessageToUI(message, shouldScroll = true) {
    const chatMessages = elements.chatMessages;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${message.role}`;
    
    // Format timestamp
    const timestamp = new Date(message.timestamp);
    const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create message structure
    if (message.role === 'user') {
        // User messages are displayed immediately
        messageElement.innerHTML = `
            <div class="message-content">
                ${message.content}
            </div>
            <div class="message-meta">
                <span class="message-time">${formattedTime}</span>
                <span class="message-role">You</span>
            </div>
        `;
    } else {
        // Assistant messages get the typing effect
        // First create the structure with empty content
        const formattedContent = marked.parse(message.content);
        messageElement.innerHTML = `
            <div class="message-content markdown-content">
                ${formattedContent}
            </div>
            <div class="message-meta">
                <span class="message-time">${formattedTime}</span>
                <span class="message-role">AI</span>
            </div>
        `;
        
        // Add a data attribute to track if typing effect has been applied
        messageElement.dataset.typingApplied = 'false';
    }
    
    chatMessages.appendChild(messageElement);
    
    // Apply syntax highlighting to code blocks
    if (message.role === 'assistant') {
        messageElement.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
        
        // Apply typing effect only for new messages (not when loading conversation history)
        if (shouldScroll) {
            const markdownContent = messageElement.querySelector('.markdown-content');
            applyTypingEffectToMarkdown(markdownContent);
        }
    }
    
    if (shouldScroll) {
        scrollToBottom();
    }
    
    return messageElement;
}

// Add loading message to UI
function addLoadingMessageToUI() {
    const chatMessages = elements.chatMessages;
    
    const loadingElement = document.createElement('div');
    loadingElement.className = 'message message-assistant loading';
    
    loadingElement.innerHTML = `
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(loadingElement);
    scrollToBottom();
    
    return loadingElement;
}

// Render selected files
function renderSelectedFiles() {
    const selectedFiles = elements.selectedFiles;
    const selectedFilesList = elements.selectedFilesList;
    
    if (!state.selectedFiles || state.selectedFiles.length === 0) {
        hideElement(selectedFiles);
        return;
    }
    
    showElement(selectedFiles);
    selectedFilesList.innerHTML = '';
    
    state.selectedFiles.forEach(fileId => {
        const file = state.files.find(f => f.file_id === fileId);
        if (!file) return;
        
        const fileElement = document.createElement('div');
        fileElement.className = 'selected-file-badge';
        fileElement.innerHTML = `
            <span>${file.filename}</span>
            <i class="fas fa-times remove-file" data-id="${fileId}"></i>
        `;
        
        const removeBtn = fileElement.querySelector('.remove-file');
        removeBtn.addEventListener('click', () => {
            toggleFileSelection(fileId);
        });
        
        selectedFilesList.appendChild(fileElement);
    });
}

// Toggle file selection
function toggleFileSelection(fileId) {
    console.log('Toggling file selection for:', fileId);
    const index = state.selectedFiles.indexOf(fileId);
    
    if (index === -1) {
        // Add file to selection
        state.selectedFiles.push(fileId);
        console.log('Added file to selection, now selected:', state.selectedFiles);
    } else {
        // Remove file from selection
        state.selectedFiles.splice(index, 1);
        console.log('Removed file from selection, now selected:', state.selectedFiles);
    }
    
    // Update UI
    renderFileList();
    renderSelectedFiles();
    
    // Update chat mode based on selection
    updateChatMode();
    
    // If we're in a new conversation (no active conversation), update the session
    // to store the selected files for when a message is sent
    if (!state.session.activeConversation) {
        updateSession({
            active_files: state.selectedFiles
        });
    }
}

// Update chat mode based on selected files
function updateChatMode() {
    let mode = 'general';
    
    if (state.selectedFiles.length === 1) {
        mode = 'single_file';
    } else if (state.selectedFiles.length > 1) {
        mode = 'multi_file';
    }
    
    state.session.chatMode = mode;
    updateChatModeUI(mode);
    
    // Update session
    updateSession({ chat_mode: mode });
}

// Update chat mode UI
function updateChatModeUI(mode) {
    // Remove active class from all mode buttons
    Object.values(elements.modeButtons).forEach(button => {
        button.classList.remove('active');
    });
    
    // Add active class to the selected mode button
    switch (mode) {
        case 'general':
            elements.modeButtons.general.classList.add('active');
            break;
        case 'single_file':
            elements.modeButtons.singleFile.classList.add('active');
            break;
        case 'multi_file':
            elements.modeButtons.multiFile.classList.add('active');
            break;
        case 'full_library':
            elements.modeButtons.library.classList.add('active');
            break;
    }
}

// Update upload progress
function updateUploadProgress(progress) {
    const progressBar = elements.uploadProgress.querySelector('.progress-bar');
    const progressText = elements.uploadProgress.querySelector('.progress-text');
    
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `Uploading... ${progress}%`;
}

// Restore UI state
function restoreUIState() {
    // Set theme
    if (state.session.uiState && state.session.uiState.theme === 'dark') {
        document.body.classList.add('dark-theme');
        elements.themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
    }
    
    // Set sidebar visibility
    if (state.session.uiState && !state.session.uiState.sidebarVisible) {
        document.body.classList.add('sidebar-hidden');
    }
    
    // Set selected files
    state.selectedFiles = state.session.activeFiles || [];
    renderSelectedFiles();
    
    // Set chat mode
    updateChatModeUI(state.session.chatMode);
}

// Setup event listeners
function setupEventListeners() {
    // Toggle sidebar button
    elements.toggleSidebar.addEventListener('click', toggleSidebar);
    elements.mobileSidebarToggle.addEventListener('click', toggleSidebar);
    
    // Show sidebar button (when sidebar is hidden)
    elements.showSidebarBtn = document.getElementById('show-sidebar-btn');
    if (elements.showSidebarBtn) {
        elements.showSidebarBtn.addEventListener('click', () => {
            if (document.body.classList.contains('sidebar-hidden')) {
                toggleSidebar();
            }
        });
    }
    
    // Theme toggle
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
    
    // File upload
    elements.uploadFileBtn.addEventListener('click', () => {
        showElement(elements.fileUploadArea);
    });
    
    elements.cancelUpload.addEventListener('click', () => {
        hideElement(elements.fileUploadArea);
    });
    
    elements.fileUploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!elements.fileInput.files[0]) return;
        uploadFile(elements.fileInput.files[0]);
    });
    
    // Clear selected files
    elements.clearSelectedFiles.addEventListener('click', () => {
        state.selectedFiles = [];
        renderFileList();
        renderSelectedFiles();
        updateChatMode();
    });
    
    // Chat mode selection
    Object.entries(elements.modeButtons).forEach(([mode, button]) => {
        button.addEventListener('click', () => {
            let chatMode;
            switch (mode) {
                case 'general':
                    chatMode = 'general';
                    break;
                case 'singleFile':
                    chatMode = 'single_file';
                    break;
                case 'multiFile':
                    chatMode = 'multi_file';
                    break;
                case 'library':
                    chatMode = 'full_library';
                    break;
            }
            
            state.session.chatMode = chatMode;
            updateChatModeUI(chatMode);
            updateSession({ chat_mode: chatMode });
        });
    });
    
    // New conversation
    elements.newConversationBtn.addEventListener('click', () => {
        state.session.activeConversation = null;
        elements.activeConversationName.textContent = 'New Conversation';
        elements.chatMessages.innerHTML = `
            <div class="welcome-message">
                <h2>Start a New Conversation</h2>
                <p>Type a message below to begin chatting.</p>
            </div>
        `;
        
        // Update session
        updateSession({ active_conversation: null });
        
        // Update conversation list
        const conversationItems = document.querySelectorAll('.conversation-item');
        conversationItems.forEach(item => {
            item.classList.remove('active');
        });
    });
    
    // Send message
    elements.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = elements.chatInput.value.trim();
        if (!message) return;
        
        sendMessage(state.session.activeConversation, message);
    });
    
    // Handle Enter and Shift+Enter in chat input
    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // If Shift+Enter, allow new line
            if (e.shiftKey) {
                return; // Default behavior (new line)
            } else {
                // If just Enter, send the message
                e.preventDefault();
                const message = elements.chatInput.value.trim();
                if (!message) return;
                
                sendMessage(state.session.activeConversation, message);
            }
        }
    });
    
    // Rename conversation functionality moved to sidebar conversation items
    
    elements.renameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = elements.newNameInput.value.trim();
        if (!newName) return;
        
        renameConversation(state.session.activeConversation, newName);
        hideModal(elements.renameModal);
    });
    
    // Export conversation
    elements.exportConversationBtn.addEventListener('click', () => {
        console.log('Export button clicked, active conversation:', state.session.activeConversation);
        
        // If we already have an active conversation, just show the export modal
        if (state.session.activeConversation) {
            showModal(elements.exportModal);
            return;
        }
        
        // Check if we have messages even if no active conversation is set
        const hasMessages = elements.chatMessages.querySelectorAll('.message').length > 0;
        
        // If we have messages but no conversation ID, create one first
        if (hasMessages) {
            showToast('Creating conversation first...', 'info');
            createConversation().then(conversationId => {
                if (conversationId) {
                    showModal(elements.exportModal);
                }
            }).catch(error => {
                console.error('Failed to create conversation:', error);
                showToast('Failed to create conversation', 'error');
            });
            return;
        }
        
        // For empty chats with no conversation ID, create one first
        showToast('Creating conversation first...', 'info');
        createConversation().then(conversationId => {
            if (conversationId) {
                showModal(elements.exportModal);
            }
        }).catch(error => {
            console.error('Failed to create conversation:', error);
            showToast('Failed to create conversation', 'error');
        });
    });
    
    elements.exportMarkdown.addEventListener('click', async () => {
        const content = await exportConversation(state.session.activeConversation, 'markdown');
        if (content) {
            downloadFile(`${elements.activeConversationName.textContent}.md`, content);
        }
        hideModal(elements.exportModal);
    });
    
    elements.exportHtml.addEventListener('click', async () => {
        const content = await exportConversation(state.session.activeConversation, 'html');
        if (content) {
            downloadFile(`${elements.activeConversationName.textContent}.html`, content);
        }
        hideModal(elements.exportModal);
    });
    
    elements.exportPrint.addEventListener('click', async () => {
        const content = await exportConversation(state.session.activeConversation, 'html');
        if (content) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>${elements.activeConversationName.textContent}</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; }
                        h1, h2 { margin-bottom: 10px; }
                        p { margin-bottom: 10px; }
                    </style>
                </head>
                <body>
                    ${content}
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        }
        hideModal(elements.exportModal);
    });
    
    // Delete conversation functionality moved to sidebar conversation items
    
    // Clear messages
    elements.clearMessagesBtn.addEventListener('click', () => {
        console.log('Clear messages button clicked, active conversation:', state.session.activeConversation);
        
        // Clear the chat messages
        elements.chatMessages.innerHTML = `
            <div class="welcome-message">
                <h2>Start a New Conversation</h2>
                <p>Type a message below to begin chatting.</p>
            </div>
        `;
        
        // If we have an active conversation, we'll keep its ID but clear the messages
        // This ensures the conversation remains deletable
        if (state.session.activeConversation) {
            showToast('Chat cleared', 'success');
        } else {
            // For new/empty chats, reset everything
            elements.activeConversationName.textContent = 'New Conversation';
            state.selectedFiles = [];
            renderSelectedFiles();
            showToast('Chat cleared', 'success');
        }
    });
    
    // Delete all empty chats button
    elements.deleteEmptyChatsBtn = document.getElementById('delete-empty-chats-btn');
    if (elements.deleteEmptyChatsBtn) {
        elements.deleteEmptyChatsBtn.addEventListener('click', () => {
            showConfirmModal(
                'Delete All Empty Chats',
                'Are you sure you want to delete all empty chats? This action cannot be undone.',
                deleteAllEmptyChats
            );
        });
    }
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            hideAllModals();
        });
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideAllModals();
        }
    });
    
    // Escape key to close modals
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideAllModals();
        }
    });
}

// Reset the chat UI to initial state
function resetChatUI() {
    // Clear the chat messages
    elements.chatMessages.innerHTML = `
        <div class="welcome-message">
            <h2>Start a New Conversation</h2>
            <p>Type a message below to begin chatting.</p>
        </div>
    `;
    
    // Reset conversation name
    elements.activeConversationName.textContent = 'New Conversation';
    
    // Reset selected files
    state.selectedFiles = [];
    renderSelectedFiles();
    
    // Reset state
    state.session.activeConversation = null;
    
    // Update session state on the server
    updateSessionState({
        activeConversation: null,
        selectedFiles: []
    }).catch(error => {
        console.error('Failed to update session state:', error);
    });
    
    // Show toast
    showToast('Chat reset', 'success');
}

// Setup textarea auto-resize
function setupTextareaAutoResize() {
    elements.chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
}

// Toggle sidebar
function toggleSidebar() {
    const isVisible = !document.body.classList.toggle('sidebar-hidden');
    state.session.uiState.sidebarVisible = isVisible;
    updateSession({ ui_state: { sidebarVisible: isVisible } });
}

// Toggle theme
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    state.session.uiState.theme = isDark ? 'dark' : 'light';
    
    // Update button text
    if (isDark) {
        elements.themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
    } else {
        elements.themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
    }
    
    updateSession({ ui_state: { theme: state.session.uiState.theme } });
}

// Show/hide elements
function showElement(element) {
    element.classList.remove('hidden');
}

function hideElement(element) {
    element.classList.add('hidden');
}

// Modal functions
function showModal(modal) {
    hideAllModals();
    showElement(modal);
}

function hideModal(modal) {
    hideElement(modal);
}

function hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        hideElement(modal);
    });
}

function showConfirmModal(title, message, onConfirm) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    
    // Remove previous event listener
    const newConfirmBtn = elements.confirmAction.cloneNode(true);
    elements.confirmAction.parentNode.replaceChild(newConfirmBtn, elements.confirmAction);
    elements.confirmAction = newConfirmBtn;
    
    // Add new event listener
    elements.confirmAction.addEventListener('click', () => {
        onConfirm();
        hideModal(elements.confirmModal);
    });
    
    showModal(elements.confirmModal);
}

// Toast notification
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Add to DOM
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Download file
function downloadFile(filename, content) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Scroll to bottom of chat
function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Delete all empty chats from the conversation list
async function deleteAllEmptyChats() {
    try {
        showToast('Deleting all empty chats...', 'info');
        
        // Get all conversations index
        const conversationsIndex = await api('conversations');
        
        if (!conversationsIndex || !conversationsIndex.conversations || conversationsIndex.conversations.length === 0) {
            showToast('No conversations to delete', 'info');
            return;
        }
        
        // Get full conversation data for each conversation
        const emptyConversations = [];
        
        // Check each conversation by fetching its full data
        for (const conv of conversationsIndex.conversations) {
            try {
                // Get full conversation data including messages
                const fullConversation = await api(`conversations/${conv.id}`);
                
                // Check if it's empty (no messages or only system messages)
                if (!fullConversation.conversation.messages || 
                    fullConversation.conversation.messages.length === 0 || 
                    (fullConversation.conversation.messages.length === 1 && 
                     fullConversation.conversation.messages[0].role === 'system')) {
                    
                    emptyConversations.push(conv);
                    console.log(`Found empty chat: ${conv.name} (${conv.id})`);
                }
            } catch (err) {
                console.error(`Error checking conversation ${conv.id}:`, err);
            }
        }
        
        if (emptyConversations.length === 0) {
            showToast('No empty chats found', 'info');
            return;
        }
        
        console.log(`Found ${emptyConversations.length} empty chats to delete`);
        
        // Delete each empty conversation
        for (const conv of emptyConversations) {
            try {
                await api(`conversations/${conv.id}`, 'DELETE');
                console.log(`Deleted conversation: ${conv.id}`);
            } catch (err) {
                console.error(`Error deleting conversation ${conv.id}:`, err);
            }
        }
        
        // Reload conversations
        await loadConversations();
        
        // If the active conversation was deleted, reset the UI
        if (emptyConversations.some(conv => conv.id === state.session.activeConversation)) {
            resetChatUI();
        }
        
        showToast(`Deleted ${emptyConversations.length} empty chat(s)`, 'success');
    } catch (error) {
        console.error('Failed to delete empty chats:', error);
        showToast('Failed to delete empty chats', 'error');
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
