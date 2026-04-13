"""
app/services/quiz_engine.py
───────────────────────────
Quiz Engine Service — AI-powered quiz generation with RAG.
Handles OpenAI integration, vector search, and adaptive quiz creation.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import structlog
from flask import current_app
from anthropic import Anthropic
from sentence_transformers import SentenceTransformer

from app.extensions import db
from app.models.models import (
    QuizTemplate, QuizGeneration, Quiz, QuizQuestion,
    VectorDocument, Document, Subject, Topic, QuizDifficulty, DocumentStatus
)
from app.repositories.repositories import (
    QuizTemplateRepository, QuizGenerationRepository,
    VectorDocumentRepository, DocumentRepository
)

log = structlog.get_logger(__name__)


class QuizEngineService:

    @staticmethod
    def create_template(
        name: str,
        subject_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        difficulty: str = "medium",
        question_count: int = 10,
        time_limit_minutes: int = 15,
        prompt_template: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> dict:
        """Create a new quiz template."""
        if not prompt_template:
            prompt_template = QuizEngineService._get_default_prompt_template()

        template = QuizTemplateRepository.create(
            name=name,
            subject_id=subject_id,
            topic_id=topic_id,
            difficulty=QuizDifficulty(difficulty.lower()),
            question_count=question_count,
            time_limit_minutes=time_limit_minutes,
            prompt_template=prompt_template,
            created_by=created_by,
        )
        db.session.commit()
        return template.to_dict()

    @staticmethod
    def generate_quiz(
        template_id: str,
        user_id: str,
        custom_query: Optional[str] = None,
    ) -> dict:
        """Generate a quiz using AI and vector search."""
        template = QuizTemplateRepository.get_by_id(template_id)
        if not template:
            raise ValueError("Template not found")

        # Create generation record
        generation = QuizGenerationRepository.create(
            template_id=template_id,
            user_id=user_id,
            status=DocumentStatus.PROCESSING,
        )
        db.session.commit()

        try:
            # Perform vector search to get relevant content
            vector_query = custom_query or QuizEngineService._build_vector_query(template)
            relevant_docs = QuizEngineService._search_vectors(vector_query, template.subject_id, limit=5)

            # Generate quiz using Anthropic
            quiz_data = QuizEngineService._generate_with_anthropic(template, relevant_docs, vector_query)

            # Create the quiz
            quiz = QuizEngineService._create_quiz_from_generation(template, quiz_data, user_id)

            # Update generation record
            generation.quiz_id = quiz.id
            generation.status = DocumentStatus.READY
            generation.vector_query = vector_query
            generation.generated_content = quiz_data
            db.session.commit()

            return {
                "generation_id": generation.id,
                "quiz": quiz.to_dict(include_questions=True),
            }

        except Exception as e:
            log.exception("quiz_generation_failed", generation_id=generation.id, error=str(e))
            generation.status = DocumentStatus.FAILED
            generation.error_message = str(e)
            db.session.commit()
            raise

    @staticmethod
    def _build_vector_query(template: QuizTemplate) -> str:
        """Build a vector search query from template."""
        parts = []
        if template.subject:
            parts.append(f"subject: {template.subject.name}")
        if template.topic:
            parts.append(f"topic: {template.topic.name}")
        parts.append(f"difficulty: {template.difficulty.value}")
        return " ".join(parts)

    @staticmethod
    def _search_vectors(query: str, subject_id: Optional[str] = None, limit: int = 5) -> List[Dict]:
        """Search vector database for relevant content."""
        # For now, use simple text search. In production, integrate with Pinecone/Chroma
        docs = VectorDocumentRepository.search_by_content(query, subject_id=subject_id, limit=limit)
        return [doc.to_dict() for doc in docs]

    @staticmethod
    def _generate_with_anthropic(
        template: QuizTemplate,
        relevant_docs: List[Dict],
        vector_query: str,
    ) -> Dict:
        """Generate quiz using Anthropic API."""
        client = Anthropic(api_key=current_app.config.get("ANTHROPIC_API_KEY"))

        # Build context from relevant documents
        context = "\n\n".join([doc["content"] for doc in relevant_docs])

        prompt = template.prompt_template.format(
            subject=template.subject.name if template.subject else "General",
            topic=template.topic.name if template.topic else "Various Topics",
            difficulty=template.difficulty.value,
            question_count=template.question_count,
            context=context,
            query=vector_query,
        )

        try:
            response = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                system="You are an expert educator creating high-quality quizzes. Return ONLY valid JSON.",
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=4000,
            )
            
            content = response.content[0].text
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
                
            return json.loads(content)
        except Exception as e:
            log.error("anthropic_quiz_generation_failed", error=str(e))
            raise

    @staticmethod
    def _create_quiz_from_generation(
        template: QuizTemplate,
        quiz_data: Dict,
        user_id: str,
    ) -> Quiz:
        """Create Quiz and QuizQuestion records from generated data."""
        quiz = Quiz(
            subject_id=template.subject_id,
            created_by=user_id,
            title=quiz_data.get("title", template.name),
            description=quiz_data.get("description", ""),
            difficulty=template.difficulty,
            time_limit_seconds=template.time_limit_minutes * 60,
            is_published=True,
            pass_score=70.0,
            xp_reward=template.question_count * 10,
            tags=["ai-generated", "adaptive"],
        )
        db.session.add(quiz)
        db.session.flush()  # Get quiz.id

        for i, q_data in enumerate(quiz_data.get("questions", [])):
            question = QuizQuestion(
                quiz_id=quiz.id,
                text=q_data["question"],
                options=q_data["options"],
                correct_idx=q_data["correct_index"],
                explanation=q_data.get("explanation", ""),
                sort_order=i,
                points=1,
            )
            db.session.add(question)

        return quiz

    @staticmethod
    def _get_default_prompt_template() -> str:
        """Default prompt template for quiz generation."""
        return """
