# NEET-PG Revision Dashboard - Complete System Guide

## 📋 Overview

Your NEET-PG Revision Dashboard has three main components working together:

```
┌─────────────────────────────────────────────────────────────────┐
│                  SYSTEM ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  FRONTEND (React)           BACKEND (Flask)         SERVICES      │
│  ─────────────              ──────────────           ────────     │
│                                                                   │
│  1. File Upload    ──────→   Document Upload     ──→  RAG Service │
│     Component               Controller            OpenAI Files API│
│                                                  OpenAI Vector DB │
│                                                                   │
│  2. AI Tutor       ──────→   Chat Service        ──→  OpenAI GPT  │
│     Chat Viewer             Assistants API            File Search │
│                                                                   │
│  3. Admin Console  ──────→   Admin Service       ──→  PostgreSQL  │
│                             PYQ Management           Data Storage │
│                             Config Management                     │
│                                                                   │
│  DATABASE: PostgreSQL                                             │
│  ├─ Users                    CACHE: Redis                         │
│  ├─ Documents (RAG)        ├─ Session Cache                       │
│  ├─ Chat Sessions          ├─ Leaderboard Cache                   │
│  ├─ TopicAssessments       └─ Rate Limiting                       │
│  └─ PYQ Intelligence                                              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Main Issues Fixed

### **Issue #1: Files Disappear After Page Refresh ❌ → ✅**

**What was happening:**
1. Upload file → appears in UI ✓
2. Refresh page (F5) → file disappears ✗
3. Come back to page → no files shown ✗

**Root cause:**
- Frontend state only stored in React (RAM)
- Files in database but React wasn't fetching them on reload
- `useEffect` dependency array was empty

**Solution:**
- Added automatic fetch on component mount
- Added automatic fetch when subject changes
- Added fetch after successful upload
- Proper dependency tracking

**Files changed:**
- `Frontend/file-upload.jsx`: Updated fetch logic with logging

---

### **Issue #2: AI Tutor "No Response" Error ❌ → ✅**

**What was happening:**
1. Open AI Tutor → send message
2. Get error: "I'm having trouble connecting to the AI service"
3. Check logs → API errors

**Root cause:**
- Vector stores API was using `client.beta.vector_stores` (wrong!)
- Actually should be `client.vector_stores` (correct!)
- Also missing error handling for debugging

**Solution:**
- Fixed all vector store API calls
- Added detailed error handling with context
- Added logging at each step
- Improved fallback error messages

**Files changed:**
- `Backend/app/services/rag_service.py`: Fixed API endpoints
- `Backend/app/services/services.py`: Added error handling

---

### **Issue #3: Page Counts Showing Different Numbers ❌ → ✅**

**What was happening:**
1. Upload PDF → shows "179 pages"
2. Upload same PDF again → shows "215 pages"
3. Refresh → shows different number again

**Root cause:**
- No PDF parsing library installed
- Page count field in database never populated
- Null values rendered as garbage

**Solution:**
- Added `PyPDF2==3.0.1` to requirements
- Parse PDFs on upload to get actual page count
- Store in database and retrieve consistently

**Files changed:**
- `Backend/requirements.txt`: Added PyPDF2
- `Backend/app/services/rag_service.py`: Added page extraction

---

## 🚀 How to Use The System

### **For Students: Using AI Tutor**

```
Step 1: Login
  └─ Email: student@example.com
      Password: your_password

Step 2: Navigate to AI Tutor Tab

Step 3: Select Subject (e.g., Anatomy)

Step 4: Select Topic (e.g., Upper Limb Anatomy)

Step 5: AI Provides Diagnostic Assessment
  • 3-4 SAQs (Short Answer Questions)
  • AI scores your answers
  • Identifies knowledge gaps

Step 6: Adaptive Training Begins
  • Level 1: SAQs
  • Level 2: LAQs (Long answer)
  • Level 3: Clinical MCQs
  
  (Must pass each level before advancing)

Step 7: Achieve Mastery ✓
  • Spaced revision scheduled
  • Returns to topic on days 1, 3, 7, 14, 30

Step 8: Track Progress
  • See overall mastery %
  • View per-subject breakdown
  • Check upcoming revisions
