"""
RAG (Retrieval-Augmented Generation) Service
─────────────────────────────────────────────
Handles OpenAI Files API and Vector Store integration for document uploading
and retrieval-based response generation.
"""

from __future__ import annotations

import os
import structlog
from datetime import datetime, timezone
from typing import Optional, List, Tuple
import json

from flask import current_app
from openai import OpenAI, UnprocessableEntityError, BadRequestError

try:
    from PyPDF2 import PdfReader
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

from app.extensions import db
from app.models.models import (
    Document, VectorDocument, DocumentStatus, User
)
from app.repositories.repositories import (
    DocumentRepository, VectorDocumentRepository
)

log = structlog.get_logger(__name__)


class RAGService:
    """Manages document upload, vectorization, and retrieval."""

    def __init__(self):
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o')

    # ─────────────────────────────────────────────────────────────────────────
    #  VECTOR STORE MANAGEMENT
    # ─────────────────────────────────────────────────────────────────────────

    def get_or_create_vector_store(self, subject_id: Optional[str] = None) -> str:
        """Get existing vector store or create a new one."""
        try:
            # Check if vector store already exists for this subject
            store_id = current_app.config.get(f'VECTOR_STORE_ID_{subject_id}')
            if store_id:
                return store_id

            # Create new vector store
            vector_store = self.client.beta.vector_stores.create(
                name=f"VectorStore_{subject_id}" if subject_id else "VectorStore_General"
            )
            store_id = vector_store.id
            
            # Cache the store ID
            if subject_id:
                current_app.config[f'VECTOR_STORE_ID_{subject_id}'] = store_id
            else:
                current_app.config['VECTOR_STORE_ID_GENERAL'] = store_id

            log.info("vector_store_created", vector_store_id=store_id, subject_id=subject_id)
            return store_id
        except Exception as e:
            log.error("vector_store_creation_failed", error=str(e))
            raise

    # ─────────────────────────────────────────────────────────────────────────
    #  FILE UPLOAD & PROCESSING
    # ─────────────────────────────────────────────────────────────────────────

    def upload_document(
        self,
        file_path: str,
        original_filename: str,
        subject_id: Optional[str],
        uploaded_by: str,
        description: Optional[str] = None,
    ) -> Document:
        """
        Upload a document to OpenAI Files API and create a vector store entry.
        Returns Document record with status=UPLOADING initially.
        """
        try:
            # Create local Document record
            file_size = os.path.getsize(file_path)
            mime_type = self._get_mime_type(original_filename)
            
            # Extract page count if PDF
            page_count = None
            if original_filename.lower().endswith('.pdf') and HAS_PYPDF2:
                try:
                    with open(file_path, 'rb') as pdf_file:
                        pdf_reader = PdfReader(pdf_file)
                        page_count = len(pdf_reader.pages)
                    log.info("pdf_page_count_extracted", 
                            filename=original_filename, 
                            pages=page_count)
                except Exception as e:
                    log.warning("pdf_page_count_extraction_failed",
                              filename=original_filename,
                              error=str(e))
                    page_count = None

            doc = Document(
                subject_id=subject_id,
                uploaded_by=uploaded_by,
                filename=os.path.basename(file_path),
                original_name=original_filename,
                file_size_bytes=file_size,
                mime_type=mime_type,
                file_path=file_path,
                status=DocumentStatus.UPLOADING,
                description=description,
                page_count=page_count,
            )
            db.session.add(doc)
            db.session.flush()

            # Upload to OpenAI Files API
            with open(file_path, 'rb') as f:
                file_response = self.client.beta.files.upload(file=f)

            doc.openai_file_id = file_response.id
            doc.status = DocumentStatus.PROCESSING
            db.session.commit()

            log.info("document_uploaded_to_openai", 
                    doc_id=doc.id, 
                    openai_file_id=file_response.id)

            # Process file and add to vector store
            self._process_and_vectorize(doc)

            return doc

        except Exception as e:
            log.error("document_upload_failed", error=str(e))
            if 'doc' in locals():
                doc.status = DocumentStatus.FAILED
                doc.error_message = str(e)
                db.session.commit()
            raise

    def _process_and_vectorize(self, doc: Document) -> None:
        """Process document and add to vector store."""
        try:
            # Get or create vector store
            vector_store_id = self.get_or_create_vector_store(doc.subject_id)
            doc.vector_store_id = vector_store_id

            # Add file to vector store
            self.client.beta.vector_stores.files.create(
                vector_store_id=vector_store_id,
                file_id=doc.openai_file_id,
            )

            # Mark as indexed
            doc.status = DocumentStatus.INDEXED
            db.session.commit()

            log.info("document_vectorized",
                    doc_id=doc.id,
                    vector_store_id=vector_store_id)

        except Exception as e:
            log.error("document_vectorization_failed", 
                     doc_id=doc.id,
                     error=str(e))
            doc.status = DocumentStatus.FAILED
            doc.error_message = str(e)
            db.session.commit()
            raise

    # ─────────────────────────────────────────────────────────────────────────
    #  RETRIEVAL & RAG QUERIES
    # ─────────────────────────────────────────────────────────────────────────

    def query_documents(
        self,
        query: str,
        subject_id: Optional[str] = None,
        max_results: int = 5,
    ) -> List[dict]:
        """
        Query documents using vector similarity search.
        Returns top matching chunks with content.
        """
        try:
            vector_store_id = self.get_or_create_vector_store(subject_id)

            # Use file search to retrieve relevant documents
            response = self.client.beta.vector_stores.files.query(
                vector_store_id=vector_store_id,
                query=query,
                limit=max_results,
            )

            results = []
            for file_ref in response.data:
                results.append({
                    "file_id": file_ref.id,
                    "file_name": file_ref.name if hasattr(file_ref, 'name') else "Unknown",
                    "relevance": file_ref.relevance if hasattr(file_ref, 'relevance') else None,
                })

            log.info("document_query_completed",
                    query=query,
                    results_count=len(results))

            return results

        except Exception as e:
            log.error("document_query_failed",
                     query=query,
                     error=str(e))
            return []

    # ─────────────────────────────────────────────────────────────────────────
    #  DOCUMENT DELETION & CLEANUP
    # ─────────────────────────────────────────────────────────────────────────

    def delete_document(self, doc_id: str) -> bool:
        """Delete document from OpenAI and database."""
        try:
            doc = DocumentRepository.get_by_id(doc_id)
            if not doc:
                return False

            # Delete from vector store
            if doc.openai_file_id and doc.vector_store_id:
                try:
                    self.client.beta.vector_stores.files.delete(
                        vector_store_id=doc.vector_store_id,
                        file_id=doc.openai_file_id,
                    )
                except Exception as e:
                    log.warning("vector_store_file_deletion_failed",
                               vector_store_id=doc.vector_store_id,
                               file_id=doc.openai_file_id,
                               error=str(e))

            # Delete from OpenAI Files API
            if doc.openai_file_id:
                try:
                    self.client.beta.files.delete(doc.openai_file_id)
                except Exception as e:
                    log.warning("openai_file_deletion_failed",
                               file_id=doc.openai_file_id,
                               error=str(e))

            # Delete local file
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)

            # Delete from database
            DocumentRepository.delete(doc)
            db.session.commit()

            log.info("document_deleted", doc_id=doc_id)
            return True

        except Exception as e:
            log.error("document_deletion_failed", doc_id=doc_id, error=str(e))
            return False

    # ─────────────────────────────────────────────────────────────────────────
    #  UTILITY METHODS
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _get_mime_type(filename: str) -> str:
        """Get MIME type from filename."""
        ext = os.path.splitext(filename)[1].lower()
        mime_types = {
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword',
        }
        return mime_types.get(ext, 'application/octet-stream')

    @staticmethod
    def validate_file(filename: str, file_size_bytes: int) -> Tuple[bool, str]:
        """Validate file for upload."""
        # Check file extension
        allowed_exts = {'.pdf', '.txt', '.md', '.docx', '.doc'}
        if not any(filename.lower().endswith(ext) for ext in allowed_exts):
            return False, "Only PDF, TXT, MD, DOCX, and DOC files are allowed"

        # Check file size (max 10MB)
        max_size = 10 * 1024 * 1024
        if file_size_bytes > max_size:
            return False, "File size must not exceed 10MB"

        return True, ""
