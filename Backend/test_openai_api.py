#!/usr/bin/env python3
"""
Test script to diagnose OpenAI API connectivity and configuration.
Run with: python test_openai_api.py
"""

import os
import sys
from dotenv import load_dotenv
from openai import OpenAI, AuthenticationError, APIError

# Load environment variables
load_dotenv()

def test_api_key():
    """Test if API key is configured."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    
    print("=" * 70)
    print("OpenAI API Configuration Test")
    print("=" * 70)
    print()
    
    if not api_key:
        print("❌ OPENAI_API_KEY is not set in environment")
        return False
    
    if len(api_key) < 20:
        print("❌ OPENAI_API_KEY appears to be invalid (too short)")
        return False
    
    print("✓ OPENAI_API_KEY is configured")
    print(f"  Key prefix: {api_key[:10]}...{api_key[-7:]}")
    print()
    return True

def test_client_creation():
    """Test if OpenAI client can be created."""
    print("Testing OpenAI client creation...")
    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        print("✓ OpenAI client created successfully")
        return client
    except AuthenticationError as e:
        print(f"❌ Authentication Error: {e}")
        return None
    except Exception as e:
        print(f"❌ Error creating client: {e}")
        return None

def test_api_connectivity(client):
    """Test if API is reachable."""
    print("\nTesting API connectivity...")
    try:
        # List models to test basic connectivity
        models = client.models.list()
        print(f"✓ API is reachable. Available models: {len(models.data)} models")
        return True
    except AuthenticationError as e:
        print(f"❌ Authentication failed: {e}")
        print("   → Check if your API key is valid and not expired")
        return False
    except APIError as e:
        print(f"❌ API Error: {e}")
        print(f"   → Status: {e.status_code}")
        return False
    except Exception as e:
        print(f"❌ Error testing connectivity: {e}")
        return False

def test_vector_stores(client):
    """Test vector store access."""
    print("\nTesting vector store access...")
    try:
        stores = client.beta.vector_stores.list(limit=5)
        print(f"✓ Vector stores accessible. Found {len(stores.data)} stores")
        if stores.data:
            for store in stores.data[:3]:
                print(f"   - {store.name} ({store.id})")
        return True
    except AuthenticationError as e:
        print(f"❌ Authentication failed: {e}")
        return False
    except AttributeError as e:
        print(f"❌ Vector stores API not available: {e}")
        print("   → Ensure you're using OpenAI API v1.0+")
        return False
    except Exception as e:
        print(f"❌ Error accessing vector stores: {e}")
        return False

def test_assistants(client):
    """Test assistants API."""
    print("\nTesting assistants API...")
    try:
        assistants = client.beta.assistants.list(limit=5)
        print(f"✓ Assistants API accessible. Found {len(assistants.data)} assistants")
        if assistants.data:
            for asst in assistants.data[:3]:
                print(f"   - {asst.name} ({asst.id})")
        return True
    except AuthenticationError as e:
        print(f"❌ Authentication failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Error accessing assistants: {e}")
        return False

def test_chat_completions(client):
    """Test basic chat completion."""
    print("\nTesting chat completions...")
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Say 'OpenAI API working!'"}],
            max_tokens=10,
        )
        print("✓ Chat completions working")
        print(f"  Response: {response.choices[0].message.content}")
        return True
    except AuthenticationError as e:
        print(f"❌ Authentication failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Error with chat completions: {e}")
        return False

def main():
    print("\n")
    
    # Test 1: API Key configuration
    if not test_api_key():
        print("\n" + "=" * 70)
        print("Diagnostic: API key not configured")
        print("=" * 70)
        return 1
    
    # Test 2: Client creation
    client = test_client_creation()
    if not client:
        print("\n" + "=" * 70)
        print("Diagnostic: Could not create OpenAI client")
        print("=" * 70)
        return 1
    
    # Test 3: API Connectivity
    if not test_api_connectivity(client):
        print("\n" + "=" * 70)
        print("Diagnostic: API is not reachable or key is invalid")
        print("=" * 70)
        return 1
    
    # Test 4: Vector Stores
    test_vector_stores(client)
    
    # Test 5: Assistants
    test_assistants(client)
    
    # Test 6: Chat Completions
    test_chat_completions(client)
    
    print("\n" + "=" * 70)
    print("✓ All tests passed! OpenAI API is configured and working.")
    print("=" * 70)
    print()
    return 0

if __name__ == "__main__":
    sys.exit(main())
