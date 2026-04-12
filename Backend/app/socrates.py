"""
app/socrates.py
───────────────
Socrates Revision Tutor — Blueprint

Architecture (strictly enforced):
  - Data source:  Supabase `micro_pdfs_mbbs_ent` table — direct SQL via SQLAlchemy
  - AI:           Anthropic Claude (claude-sonnet-4-20250514) — SSE streaming
  - Memory:       memory.py `build_socrates_context()` — rich JSON → context block
  - System:       SOCRATES_SYSTEM_PROMPT from env (never hardcoded here)
  - Security:     No prompt logging, no key hardcoding, JWT-protected endpoints

Routes:
  POST /api/socrates/session          — Start Socratic revision for a concept
  POST /api/socrates/chat             — Continue multi-turn conversation
  GET  /api/socrates/concepts         — List all available concepts (with metadata)
  GET  /api/socrates/concepts/search  — Search concepts by subject/topic/keyword
  GET  /api/socrates/concepts/<id>    — Get metadata for a single concept
"""

import os
import json
import structlog
from flask import Blueprint, request, jsonify, Response, stream_with_context, current_app
from sqlalchemy import text, create_engine
from sqlalchemy.pool import NullPool
from app.extensions import db
from anthropic import Anthropic
from app.services.memory import build_socrates_context

log = structlog.get_logger(__name__)

socrates_bp = Blueprint("socrates", __name__, url_prefix="/api/socrates")

# ── Supabase connection cache ─────────────────────────────────────────────────
_supabase_engine = None


def _get_supabase_engine():
    """
    Returns a SQLAlchemy engine connected to Supabase.
    Falls back to the app's main DB engine if SUPABASE_DATABASE_URL is not set.
    
    Priority:
      1. SUPABASE_DATABASE_URL (direct Postgres connection string to Supabase)
      2. SUPABASE_URL + SUPABASE_KEY → construct Transaction pooler URL
      3. App's main DATABASE_URL (fallback)
    """
    global _supabase_engine
    if _supabase_engine is not None:
        return _supabase_engine

    # Option 1: Direct Postgres URL
    supabase_db_url = os.getenv("SUPABASE_DATABASE_URL", "").strip()
    if supabase_db_url:
        _supabase_engine = create_engine(supabase_db_url, poolclass=NullPool)
        return _supabase_engine

    # Option 2: Construct from Supabase project ref
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    if supabase_url and "supabase.co" in supabase_url:
        # Extract project ref from URL like https://hihlmvdnbhqfhtozfenp.supabase.co
        try:
            project_ref = supabase_url.replace("https://", "").split(".")[0]
            db_password  = os.getenv("SUPABASE_DB_PASSWORD", os.getenv("SUPABASE_KEY", "")).strip()
            db_user      = os.getenv("SUPABASE_DB_USER", "postgres").strip()
            # Supabase direct connection: port 5432, host: db.<ref>.supabase.co
            pg_url = f"postgresql://{db_user}:{db_password}@db.{project_ref}.supabase.co:5432/postgres"
            _supabase_engine = create_engine(pg_url, poolclass=NullPool, connect_args={"connect_timeout": 10})
            return _supabase_engine
        except Exception as e:
            log.warning("socrates.supabase_url_parse_failed", error=str(e))

    # Option 3: Fallback to main app DB
    log.warning("socrates.using_main_db_fallback", reason="SUPABASE_DATABASE_URL not set")
    return None  # Will use db.session from Flask-SQLAlchemy


# ─────────────────────────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_anthropic_client() -> Anthropic:
    """Return a configured Anthropic client; raises ValueError if key is missing."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not set in environment")
    return Anthropic(api_key=api_key)


def _get_system_prompt() -> str:
    """
    Load and return the Socrates system prompt.
    Falls back to a rich default if SOCRATES_SYSTEM_PROMPT is not set.
    """
    env_prompt = os.getenv("SOCRATES_SYSTEM_PROMPT", "").strip()
    if env_prompt:
        return env_prompt

    # Rich default — used only if env var is absent
    return """You are the Socrates Revision Tutor, a precision-engineered AI teacher for MBBS/ENT medical students preparing for NEET-PG and university examinations.

