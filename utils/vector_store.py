"""
Vector store utilities for AI Approach Chat.
Handles FAISS vector database operations for efficient similarity search.
"""
import os
import json
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from pathlib import Path

class VectorStore:
    def __init__(self, base_path):
        """Initialize the vector store with base paths for storage."""
        self.base_path = base_path
        self.vectors_dir = os.path.join(base_path, 'data', 'vectors')
        self.index_path = os.path.join(self.vectors_dir, 'faiss_index')
        self.mapping_path = os.path.join(self.vectors_dir, 'chunk_mapping.json')
        
        # Ensure directory exists
        os.makedirs(self.vectors_dir, exist_ok=True)
        
        # Initialize sentence transformer model
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.vector_dimension = self.model.get_sentence_embedding_dimension()
        
        # Initialize or load FAISS index and mapping
        self._initialize_or_load_index()

    def _initialize_or_load_index(self):
        """Initialize a new FAISS index or load an existing one."""
        if os.path.exists(self.index_path) and os.path.exists(self.mapping_path):
            # Load existing index and mapping
            self.index = faiss.read_index(self.index_path)
            with open(self.mapping_path, 'r') as f:
                self.chunk_mapping = json.load(f)
        else:
            # Create new index and mapping
            self.index = faiss.IndexFlatL2(self.vector_dimension)
            self.chunk_mapping = {}
            self._save_index_and_mapping()

    def _save_index_and_mapping(self):
        """Save the FAISS index and chunk mapping."""
        faiss.write_index(self.index, self.index_path)
        with open(self.mapping_path, 'w') as f:
            json.dump(self.chunk_mapping, f, indent=2)

    def add_chunks(self, chunks, file_id):
        """
        Add chunks to the vector store.
        
        Args:
            chunks: List of chunk dictionaries with 'chunk_id' and 'content'
            file_id: ID of the file these chunks belong to
        """
        if not chunks:
            return
        
        # Get current index size for mapping
        current_index_size = self.index.ntotal
        
        # Prepare texts and chunk IDs
        texts = [chunk['content'] for chunk in chunks]
        chunk_ids = [chunk['chunk_id'] for chunk in chunks]
        
        # Generate embeddings
        embeddings = self.model.encode(texts)
        
        # Add embeddings to the index
        self.index.add(np.array(embeddings).astype('float32'))
        
        # Update mapping
        for i, chunk_id in enumerate(chunk_ids):
            idx = current_index_size + i
            self.chunk_mapping[str(idx)] = {
                'chunk_id': chunk_id,
                'file_id': file_id
            }
        
        # Save updated index and mapping
        self._save_index_and_mapping()

    def search(self, query, top_k=5, file_ids=None):
        """
        Search for similar chunks based on query.
        
        Args:
            query: Search query text
            top_k: Number of results to return
            file_ids: Optional list of file IDs to restrict search to
        
        Returns:
            List of chunk IDs and their similarity scores
        """
        if self.index.ntotal == 0:
            return []
        
        # Generate query embedding
        query_embedding = self.model.encode([query])[0].reshape(1, -1).astype('float32')
        
        # Search the index
        distances, indices = self.index.search(query_embedding, self.index.ntotal)
        
        # Filter and format results
        results = []
        for i, idx in enumerate(indices[0]):
            if idx < 0 or idx >= self.index.ntotal:
                continue
                
            chunk_info = self.chunk_mapping.get(str(idx))
            if not chunk_info:
                continue
                
            # Filter by file_ids if provided
            if file_ids and chunk_info['file_id'] not in file_ids:
                continue
                
            results.append({
                'chunk_id': chunk_info['chunk_id'],
                'file_id': chunk_info['file_id'],
                'score': float(1.0 / (1.0 + distances[0][i]))  # Convert distance to similarity score
            })
            
            if len(results) >= top_k:
                break
                
        return results

    def remove_file_chunks(self, file_id):
        """
        Remove all chunks associated with a file.
        This requires rebuilding the index.
        """
        if not file_id or self.index.ntotal == 0:
            return
            
        # Identify chunks to keep (not from the specified file)
        keep_indices = []
        keep_chunk_ids = []
        
        for idx, chunk_info in self.chunk_mapping.items():
            if chunk_info['file_id'] != file_id:
                keep_indices.append(int(idx))
                keep_chunk_ids.append(chunk_info['chunk_id'])
        
        if not keep_indices:
            # If no chunks remain, reset the index
            self.index = faiss.IndexFlatL2(self.vector_dimension)
            self.chunk_mapping = {}
        else:
            # Rebuild index with remaining chunks
            # This is a simplified approach - in production, you might want to
            # store the original vectors to avoid recomputing embeddings
            chunks_dir = os.path.join(self.base_path, 'data', 'chunks')
            
            # Collect all chunks to keep
            all_chunks = []
            file_ids = set()
            
            for chunk_file in os.listdir(chunks_dir):
                if not chunk_file.endswith('.json'):
                    continue
                    
                current_file_id = chunk_file.split('.')[0]
                if current_file_id == file_id:
                    continue
                    
                file_ids.add(current_file_id)
                
                with open(os.path.join(chunks_dir, chunk_file), 'r') as f:
                    chunks = json.load(f)
                    all_chunks.extend(chunks)
            
            # Reset index and mapping
            self.index = faiss.IndexFlatL2(self.vector_dimension)
            self.chunk_mapping = {}
            
            # Re-add all chunks
            for file_id in file_ids:
                file_chunks = [c for c in all_chunks if c['file_id'] == file_id]
                self.add_chunks(file_chunks, file_id)
        
        # Save updated index and mapping
        self._save_index_and_mapping()
