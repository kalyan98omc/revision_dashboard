# RAG Pipeline Testing Guide

## Quick Setup

### 1. Verify OpenAI Configuration
```bash
cd Backend
python openai_setup.py verify
```

### 2. Start Backend Server
```bash
python wsgi.py
# Server runs on http://localhost:5000
```

---

## Testing Commands

### Step 1: User Authentication
```bash
# Register (if needed)
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@neetpg.com",
    "username": "teacher123",
    "display_name": "Dr. Teacher",
    "password": "SecurePassword123!",
    "role": "teacher"
  }'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "teacher@neetpg.com",
    "password": "SecurePassword123!"
  }'

# Save the returned `access_token` for next requests
export TOKEN="your-access-token-here"
```

---

### Step 2: Upload a Document

#### Option A: Upload with cURL
```bash
curl -X POST http://localhost:5000/api/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "description=NEET-PG Physiology Notes"
```

#### Option B: Upload Multiple Files
```bash
# Create sample files
echo "Hemoglobin is an iron-containing protein..." > physiology.txt
echo "The heart is divided into four chambers..." > cardiology.txt

# Upload both
curl -X POST http://localhost:5000/api/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@physiology.txt" \
  -F "description=Physiology Overview"

curl -X POST http://localhost:5000/api/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cardiology.txt" \
  -F "description=Cardiology Basics"
```

**Expected Response (202 Accepted)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "physiology.txt",
  "status": "uploading",
  "message": "File uploaded and processing started"
}
```

---

### Step 3: List Uploaded Documents

#### Get All Documents
```bash
curl -X GET http://localhost:5000/api/v1/documents \
  -H "Authorization: Bearer $TOKEN"
```

#### Filter by Status
```bash
# Show only indexed documents
curl -X GET "http://localhost:5000/api/v1/documents?status=indexed" \
  -H "Authorization: Bearer $TOKEN"
```

#### Pagination
```bash
curl -X GET "http://localhost:5000/api/v1/documents?page=2&per_page=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200)**:
```json
{
  "documents": [
    {
      "id": "doc-id",
      "filename": "physiology.txt",
      "status": "indexed",
      "file_size_bytes": 1024,
      "created_at": "2024-03-25T10:30:00Z",
      "error_message": null
    }
  ],
  "total": 2,
  "page": 1,
  "per_page": 20
}
```

---

### Step 4: Query Documents (Semantic Search)

```bash
curl -X POST http://localhost:5000/api/v1/documents/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "hemoglobin oxygen binding mechanism",
    "max_results": 5
  }'
```

**Expected Response (200)**:
```json
{
  "query": "hemoglobin oxygen binding mechanism",
  "results": [
    {
      "file_id": "file-id",
      "file_name": "physiology.txt",
      "relevance": 0.92
    }
  ],
  "count": 1
}
```

---

### Step 5: Get Document Details

```bash
curl -X GET http://localhost:5000/api/v1/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response**:
```json
{
  "id": "doc-id",
  "subject_id": null,
  "filename": "physiology.txt",
  "file_size_bytes": 2048,
  "mime_type": "text/plain",
  "status": "indexed",
  "error_message": null,
  "page_count": 1,
  "openai_file_id": "file-xyz123",
  "created_at": "2024-03-25T10:30:00Z"
}
```

---

### Step 6: Monitor Upload Status

Wait for status to change from `processing` → `indexed`:

```bash
# Check status every 5 seconds
watch -n 5 "curl -s http://localhost:5000/api/v1/documents/$DOC_ID \
  -H 'Authorization: Bearer $TOKEN' | jq '.status'"
```

Or in a loop:
```bash
for i in {1..12}; do
  echo "Check $i:"
  curl -s http://localhost:5000/api/v1/documents/$DOC_ID \
    -H "Authorization: Bearer $TOKEN" | jq '.status'
  sleep 5
done
```

---

### Step 7: Get Statistics (Admin Only)

```bash
# Make sure TOKEN is from an admin user
curl -X GET http://localhost:5000/api/v1/documents/stats \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response**:
```json
{
  "total_documents": 42,
  "indexed_documents": 40,
  "failed_documents": 2,
  "total_size_bytes": 104857600,
  "total_size_mb": 100.0
}
```

---

### Step 8: Delete a Document

```bash
curl -X DELETE http://localhost:5000/api/v1/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200)**:
```json
{
  "message": "Document deleted successfully"
}
```

---

## Frontend Testing (React Component)

### Integration in Admin Panel
```jsx
import FileUpload from './file-upload.jsx';

export function DocumentManagement() {
  const [uploadComplete, setUploadComplete] = useState(false);

  return (
    <div>
      <FileUpload
        subjectId="cardiology-subject-id"
        onUploadComplete={(response) => {
          console.log('✅ Upload completed:', response);
          setUploadComplete(true);
        }}
      />
      {uploadComplete && <p>File ready for queries!</p>}
    </div>
  );
}
```

### Manual Component Testing
```jsx
import FileUpload from './file-upload.jsx';

export function Test() {
  return <FileUpload subjectId={null} />;
}
```

---

## Monitoring Backend Logs

### Watch for errors:
```bash
# Using tail
tail -f backend.log | grep -i 'document\|error\|rag'

# Using Docker
docker logs -f kalyanji-backend | grep -i 'document'
```

### Check uploads directory:
```bash
ls -lh Backend/uploads/
```

---

## Common Issues & Solutions

### Issue: Upload returns 401 Unauthorized
**Solution**: Token expired or not authenticated. Re-login:
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier": "email@example.com", "password": "password"}'
```

### Issue: Document stuck in PROCESSING
**Solution**: Check OpenAI API status and wait. If >2 minutes, check backend logs for errors.

### Issue: Query returns empty results
**Solution**: Wait 30 seconds after upload completes. Vector indexing takes time. Then:
```bash
# Verify document is INDEXED
curl -s http://localhost:5000/api/v1/documents \
  -H "Authorization: Bearer $TOKEN" | jq '.documents[] | {id, status}'
```

### Issue: File upload fails with size error
**Solution**: Check file size is < 10MB:
```bash
du -h /path/to/file.pdf
```

---

## Performance Benchmarks

Test query performance:
```bash
time curl -X POST http://localhost:5000/api/v1/documents/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "cardiac physiology", "max_results": 5}'
```

Expected: **< 1 second** for typical queries

---

## Stress Testing

Upload multiple files at once:
```bash
for i in {1..5}; do
  echo "test content $i" > test$i.txt
  curl -X POST http://localhost:5000/api/v1/documents \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@test$i.txt" &
done
wait
```

---

## Clean Up Test Data

```bash
# Delete all documents
curl -X GET http://localhost:5000/api/v1/documents \
  -H "Authorization: Bearer $TOKEN" | jq '.documents[].id' | \
xargs -I {} curl -X DELETE http://localhost:5000/api/v1/documents/{} \
  -H "Authorization: Bearer $TOKEN"

# Remove local files
rm -rf Backend/uploads/*
```

---

## Next Steps

1. ✅ Verify uploads working
2. ✅ Test queries return results
3. ✅ Integrate into quiz generation pipeline
4. ✅ Monitor performance under load
5. ✅ Set up automated backups
