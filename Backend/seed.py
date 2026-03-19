"""
app/utils/seed.py
──────────────────
Database seeder — populates 19 NEET-PG subjects, demo users, and sample quizzes.
Run: flask seed
"""

import uuid
import click
from flask import Flask
from flask.cli import with_appcontext

from app.extensions import db
from app.models.models import (
    User, UserRole, UserStatus, Subject,
    Quiz, QuizQuestion, QuizDifficulty, Topic,
)


# ─── 19 NEET-PG Subjects ─────────────────────────────────────────────────────

SUBJECTS = [
    {"name": "Anatomy",             "slug": "anatomy",             "icon_emoji": "🦴", "color_hex": "#F5A623", "sort_order": 1},
    {"name": "Physiology",          "slug": "physiology",          "icon_emoji": "💓", "color_hex": "#4ECDC4", "sort_order": 2},
    {"name": "Biochemistry",        "slug": "biochemistry",        "icon_emoji": "🧬", "color_hex": "#9B8FFF", "sort_order": 3},
    {"name": "Pathology",           "slug": "pathology",           "icon_emoji": "🔬", "color_hex": "#FF6B6B", "sort_order": 4},
    {"name": "Pharmacology",        "slug": "pharmacology",        "icon_emoji": "💊", "color_hex": "#52D78A", "sort_order": 5},
    {"name": "Microbiology",        "slug": "microbiology",        "icon_emoji": "🦠", "color_hex": "#60A5FA", "sort_order": 6},
    {"name": "Forensic Medicine",   "slug": "forensic-medicine",   "icon_emoji": "⚖️", "color_hex": "#A78BFA", "sort_order": 7},
    {"name": "Community Medicine",  "slug": "community-medicine",  "icon_emoji": "🏥", "color_hex": "#34D399", "sort_order": 8},
    {"name": "Medicine",            "slug": "medicine",            "icon_emoji": "🩺", "color_hex": "#F97316", "sort_order": 9},
    {"name": "Surgery",             "slug": "surgery",             "icon_emoji": "🔪", "color_hex": "#EF4444", "sort_order": 10},
    {"name": "OBG",                 "slug": "obg",                 "icon_emoji": "🤰", "color_hex": "#EC4899", "sort_order": 11},
    {"name": "Pediatrics",          "slug": "pediatrics",          "icon_emoji": "👶", "color_hex": "#8B5CF6", "sort_order": 12},
    {"name": "Ophthalmology",       "slug": "ophthalmology",       "icon_emoji": "👁️", "color_hex": "#06B6D4", "sort_order": 13},
    {"name": "ENT",                 "slug": "ent",                 "icon_emoji": "👂", "color_hex": "#14B8A6", "sort_order": 14},
    {"name": "Dermatology",         "slug": "dermatology",         "icon_emoji": "🧴", "color_hex": "#F59E0B", "sort_order": 15},
    {"name": "Psychiatry",          "slug": "psychiatry",          "icon_emoji": "🧠", "color_hex": "#6366F1", "sort_order": 16},
    {"name": "Orthopedics",         "slug": "orthopedics",         "icon_emoji": "🦿", "color_hex": "#78716C", "sort_order": 17},
    {"name": "Anesthesia",          "slug": "anesthesia",          "icon_emoji": "😴", "color_hex": "#0EA5E9", "sort_order": 18},
    {"name": "Radiology",           "slug": "radiology",           "icon_emoji": "📡", "color_hex": "#84CC16", "sort_order": 19},
]


# ─── Sample Topics (for a few key subjects) ──────────────────────────────────

