# AI Approach Chat

<div align="center">

![AI Approach Chat Logo](static/icon/image.png)


**A smart AI-powered chat system with document processing capabilities**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.9%2B-blue)](https://www.python.org/downloads/)
[![Flask](https://img.shields.io/badge/flask-2.0%2B-green)](https://flask.palletsprojects.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini%20AI-Powered-blueviolet)](https://ai.google.dev/)

</div>

## 🌟 Overview

AI Approach Chat is a sophisticated web application that combines the power of Google's Gemini AI with document processing capabilities. The system allows users to upload documents (PDF, DOCX, PPTX), processes them into searchable chunks, and enables AI-powered conversations that can reference information from these documents.

## ✨ Features

- **🔐 User Authentication**: Secure login and registration system
- **💬 AI Chat Interface**: Intuitive chat interface powered by Google's Gemini AI
- **📄 Document Processing**: Upload and process various document types (PDF, DOCX, PPTX)
- **🔍 Vector Search**: Semantic search capabilities using vector embeddings
- **💾 Conversation Memory**: Persistent conversation history with context retention
- **🔄 Multiple Chat Modes**: General chat and document-specific chat modes
- **📱 Responsive Design**: Works on desktop and mobile devices

## 🛠️ Technology Stack

- **Backend**: Python, Flask
- **AI**: Google Generative AI (Gemini)
- **Vector Database**: FAISS for efficient similarity search
- **Document Processing**: Custom processing pipeline for various document formats
- **Frontend**: HTML, CSS, JavaScript
- **Authentication**: Session-based authentication

## 📋 Prerequisites

- Python 3.9 or higher
- Google Gemini API key
- Modern web browser

## 🚀 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AIApproach/AI-Approach-Chat.git
   cd AI-Approach-Chat
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows
   venv\Scripts\activate
   # On macOS/Linux
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the project root (you can copy from `.env.example`):
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   FLASK_SECRET_KEY=your_secret_key_here
   ```

5. Run the application:
   ```bash
   python app.py
   ```

6. Open your browser and navigate to `http://localhost:5000`

## 🔧 Configuration

The application can be configured through environment variables in the `.env` file:

- `GEMINI_API_KEY`: Your Google Gemini API key (you can get it from [Google AI Studio]("https://aistudio.google.com/app/apikey))
- `FLASK_SECRET_KEY`: Secret key for Flask session encryption

## 📊 Project Structure

```
├── app.py                 # Main Flask application
├── data/                  # Data storage
│   ├── chunks/            # Document chunks
│   ├── conversations/     # Conversation history
│   ├── files/             # Uploaded files
│   ├── memories/          # Conversation memory
│   ├── sessions/          # User sessions
│   ├── uploads/           # Temporary upload storage
│   ├── users/             # User data
│   └── vectors/           # Vector embeddings
├── requirements.txt       # Python dependencies
├── static/                # Static assets
│   ├── css/               # Stylesheets
│   ├── icon/              # Icons
│   └── js/                # JavaScript files
├── templates/             # HTML templates
└── utils/                 # Utility modules
    ├── chat_manager.py    # Chat functionality
    ├── file_processor.py  # Document processing
    ├── session_manager.py # Session management
    └── vector_store.py    # Vector database operations
```

## 💻 Usage

1. **Register/Login**: Create an account or log in to an existing one
2. **Upload Documents**: Click the upload button to add documents to your library
3. **Create Conversation**: Start a new conversation, optionally selecting documents to reference
4. **Chat with AI**: Interact with the AI, asking questions about your documents or general topics
5. **View History**: Access your conversation history from the sidebar


**Built with ❤️ by the AI Approach Engineer Alaadin**

</div>