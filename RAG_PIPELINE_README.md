# RAG Pipeline Implementation Guide

## Overview

Your NEET-PG Revision Dashboard now includes a **Retrieval-Augmented Generation (RAG)** pipeline powered by OpenAI's Files API and Vector Store. This enables:

- ✅ Document upload (PDF, TXT, MD, DOC, DOCX)
- ✅ Automatic vectorization via OpenAI
- ✅ Semantic similarity search across documents
- ✅ RAG-based quiz generation from uploaded materials
- ✅ File metadata tracking and indexing

---

## Architecture

### Backend Components

#### 1. **RAG Service** (`app/services/rag_service.py`)
Core service handling OpenAI integration:
- **`get_or_create_vector_store()`**: Creates or retrieves OpenAI vector store
- **`upload_document()`**: Uploads file to OpenAI Files API and creates DB record
- **`_process_and_vectorize()`**: Indexes file in vector store
- **`query_documents()`**: Performs semantic search across documents
- **`delete_document()`**: Cleans up files from OpenAI and database

#### 2. **Document Controller** (`app/controllers/document_controller.py`)
REST API endpoints for file operations:
- `POST /api/v1/documents` - Upload document
- `GET /api/v1/documents` - List documents with filtering
- `GET /api/v1/documents/<doc_id>` - Get document metadata
- `DELETE /api/v1/documents/<doc_id>` - Delete document
- `POST /api/v1/documents/query` - Query documents by semantic similarity
- `GET /api/v1/documents/stats` - Get upload statistics (admin)

#### 3. **Document Repository** (`app/repositories/repositories.py`)
Database operations:
- `get_by_id()` - Retrieve document
- `list_by_subject()` - Filter by subject
- `list_by_status()` - Filter by upload status
- `get_by_openai_id()` - Lookup by OpenAI file ID

### Frontend Components

#### **FileUpload Component** (`Frontend/file-upload.jsx`)
User-facing upload interface with:
- Drag-and-drop file upload
- File validation (type, size)
- Upload progress tracking
- File listing and deletion
- Description metadata

---

## Configuration

### Environment Variables (Backend)

Add to `.env`:
```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-actual-key-here
OPENAI_MODEL=gpt-4o
OPENAI_TTS_MODEL=tts-1

# File Upload
UPLOAD_FOLDER=./uploads
MAX_UPLOAD_SIZE=10485760  # 10MB in bytes
```

### Database Models

The following models are used:

**Document**
```python
- id: UUID (primary key)
- subject_id: UUID (foreign key)
- uploaded_by: UUID (foreign key to User)
- filename: String (sanitized)
- original_name: String
- file_size_bytes: Integer
- mime_type: String
- openai_file_id: String (OpenAI Files API ID)
- vector_store_id: String (OpenAI Vector Store ID)
- status: Enum (UPLOADING|PROCESSING|INDEXED|FAILED)
- error_message: Text (if failed)
```

**VectorDocument**
```python
- id: UUID
- document_id: UUID (foreign key)
- chunk_index: Integer
- content: Text (document chunk)
- embedding: JSON (vector embedding)
- vector_store_id: String
```

---

## Usage Guide

### Backend Setup

#### 1. Install Dependencies
```bash
cd Backend
pip install -r requirements.txt
```

#### 2. Verify OpenAI Connection
```bash
python openai_setup.py verify
```

#### 3. Start Flask Server
```bash
python wsgi.py
```

### Frontend Integration

#### 1. Import Component
```jsx
import FileUpload from './file-upload.jsx';

export function AdminPanel() {
  return (
    <FileUpload
      subjectId="subject-id-here"
      onUploadComplete={(response) => {
        console.log('File uploaded:', response);
        // Handle successful upload
      }}
    />
  );
}
```

#### 2. Use in Pages
Add to your admin panel or study materials section:
```jsx
<FileUpload subjectId={selectedSubject?.id} />
```

---

## API Endpoints

### Upload Document
```http
POST /api/v1/documents
Content-Type: multipart/form-data
Authorization: Bearer <token>

Form Data:
- file: <binary file>
- subject_id: <optional UUID>
- description: <optional string>

Response (202 Accepted):
{
  "id": "doc-uuid",
  "filename": "document.pdf",
  "status": "uploading",
  "message": "File uploaded and processing started"
}
```

### List Documents
```http
GET /api/v1/documents?page=1&per_page=20&subject_id=<uuid>&status=indexed
Authorization: Bearer <token>

Response (200):
{
  "documents": [
    {
      "id": "doc-uuid",
      "filename": "document.pdf",
      "status": "indexed",
      "file_size_bytes": 1024000,
      "created_at": "2024-03-25T10:30:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
```

