"""
QUICK REFERENCE: OpenAI Vector Database Management
===================================================

SETUP & VERIFICATION
"""

# 1. INITIAL SETUP (Run once after deployment)
# ============================================
python Backend/openai_setup.py verify

# Expected output: All checks PASS
# ✓ Environment vars
# ✓ OpenAI API connection
# ✓ Vector store created
# ✓ AI Assistant configured


# 2. DOCUMENT UPLOAD WORKFLOW (Admin UI)
# ======================================
# 1. Go to Admin Console → Documents
# 2. Select Subject (Medicine, Pharmacology, etc.)
# 3. Upload PDF/DOCX file
# 4. System processes automatically
#    Status: UPLOADING → PROCESSING → INDEXED ✓


# 3. MONITOR DOCUMENT STATUS
# ==========================

# Option A: Check one document
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:5000/api/v1/admin/documents/<doc_id>/status

# Sample response:
{
    "status": "indexed",
    "file_exists_locally": true,
    "openai_file_id": "file-xyz123",
    "openai_file_status": "active",
    "vector_store_file_status": "completed",
    "vector_store_chunks": 150
}

# Option B: Check all documents
python Backend/openai_setup.py check-docs

# Sample output:
# Status Summary:
#   • indexed: 3
#   • processing: 1
#   • failed: 0


# 4. FIX STUCK/FAILED DOCUMENTS
# =============================

# Option A: Retry one document
curl -X POST \
  -H "Authorization: Bearer <admin_token>" \
  http://localhost:5000/api/v1/admin/documents/<doc_id>/retry

# Option B: Retry all failed documents
python Backend/openai_setup.py retry-failed

# Option C: Manual fix via API
DELETE /api/v1/admin/documents/<doc_id>
# Then re-upload


# 5. VERIFY VECTOR STORE CONNECTION
# ==================================

curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:5000/api/v1/vector-store/verify

# Success (200): Connected and ready
# Error (503): Connection failed - check API key


# 6. ENVIRONMENT SETUP CHECKLIST
# ==============================
[✓] OPENAI_API_KEY         Set in .env
[✓] OPENAI_MODEL           Set to gpt-4o
[✓] DATABASE_URL           PostgreSQL running
[✓] UPLOAD_FOLDER          ./uploads directory exists
[✓] python openai_setup.py verify passes


# 7. DOCUMENT STATUSES EXPLAINED
# ==============================

UPLOADING  = File being saved to local disk
PROCESSING = Uploading to OpenAI Files API
INDEXED    = Successfully stored in vector store ✓
FAILED     = Error during upload (see error_message)


# 8. API ENDPOINTS SUMMARY
# ========================

POST   /api/v1/admin/documents/upload
       → Upload new document

GET    /api/v1/admin/documents
       → List all documents (paginated)

GET    /api/v1/admin/documents/<id>/status
       → Check status & OpenAI integration

POST   /api/v1/admin/documents/<id>/retry
       → Retry failed/stuck document

DELETE /api/v1/admin/documents/<id>
       → Delete document from all storage

GET    /api/v1/admin/vector-store/verify
       → Test OpenAI connection


# 9. TROUBLESHOOTING FLOWCHART
# ============================

Document shows "PROCESSING" after upload?
├─ Wait 30 seconds (OpenAI is indexing)
├─→ Still processing after 2 min?
│   └─ curl GET .../documents/<id>/status
│      └─→ check "openai_file_status" field
│         ├─ "active" = File ok, checking chunks
│         ├─ "error" = File rejected
│         └─ "being_processed" = Wait longer
└─→ Then retry:
    curl -X POST .../documents/<id>/retry

Document shows "FAILED"?
├─ Run: python openai_setup.py verify
├─→ Check: OPENAI_API_KEY is valid
├─→ Check: error_message in database
└─→ Retry: curl -X POST .../documents/<id>/retry

API returns 503 (vector-store/verify)?
├─ OPENAI_API_KEY likely invalid/expired
├─→ Regenerate from https://platform.openai.com/api-keys
├─→ Update .env
├─→ Restart Flask app
└─→ Re-run: python openai_setup.py verify


# 10. PRODUCTION DEPLOYMENT
# ==========================

1. Set secrets manager with OPENAI_API_KEY
2. Run: python openai_setup.py verify
3. Upload test document
4. Confirm status = indexed
5. Enable monitoring: tail -f logs/app.log | grep openai
6. (Optional) Setup Celery retry task (see OPENAI_SETUP.md)


# 11. QUICK ADMIN TASKS
# =====================

View all documents status:
  python Backend/openai_setup.py check-docs

Retry all failed at once:
  python Backend/openai_setup.py retry-failed

Test OpenAI connection:
  python Backend/openai_setup.py verify

Re-index document after deletion:
  1. DELETE /api/v1/admin/documents/<id>
  2. Upload file again through UI


# 12. LOGS & DEBUGGING
# ====================

Check for errors:
  grep -i error logs/app.log | grep document

Tail OpenAI operations:
  tail -f logs/app.log | grep -E "document|openai|vector"

Full verification with debug info:
  DEBUG=1 python Backend/openai_setup.py verify


═══════════════════════════════════════════════════════════════════════
For detailed help: See Backend/OPENAI_SETUP.md
═══════════════════════════════════════════════════════════════════════
"""