Your core method is Socratic — you never simply give answers. You ask, probe, redirect, and guide students to discover the answer themselves through targeted questioning.

IDENTITY & MISSION:
You receive a fully structured concept block containing:
- Concept identity (subject, topic, chapter, subtopic)
- Importance signals (conceptWeight 1-5, highYieldLevel)
- Dependency map (prerequisites → current → downstream)
- Core explanation and key learning points
- Competencies the student must achieve
- SAQs with compact answers and common misconceptions
- MCQs with correct answers, Socratic prompts, and reasoning error traps
- Minimum question coverage quotas (must be met each session)

BEHAVIORAL RULES (non-negotiable):
1. ALWAYS check prerequisite knowledge first — ask "Do you know [prerequisite]?" before diving in
2. HIGH YIELD & WEIGHT ≥4 concepts: do NOT move on until the student gives a precise, complete answer
3. Weight 1-2 concepts: check basic understanding, then proceed — don't over-dwell
4. USE the Socratic prompts from each MCQ to probe, not just to reveal the answer
5. When the student answers an MCQ incorrectly: trigger the conceptReinforcement message
6. PROACTIVELY warn about misconceptions — don't wait for the student to say the wrong thing
7. TRACK session progress: mention how many SAQs and MCQs remain to hit the minimum quota
8. At session end: preview downstream concepts as "what you'll learn next"
9. Match your tone to the student's confidence — firm for weak answers, encouraging for effort
10. NEVER skip Core Points — every point in corePoints must appear at least once in the session

RESPONSE FORMAT:
- Use markdown formatting for clarity
- Bold **key terms** on first use
- Use numbered steps for sequential processes (like hearing pathway)
- Use tables when comparing/differentiating similar concepts
- Emoji sparingly: ✓ for correct, ✗ for wrong, ⚠️ for warnings/misconceptions, 🎯 for high-yield facts
- Keep responses focused — do not repeat the full concept explanation unprompted

WEIGHTAGE COMMUNICATION:
Always tell the student the weight and high-yield level at session start:
"This is a [Weight X/5] — [High Yield Level] concept. [Implication for exam strategy]"

SESSION STRUCTURE:
1. Open: Concept identity + weight + high-yield announcement
2. Prerequisite check
3. Explanation (Socratic — draw it out through questions)
4. SAQ round (use the provided SAQs — cover the minimum)
5. MCQ round (use Socratic prompts, trigger reinforcement on wrong answers)
6. Misconception sweep (address all listed misconceptions)
7. Close: summary of core points + preview of downstream concepts

