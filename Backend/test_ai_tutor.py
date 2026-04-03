#!/usr/bin/env python3
"""
Test to find the actual issue with AI Tutor chat streaming.
"""

import os
import sys
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

def test_vector_stores():
    """Test vector stores in different ways."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    print("\n1. Testing client.beta.vector_stores...")
    try:
        stores = client.beta.vector_stores.list(limit=1)
        print(f"   ✓ Works! Found {len(stores.data)} stores")
    except AttributeError as e:
        print(f"   ✗ AttributeError: {e}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    print("\n2. Testing client.vector_stores...")
    try:
        stores = client.vector_stores.list(limit=1)
        print(f"   ✓ Works! Found {len(stores.data)} stores")
    except AttributeError as e:
        print(f"   ✗ AttributeError: {e}")
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    print("\n3. Checking client.beta attributes...")
    try:
        beta_attrs = [x for x in dir(client.beta) if not x.startswith('_')]
        print(f"   Found: {', '.join(beta_attrs[:10])}...")
        if 'vector_stores' in beta_attrs:
            print("   ✓ vector_stores is in beta")
        else:
            print("   ✗ vector_stores NOT in beta")
    except Exception as e:
        print(f"   ✗ Error: {e}")

def test_assistants_with_file_search():
    """Test creating an assistant with file_search."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    print("\n4. Testing assistants with file_search...")
    try:
        assistants = client.beta.assistants.list(limit=1)
        print(f"   ✓ Can list assistants. Found {len(assistants.data)}")
        
        if len(assistants.data) == 0:
            print("   Note: No assistants created yet. Creating one...")
            asst = client.beta.assistants.create(
                name="Test Assistant",
                model="gpt-4o",
                tools=[{"type": "file_search"}],
            )
            print(f"   ✓ Created assistant: {asst.id}")
    except Exception as e:
        print(f"   ✗ Error: {e}")

def test_threads():
    """Test creating and streaming a thread."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    print("\n5. Testing thread creation...")
    try:
        thread = client.beta.threads.create(
            messages=[
                {"role": "user", "content": "Hello test"}
            ]
        )
        print(f"   ✓ Created thread: {thread.id}")
        
        # Clean up
        client.beta.threads.delete(thread.id)
        print(f"   ✓ Deleted thread")
    except Exception as e:
        print(f"   ✗ Error: {e}")

if __name__ == "__main__":
    print("=" * 70)
    print("AI Tutor Diagnostic Test")
    print("=" * 70)
    
    test_vector_stores()
    test_assistants_with_file_search()
    test_threads()
    
    print("\n" + "=" * 70)
    print("Diagnostic Complete")
    print("=" * 70)