Generate a {question_count}-question multiple choice quiz on {subject} - {topic} at {difficulty} difficulty level.

Context from documents:
{context}

Query focus: {query}

Return a JSON object with:
- title: Quiz title
- description: Brief description
- questions: Array of questions, each with:
  - question: The question text
  - options: Array of 4 answer options
  - correct_index: Index of correct answer (0-3)
  - explanation: Why the answer is correct

Ensure questions test understanding and are appropriate for {difficulty} level.
"""

    @staticmethod
    def get_adaptive_quiz(user_id: str, subject_id: Optional[str] = None) -> dict:
        """Get an adaptive quiz based on user's progress and spaced repetition."""
        # This would implement spaced repetition logic
        # For now, return a random quiz
        from app.repositories.repositories import QuizRepository
        quizzes = QuizRepository.find_published(subject_id=subject_id, limit=1)
        if not quizzes:
            raise ValueError("No quizzes available")
        return quizzes[0].to_dict(include_questions=True)

    @staticmethod
    def list_templates(subject_id: Optional[str] = None) -> List[Dict]:
        """List available quiz templates."""
        templates = QuizTemplateRepository.find_active(subject_id=subject_id)
        return [t.to_dict() for t in templates]


class VectorService:

    @staticmethod
    def process_document(document_id: str) -> None:
        """Process a document and create vector embeddings."""
        document = DocumentRepository.get_by_id(document_id)
        if not document:
            return

        # Read document content (simplified - in reality, use proper PDF/text extraction)
        content = QuizEngineService._extract_text_from_file(document.file_path)

        # Chunk the content
        chunks = QuizEngineService._chunk_text(content)

        # Generate embeddings
        model = SentenceTransformer('all-MiniLM-L6-v2')
        embeddings = model.encode(chunks)

        # Store vector documents
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vector_doc = VectorDocument(
                document_id=document_id,
                chunk_index=i,
                content=chunk,
                embedding=embedding.tolist(),
                metadata={"page": i // 10 + 1, "chunk_size": len(chunk)},
            )
            db.session.add(vector_doc)

        db.session.commit()

    @staticmethod
    def _extract_text_from_file(file_path: str) -> str:
        """Extract text from file (placeholder implementation)."""
        # In production, use libraries like PyPDF2, python-docx, etc.
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

    @staticmethod
    def _chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Split text into overlapping chunks."""
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - overlap
        return chunks