```

**💡 Pro Tips:**
- Ask follow-up questions to clarify concepts
- Use subject search to focus on weak areas
- Combine SAQ revision with high-yield MCQ mode
- Check analytics tab to see performance trends

---

### **For Admins: Managing the System**

#### **1️⃣ Upload Study Materials (RAG Documents)**

```
Admin Console → Documents → Upload

Then:
1. Click "Upload Document"
2. Select your PDF/DOCX file
3. Choose Subject (Anatomy, Physiology, etc.)
4. Add description (optional)
5. Wait for Status: INDEXED ✅

Once INDEXED, AI can reference in tutor sessions
```

**Best practices:**
- Use recent, high-quality textbooks
- One document per major topic
- Ensure PDFs are OCR'd if scanned
- Include diagrams and clinical photos when possible

#### **2️⃣ Configure AI Behavior**

```
Backend/.env:
  OPENAI_MODEL=gpt-4-turbo-preview
  OPENAI_MAX_TOKENS=1024
  OPENAI_TEMPERATURE=0.7

Then:
1. Modify settings
2. Docker compose restart api
3. Restart takes ~30 seconds
```

**Settings explained:**
- **Model**: gpt-4o (better) vs gpt-4-turbo-preview (faster)
- **Max Tokens**: Higher = longer responses (default 1024)
- **Temperature**: 0 = precise, 1 = creative (default 0.7)

#### **3️⃣ Manage Previous Year Questions (PYQs)**

```
Admin Console → PYQ Management

Steps:
1. Create/Import PYQs
2. Categorize by frequency:
   🔴 CORE (18+ times) - must memorize
   🟠 FREQUENT (8-17) - high priority
   🟡 OCCASIONAL (3-7) - medium
   ⚪ RARE (<3) - low priority
3. Link to topics
4. Set difficulty level

AI will use frequency to prioritize content
```

#### **4️⃣ Configure Student Tiers**

```
Edit: Backend/config/settings.py

TIER_PROGRESSION = {
  "WEAK": {
    "speed": 0.5,           # Slower progression
    "difficulty": -1,       # Easier questions
    "focus": ["core"],      # Only core concepts
  },
  "STRONG": {
    "speed": 2.0,           # Faster progression
    "difficulty": +2,       # Harder questions
    "focus": ["occasional", "rare"],
  },
}

Then restart backend:
  docker compose restart api
```

#### **5️⃣ Monitor System Health**

```
Check Endpoints:
  GET http://localhost:5000/health
    → Backend status

Check Docker Containers:
  docker ps
    → All running services

Check Logs:
  docker logs api | tail -50
    → Recent backend logs
  
  docker logs postgres
    → Database logs

Check Database:
  docker exec -it <postgres_id> psql -U apexlearn -d apexlearn_dev
    → Can run SQL queries
```

---

## 📊 Data Flow - Complete Picture

### **File Upload to AI Tutor Usage:**

```
1. ADMIN UPLOADS PDF
   ├─ File saved locally: Backend/uploads/uuid_filename.pdf
   └─ Database: INSERT Document (status=UPLOADING)

2. BACKEND PROCESSES  
   ├─ Uploads to OpenAI Files API
   │  └─ Gets openai_file_id (e.g., file-xyz123)
   ├─ Creates Vector Store
   ├─ Adds file to vector store
   └─ Database: UPDATE status=INDEXED

3. DATABASE STORES METADATA
   documents table:
   ├─ id: UUID
   ├─ original_name: "anatomy_book_ch3.pdf"
   ├─ status: "indexed"
   ├─ page_count: 45
   ├─ openai_file_id: "file-xyz123"
   ├─ vector_store_id: "vs-abc789"
   └─ created_at: timestamp

4. STUDENT USES AI TUTOR
   ├─ Selects "Anatomy" → "Cardiovascular System"
   ├─ AI retrieves: "Teach me about heart valves"
   ├─ Backend queries vector store
   │  └─ Finds relevant chunks from PDF
   ├─ AI generates response referencing PDF content
   └─ Student learns with context from uploaded materials

