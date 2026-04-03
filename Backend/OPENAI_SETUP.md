# OpenAI Vector Database Setup Guide

## Overview

This guide explains how to set up and verify the OpenAI vector database integration for the NEET-PG Revision Dashboard. Documents uploaded through the admin console are stored in OpenAI's vector store for use in RAG (Retrieval-Augmented Generation) based quiz generation.

## Prerequisites

- OpenAI API account with access to Files API and Assistants API
- API key from OpenAI (https://platform.openai.com/api-keys)
- Backend running with Flask
- PostgreSQL database

## Step 1: Configure Environment Variables

Create or update your `.env` file in the Backend directory:

```bash
# .env
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_MODEL=gpt-4o
OPENAI_WHISPER_MODEL=whisper-1
OPENAI_TTS_MODEL=tts-1
OPENAI_MAX_TOKENS=1024
OPENAI_TEMPERATURE=0.7

# Other required configs
DATABASE_URL=postgresql://user:pass@localhost/dbname
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
UPLOAD_FOLDER=./uploads
```

**Important**: Never commit `.env` to git. Use environment variables or secrets management in production.

## Step 2: Verify Configuration

Run the verification script:

```bash
cd Backend
python openai_setup.py verify
```

This will check:
- ✓ Environment variables are set
- ✓ OpenAI API connection works
- ✓ Vector store exists (or creates one)
- ✓ AI Assistant is configured
- ✓ Database connectivity
- ✓ Existing documents

### Expected Output

```
======================================================================
  OPENAI VECTOR STORE INTEGRATION VERIFICATION
======================================================================

======================================================================
  1. Environment Configuration
======================================================================
✓ OPENAI_API_KEY is set: sk-...
✓ OPENAI_MODEL is set: gpt-4o
✓ DATABASE_URL is set: postgresql://...

======================================================================
  2. OpenAI API Connection
======================================================================
ℹ Testing API connection...
✓ Connected to OpenAI API
ℹ   Sample model available: gpt-4o

======================================================================
  3. Vector Store Setup
======================================================================
✓ Found existing vector store: vs_xyz123
ℹ   Name: neetpg-revision-docs
ℹ   Total files: 4
ℹ   Processing: 0
ℹ   Completed: 4
```

## Step 3: Document Upload Workflow

### Admin Console Upload

1. Log in to admin console
2. Go to Documents section
3. Select subject (e.g., Medicine, Pharmacology)
4. Upload PDF/DOCX file
5. System automatically:
   - Saves file locally
   - Creates database record with `UPLOADING` status
   - Uploads to OpenAI Files API
   - Adds to vector store
   - Updates status to `INDEXED` (or `FAILED` if error)

### Document Status States

```
UPLOADING  →  File being saved locally
     ↓
PROCESSING →  Uploading to OpenAI API
     ↓
INDEXED    →  Successfully indexed in vector store ✓
     ↓ (if error)
FAILED     →  Upload/processing failed
```

## Step 4: API Endpoints

### 1. Upload Document
```bash
POST /api/v1/admin/documents/upload
Content-Type: multipart/form-data

# Form data:
file: <file>
subject_id: <uuid>
description: "Harrison Internal Medicine Chapter 14"

# Response:
{
  "id": "doc-uuid",
  "filename": "Harrison_Internal_Medicine_Ch14.pdf",
  "original_name": "Harrison_Internal_Medicine_Ch14.pdf",
  "subject_id": "subj-uuid",
  "status": "indexed",
  "file_size_bytes": 4400000,
  "created_at": "2024-01-15T10:30:00Z",
  "openai_file_id": "file-xyz123"
}
```

### 2. List Documents
```bash
GET /api/v1/admin/documents?subject_id=<uuid>&page=1&per_page=20

# Response:
{
  "documents": [
    {
      "id": "doc-uuid",
      "original_name": "Harrison.pdf",
      "status": "indexed",
      "file_size_bytes": 4400000,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 4,
  "page": 1,
  "pages": 1
}
```

### 3. Check Document Status (NEW)
```bash
GET /api/v1/admin/documents/<doc_id>/status

# Response:
{
  "id": "doc-uuid",
  "status": "indexed",
  "file_exists_locally": true,
  "openai_file_status": "active",
  "openai_file_size": 4400000,
  "vector_store_file_status": "completed",
  "vector_store_chunks": 150
}
```

### 4. Retry Failed Document (NEW)
```bash
POST /api/v1/admin/documents/<doc_id>/retry

# Response:
{
  "message": "Document upload retried",
  "document": {
    "id": "doc-uuid",
    "status": "indexed",
    "openai_file_id": "file-xyz123"
  }
}
```

### 5. Delete Document
```bash
DELETE /api/v1/admin/documents/<doc_id>

# Response:
{
  "message": "Document deleted"
}
```

### 6. Verify Vector Store (NEW)
```bash
GET /api/v1/admin/vector-store/verify

# Success Response (200):
{
  "connected": true,
  "vector_store_id": "vs_xyz123",
  "vector_store_name": "neetpg-revision-docs",
  "file_count": 4,
  "processing_count": 0
}

# Error Response (503):
{
  "connected": false,
  "error": "Invalid API key"
}
```

## Troubleshooting

### Problem: "OPENAI_API_KEY not configured"

**Solution**: 
```bash
# 1. Verify .env file exists in Backend directory
ls -la Backend/.env

# 2. Add key if missing
echo "OPENAI_API_KEY=sk-your-key" >> Backend/.env

# 3. Reload and test
python Backend/openai_setup.py verify
```

### Problem: Document stuck in "PROCESSING" status

**Solution**:
```bash
# Option 1: Use retry endpoint
curl -X POST http://localhost:5000/api/v1/admin/documents/<doc_id>/retry \
  -H "Authorization: Bearer <token>"

# Option 2: Run script
python Backend/openai_setup.py retry-failed

# Option 3: Check detailed status
curl http://localhost:5000/api/v1/admin/documents/<doc_id>/status \
  -H "Authorization: Bearer <token>"
```

### Problem: Vector store connection fails

**Solution**:
```bash
# 1. Verify API key is valid
python -c "from openai import OpenAI; OpenAI(api_key='sk-...').models.list()"

# 2. Check API key permissions
#    - Go to https://platform.openai.com/account/api-keys
#    - Verify key has "Files API" and "Assistants API" access

# 3. Run full verification
python Backend/openai_setup.py verify
```

### Problem: "File already exists in vector store"

**Solution**:
- OpenAI prevents duplicate file IDs in vector store
- Use the retry endpoint which handles this automatically
- Or delete and re-upload the document

### Problem: Large file upload timeout

**Solution**:
```python
# In config/settings.py, increase timeout:
MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500 MB
REQUEST_TIMEOUT = 300  # 5 minutes

# Or upload in chunks using the client retry
# The system will automatically retry up to 3 times
```

## Monitoring

### Check Document Processing Status
```bash
python Backend/openai_setup.py check-docs
```

Output:
```
  Status Summary:
    • indexed: 3
    • processing: 1
    • failed: 0

  Documents needing attention:
    • Physiology_Renal_Comprehensive.pdf (processing)
```

### Debug Logging

Enable detailed logging in `config/settings.py`:
```python
SQLALCHEMY_ECHO = True  # Log all SQL queries
```

View logs:
```bash
# Tail logs
tail -f logs/app.log | grep -i "document\|openai\|vector"
```

## Production Deployment

### 1. Use Environment Secrets
```bash
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id openai-api-key

# or Docker secrets
docker secret create openai-api-key openai-key.txt
```

### 2. Set Upload Limits
```bash
# In docker-compose.yml or nginx.conf
client_max_body_size 100M;
MAX_CONTENT_LENGTH = 100 * 1024 * 1024
```

### 3. Enable Monitoring
```python
# Add to app/__init__.py
import logging
logging.basicConfig(level=logging.INFO)
```

### 4. Setup Automated Retries (Optional)
Create a Celery task:
```python
# app/tasks.py
from celery import shared_task
from app.services.admin_service import AdminService
from app.models.models import Document, DocumentStatus

@shared_task
def retry_failed_documents():
    """Hourly task to retry failed documents."""
    from app import create_app
    app = create_app()
    with app.app_context():
        failed = Document.query.filter_by(status=DocumentStatus.FAILED).all()
        for doc in failed:
            try:
                AdminService.retry_document(doc.id)
            except Exception as e:
                print(f"Retry failed for {doc.id}: {e}")
```

Schedule in `celerybeat`:
```python
# In config/settings.py
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'retry-failed-documents': {
        'task': 'app.tasks.retry_failed_documents',
        'schedule': crontab(minute=0),  # Every hour
    },
}
```

## API Integration with Quiz Generation

Once documents are indexed, the quiz generation engine uses them via RAG:

```python
# app/services/quiz_engine.py
def generate_quiz(template_id, user_id):
    # 1. Search vector store for relevant documents
    docs = VectorService.search(query="Renal physiology")
    
    # 2. Feed to OpenAI with context
    response = OpenAI.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": f"Generate quiz based on:\n{docs}"
        }]
    )
    
    # 3. Create quiz from response
    return Quiz.from_openai_response(response)
```

## Summary

| Task | Command | Status |
|------|---------|--------|
| Verify setup | `python openai_setup.py verify` | Run after deploy |
| Upload doc | `POST /api/v1/admin/documents/upload` | From admin UI |
| Check status | `GET /api/v1/admin/documents/<id>/status` | Debug uploads |
| Retry failed | `POST /api/v1/admin/documents/<id>/retry` | Fix stuck docs |
| Monitor store | `python openai_setup.py check-docs` | Weekly check |

## Support

For issues, check:
1. [OpenAI API Documentation](https://platform.openai.com/docs)
2. [Backend logs](Backend/logs/)
3. Admin console → Documents tab (status visible there)

---

**Last Updated**: 2024-01-22  
**Version**: 1.0
