"""
app/services/memory.py
─────────────────────
Socrates Engine – Memory & Context Builder

Converts a structured micro_pdfs_mbbs_ent JSON row into a rich, 
pedagogically-aware context block for the Anthropic Claude API.

Every field of the schema is parsed and surfaced so that Claude has
full situational awareness about:
  - Concept identity and importance (weight, high-yield level)
  - Prerequisites and downstream concepts (dependency graph)
  - Core explanations and learning outcomes
  - All SAQs with compact answers and misconceptions
  - All MCQs with correct answers, Socratic prompts, and error patterns
  - Minimum question coverage expectations
"""

import json
from typing import Any


def _safe_get(obj: dict, *keys, default=""):
    """Safely traverse nested dict keys."""
    for key in keys:
        if not isinstance(obj, dict):
            return default
        obj = obj.get(key, default)
    return obj if obj is not None else default


def _format_list(items: list, prefix: str = "  • ") -> str:
    """Format a list of strings into a bulleted text block."""
    if not items:
        return "  (none)"
    return "\n".join(f"{prefix}{item}" for item in items if item)


def _format_saqs(saqs: list) -> str:
    """Format all SAQs into a rich tutor-facing text block."""
    if not saqs:
        return "  (no SAQs available)"
    
    parts = []
    for i, saq in enumerate(saqs, 1):
        q = saq.get("question", "")
        core = saq.get("corePoints", "")
        misconception = saq.get("misconceptions", "")
        answer = saq.get("compactAnswer", "")
        
        parts.append(
            f"  SAQ {i}: {q}\n"
            f"    Core Points: {core}\n"
            f"    Compact Answer: {answer}\n"
            f"    ⚠ Common Misconception: {misconception}"
        )
    return "\n\n".join(parts)


def _format_mcqs(mcqs: list) -> str:
    """Format all MCQs including Socratic prompts and reasoning errors."""
    if not mcqs:
        return "  (no MCQs available)"
    
    parts = []
    for i, mcq in enumerate(mcqs, 1):
        q = mcq.get("question", "")
        options = mcq.get("options", [])
        correct = mcq.get("correctAnswer", "")
        socratic = mcq.get("socraticPrompts", "")
        error = mcq.get("commonReasoningErrors", "")
        reinforce = mcq.get("conceptReinforcement", "")
        
        opts_text = "\n    ".join(options) if options else "(no options)"
        parts.append(
            f"  MCQ {i}: {q}\n"
            f"    {opts_text}\n"
            f"    ✓ Correct: {correct}\n"
            f"    Socratic Probe: {socratic}\n"
            f"    ⚠ Reasoning Trap: {error}\n"
            f"    Reinforcement: {reinforce}"
        )
    return "\n\n".join(parts)


def _weight_label(weight: Any) -> str:
    """Convert numeric conceptWeight to descriptive label."""
    try:
        w = int(weight)
    except (TypeError, ValueError):
        return str(weight)
    if w >= 5:
        return f"{w}/5 — CRITICAL CONCEPT (exam essential)"
    elif w == 4:
        return f"{w}/5 — HIGH IMPORTANCE (very likely to appear)"
    elif w == 3:
        return f"{w}/5 — MODERATE IMPORTANCE"
    elif w == 2:
        return f"{w}/5 — LOW IMPORTANCE (know basics)"
    else:
        return f"{w}/5 — SUPPLEMENTARY"


