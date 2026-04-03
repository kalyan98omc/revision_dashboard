"""
Document Upload Controller
───────────────────────────
Handles file uploads, vectorization, and RAG-based retrieval.
"""

from __future__ import annotations

import os
import uuid
import structlog
from werkzeug.utils import secure_filename
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, validate, ValidationError, EXCLUDE

from app.extensions import db, limiter
from app.services.rag_service import RAGService, DocumentRepository
from app.models.models import DocumentStatus
from app.middleware.security import roles_required, get_request_ip
from app.models.models import UserRole

log = structlog.get_logger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
#  SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class DocumentUploadSchema(Schema):
    description = fields.Str(allow_none=True, validate=validate.Length(max=500))
    subject_id = fields.Str(allow_none=True)
    class Meta:
        unknown = EXCLUDE

class QueryDocumentsSchema(Schema):
    query = fields.Str(required=True, validate=validate.Length(min=1, max=1000))
    subject_id = fields.Str(allow_none=True)
    max_results = fields.Int(load_default=5, validate=validate.Range(min=1, max=20))
    class Meta:
        unknown = EXCLUDE

# ─────────────────────────────────────────────────────────────────────────────
#  BLUEPRINT SETUP
# ─────────────────────────────────────────────────────────────────────────────

documents_bp = Blueprint('documents', __name__, url_prefix='/api/v1/documents')
rag_service = RAGService()

# ─────────────────────────────────────────────────────────────────────────────
#  ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@documents_bp.route('', methods=['POST'])
@jwt_required()
@roles_required(['admin', 'teacher'])
@limiter.limit("10 per hour")
def upload_document():
    """
    Upload a document for RAG integration.
    - File is saved locally first
    - Then uploaded to OpenAI Files API
    - Added to vector store for retrieval
    """
    try:
        # Check file exists
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "Empty filename"}), 400

        # Parse form data
        schema = DocumentUploadSchema()
        form_data = schema.load(request.form)

        # Get file size before reading
        file_content = file.read()
        file_size_bytes = len(file_content)
        file.seek(0)  # Reset file pointer

        # Validate file
        is_valid, error_msg = rag_service.validate_file(
            file.filename,
            file_size_bytes
        )

        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Save file locally
        upload_folder = current_app.config.get('UPLOAD_FOLDER', './uploads')
        os.makedirs(upload_folder, exist_ok=True)

        # Secure filename with UUID to prevent collisions
        sanitized_name = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4().hex}_{sanitized_name}"
        file_path = os.path.join(upload_folder, unique_filename)

        file.seek(0)  # Reset before save
        file.save(file_path)

        # Upload to OpenAI and create document record
        user_id = get_jwt_identity()
        doc = rag_service.upload_document(
            file_path=file_path,
            original_filename=file.filename,
            subject_id=form_data.get('subject_id'),
            uploaded_by=user_id,
            description=form_data.get('description'),
        )

        log.info("document_upload_initiated",
                user_id=user_id,
                doc_id=doc.id,
                filename=file.filename)

        return jsonify({
            "id": doc.id,
            "filename": doc.original_name,
            "status": doc.status.value,
            "message": "File uploaded and processing started",
        }), 202

    except Exception as e:
        log.error("document_upload_error", error=str(e), exc_info=True)
        return jsonify({"error": "Failed to upload document"}), 500


@documents_bp.route('/<doc_id>', methods=['GET'])
@jwt_required()
def get_document(doc_id):
    """Get document metadata and status."""
    try:
        doc = DocumentRepository.get_by_id(doc_id)
        if not doc:
            return jsonify({"error": "Document not found"}), 404

        return jsonify(doc.to_dict()), 200

    except Exception as e:
        log.error("get_document_error", doc_id=doc_id, error=str(e))
        return jsonify({"error": "Failed to fetch document"}), 500


@documents_bp.route('', methods=['GET'])
@jwt_required()
def list_documents():
    """List uploaded documents with filtering."""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        subject_id = request.args.get('subject_id', None)
        status = request.args.get('status', None)

        if subject_id:
            docs, total = DocumentRepository.list_by_subject(subject_id, page, per_page)
        elif status:
            try:
                status_enum = DocumentStatus[status.upper()]
                docs, total = DocumentRepository.list_by_status(status_enum, page, per_page)
            except KeyError:
                return jsonify({"error": "Invalid status"}), 400
        else:
            docs, total = DocumentRepository.get_all(page, per_page)

        return jsonify({
            "documents": [doc.to_dict() for doc in docs],
            "total": total,
            "page": page,
            "per_page": per_page,
        }), 200

    except Exception as e:
        log.error("list_documents_error", error=str(e))
        return jsonify({"error": "Failed to fetch documents"}), 500


@documents_bp.route('/<doc_id>', methods=['DELETE'])
@jwt_required()
@roles_required(['admin', 'teacher'])
def delete_document(doc_id):
    """Delete a document from vector store and database."""
    try:
        success = rag_service.delete_document(doc_id)
        if not success:
            return jsonify({"error": "Document not found"}), 404

        return jsonify({"message": "Document deleted successfully"}), 200

    except Exception as e:
        log.error("delete_document_error", doc_id=doc_id, error=str(e))
        return jsonify({"error": "Failed to delete document"}), 500


@documents_bp.route('/query', methods=['POST'])
@jwt_required()
@limiter.limit("30 per hour")
def query_documents():
    """
    Query documents using vector similarity.
    Returns top matching documents based on semantic relevance.
    """
    try:
        schema = QueryDocumentsSchema()
        data = schema.load(request.json or {})

        results = rag_service.query_documents(
            query=data['query'],
            subject_id=data.get('subject_id'),
            max_results=data.get('max_results', 5),
        )

        return jsonify({
            "query": data['query'],
            "results": results,
            "count": len(results),
        }), 200

    except ValidationError as e:
        return jsonify({"error": "Validation error", "details": e.messages}), 400

    except Exception as e:
        log.error("query_documents_error", error=str(e), exc_info=True)
        return jsonify({"error": "Query failed"}), 500


@documents_bp.route('/stats', methods=['GET'])
@jwt_required()
@roles_required(['admin'])
def get_document_stats():
    """Get document upload statistics (admin only)."""
    try:
        from sqlalchemy import func

        total_docs = db.session.query(func.count(DocumentRepository.model.id)).scalar()
        index_count = db.session.query(func.count(DocumentRepository.model.id)).filter(
            DocumentRepository.model.status == DocumentStatus.INDEXED
        ).scalar()
        failed_count = db.session.query(func.count(DocumentRepository.model.id)).filter(
            DocumentRepository.model.status == DocumentStatus.FAILED
        ).scalar()
        total_size = db.session.query(func.sum(DocumentRepository.model.file_size_bytes)).scalar() or 0

        return jsonify({
            "total_documents": total_docs,
            "indexed_documents": index_count,
            "failed_documents": failed_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
        }), 200

    except Exception as e:
        log.error("get_document_stats_error", error=str(e))
        return jsonify({"error": "Failed to fetch statistics"}), 500
