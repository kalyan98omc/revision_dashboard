#!/usr/bin/env python
"""
openai_setup.py
───────────────
Setup and verification script for OpenAI Vector Store integration.
Run this AFTER deploying to verify everything is configured correctly.

Usage:
    python openai_setup.py verify       # Verify all configurations
    python openai_setup.py check-docs   # Check document status
    python openai_setup.py retry-failed # Retry failed documents
"""

import os
import sys
from pprint import pprint
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from openai import OpenAI, OpenAIError
from dotenv import load_dotenv

load_dotenv()


def print_header(title: str):
    """Print formatted section header."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def print_success(msg: str):
    """Print success message."""
    print(f"✓ {msg}")


def print_error(msg: str):
    """Print error message."""
    print(f"✗ {msg}")


def print_warning(msg: str):
    """Print warning message."""
    print(f"⚠ {msg}")


def print_info(msg: str):
    """Print info message."""
    print(f"ℹ {msg}")


def verify_env_vars():
    """Check if required environment variables are set."""
    print_header("1. Environment Configuration")
    
    required_vars = {
        "OPENAI_API_KEY": "OpenAI API Key for authentication",
        "OPENAI_MODEL": "OpenAI Model (e.g., gpt-4o, gpt-4-turbo-preview)",
        "DATABASE_URL": "Database connection string",
    }
    
    all_set = True
    for var, description in required_vars.items():
        value = os.getenv(var)
        if value:
            masked = value[:10] + "..." if len(value) > 10 else value
            print_success(f"{var} is set: {masked}")
        else:
            print_error(f"{var} is NOT set")
            print_info(f"   Description: {description}")
            all_set = False
    
    return all_set


def verify_openai_connection():
    """Test connection to OpenAI API."""
    print_header("2. OpenAI API Connection")
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print_error("OPENAI_API_KEY not set. Cannot proceed.")
        return False
    
    try:
        client = OpenAI(api_key=api_key)
        
        # Test basic API call
        print_info("Testing API connection...")
        models = client.models.list(limit=1)
        print_success("Connected to OpenAI API")
        print_info(f"   Sample model available: {models.data[0].id}")
        return True
    except OpenAIError as e:
        print_error(f"Failed to connect to OpenAI: {e}")
        return False
    except Exception as e:
        print_error(f"Error: {e}")
        return False


def verify_vector_store(client: OpenAI):
    """Check or create vector store."""
    print_header("3. Vector Store Setup")
    
    try:
        # List existing vector stores
        stores = client.beta.vector_stores.list(limit=100)
        
        neetpg_store = None
        for store in stores.data:
            if store.name == "neetpg-revision-docs":
                neetpg_store = store
                break
        
        if neetpg_store:
            print_success(f"Found existing vector store: {neetpg_store.id}")
            print_info(f"   Name: {neetpg_store.name}")
            if hasattr(neetpg_store, 'file_counts'):
                print_info(f"   Total files: {neetpg_store.file_counts.total}")
                print_info(f"   Processing: {neetpg_store.file_counts.in_progress}")
                print_info(f"   Completed: {neetpg_store.file_counts.completed}")
            return neetpg_store.id
        else:
            print_warning("Vector store 'neetpg-revision-docs' not found. Creating...")
            new_store = client.beta.vector_stores.create(name="neetpg-revision-docs")
            print_success(f"Created new vector store: {new_store.id}")
            return new_store.id
    
    except Exception as e:
        print_error(f"Error managing vector store: {e}")
        return None


def verify_assistant(client: OpenAI, vector_store_id: str):
    """Check or create AI assistant."""
    print_header("4. AI Assistant Setup")
    
    try:
        # List existing assistants
        assistants = client.beta.assistants.list(limit=100)
        
        neetpg_assistant = None
        for a in assistants.data:
            if a.name == "NEET-PG Revision Assistant":
                neetpg_assistant = a
                break
        
        if neetpg_assistant:
            print_success(f"Found existing assistant: {neetpg_assistant.id}")
            print_info(f"   Name: {neetpg_assistant.name}")
            print_info(f"   Model: {neetpg_assistant.model}")
            return neetpg_assistant.id
        else:
            print_warning("Assistant 'NEET-PG Revision Assistant' not found. Creating...")
            assistant = client.beta.assistants.create(
                name="NEET-PG Revision Assistant",
                instructions="""You are an expert NEET-PG medical exam tutor with access to uploaded 
