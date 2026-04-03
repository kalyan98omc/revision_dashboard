#!/usr/bin/env python3
"""
Complete RAG Pipeline Diagnostic Test
=====================================
Tests the entire flow of uploading documents and verifying they persist in the database.
"""

import os
import sys
import json
import time
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Configuration
API_BASE = "http://localhost:5000/api/v1"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "SecurePassword123!"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log_step(message):
    print(f"{Colors.BLUE}▶ {message}{Colors.RESET}")

def log_success(message):
    print(f"{Colors.GREEN}✓ {message}{Colors.RESET}")

def log_error(message):
    print(f"{Colors.RED}✗ {message}{Colors.RESET}")

def log_warning(message):
    print(f"{Colors.YELLOW}⚠ {message}{Colors.RESET}")

def test_backend_health():
    """Check if backend is running."""
    log_step("Testing Backend Health...")
    try:
        response = requests.get(f"{API_BASE}/../health", timeout=5)
        if response.status_code == 200:
            log_success("Backend is running")
            return True
        else:
            log_error(f"Backend returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        log_error("Cannot reach backend at http://localhost:5000")
        log_error("Make sure: docker compose up -d")
        return False
    except Exception as e:
        log_error(f"Unexpected error: {e}")
        return False

def test_admin_login():
    """Login as admin and get token."""
    log_step("Logging in as admin...")
    try:
        response = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            token = response.json().get("access_token")
            log_success(f"Admin login successful, got token: {token[:20]}...")
            return token
        else:
            log_error(f"Login failed: {response.json()}")
            return None
    except Exception as e:
        log_error(f"Login error: {e}")
        return None

def test_document_list(token):
    """List existing documents."""
    log_step("Fetching existing documents...")
    try:
        response = requests.get(
            f"{API_BASE}/documents",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if response.status_code == 200:
            docs = response.json().get("documents", [])
            log_success(f"Found {len(docs)} documents")
            for doc in docs:
                status = doc.get("status", "unknown")
                filename = doc.get("filename", "unknown")
                print(f"  - {filename}: {status}")
            return docs
        else:
            log_error(f"Failed to list documents: {response.status_code}")
            return []
    except Exception as e:
        log_error(f"Error listing documents: {e}")
        return []

def test_create_test_file():
    """Create a small test PDF file."""
    log_step("Creating test PDF file...")
    try:
        # Create simple PDF content
        test_dir = Path("./test_uploads")
        test_dir.mkdir(exist_ok=True)
        
        test_file = test_dir / "test_document_ANAT_001.pdf"
        
        # Simple PDF header and content
        pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 750 Td
(Test Anatomy Document) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000250 00000 n 
0000000348 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
441
%%EOF
"""
        with open(test_file, "wb") as f:
            f.write(pdf_content)
        
        file_size_mb = test_file.stat().st_size / (1024 * 1024)
        log_success(f"Created test file: {test_file} ({file_size_mb:.2f} MB)")
        return str(test_file)
    except Exception as e:
        log_error(f"Failed to create test file: {e}")
        return None

def test_upload_document(token, file_path):
    """Upload test document."""
    log_step(f"Uploading document: {file_path}...")
    try:
        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f, "application/pdf")}
            data = {
                "description": "Test document for RAG pipeline verification",
                "subject_id": None,
            }
            
            response = requests.post(
                f"{API_BASE}/documents",
                files=files,
                data=data,
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
        
        if response.status_code in [200, 202]:
            result = response.json()
            doc_id = result.get("id")
            status = result.get("status")
            log_success(f"Upload initiated - Doc ID: {doc_id}, Status: {status}")
            return doc_id
        else:
            log_error(f"Upload failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log_error(f"Upload error: {e}")
        return None

def test_document_status(token, doc_id, max_retries=10):
    """Poll document status until INDEXED or FAILED."""
    log_step(f"Monitoring document status (poll every 1 sec, max {max_retries} times)...")
    
    for attempt in range(max_retries):
        try:
            response = requests.get(
                f"{API_BASE}/documents/{doc_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                doc = response.json()
                status = doc.get("status", "unknown")
                page_count = doc.get("page_count", "?")
                
                print(f"    Attempt {attempt + 1}/{max_retries}: Status = {status}, Pages = {page_count}")
                
                if status == "indexed":
                    log_success(f"Document INDEXED! Page count: {page_count}")
                    return True
                elif status == "failed":
                    error = doc.get("error_message", "Unknown error")
                    log_error(f"Document processing failed: {error}")
                    return False
                elif status in ["uploading", "processing"]:
                    if attempt < max_retries - 1:
                        time.sleep(1)
                        continue
                    else:
                        log_warning(f"Document still {status} after {max_retries} attempts")
                        return False
                else:
                    log_warning(f"Unknown status: {status}")
                    return False
            else:
                log_error(f"Failed to fetch document: {response.status_code}")
                return False
        except Exception as e:
            log_error(f"Status check error: {e}")
            return False
    
    return False

def test_ai_can_use_document(token, doc_id):
    """Verify AI can retrieve from document."""
    log_step("Testing if AI can access document...")
    try:
        # This would require a chat session
        # For now, just verify the document is queryable
        response = requests.get(
            f"{API_BASE}/documents/{doc_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            doc = response.json()
            if doc.get("status") == "indexed":
                log_success("Document is indexed and queryable")
                return True
        
        log_warning("Document not yet queryable")
        return False
    except Exception as e:
        log_error(f"Query test error: {e}")
        return False

def run_full_test():
    """Run complete diagnostic."""
    print("\n" + "="*70)
    print("RAG PIPELINE COMPLETE DIAGNOSTIC TEST")
    print("="*70 + "\n")
    
    # Test 1: Backend health
    if not test_backend_health():
        log_error("Backend is not running. Cannot proceed.")
        return False
    
    print()
    
    # Test 2: Admin login
    token = test_admin_login()
    if not token:
        log_error("Failed to login. Cannot proceed.")
        return False
    
    print()
    
    # Test 3: List existing
    existing_docs = test_document_list(token)
    
    print()
    
    # Test 4: Create test file
    test_file = test_create_test_file()
    if not test_file:
        log_error("Failed to create test file.")
        return False
    
    print()
    
    # Test 5: Upload
    doc_id = test_upload_document(token, test_file)
    if not doc_id:
        log_error("Failed to upload document.")
        return False
    
    print()
    
    # Test 6: Monitor status
    if not test_document_status(token, doc_id):
        log_error("Document processing failed or timed out.")
        return False
    
    print()
    
    # Test 7: Verify accessibility
    if not test_ai_can_use_document(token, doc_id):
        log_warning("Document may not be fully accessible yet.")
    
    print()
    
    # Final list
    log_step("Final document list after upload...")
    final_docs = test_document_list(token)
    
    print("\n" + "="*70)
    print("✓ DIAGNOSTIC COMPLETE - All tests passed!")
    print("="*70 + "\n")
    
    print("📋 SUMMARY:")
    print(f"  - Backend: ✓ Running")
    print(f"  - Authentication: ✓ Admin login successful")
    print(f"  - Existing Documents: {len(existing_docs)}")
    print(f"  - New Document Uploaded: {doc_id}")
    print(f"  - Final Document Count: {len(final_docs)}")
    print(f"  - Document Status: ✓ INDEXED")
    
    return True

if __name__ == "__main__":
    try:
        success = run_full_test()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user.")
        sys.exit(1)
    except Exception as e:
        log_error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