SAMPLE_TOPICS = {
    "medicine": [
        "Renal Tubular Acidosis", "Diabetes Mellitus", "Hypertension",
        "Thyroid Disorders", "Anemia", "Heart Failure", "Liver Cirrhosis",
        "Acid-Base Disorders", "Rheumatoid Arthritis", "Tuberculosis",
    ],
    "anatomy": [
        "Upper Limb", "Lower Limb", "Thorax", "Abdomen", "Head & Neck",
        "Neuroanatomy", "Embryology", "Histology",
    ],
    "pharmacology": [
        "Autonomic Nervous System", "Cardiovascular Drugs", "Antibiotics",
        "Antidiabetic Drugs", "CNS Pharmacology", "Chemotherapy",
        "Anti-inflammatory Drugs", "Drug Interactions",
    ],
    "pathology": [
        "Cell Injury", "Inflammation", "Neoplasia", "Hemodynamic Disorders",
        "Genetic Disorders", "Immunopathology", "Hematopathology",
    ],
    "physiology": [
        "Cardiovascular Physiology", "Respiratory Physiology", "Renal Physiology",
        "GI Physiology", "Neurophysiology", "Endocrine Physiology",
    ],
}


SAMPLE_QUIZ = {
    "title": "Renal Tubular Acidosis — Quick Assessment",
    "difficulty": QuizDifficulty.MEDIUM,
    "time_limit_seconds": 600,
    "pass_score": 70.0,
    "xp_reward": 150,
    "tags": ["medicine", "nephrology", "RTA"],
    "questions": [
        {
            "text": "What is the key difference between Type 1 (distal) and Type 2 (proximal) RTA?",
            "options": [
                "Type 1 has urine pH > 5.5; Type 2 has urine pH < 5.5 after acid loading",
                "Type 1 affects bicarbonate reabsorption; Type 2 affects H+ secretion",
                "Type 1 causes metabolic alkalosis; Type 2 causes metabolic acidosis",
                "There is no significant clinical difference"
            ],
            "correct_idx": 0,
            "explanation": "In Type 1 (distal) RTA, H+ secretion is impaired → urine pH > 5.5. In Type 2 (proximal) RTA, HCO3⁻ reabsorption is impaired but H+ secretion is intact → urine can be acidified after acid loading.",
        },
        {
            "text": "Which electrolyte abnormality is most characteristic of Type 4 RTA?",
            "options": ["Hypokalemia", "Hyperkalemia", "Hypercalcemia", "Hyponatremia"],
            "correct_idx": 1,
            "explanation": "Type 4 RTA is caused by aldosterone deficiency/resistance → impaired K+ and H+ secretion → Hyperkalemia with mild metabolic acidosis.",
        },
        {
            "text": "Which type of RTA is most commonly associated with nephrolithiasis?",
            "options": ["Type 1 (Distal)", "Type 2 (Proximal)", "Type 3 (Mixed)", "Type 4 (Hyperkalemic)"],
            "correct_idx": 0,
            "explanation": "Type 1 RTA → alkaline urine + hypercalciuria + hypocitraturia → calcium phosphate stones. This is the most common subtype associated with nephrolithiasis.",
        },
        {
            "text": "What is the role of urine anion gap in diagnosing RTA?",
            "options": [
                "Positive gap suggests extra-renal cause of acidosis",
                "Negative gap suggests RTA",
                "Positive gap suggests RTA (impaired NH4+ excretion)",
                "Urine anion gap is not useful in RTA diagnosis"
            ],
            "correct_idx": 2,
            "explanation": "Urine anion gap = (Na+ + K+) − Cl⁻. A positive gap indicates impaired ammonium (NH4+) excretion, pointing to a renal cause (RTA). A negative gap suggests appropriate renal compensation (e.g., GI bicarbonate loss).",
        },
    ],
}