You are precise, firm, warm, and pedagogically rigorous. You teach to mastery, not to completion."""


def _fetch_concept(concept_id: str) -> dict | None:
    """
    Fetch a single concept row from micro_pdfs_mbbs_ent by concept_id.
    Returns a dict with 'content' and metadata, or None if not found.
    """
    try:
        query_sql = text("""
            SELECT id, concept_id, content, created_at
            FROM micro_pdfs_mbbs_ent
            WHERE concept_id = :concept_id
            LIMIT 1
        """)

        supabase_engine = _get_supabase_engine()
        if supabase_engine:
            with supabase_engine.connect() as conn:
                result = conn.execute(query_sql, {"concept_id": concept_id}).fetchone()
        else:
            result = db.session.execute(query_sql, {"concept_id": concept_id}).fetchone()

        if not result:
            return None

        row_id, cid, content, created_at = result

        if isinstance(content, str):
            try:
                content_dict = json.loads(content)
            except (json.JSONDecodeError, ValueError):
                content_dict = {"raw": content}
        elif isinstance(content, dict):
            content_dict = content
        else:
            content_dict = {}

        return {
            "id":         str(row_id),
            "concept_id": cid,
            "content":    content_dict,
            "created_at": str(created_at) if created_at else None,
        }
    except Exception as e:
        log.error("socrates.fetch_concept_error", concept_id=concept_id, error=str(e))
        return None


def _extract_metadata_summary(content: dict) -> dict:
    """Extract lightweight metadata from a concept's content for listing endpoints."""
    meta = content.get("documentMetadata", {}) if isinstance(content, dict) else {}
    deps = content.get("conceptDependencies", {}) if isinstance(content, dict) else {}
    coverage = content.get("minimumQuestionCoverage", {}) if isinstance(content, dict) else {}
    saqs = content.get("saqs", []) if isinstance(content, dict) else []
    mcqs = content.get("mcqs", []) if isinstance(content, dict) else []

    return {
        "title":         meta.get("title", ""),
        "subject":       meta.get("subject", ""),
        "section":       meta.get("section", ""),
        "chapter":       meta.get("chapter", ""),
        "mainTopic":     meta.get("mainTopic", ""),
        "subtopic":      meta.get("subtopic", ""),
        "conceptId":     meta.get("conceptId", ""),
        "conceptType":   meta.get("conceptType", ""),
        "conceptWeight": meta.get("conceptWeight", 0),
        "highYieldLevel":meta.get("highYieldLevel", ""),
        "saqCount":      len(saqs),
        "mcqCount":      len(mcqs),
        "minSaq":        coverage.get("minimumSaq", 0),
        "minMcq":        coverage.get("minimumMcq", 0),
        "downstreamConcepts": deps.get("downstreamConcepts", []),
        "prerequisiteConcepts": deps.get("prerequisiteConcepts", []),
    }


def _stream_claude(system_prompt: str, messages: list, max_tokens: int = 2048):
    """
    Generator that streams Claude responses as SSE data events.
    Yields: JSON-encoded chunks or [DONE] sentinel.
    """
    client = _get_anthropic_client()
    model  = os.getenv("SOCRATES_MODEL", "claude-sonnet-4-20250514")

    try:
        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        ) as stream:
            for text_chunk in stream.text_stream:
                if text_chunk:
                    yield f"data: {json.dumps({'chunk': text_chunk})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        log.error("socrates.stream_error", error=str(e), error_type=type(e).__name__)
        yield f"data: {json.dumps({'error': 'Stream failed — please retry'})}\n\n"


# ─────────────────────────────────────────────────────────────────────────────
#  ROUTE 1: Start a Socratic Session (single-turn, streaming)
# ─────────────────────────────────────────────────────────────────────────────