def build_socrates_context(content: Any, student_query: str) -> list:
    """
    Builds the context memory for the Socrates engine.

    Parses the full micro_pdfs_mbbs_ent JSON schema and generates a
    rich, structured context block for Claude (Anthropic Messages API format).

    The context includes:
      - Concept identity: title, subject, section, chapter, topic, subtopic
      - Importance signals: conceptWeight, highYieldLevel, conceptType
      - Dependency graph: prerequisites, parallel, downstream concepts
      - Core explanation and learning points
      - Competencies covered
      - Minimum question coverage quotas
      - All SAQs with compact answers and misconceptions
      - All MCQs with options, correct answers, Socratic prompts, and error patterns

    Args:
        content: Raw JSON string, dict, or list from micro_pdfs_mbbs_ent.content column
        student_query: The student's current question or message

    Returns:
        List of Anthropic message dicts (role: user with structured context)
    """
    # ── Parse content ─────────────────────────────────────────────────────────
    if isinstance(content, (dict, list)):
        data = content
    elif isinstance(content, str):
        try:
            data = json.loads(content)
        except (json.JSONDecodeError, ValueError):
            data = {}
    else:
        data = {}

    if not isinstance(data, dict):
        data = {}

    # ── Extract all schema fields ─────────────────────────────────────────────
    meta       = data.get("documentMetadata", {})
    deps       = data.get("conceptDependencies", {})
    explanation= data.get("conceptExplanation", "")
    core_pts   = data.get("corePoints", [])
    imp_pts    = data.get("importantPoints", [])
    competencies = data.get("competenciesCovered", [])
    min_coverage = data.get("minimumQuestionCoverage", {})
    saqs       = data.get("saqs", [])
    mcqs       = data.get("mcqs", [])

    # ── Metadata fields ───────────────────────────────────────────────────────
    title        = _safe_get(meta, "title")
    subject      = _safe_get(meta, "subject")
    section      = _safe_get(meta, "section")
    chapter      = _safe_get(meta, "chapter")
    main_topic   = _safe_get(meta, "mainTopic")
    subtopic     = _safe_get(meta, "subtopic")
    concept_name = _safe_get(meta, "conceptName")
    concept_id   = _safe_get(meta, "conceptId")
    concept_type = _safe_get(meta, "conceptType")
    weight       = meta.get("conceptWeight", "N/A")
    high_yield   = _safe_get(meta, "highYieldLevel")

    # ── Dependency fields ─────────────────────────────────────────────────────
    prereqs      = deps.get("prerequisiteConcepts", [])
    parallel     = deps.get("parallelConcepts", [])
    downstream   = deps.get("downstreamConcepts", [])
    dep_reason   = deps.get("whyThisDependencyMatters", "")

    # ── Coverage fields ───────────────────────────────────────────────────────
    min_saq      = min_coverage.get("minimumSaq", "?")
    actual_saq   = min_coverage.get("actualSaqCount", len(saqs))
    min_mcq      = min_coverage.get("minimumMcq", "?")
    actual_mcq   = min_coverage.get("actualMcqCount", len(mcqs))

    # ── Build the context block ───────────────────────────────────────────────
    context_block = f"""
╔══════════════════════════════════════════════════════════════════╗
║           SOCRATES REVISION TUTOR — CONCEPT CONTEXT             ║
╚══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPT IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Title:         {title}
  Concept ID:    {concept_id}
  Concept Type:  {concept_type}
  Subject:       {subject}
  Section:       {section}
  Chapter:       {chapter}
  Main Topic:    {main_topic}
  Subtopic:      {subtopic}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANCE & WEIGHTAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Concept Weight:   {_weight_label(weight)}
  High Yield Level: {high_yield}

  ► This determines how deeply you should probe the student:
    Weight 4-5 → demand near-complete recall, push for precision
    Weight 2-3 → check understanding, allow approximate recall
    Weight 1   → brief mention, move on quickly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPT EXPLANATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{explanation if explanation else "  (no explanation provided)"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE POINTS (must know for exam)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{_format_list(core_pts)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT ADDITIONAL POINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{_format_list(imp_pts)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPENDENCY MAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ◀ Prerequisite Concepts (student should already know):
{_format_list(prereqs)}

  ◈ Parallel Concepts (teach alongside this):
{_format_list(parallel)}

  ▶ Downstream Concepts (this unlocks understanding of):
{_format_list(downstream)}

  Why this dependency matters:
    {dep_reason}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPETENCIES COVERED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{_format_list(competencies)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION COVERAGE REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SAQ: minimum {min_saq} required | {actual_saq} available in this micro-PDF
  MCQ: minimum {min_mcq} required | {actual_mcq} available in this micro-PDF

  ► These quotas define your revision session coverage obligations.
    Do not end the session until the minimums are satisfied.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHORT ANSWER QUESTIONS (SAQs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{_format_saqs(saqs)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MULTIPLE CHOICE QUESTIONS (MCQs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{_format_mcqs(mcqs)}
""".strip()

    return [
        {
            "role": "user",
            "content": (
                "You are now conducting a personalized Socratic revision session. "
                "Below is the complete structured curriculum data for the concept being studied. "
                "Use EVERY field — weightage, high-yield level, dependency map, SAQs, MCQs, "
                "Socratic prompts, and misconception traps — to guide the student precisely.\n\n"
                "Tutor behavior rules:\n"
                "1. Check prerequisites before explaining — ask if unsure\n"
                "2. Weight ≥4 → demand precise, complete answers before moving on\n"
                "3. Use the Socratic prompts from MCQs to probe understanding, not just test recall\n"
                "4. When the student gets MCQ wrong: trigger the conceptReinforcement, not just the answer\n"
                "5. Address misconceptions proactively — don't wait for the student to fall into the trap\n"
                "6. Cover minimum SAQ and MCQ counts before ending the session\n"
                "7. Mention downstream concepts at end as a preview of what comes next\n"
                "8. Always surface the HIGH YIELD level and conceptWeight to motivate student effort\n\n"
                f"<concept_data>\n{context_block}\n</concept_data>\n\n"
                f"Student: {student_query}"
            )
        }
    ]
