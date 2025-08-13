"""
AI Approach Chat - Smart AI File-Enhanced Chat System
Main Flask application file
"""
import os
import json
import uuid
import datetime
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_from_directory
from werkzeug.utils import secure_filename
import google.generativeai as genai
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv()

# Import utility modules
from utils.file_processor import FileProcessor
from utils.vector_store import VectorStore
from utils.chat_manager import ChatManager
from utils.session_manager import SessionManager

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', str(uuid.uuid4()))
print(f"Flask app initialized with secret key: {app.secret_key[:5]}...")
# Set session to be permanent
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=7)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Set up base path
BASE_PATH = os.path.dirname(os.path.abspath(__file__))

# Initialize utilities
file_processor = FileProcessor(BASE_PATH)
vector_store = VectorStore(BASE_PATH)
chat_manager = ChatManager(BASE_PATH, os.getenv('GEMINI_API_KEY'), file_processor, vector_store)
session_manager = SessionManager(BASE_PATH)

# Configure upload settings
UPLOAD_FOLDER = os.path.join(BASE_PATH, 'data', 'uploads')
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# User management
USERS_FILE = os.path.join(BASE_PATH, 'data', 'users', 'users.json')
os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)

def load_users():
    """Load users from JSON file."""
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_users(users):
    """Save users to JSON file."""
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

# Initialize users if not exists
if not os.path.exists(USERS_FILE):
    save_users({})

def allowed_file(filename):
    """Check if file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """Render the main application page."""
    print("Index route accessed, session:", session)
    if 'username' not in session:
        print("No username in session, redirecting to login")
        return redirect(url_for('login'))
    print("Username found in session, rendering index")
    # Pass the username directly to the template
    return render_template('index.html', username=session['username'])

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Handle user login."""
    print("Login route accessed, method:", request.method)
    print("Current session before login:", session)
    
    # If user is already logged in, redirect to index
    if 'username' in session:
        print("User already logged in, redirecting to index")
        return redirect(url_for('index'))
        
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        print(f"Login attempt for user: {username}")
        
        users = load_users()
        
        # Check if user exists and password matches
        if username in users and users[username]['password'] == password:
            print(f"Login successful for user: {username}")
            # Make session permanent
            session.permanent = True
            session['username'] = username
            session['session_id'] = str(uuid.uuid4())
            print("Session after setting username:", session)
            
            # Initialize session data
            session_data = {
                'username': username,
                'active_conversation': None,
                'active_files': [],
                'chat_mode': 'general',
                'ui_state': {
                    'theme': 'light',
                    'sidebar_visible': True
                }
            }
            
            session_manager.save_session(session['session_id'], session_data)
            print("Session data saved, redirecting to index")
            
            return redirect(url_for('index'))
        
        print(f"Login failed for user: {username}")
        return render_template('login.html', error='Invalid username or password')
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    """Handle user registration."""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        users = load_users()
        
        # Check if user already exists
        if username in users:
            return render_template('register.html', error='Username already exists')
        
        # Add new user
        users[username] = {
            'username': username,
            'password': password,
            'created_at': datetime.datetime.now().isoformat()
        }
        
        save_users(users)
        
        return redirect(url_for('login'))
    
    return render_template('register.html')

@app.route('/logout')
def logout():
    """Handle user logout."""
    # Save session data before logout
    if 'session_id' in session:
        session_manager.delete_session(session['session_id'])
    
    # Clear session
    session.clear()
    
    return redirect(url_for('login'))

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Handle file upload."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'File type not allowed'}), 400
    
    # Save file temporarily
    filename = secure_filename(file.filename)
    temp_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(temp_path)
    
    # Process file
    success, result = file_processor.process_file(temp_path, filename, session['username'])
    
    # Remove temporary file
    if os.path.exists(temp_path):
        os.remove(temp_path)
    
    if not success:
        return jsonify({'success': False, 'error': result}), 400
    
    # Get file metadata
    file_id = result
    file_metadata = file_processor.get_file_metadata(file_id)
    
    # Add chunks to vector store
    chunks = file_processor.get_chunks(file_id)
    vector_store.add_chunks(chunks, file_id)
    
    return jsonify({
        'success': True,
        'file_id': file_id,
        'filename': file_metadata['filename'],
        'chunk_count': file_metadata['chunk_count']
    })

@app.route('/api/files', methods=['GET'])
def get_files():
    """Get user's files."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    files = file_processor.get_user_files(session['username'])
    
    return jsonify({
        'success': True,
        'files': files
    })

@app.route('/api/files/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    """Delete a file."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    success = file_processor.delete_file(file_id, session['username'])
    
    if success:
        # Remove file chunks from vector store
        vector_store.remove_file_chunks(file_id)
        
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'File not found'}), 404