5. CONVERSATION PERSISTED
   chat_messages table:
   ├─ id: UUID
   ├─ session_id: UUID
   ├─ role: "user" | "assistant"
   ├─ content: Message text
   ├─ created_at: timestamp
   └─ metadata: Token count, model used, etc.
```

---

## 🔧 Troubleshooting Quick Reference

### **Problem: Files disappear after refresh**

**Check:**
```bash
# 1. Frontend console (F12 → Console)
# Should see: "[FileUpload] Fetched documents: ..."

# 2. Network tab
# GET /api/v1/documents should return 200 with files

# 3. Database
docker exec -it <postgres_id> psql -U apexlearn -d apexlearn_dev
SELECT COUNT(*) FROM documents WHERE status='indexed';
# Should show > 0

# 4. Frontend code  
# Check file-upload.jsx has useCallback with [subjectId, API_BASE]
```

**Solution:**
- Update Frontend/file-upload.jsx (already done)
- Clear browser cache and localStorage
- Close and reopen tab

---

### **Problem: AI Tutor shows "No Response" error**

**Check:**
```bash
# 1. Backend logs
docker logs api | grep -i error | tail -20

# 2. API key
echo $OPENAI_API_KEY  # Should show sk-proj-...

# 3. Vector stores accessible
python test_openai_api.py

# 4. Documents indexed
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/v1/documents?status=indexed
# Should return list of indexed documents
```

**Solution:**
- Verify OPENAI_API_KEY in .env
- Upload at least one document with status INDEXED
- Check API key has file_search permissions
- Restart backend: docker compose restart api

---

### **Problem: Page counts showing wrong numbers**

**Check:**
```bash
# 1. PyPDF2 installed
pip list | grep PyPDF2
# Should show: PyPDF2    3.0.1

# 2. Backend logs on upload
docker logs api | grep "pdf_page_count"
# Should show: pdf_page_count_extracted pages=X

# 3. Database
docker exec -it <postgres_id> psql -U apexlearn -d apexlearn_dev
SELECT original_name, page_count FROM documents;
```

**Solution:**
- Install PyPDF2: pip install PyPDF2==3.0.1
- Re-upload PDF files
- Check backend restarted

---

## 📈 Performance Monitoring

### **Key Metrics to Track**

```
1. Document Upload Success Rate
   Target: > 99%
   Query: SELECT COUNT(*) FROM documents WHERE status='indexed';

2. Average Chat Response Time
   Target: < 5 seconds
   Check logs: "response_time_ms": X

3. Mastery Completion Rate  
   Target: > 80% within 60 days
   Query: SELECT COUNT(*) FROM topic_assessments 
          WHERE mastery_status='mastered';

4. API Error Rate
   Target: < 0.1%
   Check: docker logs api | grep ERROR | wc -l
```

---

## 🚀 Quick Start Checklist

- [ ] Backend running: `docker ps | grep api`
- [ ] Frontend running: `npm run dev` in Frontend/
- [ ] Database healthy: `docker ps | grep postgres`
- [ ] Redis running: `docker ps | grep redis`
- [ ] Uploaded test document: Status INDEXED
- [ ] AI Tutor returns response (no errors)
- [ ] Page refresh preserves files
- [ ] Student can complete assessment

---

## 📚 Additional Resources

| Topic | Location | Time |
|-------|----------|------|
| Admin Setup | ADMIN_GUIDE.md | 5 min |
| File Persistence | FILE_PERSISTENCE_FIX.md | 10 min |
| Architecture | rag_service.py | 15 min |
| API Docs | http://localhost:5000/api/v1/docs | 20 min |
| Troubleshooting | This document | As needed |

---

## 🎓 Learning Resources for Students

Once system is running:

1. **Get Started**: Take diagnostic for a topic
2. **Learn**: Use AI Tutor for adaptive learning
3. **Practice**: Complete SAQ → LAQ → MCQ progression
4. **Master**: Achieve mastery and schedule revision
5. **Optimize**: Focus on high-yield content based on PYQ frequency

---

**Last Updated:** March 25, 2026 ✅  
**All Issues:** ✅ Resolved  
**Ready for:** Production Use

### 🎉 Your system is now fully operational!
