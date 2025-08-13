"""
Session manager utilities for AI Approach Chat.
Handles session persistence and restoration.
"""
import os
import json
from datetime import datetime

class SessionManager:
    def __init__(self, base_path):
        """Initialize the session manager with base paths for storage."""
        self.base_path = base_path
        self.sessions_dir = os.path.join(base_path, 'data', 'sessions')
        
        # Ensure directory exists
        os.makedirs(self.sessions_dir, exist_ok=True)
    
    def _get_session_path(self, session_id):
        """Get the file path for a session."""
        return os.path.join(self.sessions_dir, f"{session_id}.json")
    
    def save_session(self, session_id, session_data):
        """
        Save session data to a file.
        
        Args:
            session_id: Unique session identifier
            session_data: Dictionary containing session data
        """
        session_data['last_updated'] = datetime.now().isoformat()
        
        with open(self._get_session_path(session_id), 'w') as f:
            json.dump(session_data, f, indent=2)
    
    def load_session(self, session_id):
        """
        Load session data from a file.
        
        Args:
            session_id: Unique session identifier
            
        Returns:
            Dictionary containing session data or None if not found
        """
        session_path = self._get_session_path(session_id)
        if os.path.exists(session_path):
            with open(session_path, 'r') as f:
                return json.load(f)
        return None
    
    def delete_session(self, session_id):
        """
        Delete a session.
        
        Args:
            session_id: Unique session identifier
            
        Returns:
            True if successful, False otherwise
        """
        session_path = self._get_session_path(session_id)
        if os.path.exists(session_path):
            os.remove(session_path)
            return True
        return False
    
    def get_all_sessions(self):
        """
        Get all session IDs.
        
        Returns:
            List of session IDs
        """
        sessions = []
        for filename in os.listdir(self.sessions_dir):
            if filename.endswith('.json'):
                sessions.append(filename[:-5])  # Remove .json extension
        return sessions
