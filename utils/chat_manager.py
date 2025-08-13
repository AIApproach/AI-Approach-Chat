"""
Chat manager utilities for AI Approach Chat.
Handles chat interactions with the Gemini API and conversation management.
"""
import os
import json
import uuid
import pickle
import google.generativeai as genai
from datetime import datetime
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationChain
from langchain.schema import HumanMessage, AIMessage, SystemMessage

class ChatManager:
    def __init__(self, base_path, api_key, file_processor, vector_store):
        """Initialize the chat manager with base paths and dependencies."""
        self.base_path = base_path
        self.conversations_dir = os.path.join(base_path, 'data', 'conversations')
        self.memories_dir = os.path.join(base_path, 'data', 'memories')
        self.file_processor = file_processor
        self.vector_store = vector_store
        
        # Ensure directories exist
        os.makedirs(self.conversations_dir, exist_ok=True)
        os.makedirs(self.memories_dir, exist_ok=True)
        
        # Initialize Gemini API
        genai.configure(api_key=api_key)
        # Use the gemini-2.0-flash model as requested
        print("Using gemini-2.0-flash model as requested")
        try:
            # Try to initialize the model
            self.model = genai.GenerativeModel('gemini-2.0-flash')
        except Exception as e:
            print(f"Error initializing gemini-2.0-flash model: {e}")
            # Try to find a suitable fallback model
            try:
                # List available models
                print("Listing available Gemini models for fallback...")
                models = genai.list_models()
                model_names = [model.name for model in models]
                print(f"Available models: {model_names}")
                
                # Look for models with 'flash' in the name as they tend to be faster
                flash_models = [m for m in model_names if 'flash' in m.lower()]
                if flash_models:
                    selected_model = flash_models[0]
                    print(f"Selected flash model: {selected_model}")
                    self.model = genai.GenerativeModel(selected_model)
                else:
                    # Use any available Gemini model
                    gemini_models = [m for m in model_names if 'gemini' in m.lower()]
                    if gemini_models:
                        selected_model = gemini_models[0]
                        print(f"Selected gemini model: {selected_model}")
                        self.model = genai.GenerativeModel(selected_model)
                    else:
                        # Last resort fallback
                        print("No Gemini models found, using fallback model name")
                        self.model = genai.GenerativeModel('gemini-1.5-flash')
            except Exception as e2:
                print(f"Error finding fallback model: {e2}")
                # Hardcoded fallback
                self.model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Load conversations index
        self.conversations_index_path = os.path.join(self.conversations_dir, 'index.json')
        if os.path.exists(self.conversations_index_path):
            with open(self.conversations_index_path, 'r') as f:
                self.conversations_index = json.load(f)
        else:
            self.conversations_index = {}
            self._save_conversations_index()
        
        # Active conversation memories
        self.active_memories = {}
        
        # Load any existing memories
        self._load_all_memories()

    def _save_conversations_index(self):
        """Save the conversations index to JSON file."""
        with open(self.conversations_index_path, 'w') as f:
            json.dump(self.conversations_index, f, indent=2)
            
    def _get_memory_path(self, conversation_id):
        """Get the file path for a conversation's memory."""
        return os.path.join(self.memories_dir, f"{conversation_id}.pkl")
        
    def _save_memory(self, conversation_id):
        """Save a conversation's memory to disk."""
        if conversation_id in self.active_memories:
            memory_path = self._get_memory_path(conversation_id)
            with open(memory_path, 'wb') as f:
                pickle.dump(self.active_memories[conversation_id], f)
                
    def _load_memory(self, conversation_id):
        """Load a conversation's memory from disk."""
        memory_path = self._get_memory_path(conversation_id)
        if os.path.exists(memory_path):
            try:
                with open(memory_path, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                print(f"Error loading memory for conversation {conversation_id}: {e}")
        return None
        
    def _load_all_memories(self):
        """Load all saved memories into active_memories."""
        if not os.path.exists(self.memories_dir):
            return
            
        for filename in os.listdir(self.memories_dir):
            if filename.endswith('.pkl'):
                conversation_id = filename.split('.')[0]
                memory = self._load_memory(conversation_id)
                if memory:
                    self.active_memories[conversation_id] = memory

    def _generate_conversation_id(self):
        """Generate a unique conversation ID."""
        return str(uuid.uuid4())

    def _get_conversation_path(self, conversation_id):
        """Get the file path for a conversation."""
        return os.path.join(self.conversations_dir, f"{conversation_id}.json")

    def create_conversation(self, username, name=None, files=None, mode="general", previous_conversation_id=None):
        """
        Create a new conversation.
        
        Args:
            username: Username of the conversation owner
            name: Optional name for the conversation
            files: Optional list of file IDs associated with the conversation
            mode: Chat mode (general, single_file, multi_file, full_library)
            previous_conversation_id: Optional ID of a previous conversation to inherit memory from
            
        Returns:
            Conversation ID
        """
        conversation_id = self._generate_conversation_id()
        
        conversation = {
            'id': conversation_id,
            'username': username,
            'name': name or "New Conversation",
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'mode': mode,
            'files': files or [],
            'messages': [],
            'previous_conversation_id': previous_conversation_id  # Track the previous conversation for context
        }
        
        # Save conversation
        with open(self._get_conversation_path(conversation_id), 'w') as f:
            json.dump(conversation, f, indent=2)
        
        # Update index
        if username not in self.conversations_index:
            self.conversations_index[username] = []
        
        self.conversations_index[username].append({
            'id': conversation_id,
            'name': conversation['name'],
            'created_at': conversation['created_at'],
            'updated_at': conversation['updated_at'],
            'mode': mode,
            'files': files or [],
            'previous_conversation_id': previous_conversation_id
        })
        
        self._save_conversations_index()
        
        # Initialize memory for this conversation
        memory = None
        
        # If there's a previous conversation, inherit its memory
        if previous_conversation_id:
            memory = self._inherit_memory_from_conversation(previous_conversation_id)
        
        # If no memory was inherited, create a new one
        if not memory:
            memory = ConversationBufferMemory(return_messages=True)
        
        # If files are provided, add file information to memory as system message
        if files and (mode == 'single_file' or mode == 'multi_file'):
            file_info = self._get_file_information(files)
            if file_info:
                system_message = f"This conversation includes the following files: {file_info}"
                memory.chat_memory.add_message(SystemMessage(content=system_message))
        
        self.active_memories[conversation_id] = memory
        
        # Save memory to disk
        self._save_memory(conversation_id)
        
        return conversation_id
        
    def _inherit_memory_from_conversation(self, conversation_id):
        """Inherit memory from another conversation to maintain context."""
        # Get the memory from the previous conversation
        previous_memory = self._get_or_create_memory(conversation_id)
        
        if previous_memory:
            # Create a new memory instance with the messages from the previous conversation
            new_memory = ConversationBufferMemory(return_messages=True)
            
            # Copy all messages from the previous memory
            for message in previous_memory.chat_memory.messages:
                new_memory.chat_memory.messages.append(message)
                
            return new_memory
            
        return None
        
    def _get_file_information(self, file_ids):
        """Get summary information about files to include in memory."""
        if not file_ids:
            return ""
            
        file_info = []
        for file_id in file_ids:
            metadata = self.file_processor.get_file_metadata(file_id)
            if metadata:
                file_info.append(f"{metadata['filename']} (ID: {file_id})")
                
        return ", ".join(file_info)

    def get_conversation(self, conversation_id):
        """Get a conversation by ID."""
        conversation_path = self._get_conversation_path(conversation_id)
        if os.path.exists(conversation_path):
            with open(conversation_path, 'r') as f:
                return json.load(f)
        return None

    def get_user_conversations(self, username):
        """Get all conversations for a user."""
        if username in self.conversations_index:
            return self.conversations_index[username]
        return []

    def update_conversation_name(self, conversation_id, new_name):
        """Update the name of a conversation."""
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            return False
        
        conversation['name'] = new_name
        conversation['updated_at'] = datetime.now().isoformat()
        
        # Save conversation
        with open(self._get_conversation_path(conversation_id), 'w') as f:
            json.dump(conversation, f, indent=2)
        
        # Update index
        username = conversation['username']
        for conv in self.conversations_index[username]:
            if conv['id'] == conversation_id:
                conv['name'] = new_name
                conv['updated_at'] = conversation['updated_at']
                break
        
        self._save_conversations_index()
        return True

    def delete_conversation(self, conversation_id):
        """Delete a conversation."""
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            return False
        
        # Delete conversation file
        conversation_path = self._get_conversation_path(conversation_id)
        if os.path.exists(conversation_path):
            os.remove(conversation_path)
        
        # Update index
        username = conversation['username']
        if username in self.conversations_index:
            self.conversations_index[username] = [
                conv for conv in self.conversations_index[username] 
                if conv['id'] != conversation_id
            ]
            self._save_conversations_index()
        
        # Remove from active memories
        if conversation_id in self.active_memories:
            del self.active_memories[conversation_id]
        
        return True

    def _get_or_create_memory(self, conversation_id):
        """Get or create memory for a conversation."""
        # First try to load from active memories
        if conversation_id in self.active_memories:
            return self.active_memories[conversation_id]
            
        # Then try to load from disk
        memory = self._load_memory(conversation_id)
        if memory:
            self.active_memories[conversation_id] = memory
            return memory
            
        # If not found, create new memory and load conversation history
        conversation = self.get_conversation(conversation_id)
        if conversation:
            # Create memory with return_messages=True to get the full message objects
            memory = ConversationBufferMemory(return_messages=True)
            
            # Add file information as system message if applicable
            if conversation['files'] and (conversation['mode'] == 'single_file' or 
                                         conversation['mode'] == 'multi_file' or
                                         conversation['mode'] == 'full_library'):
                file_info = self._get_file_information(conversation['files'])
                if file_info:
                    system_message = f"This conversation includes the following files: {file_info}"
                    memory.chat_memory.add_message(SystemMessage(content=system_message))
            
            # Add conversation history to memory
            for message in conversation['messages']:
                if message['role'] == 'user':
                    memory.chat_memory.add_user_message(message['content'])
                elif message['role'] == 'assistant':
                    memory.chat_memory.add_ai_message(message['content'])
                    
            self.active_memories[conversation_id] = memory
            # Save to disk
            self._save_memory(conversation_id)
            return memory
        else:
            # Create new empty memory if conversation not found
            memory = ConversationBufferMemory(return_messages=True)
            self.active_memories[conversation_id] = memory
            return memory

    def _get_relevant_chunks(self, query, conversation_id, top_k=5):
        """
        Get relevant chunks based on the conversation mode.
        
        Returns:
            List of chunk contents with metadata
        """
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            return []
        
        mode = conversation['mode']
        file_ids = conversation['files']
        
        if mode == 'general':
            # No chunks needed for general chat
            return []
        
        elif mode == 'single_file' or mode == 'multi_file':
            # Use specified files
            if not file_ids:
                return []
            
            search_results = self.vector_store.search(query, top_k=top_k, file_ids=file_ids)
            
        elif mode == 'full_library':
            # Search across all files for the user
            search_results = self.vector_store.search(query, top_k=top_k)
            
        else:
            return []
        
        # Get chunk contents
        chunks_with_content = []
        for result in search_results:
            chunk_id = result['chunk_id']
            file_id = result['file_id']
            
            # Get file metadata
            file_metadata = self.file_processor.get_file_metadata(file_id)
            if not file_metadata:
                continue
            
            # Get chunks
            chunks = self.file_processor.get_chunks(file_id)
            if not chunks:
                continue
            
            # Find the specific chunk
            for chunk in chunks:
                if chunk['chunk_id'] == chunk_id:
                    chunks_with_content.append({
                        'content': chunk['content'],
                        'file_id': file_id,
                        'filename': file_metadata['filename'],
                        'page': chunk['page'],
                        'chunk_id': chunk_id,
                        'score': result['score']
                    })
                    break
        
        return chunks_with_content

    def _format_chunks_for_context(self, chunks):
        """Format chunks for inclusion in the prompt context."""
        if not chunks:
            return ""
        
        context = "### Reference Information:\n\n"
        
        for i, chunk in enumerate(chunks):
            context += f"Source {i+1}: {chunk['filename']}, Page {chunk['page']}\n"
            context += f"```\n{chunk['content']}\n```\n\n"
        
        return context

    def _format_response_with_sources(self, response, chunks):
        """Format the response with source references."""
        if not chunks:
            return response
        
        # Add sources section at the end
        sources_section = "\n\n### Sources:\n"
        unique_sources = {}
        
        for chunk in chunks:
            file_id = chunk['file_id']
            if file_id not in unique_sources:
                unique_sources[file_id] = {
                    'filename': chunk['filename'],
                    'pages': set([chunk['page']])
                }
            else:
                unique_sources[file_id]['pages'].add(chunk['page'])
        
        for file_id, source in unique_sources.items():
            pages_str = ", ".join(map(str, sorted(source['pages'])))
            sources_section += f"- {source['filename']} (Pages: {pages_str})\n"
        
        return response + sources_section

    def _generate_smart_name(self, first_message):
        """Generate a smart name for the conversation based on the first message."""
        try:
            prompt = f"Generate a short, concise title (3-5 words) for a conversation that starts with this message: '{first_message}'. Return ONLY the title, nothing else."
            response = self.model.generate_content(prompt)
            title = response.text.strip().strip('"\'')
            
            # Limit length and remove quotes if present
            if len(title) > 50:
                title = title[:47] + "..."
            
            return title
        except Exception as e:
            print(f"Error generating conversation name: {str(e)}")
            return "New Conversation"

    def _detect_language(self, text):
        """
        Detect the language of the input text.
        Returns language code (e.g., 'en', 'ar', 'he', etc.)
        """
        try:
            prompt = f"Detect the language of this text and return ONLY the ISO language code (e.g., 'en', 'ar', 'he', 'fr', etc.): '{text}'"
            response = self.model.generate_content(prompt)
            lang_code = response.text.strip().lower()
            
            # Clean up response to ensure it's just a language code
            lang_code = lang_code.replace("'", "").replace('"', "")
            
            # If response is too long, default to English
            if len(lang_code) > 5:
                return 'en'
            
            return lang_code
        except Exception:
            return 'en'  # Default to English on error

    def _is_rtl_language(self, lang_code):
        """Check if the language is RTL (Right-to-Left)."""
        rtl_languages = ['ar', 'he', 'fa', 'ur', 'yi', 'dv']
        return lang_code in rtl_languages

    def process_message(self, conversation_id, message, username):
        """
        Process a user message and generate a response.
        
        Args:
            conversation_id: ID of the conversation
            message: User message text
            username: Username of the sender
            
        Returns:
            Response text and conversation details
        """
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            return "Conversation not found.", None
        
        # Detect language
        lang_code = self._detect_language(message)
        is_rtl = self._is_rtl_language(lang_code)
        
        # Get memory with conversation history
        memory = self._get_or_create_memory(conversation_id)
        
        # Get relevant chunks based on mode and current query
        relevant_chunks = self._get_relevant_chunks(message, conversation_id)
        
        # Prepare context with relevant chunks
        context = self._format_chunks_for_context(relevant_chunks)
        
        # Build system prompt
        system_prompt = (
            "You are AI Approach Chat, a helpful and knowledgeable assistant, built by AI Eng. Alaadin for AI Approach Company "
            f"The user's name is {username}. "
        )
        
        if conversation['mode'] != 'general':
            file_names = []
            for file_id in conversation['files']:
                metadata = self.file_processor.get_file_metadata(file_id)
                if metadata:
                    file_names.append(metadata['filename'])
            
            if file_names:
                files_str = ", ".join(file_names)
                system_prompt += f"This conversation is about the following files: {files_str}. "
            
            system_prompt += (
                "Base your response primarily on the provided reference information. "
                "If the reference information doesn't contain the answer, clearly state that "
                "you don't have enough information to answer accurately based on the provided documents. "
                "Format your response in Markdown."
            )
        
        # Get conversation history from memory
        conversation_history = memory.chat_memory.messages
        
        # Format full prompt
        full_prompt = f"{system_prompt}\n\n"
        
        if context:
            full_prompt += f"{context}\n\n"
        
        # Add conversation history
        for msg in conversation_history:
            if msg.type == "human":
                full_prompt += f"User: {msg.content}\n"
            elif msg.type == "ai":
                full_prompt += f"Assistant: {msg.content}\n"
            elif msg.type == "system":
                full_prompt += f"System: {msg.content}\n"
        
        # Add current message
        full_prompt += f"User: {message}\nAssistant:"
        
        try:
            # Generate response
            print(f"Sending request to Gemini API with API key: {os.getenv('GEMINI_API_KEY')[:5]}...")
            print(f"Prompt length: {len(full_prompt)} characters")
            
            try:
                response = self.model.generate_content(full_prompt)
                print(f"Received response from Gemini API: {response}")
                response_text = response.text
                print(f"Response text: {response_text[:100]}...")
                
                # Fallback if response is empty
                if not response_text or not response_text.strip():
                    print("Empty response received from API, using fallback")
                    response_text = "I'm sorry, I couldn't generate a response at this time. Please try again later."
            except Exception as api_error:
                error_str = str(api_error)
                print(f"API request failed: {error_str}")
                
                # Check for quota exceeded error
                if "429" in error_str and "quota" in error_str.lower():
                    response_text = "I'm sorry, the AI service is currently unavailable due to quota limits being exceeded. This is a temporary issue with the API key. Please try again later or contact the administrator to update the API key."
                else:
                    response_text = f"I'm sorry, I encountered an error while processing your request: {error_str}. Please try again later."
            
            # Format response with sources if needed
            if relevant_chunks:
                response_text = self._format_response_with_sources(response_text, relevant_chunks)
            
            # Update conversation with new messages
            conversation['messages'].append({
                'role': 'user',
                'content': message,
                'timestamp': datetime.now().isoformat()
            })
            
            conversation['messages'].append({
                'role': 'assistant',
                'content': response_text,
                'timestamp': datetime.now().isoformat()
            })
            
            conversation['updated_at'] = datetime.now().isoformat()
            
            # Generate name for new conversations with only one message
            if len(conversation['messages']) == 2 and not conversation['name'] or conversation['name'] == "New Conversation":
                conversation['name'] = self._generate_smart_name(message)
                
                # Update index with new name
                for conv in self.conversations_index[username]:
                    if conv['id'] == conversation_id:
                        conv['name'] = conversation['name']
                        conv['updated_at'] = conversation['updated_at']
                        break
                
                self._save_conversations_index()
            
            # Save conversation
            with open(self._get_conversation_path(conversation_id), 'w') as f:
                json.dump(conversation, f, indent=2)
            
            # Update memory
            memory.chat_memory.add_user_message(message)
            memory.chat_memory.add_ai_message(response_text)
            
            # Save memory to disk for persistence
            self._save_memory(conversation_id)
            
            return {
                'response': response_text,
                'conversation': conversation,
                'language': {
                    'code': lang_code,
                    'is_rtl': is_rtl
                }
            }
            
        except Exception as e:
            error_message = f"Error generating response: {str(e)}"
            print(error_message)
            
            # Add the error message to the conversation
            fallback_response = "I'm sorry, I encountered an error while processing your request. The AI model may be unavailable or there might be an issue with the API key. Please try again later."
            
            # Update conversation with the error message
            conversation['messages'].append({
                'role': 'user',
                'content': message,
                'timestamp': datetime.now().isoformat()
            })
            
            conversation['messages'].append({
                'role': 'assistant',
                'content': fallback_response,
                'timestamp': datetime.now().isoformat()
            })
            
            conversation['updated_at'] = datetime.now().isoformat()
            
            # Save conversation
            with open(self._get_conversation_path(conversation_id), 'w') as f:
                json.dump(conversation, f, indent=2)
            
            # Update memory
            memory.chat_memory.add_user_message(message)
            memory.chat_memory.add_ai_message(fallback_response)
            
            # Save memory to disk for persistence
            self._save_memory(conversation_id)
            
            return {
                'response': fallback_response,
                'conversation': conversation,
                'language': {
                    'code': lang_code,
                    'is_rtl': is_rtl
                }
            }

    def export_conversation(self, conversation_id, format='markdown'):
        """
        Export a conversation in the specified format.
        
        Args:
            conversation_id: ID of the conversation to export
            format: 'markdown' or 'html'
            
        Returns:
            Exported conversation content
        """
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            return None
        
        if format == 'markdown':
            content = f"# {conversation['name']}\n\n"
            content += f"Created: {conversation['created_at']}\n\n"
            
            for message in conversation['messages']:
                role = "User" if message['role'] == 'user' else "Assistant"
                content += f"## {role}\n\n{message['content']}\n\n"
            
            return content
            
        elif format == 'html':
            content = f"<h1>{conversation['name']}</h1>\n"
            content += f"<p>Created: {conversation['created_at']}</p>\n"
            
            for message in conversation['messages']:
                role = "User" if message['role'] == 'user' else "Assistant"
                content += f"<h2>{role}</h2>\n<div>{message['content']}</div>\n"
            
            return content
            
        return None
