# AI Tutor & Admin Console Complete Guide

## Part 1: RAG Document Upload - Why Files Disappear & How to Fix It

### ❌ **THE PROBLEM: Files disappear after page refresh**

**Root Cause Analysis:**
1. **Files stored in local state only** - `uploadedFiles` state in React is lost on refresh
2. **Frontend doesn't call fetch on component mount** - Missing `useEffect` to load files from DB
3. **Database might not be persisting files properly** - Check if save operation completes

### ✅ **THE SOLUTION: Fix the Frontend File Persistence**

#### Step 1: Verify Backend is Saving Files
Check the document upload endpoint returns status correctly:

```bash
# After uploading a file, check Docker logs:
docker logs kalyanji_revision_dashboard-api-1 | grep "document_upload"

# You should see:
# document_upload_initiated user_id=... doc_id=... filename=...
```

#### Step 2: Verify Frontend Fetches on Load

The `FileUpload` component has `useEffect` that calls `fetchUploadedFiles()` on mount.

**To verify it's working:**
1. Open DevTools → Network tab
2. Look for GET request to `http://localhost:5000/api/v1/documents`
3. Should return list of uploaded files with statuses

**If files still don't appear:**

Add debugging to file-upload.jsx:

```javascript
// In the fetchUploadedFiles function, add logging:
const fetchUploadedFiles = async () => {
  try {
    const token = localStorage.getItem("access_token");
    const url = subjectId
      ? `${API_BASE}/documents?subject_id=${subjectId}`
      : `${API_BASE}/documents`;

    console.log("Fetching from:", url);  // 👈 ADD THIS
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    console.log("Fetched documents:", data);  // 👈 ADD THIS
    
    if (response.ok) {
      setUploadedFiles(data.documents || []);
    }
  } catch (err) {
    console.error("Failed to fetch documents:", err);
  }
};
```

#### Step 3: Understand File Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                   COMPLETE FILE UPLOAD FLOW                  │
└─────────────────────────────────────────────────────────────┘

1. USER UPLOADS FILE
   ↓
2. FRONTEND validates file
   - Type: PDF, TXT, MD, DOCX
   - Size: < 10MB
   ↓
3. FRONTEND sends to: POST /api/v1/documents
   - FormData with file and metadata
   - JWT token in Authorization header
   ↓
4. BACKEND receives & saves locally
   - Saved to ./Backend/uploads/<uuid>_filename
   - Creates Document record in PostgreSQL
   - Status: UPLOADING
   ↓
5. BACKEND uploads to OpenAI
   - Uses OpenAI Files API
   - Gets openai_file_id
   - Status: PROCESSING
   ↓
6. BACKEND adds to Vector Store
   - Uses client.vector_stores (NOT client.beta.vector_stores)
   - File indexed for semantic search
   - Status: INDEXED ✅
   ↓
7. FRONTEND refreshes
   - Calls fetchUploadedFiles()
   - Retrieves all INDEXED files from DB
   - Displays in table
```

---

## Part 2: Using the AI Tutor

### **AI Tutor Workflow**

```
┌─────────────────────────────────────────────────────┐
│             AI TUTOR STUDENT FLOW                   │
└─────────────────────────────────────────────────────┘

1. STUDENT LOGS IN
   ↓
2. OPENS "AI TUTOR" TAB
   ↓
3. SELECTS A SUBJECT
   ↓
4. SELECTS A TOPIC
   ↓
5. LEARNS (Study Material from RAG)
   - AI pulls relevant content from uploaded PDFs
   - References specific concepts
   ↓
6. TAKES DIAGNOSTIC ASSESSMENT
   - 3-4 Short Answer Questions (SAQs)
   - AI evaluates and scores each answer
   - Identifies knowledge gaps
   ↓
7. ADAPTIVE TRAINING BEGINS
   - SAQ (Conceptual) → 3 correct answers needed
   - LAQ (In-depth) → 3 correct answers needed
   - MCQ (Clinical) → 3 correct answers needed
   ↓
8. MASTERY ACHIEVED ✅
   - Scheduled for spaced revision (1, 3, 7, 14, 30 days)