### Query Documents
```http
POST /api/v1/documents/query
Content-Type: application/json
Authorization: Bearer <token>

{
  "query": "hemoglobin metabolism",
  "subject_id": "subject-uuid",
  "max_results": 5
}

Response (200):
{
  "query": "hemoglobin metabolism",
  "results": [
    {
      "file_id": "file-uuid",
      "file_name": "physiology.pdf",
      "relevance": 0.95
    }
  ],
  "count": 1
}
```

### Delete Document
```http
DELETE /api/v1/documents/<doc-id>
Authorization: Bearer <token>

Response (200):
{
  "message": "Document deleted successfully"
}
```

---

## File Handling

### Supported File Types
- `application/pdf` (.pdf)
- `text/plain` (.txt)
- `text/markdown` (.md)
- `application/msword` (.doc)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)

### Size Limits
- **Max file size**: 10 MB
- **Max upload batch**: No limit (but API rate limited)

### File Storage
- **Local storage**: `./uploads/` directory
- **OpenAI storage**: Files API with vector indexing
- **Database**: Metadata and tracking

---

## Status Workflow

```
UPLOADING → PROCESSING → INDEXED [✓ Ready for queries]
    ↓          ↓              ↓
  Error → FAILED [✗ See error_message]
```

### Status Descriptions
| Status | Description |
|--------|-------------|
| `UPLOADING` | File being saved locally |
| `PROCESSING` | Uploading to OpenAI and creating vector store |
| `INDEXED` | Successfully vectorized and ready for queries |
| `FAILED` | Error occurred; check `error_message` field |

---

## Error Handling

### Common Errors

**Invalid file type**
```json
{
  "error": "Only PDF, TXT, MD, DOCX, and DOC files are allowed"
}
```

**File too large**
```json
{
  "error": "File size must not exceed 10MB"
}
```

**OpenAI API error**
```json
{
  "error": "Failed to upload document",
  "details": "OpenAI API rate limit exceeded"
}
```

### Debugging
- Check **status** field to see upload state
- Read **error_message** for specific issues
- Review backend logs: `structlog` configured for detailed tracing

---

## Advanced Features

### Semantic Search Example
```python
from app.services.rag_service import RAGService

rag = RAGService()

# Search across documents
results = rag.query_documents(
    query="cardiac physiology pathways",
    subject_id="cardiology-subject-id",
    max_results=10
)

for result in results:
    print(f"File: {result['file_name']}, Relevance: {result['relevance']}")
```

### Bulk Upload
```jsx
// Upload multiple files at once
<FileUpload
  subjectId={subjectId}
  onUploadComplete={(response) => {
    // Called for each file
    updateFileList(response);
  }}
/>
```

---

## Monitoring & Statistics

### Admin Dashboard
```http
GET /api/v1/documents/stats
Authorization: Bearer <admin-token>

Response:
{
  "total_documents": 42,
  "indexed_documents": 40,
  "failed_documents": 2,
  "total_size_bytes": 104857600,
  "total_size_mb": 100.0
}
```

---

## Performance Considerations

1. **Vector Store Indexing**: First-time setup takes ~10-30 seconds per file
2. **Query Latency**: Semantic searches typically complete in <1 second
3. **Rate Limiting**:
   - Upload: 10 requests/hour per user
   - Query: 30 requests/hour per user

4. **Storage**:
   - Local copies in `./uploads/`
   - Permanent copies in OpenAI Files API
   - Metadata in PostgreSQL

---

## Troubleshooting

### Vector Store Creation Fails
```
Error: Vector store creation failed
```
**Solution**: Verify `OPENAI_API_KEY` is valid and has vector store permissions.

### Files Not Appearing in Vector Store
```
Status shows INDEXED but queries return no results
```
**Solution**: Wait 10-15 seconds for OpenAI indexing to complete. Then retry query.

### Upload Stuck in PROCESSING
```
Document status remains PROCESSING for >1 minute
```
**Solution**: Check backend logs for OpenAI API errors. May indicate API quota exceeded.

---

## Future Enhancements

- [ ] Multi-language support for documents
- [ ] OCR for scanned PDFs
- [ ] Automatic document chunking strategies
- [ ] Custom embedding models
- [ ] Document similarity clustering
- [ ] Quiz generation from document content
- [ ] Document tagging and categorization

---

## Support

For issues or questions:
1. Check backend logs: `docker logs kalyanji-backend`
2. Verify OpenAI configuration: `python openai_setup.py verify`
3. Test API manually with curl or Postman
4. Review error messages in document `error_message` field