study materials and previous year questions. Help students master topics through adaptive learning.""",
                model=os.getenv("OPENAI_MODEL", "gpt-4-turbo-preview"),
                tools=[{"type": "file_search"}],
                tool_resources={
                    "file_search": {
                        "vector_store_ids": [vector_store_id]
                    }
                },
            )
            print_success(f"Created new assistant: {assistant.id}")
            return assistant.id
    
    except Exception as e:
        print_error(f"Error managing assistant: {e}")
        return None


def check_database():
    """Verify database connection."""
    print_header("5. Database Connection")
    
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print_error("DATABASE_URL not set")
        return False
    
    try:
        from flask import Flask
        from flask_sqlalchemy import SQLAlchemy
        
        app = Flask(__name__)
        app.config["SQLALCHEMY_DATABASE_URI"] = db_url
        db = SQLAlchemy(app)
        
        # Try to connect
        with app.app_context():
            result = db.session.execute("SELECT 1")
            result.fetchall()
        
        print_success("Database connection successful")
        return True
    except Exception as e:
        print_error(f"Database connection failed: {e}")
        return False


def check_documents_status():
    """Check status of uploaded documents."""
    print_header("6. Document Status Check")
    
    try:
        from app import create_app
        from app.models.models import Document, DocumentStatus
        
        app = create_app()
        with app.app_context():
            docs = Document.query.all()
            
            if not docs:
                print_warning("No documents found in database")
                return
            
            status_counts = {}
            for doc in docs:
                status = doc.status.value
                status_counts[status] = status_counts.get(status, 0) + 1
            
            print_success(f"Found {len(docs)} documents")
            print("\n  Status Summary:")
            for status, count in sorted(status_counts.items()):
                print(f"    • {status}: {count}")
            
            # Show details for non-indexed documents
            non_indexed = [d for d in docs if d.status != DocumentStatus.INDEXED]
            if non_indexed:
                print("\n  Documents needing attention:")
                for doc in non_indexed:
                    print(f"    • {doc.original_name} ({doc.status.value})")
                    if doc.error_message:
                        print(f"      Error: {doc.error_message}")
    
    except Exception as e:
        print_error(f"Could not check documents: {e}")


def full_verification():
    """Run complete verification."""
    print("\n")
    print_header("OPENAI VECTOR STORE INTEGRATION VERIFICATION")
    
    results = {
        "env_vars": verify_env_vars(),
        "openai_connection": verify_openai_connection(),
    }
    
    if results["openai_connection"]:
        api_key = os.getenv("OPENAI_API_KEY")
        client = OpenAI(api_key=api_key)
        
        vector_store_id = verify_vector_store(client)
        results["vector_store"] = bool(vector_store_id)
        
        if vector_store_id:
            assistant_id = verify_assistant(client, vector_store_id)
            results["assistant"] = bool(assistant_id)
    
    # Optional: check database if running with Flask context
    try:
        results["database"] = check_database()
        check_documents_status()
    except Exception:
        pass
    
    # Summary
    print_header("VERIFICATION SUMMARY")
    for check, passed in results.items():
        status = "PASS" if passed else "FAIL"
        symbol = "✓" if passed else "✗"
        print(f"{symbol} {check.replace('_', ' ').title()}: {status}")
    
    all_passed = all(results.values())
    
    print()
    if all_passed:
        print_success("All checks passed! OpenAI integration is ready.")
    else:
        print_error("Some checks failed. Please review errors above.")
    
    return all_passed


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "verify"
    
    if command == "verify":
        success = full_verification()
        sys.exit(0 if success else 1)
    
    elif command == "check-docs":
        print_header("CHECKING DOCUMENT STATUS")
        check_documents_status()
    
    elif command == "retry-failed":
        print_header("RETRYING FAILED DOCUMENTS")
        try:
            from app import create_app
            from app.models.models import Document, DocumentStatus
            from app.services.admin_service import AdminService
            
            app = create_app()
            with app.app_context():
                failed_docs = Document.query.filter_by(status=DocumentStatus.FAILED).all()
                
                if not failed_docs:
                    print_success("No failed documents found")
                else:
                    print_info(f"Found {len(failed_docs)} failed documents")
                    for doc in failed_docs:
                        print(f"\nRetrying {doc.original_name}...")
                        try:
                            result = AdminService.retry_document(doc.id)
                            print_success(f"✓ Successfully retried: {doc.original_name}")
                        except Exception as e:
                            print_error(f"✗ Retry failed: {e}")
        except Exception as e:
            print_error(f"Could not retry documents: {e}")
    
    else:
        print(f"Unknown command: {command}")
        print("\nUsage:")
        print("  python openai_setup.py verify       # Verify all configurations")
        print("  python openai_setup.py check-docs   # Check document status")
        print("  python openai_setup.py retry-failed # Retry failed documents")