@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    """Get user's conversations."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    conversations = chat_manager.get_user_conversations(session['username'])
    
    return jsonify({
        'success': True,
        'conversations': conversations
    })

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    """Create a new conversation."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    data = request.json
    name = data.get('name')
    files = data.get('files', [])
    mode = data.get('mode', 'general')
    previous_conversation_id = data.get('previous_conversation_id')
    
    # If no previous conversation ID is provided but there's an active one in the session,
    # use that to maintain context between conversations
    if not previous_conversation_id and 'session_id' in session:
        session_data = session_manager.load_session(session['session_id'])
        if session_data and 'active_conversation' in session_data:
            previous_conversation_id = session_data.get('active_conversation')
    
    conversation_id = chat_manager.create_conversation(
        session['username'],
        name=name,
        files=files,
        mode=mode,
        previous_conversation_id=previous_conversation_id
    )
    
    # Update session data
    if 'session_id' in session:
        session_data = session_manager.load_session(session['session_id'])
        if session_data:
            session_data['active_conversation'] = conversation_id
            session_data['active_files'] = files
            session_data['chat_mode'] = mode
            session_data['previous_conversation_id'] = previous_conversation_id
            session_manager.save_session(session['session_id'], session_data)
    
    return jsonify({
        'success': True,
        'conversation_id': conversation_id
    })

@app.route('/api/conversations/<conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    """Get a conversation by ID."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    conversation = chat_manager.get_conversation(conversation_id)
    
    if not conversation:
        return jsonify({'success': False, 'error': 'Conversation not found'}), 404
    
    # Check ownership
    if conversation['username'] != session['username']:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 403
    
    return jsonify({
        'success': True,
        'conversation': conversation
    })

@app.route('/api/conversations/<conversation_id>', methods=['PUT'])
def update_conversation(conversation_id):
    """Update a conversation."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    data = request.json
    new_name = data.get('name')
    
    if not new_name:
        return jsonify({'success': False, 'error': 'Name is required'}), 400
    
    success = chat_manager.update_conversation_name(conversation_id, new_name)
    
    if not success:
        return jsonify({'success': False, 'error': 'Conversation not found'}), 404
    
    return jsonify({'success': True})

@app.route('/api/conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    """Delete a conversation."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    success = chat_manager.delete_conversation(conversation_id)
    
    if not success:
        return jsonify({'success': False, 'error': 'Conversation not found'}), 404
    
    # Update session data if this was the active conversation
    if 'session_id' in session:
        session_data = session_manager.load_session(session['session_id'])
        if session_data and session_data.get('active_conversation') == conversation_id:
            session_data['active_conversation'] = None
            session_manager.save_session(session['session_id'], session_data)
    
    return jsonify({'success': True})

@app.route('/api/conversations/<conversation_id>/export', methods=['GET'])
def export_conversation(conversation_id):
    """Export a conversation."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    format_type = request.args.get('format', 'markdown')
    
    if format_type not in ['markdown', 'html']:
        return jsonify({'success': False, 'error': 'Invalid format'}), 400
    
    content = chat_manager.export_conversation(conversation_id, format=format_type)
    
    if not content:
        return jsonify({'success': False, 'error': 'Conversation not found'}), 404
    
    return jsonify({
        'success': True,
        'content': content,
        'format': format_type
    })

@app.route('/api/conversations/<conversation_id>/message', methods=['POST'])
def send_message(conversation_id):
    """Send a message to a conversation."""
    if 'username' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    
    data = request.json
    message = data.get('message')
    
    if not message:
        return jsonify({'success': False, 'error': 'Message is required'}), 400
    
    result = chat_manager.process_message(conversation_id, message, session['username'])
    
    if not result:
        return jsonify({'success': False, 'error': 'Failed to process message'}), 500
    
    return jsonify({
        'success': True,
        'response': result['response'],
        'conversation': result['conversation'],
        'language': result['language']
    })

@app.route('/api/session', methods=['GET', 'PUT'])
def api_session():
    """Get or update session data."""
    print("API session endpoint accessed, method:", request.method)
    print("Current session:", session)
    
    # Check if user is logged in
    if 'username' not in session:
        print("No username in session, returning 401")
        return jsonify({
            'success': False,
            'error': 'Not logged in'
        }), 401
    
    # Create default session data
    default_session_data = {
        'username': session['username'],
        'active_conversation': None,
        'active_files': [],
        'chat_mode': 'general',
        'ui_state': {
            'theme': 'light',
            'sidebar_visible': True
        }
    }
    
    # Handle GET request
    if request.method == 'GET':
        # For simplicity, just return the default session data
        # This avoids issues with the session manager
        print("Returning default session data")
        return jsonify({
            'success': True,
            'session': default_session_data
        })
    
    # Handle PUT request
    if request.method == 'PUT':
        try:
            data = request.json
            print("Received session update:", data)
            
            # Update session data
            if 'active_conversation' in data:
                default_session_data['active_conversation'] = data['active_conversation']
                
            if 'active_files' in data:
                default_session_data['active_files'] = data['active_files']
            
            if 'chat_mode' in data:
                default_session_data['chat_mode'] = data['chat_mode']
            
            if 'ui_state' in data and isinstance(data['ui_state'], dict):
                default_session_data['ui_state'].update(data['ui_state'])
            
            print("Updated session data:", default_session_data)
            return jsonify({
                'success': True,
                'session': default_session_data
            })
        except Exception as e:
            print("Error updating session:", e)
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'success': False, 'error': 'Server error'}), 500

if __name__ == '__main__':
    # Check for API key
    if not os.getenv('GEMINI_API_KEY'):
        print("WARNING: GEMINI_API_KEY not set in environment variables or .env file")
        print("Please set your Gemini API key to enable chat functionality")
    
    app.run(debug=True)