def seed_database(app: Flask) -> None:
    with app.app_context():
        click.echo("🌱 Seeding NEET-PG database...")

        # ── Subjects ──────────────────────────────────────────────────────────
        subject_map = {}
        for s_data in SUBJECTS:
            existing = db.session.query(Subject).filter_by(slug=s_data["slug"]).first()
            if not existing:
                subject = Subject(id=str(uuid.uuid4()), **s_data)
                db.session.add(subject)
                db.session.flush()
                subject_map[s_data["slug"]] = subject
                click.echo(f"  ✓ Subject: {s_data['icon_emoji']} {s_data['name']}")
            else:
                subject_map[s_data["slug"]] = existing

        # ── Sample Topics ─────────────────────────────────────────────────────
        from slugify import slugify
        for subj_slug, topic_names in SAMPLE_TOPICS.items():
            subject = subject_map.get(subj_slug)
            if not subject:
                continue
            for i, name in enumerate(topic_names):
                t_slug = slugify(name)
                if not db.session.query(Topic).filter_by(
                        subject_id=subject.id, slug=t_slug).first():
                    topic = Topic(
                        id=str(uuid.uuid4()),
                        subject_id=subject.id,
                        name=name,
                        slug=t_slug,
                        sort_order=i,
                    )
                    db.session.add(topic)
                    click.echo(f"    ✓ Topic: {name}")

        # ── Admin user ────────────────────────────────────────────────────────
        admin_email = "admin@apexlearn.dev"
        if not db.session.query(User).filter_by(email=admin_email).first():
            admin = User(
                id=str(uuid.uuid4()),
                email=admin_email,
                username="admin",
                display_name="ApexLearn Admin",
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
                email_verified=True,
                preferences={},
            )
            admin.set_password("Admin123!")
            db.session.add(admin)
            click.echo("  ✓ Admin user: admin@apexlearn.dev / Admin123!")

        # ── Demo student ──────────────────────────────────────────────────────
        student_email = "student@apexlearn.dev"
        student_user = db.session.query(User).filter_by(email=student_email).first()
        if not student_user:
            student_user = User(
                id=str(uuid.uuid4()),
                email=student_email,
                username="alex_kumar",
                display_name="Alex Kumar",
                role=UserRole.STUDENT,
                status=UserStatus.ACTIVE,
                email_verified=True,
                xp_total=8430,
                streak_days=7,
                preferences={},
            )
            student_user.set_password("Student123!")
            db.session.add(student_user)
            click.echo("  ✓ Student user: student@apexlearn.dev / Student123!")
        db.session.flush()

        # ── Sample Quiz ───────────────────────────────────────────────────────
        medicine_subject = subject_map.get("medicine")
        if medicine_subject and not db.session.query(Quiz).filter_by(
                title=SAMPLE_QUIZ["title"]).first():
            quiz = Quiz(
                id=str(uuid.uuid4()),
                subject_id=medicine_subject.id,
                created_by=None,
                is_published=True,
                **{k: v for k, v in SAMPLE_QUIZ.items() if k != "questions"},
            )
            db.session.add(quiz)
            db.session.flush()

            for i, q_data in enumerate(SAMPLE_QUIZ["questions"]):
                question = QuizQuestion(
                    id=str(uuid.uuid4()),
                    quiz_id=quiz.id,
                    sort_order=i,
                    points=1,
                    **q_data,
                )
                db.session.add(question)

            click.echo(f"  ✓ Quiz: {SAMPLE_QUIZ['title']} ({len(SAMPLE_QUIZ['questions'])} questions)")

        db.session.commit()
        click.echo("\n✅ NEET-PG database seeded successfully!")
        click.echo("\nDemo accounts:")
        click.echo("  Admin:   admin@apexlearn.dev   / Admin123!")
        click.echo("  Student: student@apexlearn.dev / Student123!")
        click.echo(f"\n📚 {len(SUBJECTS)} NEET-PG subjects seeded")
        click.echo(f"📝 {sum(len(v) for v in SAMPLE_TOPICS.values())} sample topics seeded")


def register_cli_commands(app: Flask) -> None:
    @app.cli.command("seed")
    def seed_cmd():
        """Seed the database with initial data."""
        seed_database(app)

    @app.cli.command("create-admin")
    @click.argument("email")
    @click.argument("password")
    def create_admin(email: str, password: str):
        """Create an admin user: flask create-admin admin@example.com SecurePass1!"""
        from app.repositories.repositories import UserRepository
        if UserRepository.find_by_email(email):
            click.echo("User already exists.")
            return
        user = UserRepository.create(
            email=email,
            username=email.split("@")[0],
            display_name="Admin",
            raw_password=password,
            role=UserRole.ADMIN,
        )
        user.status = UserStatus.ACTIVE
        user.email_verified = True
        db.session.commit()
        click.echo(f"✓ Admin created: {email}")
