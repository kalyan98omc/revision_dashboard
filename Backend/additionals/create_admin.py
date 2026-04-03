import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models.models import User, UserRole, UserStatus
import uuid

app = create_app()
with app.app_context():
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
        db.session.commit()
        print("Admin user created successfully!")
    else:
        print("Admin user already exists.")

        
