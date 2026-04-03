#!/usr/bin/env python3
"""
Test AI Tutor chat streaming functionality.
"""

import os
import sys
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

def test_chat_streamingwith_assistant():
    """Test streaming with assistant and file_search."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    print("\n" + "=" * 70)
    print("Testing Chat Streaming with Assistant (Deprecated API)")
    print("=" * 70)
    
    try:
        # Get or create assistant
        assistants = client.beta.assistants.list(limit=5)
        if assistants.data:
            assistant_id = assistants.data[0].id
            print(f"✓ Using existing assistant: {assistant_id}")
        else:
            print("✗ No assistants found - creating one...")
            asst = client.beta.assistants.create(
                name="Test Chat Assistant",
                model="gpt-4o",
                instructions="You are a helpful assistant.",
                tools=[{"type": "file_search"}],
            )
            assistant_id = asst.id
            print(f"✓ Created assistant: {assistant_id}")
        
        # Create thread with message
        print("\nCreating thread and streaming response...")
        thread = client.beta.threads.create(
            messages=[
                {"role": "user", "content": "Say hello"}
            ]
        )
        print(f"✓ Created thread: {thread.id}")
        
        # Stream response
        print("\nStreaming assistant response:")
        print("-" * 50)
        with client.beta.threads.runs.stream(
            thread_id=thread.id,
            assistant_id=assistant_id,
            instructions="Respond briefly.",
        ) as stream:
            for event in stream:
                if event.event == "thread.message.delta":
                    for block in (event.data.delta.content or []):
                        if block.type == "text" and block.text and block.text.value:
                            print(block.text.value, end="", flush=True)
        
        print("\n" + "-" * 50)
        print("✓ Streaming completed successfully")
        
        # Clean up
        client.beta.threads.delete(thread.id)
        print(f"✓ Cleaned up thread")
        
        return True
        
    except DeprecationWarning as w:
        print(f"⚠️  Deprecation warning: {w}")
        print("   Note: Assistants API is deprecated but still functional")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_vector_stores_working():
    """Verify vector stores are accessible."""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    print("\n" + "=" * 70)
    print("Testing Vector Stores API")
    print("=" * 70)
    
    try:
        stores = client.beta.vector_stores.list(limit=10)
        print(f"✓ Vector stores API accessible")
        print(f"✓ Found {len(stores.data)} vector store(s)")
        for store in stores.data:
            print(f"  - {store.name} ({store.id})")
        return True
    except Exception as e:
        print(f"✗ Error accessing vector stores: {e}")
        return False

if __name__ == "__main__":
    print("\n🔍 AI Tutor ChatStreaming Diagnostic\n")
    
    all_pass = True
    all_pass = test_vector_stores_working() and all_pass
    all_pass = test_chat_streamingwith_assistant() and all_pass
    
    print("\n" + "=" * 70)
    if all_pass:
        print("✓ All tests passed! AI Tutor should be working now.")
    else:
        print("✗ Some tests failed. Check the output above.")
    print("=" * 70 + "\n")
    
    sys.exit(0 if all_pass else 1)