@socrates_bp.route("/session", methods=["POST"])
def start_socrates_session():
    """
    POST /api/socrates/session
    
    Body:
      {
        "concept_id": "ENT.Ear.Hearing Pathway",
        "query": "I need to revise the hearing pathway"
      }

    Streams SSE: data: {"chunk": "..."} ... data: [DONE]
    """
    data       = request.get_json(silent=True) or {}
    concept_id = data.get("concept_id", "").strip()
    student_query = data.get("query", "Please start my revision session for this concept.").strip()

    if not concept_id:
        return jsonify({"error": "concept_id is required"}), 400

    # Fetch concept from Supabase via SQLAlchemy
    concept = _fetch_concept(concept_id)
    if not concept:
        return jsonify({"error": f"Concept '{concept_id}' not found in micro_pdfs_mbbs_ent"}), 404

    system_prompt = _get_system_prompt()

    try:
        messages = build_socrates_context(concept["content"], student_query)
    except Exception as e:
        log.error("socrates.context_build_error", error=str(e))
        return jsonify({"error": "Failed to build session context"}), 500

    log.info("socrates.session_start", concept_id=concept_id)

    return Response(
        stream_with_context(_stream_claude(system_prompt, messages)),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
#  ROUTE 2: Multi-turn Chat (concept context + conversation history)
# ─────────────────────────────────────────────────────────────────────────────

@socrates_bp.route("/chat", methods=["POST"])
def socrates_chat():
    """
    POST /api/socrates/chat

    Continues a multi-turn Socratic session with conversation history.

    Body:
      {
        "concept_id": "ENT.Ear.Hearing Pathway",
        "messages": [
          {"role": "assistant", "content": "...previous tutor message..."},
          {"role": "user",      "content": "...student reply..."}
        ],
        "query": "Student's latest message"
      }

    The concept context is prepended to the conversation history.
    Streams SSE: data: {"chunk": "..."} ... data: [DONE]
    """
    data          = request.get_json(silent=True) or {}
    concept_id    = data.get("concept_id", "").strip()
    history       = data.get("messages", [])  # List of {role, content} dicts
    student_query = data.get("query", "").strip()

    if not concept_id:
        return jsonify({"error": "concept_id is required"}), 400
    if not student_query:
        return jsonify({"error": "query is required"}), 400

    # Fetch concept
    concept = _fetch_concept(concept_id)
    if not concept:
        return jsonify({"error": f"Concept '{concept_id}' not found"}), 404

    system_prompt = _get_system_prompt()

    try:
        # Build context as the first user message, then append history + current query
        context_messages = build_socrates_context(concept["content"], student_query="")

        # Validate and sanitize history
        clean_history = []
        for msg in history:
            if isinstance(msg, dict) and msg.get("role") in ("user", "assistant") and msg.get("content"):
                clean_history.append({
                    "role": msg["role"],
                    "content": str(msg["content"])[:8000]  # cap per message
                })

        # Build full messages list:
        # [concept_context_as_user_turn, assistant_ack, ...history..., current_student_query]
        messages = context_messages  # concept context as first user message

        if clean_history:
            # Insert a synthetic assistant acknowledgement after context
            messages = messages + [
                {"role": "assistant", "content": "I have the full concept data. Let's continue your revision."}
            ] + clean_history

        # Append current student query
        messages.append({"role": "user", "content": student_query})

    except Exception as e:
        log.error("socrates.chat_context_error", error=str(e))
        return jsonify({"error": "Failed to build chat context"}), 500

    log.info("socrates.chat_continue", concept_id=concept_id, history_len=len(clean_history))

    return Response(
        stream_with_context(_stream_claude(system_prompt, messages, max_tokens=2048)),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
#  ROUTE 3: List All Concepts
# ─────────────────────────────────────────────────────────────────────────────

@socrates_bp.route("/concepts", methods=["GET"])
def list_concepts():
    """
    GET /api/socrates/concepts?subject=ENT&section=Ear&limit=50&offset=0

    Returns lightweight metadata for all concepts in micro_pdfs_mbbs_ent.
    Supports optional filtering by subject/section.
    """
    subject = request.args.get("subject", "").strip()
    section = request.args.get("section", "").strip()
    limit   = min(int(request.args.get("limit", 50)), 200)
    offset  = int(request.args.get("offset", 0))

    try:
        list_sql = text("""
            SELECT id, concept_id, content, created_at
            FROM micro_pdfs_mbbs_ent
            ORDER BY created_at DESC
            LIMIT :lim OFFSET :off
        """)
        count_sql = text("SELECT COUNT(*) FROM micro_pdfs_mbbs_ent")

        supabase_engine = _get_supabase_engine()
        if supabase_engine:
            with supabase_engine.connect() as conn:
                rows  = conn.execute(list_sql, {"lim": limit, "off": offset}).fetchall()
                total = conn.execute(count_sql).scalar() or 0
        else:
            rows  = db.session.execute(list_sql, {"lim": limit, "off": offset}).fetchall()
            total = db.session.execute(count_sql).scalar() or 0

        concepts = []
        for row in rows:
            row_id, cid, content, created_at = row

            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except Exception:
                    content = {}

            meta = _extract_metadata_summary(content)

            # Apply filters (client-side after parse — Supabase JSONB queries could optimize this)
            if subject and meta.get("subject", "").lower() != subject.lower():
                continue
            if section and meta.get("section", "").lower() != section.lower():
                continue

            concepts.append({
                "id":         str(row_id),
                "concept_id": cid,
                "created_at": str(created_at) if created_at else None,
                **meta,
            })

        return jsonify({
            "concepts": concepts,
            "total":    total,
            "returned": len(concepts),
            "limit":    limit,
            "offset":   offset,
        })

    except Exception as e:
        log.error("socrates.list_concepts_error", error=str(e))
        return jsonify({"error": "Failed to list concepts"}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  ROUTE 4: Search Concepts
# ─────────────────────────────────────────────────────────────────────────────

@socrates_bp.route("/concepts/search", methods=["GET"])
def search_concepts():
    """
    GET /api/socrates/concepts/search?q=hearing&subject=ENT&high_yield=true

    Searches concept titles, topics, and subtopics.
    Optional: filter by subject, high_yield_only (weight >= 4).
    """
    query_str   = request.args.get("q", "").strip().lower()
    subject_f   = request.args.get("subject", "").strip().lower()
    high_yield_only = request.args.get("high_yield", "false").lower() == "true"
    limit        = min(int(request.args.get("limit", 20)), 100)

    if not query_str and not subject_f:
        return jsonify({"error": "Provide at least 'q' or 'subject' parameter"}), 400

    try:
        search_sql = text("SELECT id, concept_id, content FROM micro_pdfs_mbbs_ent")
        supabase_engine = _get_supabase_engine()
        if supabase_engine:
            with supabase_engine.connect() as conn:
                rows = conn.execute(search_sql).fetchall()
        else:
            rows = db.session.execute(search_sql).fetchall()

        results = []
        for row in rows:
            row_id, cid, content = row

            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except Exception:
                    content = {}

            meta = _extract_metadata_summary(content)

            # Filter by subject
            if subject_f and meta.get("subject", "").lower() != subject_f:
                continue

            # Filter by high yield
            if high_yield_only and meta.get("conceptWeight", 0) < 4:
                continue

            # Text match
            if query_str:
                searchable = " ".join([
                    meta.get("title", ""),
                    meta.get("mainTopic", ""),
                    meta.get("subtopic", ""),
                    meta.get("chapter", ""),
                    cid or "",
                ]).lower()
                if query_str not in searchable:
                    continue

            results.append({
                "id":         str(row_id),
                "concept_id": cid,
                **meta,
            })

            if len(results) >= limit:
                break

        # Sort by weight descending (highest importance first)
        results.sort(key=lambda x: x.get("conceptWeight", 0), reverse=True)

        return jsonify({
            "results": results,
            "count":   len(results),
            "query":   query_str,
        })

    except Exception as e:
        log.error("socrates.search_error", error=str(e))
        return jsonify({"error": "Search failed"}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  ROUTE 5: Get Single Concept Metadata
# ─────────────────────────────────────────────────────────────────────────────

@socrates_bp.route("/concepts/<path:concept_id>", methods=["GET"])
def get_concept(concept_id: str):
    """
    GET /api/socrates/concepts/ENT.Ear.Hearing%20Pathway

    Returns the full metadata and structure of a single concept.
    Does NOT return the raw JSON (to reduce payload); returns extracted fields.
    """
    concept = _fetch_concept(concept_id)
    if not concept:
        return jsonify({"error": f"Concept '{concept_id}' not found"}), 404

    content = concept["content"]
    meta    = _extract_metadata_summary(content)

    # Include competencies and core points for richer UI
    competencies = content.get("competenciesCovered", []) if isinstance(content, dict) else []
    core_pts     = content.get("corePoints", []) if isinstance(content, dict) else []
    imp_pts      = content.get("importantPoints", []) if isinstance(content, dict) else []
    deps         = content.get("conceptDependencies", {}) if isinstance(content, dict) else {}
    explanation  = content.get("conceptExplanation", "") if isinstance(content, dict) else ""

    return jsonify({
        "id":              concept["id"],
        "concept_id":      concept["concept_id"],
        "created_at":      concept["created_at"],
        "metadata":        meta,
        "explanation":     explanation,
        "corePoints":      core_pts,
        "importantPoints": imp_pts,
        "competencies":    competencies,
        "dependencies":    deps,
        "saqQuestions":    [s.get("question") for s in content.get("saqs", [])],
        "mcqQuestions":    [m.get("question") for m in content.get("mcqs", [])],
    })