```

### **Chat Tips**

**DO:**
- Ask specific medical questions
- Request explanations of concepts
- Ask for clinical scenarios
- Request high-yield summaries

**DON'T:**
- Ask unrelated general knowledge questions
- Expect it to access external internet
- Use for real medical advice (it's an edutech tool)

---

## Part 3: NEET-PG Admin Console Configuration

### **Login as Admin**

1. Access: `http://localhost:5173/admin`
2. Login with admin credentials

### **Five Main Configuration Sections**

#### **1. CONFIGURE AI MODELS**

**Purpose:** Control AI behavior and response generation

**Settings:**
- **OPENAI_MODEL**: `gpt-4-turbo-preview` (or `gpt-4o`)
- **OPENAI_MAX_TOKENS**: 1024 (max response length)
- **OPENAI_TEMPERATURE**: 0.7 (creativity: 0=precise, 1=creative)

**How to update:**

```bash
# Edit Backend/.env file:
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=1024
OPENAI_TEMPERATURE=0.7

# Restart backend:
docker compose restart api
```

**Impact on Students:**
- Higher temperature → More varied questions
- More tokens → Longer explanations
- Better model → More accurate answers

---

#### **2. MANAGE RAG DOCUMENTS**

**Purpose:** Upload study materials that AI uses for retrieval

**Process:**

```
Admin Console → Upload Documents
   ↓
Select File (PDF, DOCX, TXT)
   ↓
Assign Subject (Anatomy, Physiology, etc.)
   ↓
Add Description
   ↓
WAIT for Status: INDEXED ✅
   ↓
AI can now reference this in tutor sessions
```

**Monitoring Document Status:**

| Status | Meaning | Action |
|--------|---------|--------|
| ⏳ UPLOADING | File being saved | Wait... |
| ⏳ PROCESSING | Uploading to OpenAI | Wait... |
| ✅ INDEXED | Ready for AI to use | ✓ Active |
| ❌ FAILED | Error occurred | Delete & retry |

**Best Practices:**
- Upload high-quality, well-structured PDFs
- Use latest editions of textbooks
- Include one document per major topic
- Ensure PDFs are OCR'd if scanned

---

#### **3. MANAGE PYQ INTELLIGENCE**

**Purpose:** Connect previous year questions to topics for intelligent testing

**Configuration:**

```
Admin Console → PYQ Management
   ↓
Categorize Each PYQ by Frequency:

🔴 CORE (18+ times in PYQs)
   - Non-negotiable memorization
   
🟠 FREQUENT (8-17 times)
   - High likelihood of appearing
   
🟡 OCCASIONAL (3-7 times)
   - Medium priority
   
⚪ RARE (< 3 times)
   - Low priority unless strong
```

**How AI Uses This:**

- **Strong Students** → Focuses on RARE to OCCASIONAL gaps
- **Weak Students** → Focuses on CORE first
- **Mastery Training** → Pulls questions from FREQUENT and CORE banks

**Add PYQs:**

```
Upload PYQ CSV with columns:
- subject_id
- topic_id
- year
- question
- options (JSON)
- correct_idx
- category (core/frequent/occasional/rare)
- difficulty (easy/medium/hard)
```

---

#### **4. ADAPTIVE STUDENT TIERS**

**Purpose:** Personalize difficulty based on student performance

**Four Tiers:**

```
WEAK (0-25% scores)
├─ Simpler questions
├─ More explanations
├─ Focus on CORE concepts only
└─ Slower progression

AVERAGE (26-50% scores)
├─ Mixed SAQ + MCQ
├─ Standard explanations
├─ Mix of CORE + FREQUENT
└─ Normal progression

GOOD (51-75% scores)
├─ Advanced LAQs + Clinical MCQs
├─ Concise explanations
├─ FREQUENT + OCCASIONAL focus
└─ Faster progression

STRONG (76-100% scores)
├─ Edge cases + Differentiation Qs
├─ Minimal explanations
├─ OCCASIONAL + RARE focus
└─ Mastery-level challenges
```

**Configure Thresholds:**

Edit `Backend/config/settings.py`:

```python
# Mastery level progression rules
MASTERY_THRESHOLDS = {
    "SAQ_THRESHOLD": 60,      # 60%+ to pass SAQ layer
    "LAQ_THRESHOLD": 65,
    "MCQ_THRESHOLD": 70,
}

TIER_PROGRESSION = {
    "WEAK": {"speed": 0.5, "difficulty": -1, "focus": ["core"]},
    "AVERAGE": {"speed": 1.0, "difficulty": 0, "focus": ["core", "frequent"]},
    "GOOD": {"speed": 1.5, "difficulty": +1, "focus": ["frequent", "occasional"]},
    "STRONG": {"speed": 2.0, "difficulty": +2, "focus": ["occasional", "rare"]},
}
```

---

#### **5. MODEL & BEHAVIOR CONFIGURATION**

**AI Personality Modes:**

Available in Admin Console → AI Behavior Tags

**Preset Personas:**

| Persona | Best For | Style |
|---------|----------|-------|
| Study Companion | Motivation | Warm, encouraging |
| Strict Teacher | Accountability | Formal, demanding |
| Cross Questioner | Deep learning | Challenges everything |
| Socratic Guide | Discovery | Questions lead to answers |
| Devil's Advocate | Confidence | Tests boundary conditions |

**Configure Response Format:**

```python
SYSTEM_PROMPTS = {
    "diagnostic": "Ask 3-4 SAQs to assess..."
    "adaptive": "Adjust difficulty based on level..."
    "mastery": "Progress SAQ → LAQ → MCQ..."
    "pyq": "Map concepts to PYQ frequency..."
}
```

---

## Part 4: Admin Console URL & Access

### **Access Points:**

```
Frontend Admin:     http://localhost:5173/admin
Backend API Docs:   http://localhost:5000/api/v1/docs
Backend Health:     http://localhost:5000/health
```

### **Admin Endpoints to Know:**

```bash
# Upload Document
POST /api/v1/admin/documents
  - File upload with subject_id

# Get All Documents
GET /api/v1/admin/documents?status=indexed

# Create PYQ
POST /api/v1/admin/pyqs
  - Create previous year question

# Configure System
GET/POST /api/v1/admin/config
  - Manage model settings, thresholds, etc.

# Student Analytics
GET /api/v1/admin/analytics/students
  - Performance metrics by student/subject
```

---

## Part 5: Troubleshooting Checklist

### **Files Still Disappearing?**

```
☐ Backend running? (docker ps | grep api)
☐ Database connected? (docker ps | grep postgres)
☐ Logs show "document_upload_initiated"? 
☐ API responds to GET /api/v1/documents?
☐ Document status is INDEXED (not PROCESSING)?
☐ Portfolio refreshes useEffect (check with console.log)?
```

### **AI Tutor Returns "No Response"?**

```
☐ Backend API running?
☐ OPENAI_API_KEY set in .env?
☐ API key valid (test with test_openai_api.py)?
☐ Vector store has documents (status: INDEXED)?
☐ Student selected a subject and topic?
☐ Check browser console for errors
☐ Check backend logs: docker logs ... | tail -50
```

### **Documents Not Appearing in Vector Store?**

```
☐ File uploaded without errors?
☐ OpenAI credentials valid?
☐ File type supported (PDF, TXT, DOCX)?
☐ File size < 10MB?
☐ Check: docker logs ... | grep "pdf_page_count"
☐ Check: docker logs ... | grep "document_vectorized"
```

---

## Part 6: Quick Start - Upload & Test

### **5-Minute Setup:**

```bash
# 1. Start backend
cd Backend
docker compose up -d

# 2. Check backend is healthy
curl http://localhost:5000/health

# 3. Login as admin at frontend
# Default: admin@example.com / password

# 4. Upload a test PDF
- Go to Admin Console
- Upload one PDF for Anatomy
- WAIT until status shows INDEXED

# 5. Test AI Tutor
- Logout as admin, login as student
- Go to AI Tutor
- Select Anatomy
- Select a topic
- Ask a question
- AI should respond with context from your PDF
```

---

## Summary

| Task | Location | Time |
|------|----------|------|
| Upload Documents | Admin Console | 2 min |
| Configure AI Models | `.env` + Docker | 5 min |
| Manage PYQs | Admin → PYQ Mgmt | 10 min |
| Set Student Tiers | `config/settings.py` | 5 min |
| Test AI Tutor | Student View | 2 min |
| Monitor Status | Admin Dashboard | 1 min |

**Total Setup Time: ~25 minutes** ⏱️

Now your NEET-PG revision platform is fully configured! 🎓
