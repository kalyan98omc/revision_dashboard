# ApexLearn Backend — Complete API Reference

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│         Flask Blueprints  +  SocketIO Handlers          │
│    (controllers.py — input validation → service call)   │
├─────────────────────────────────────────────────────────┤
│                     Service Layer                        │
│     AuthService  UserService  QuizService  ChatService  │
│        (services.py — all business logic here)          │
├─────────────────────────────────────────────────────────┤
│                   Repository Layer                       │
│   UserRepo  QuizRepo  AttemptRepo  ChatRepo  AuditRepo  │
│       (repositories.py — all DB queries here)           │
├─────────────────────────────────────────────────────────┤
│                     Domain Layer                         │
│   User  Quiz  QuizQuestion  ChatSession  ChatMessage    │
│         (models.py — data shapes, zero logic)           │
└─────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology |
|---|---|
| Framework | Flask 3.0 + Flask-RESTful |
| WebSocket | Flask-SocketIO + Eventlet |
| ORM | SQLAlchemy 2.0 + Flask-Migrate |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Auth | JWT (access + refresh tokens with rotation) |
| Task Queue | Celery + Celery Beat |
| AI | OpenAI GPT-4 Turbo (streaming) + Whisper + TTS |
| Security | Bcrypt, Rate limiting, CORS, Security headers |
| Validation | Marshmallow schemas |
| Logging | Structlog (JSON in prod) |
| Testing | Pytest + pytest-flask |
| Container | Docker + Docker Compose |

---

## REST Endpoints

### Auth  `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create account |
| POST | `/login` | — | Login, receive JWT pair |
| POST | `/refresh` | Refresh token | Rotate token pair |
| POST | `/logout` | Access token | Revoke tokens |
| GET | `/verify-email/:token` | — | Verify email address |
| POST | `/request-password-reset` | — | Send reset email |
| POST | `/reset-password` | — | Set new password |

**Register body:**
```json
{
  "email": "user@example.com",
  "username": "alex_kumar",
  "display_name": "Alex Kumar",
  "password": "Secure123!",
  "role": "student"
}
```

**Login response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "user": { "id": "...", "email": "...", "role": "student", ... }
}
```

---

### Users  `/api/v1/users`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/me` | ✓ | Any | Get own profile |
| PATCH | `/me` | ✓ | Any | Update profile |
| GET | `/me/progress` | ✓ | Any | Subject mastery + quiz stats |
| GET | `/leaderboard` | ✓ | Any | Top 20 by XP |
| GET | `/` | ✓ | Admin | List all users |
| GET | `/:user_id` | ✓ | Admin/Teacher | Get any user |

---

### Quizzes  `/api/v1/quizzes`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | ✓ | List published quizzes (filterable) |
| GET | `/:quiz_id` | ✓ | Get quiz + questions (no answers) |
| POST | `/:quiz_id/attempt` | ✓ | Submit answers, receive graded result |
| GET | `/me/attempts` | ✓ | Own attempt history |

**Query params for listing:**
- `subject_id=<uuid>`
- `difficulty=easy|medium|hard`
- `page=1&per_page=20`

**Attempt body:**
```json
{
  "answers": {
    "<question_id_1>": 0,
    "<question_id_2>": 2
  },
  "time_taken": 372
}
```

**Graded response:**
```json
{
  "score_pct": 80.0,
  "passed": true,
  "xp_earned": 225,
  "correct_count": 4,
  "total_questions": 5,
  "answer_details": {
    "<q_id>": {
      "chosen": 0, "correct": 0,
      "is_correct": true,
      "explanation": "..."
    }
  }
}
```

---

### AI Chat  `/api/v1/chat`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sessions` | ✓ | Create new session |
| GET | `/sessions` | ✓ | List sessions |
| GET | `/sessions/:id` | ✓ | Get session + messages |
| POST | `/sessions/:id/stream` | ✓ | Stream AI response (SSE) |
| POST | `/sessions/:id/transcribe` | ✓ | Transcribe audio (Whisper) |

**SSE Streaming usage (frontend):**
```javascript
const response = await fetch(`/api/v1/chat/sessions/${sessionId}/stream`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ message: "Explain integration by parts" }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n\n');
  for (const line of lines) {
    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
      appendToChat(line.slice(6));
    }
  }
}
```

---

### Subjects  `/api/v1/subjects`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | ✓ | List all active subjects |

---

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | API status |
| GET | `/health/db` | DB connectivity |

---

## WebSocket Events (SocketIO)

**Connection** — Send JWT in auth handshake:
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: `Bearer ${accessToken}` }
});
```

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `chat:message` | `{ session_id, message }` | Send message, receive streamed response |
| `quiz:join` | `{ quiz_id }` | Join quiz room for live updates |
| `presence:ping` | — | Heartbeat |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `connected` | `{ user_id }` | Connection confirmed |
| `chat:typing` | `{ session_id }` | AI is generating |
| `chat:chunk` | `{ session_id, chunk }` | Stream token |
| `chat:done` | `{ session_id }` | Response complete |
| `chat:error` | `{ session_id, message }` | Error occurred |
| `quiz:joined` | `{ quiz_id }` | Joined quiz room |
| `presence:pong` | `{ online_count }` | Live user count |

---

## Security Model

### JWT Token Strategy
- **Access token**: 60 min TTL, not individually blacklisted (short expiry = fast revocation)
- **Refresh token**: 30 day TTL, stored in DB, revocable immediately
- **Rotation**: Every refresh issues a new token pair; old refresh token is revoked

### Account Security
- **Password**: Bcrypt (12 rounds), min 8 chars + uppercase + digit
- **Lockout**: 5 failed logins → 15 min lock
- **Email enumeration**: Password reset always returns 200
- **Input sanitization**: Bleach strips HTML in user-generated text
- **SQL injection**: Parameterized queries via SQLAlchemy ORM

### Rate Limits
| Endpoint | Limit |
|---|---|
| POST /register | 5/minute |
| POST /login | 10/minute |
| POST /*/stream | 30/minute |
| POST /*/transcribe | 10/minute |
| POST /*/attempt | 30/hour |
| Request reset | 3/hour |
| Default | 200/day, 50/hour |

---

## Concurrency Architecture

```
Load Balancer (nginx)
        │
   ┌────┴────┐
   │  API    │  ← 4 Gunicorn workers (Eventlet async)
   │ :5000   │
   └────┬────┘
        │
   ┌────┴──────────────┐
   │                   │
  Redis               PostgreSQL
  ┌──────┐            ┌──────────┐
  │ 0    │ SocketIO   │ Pool:    │
  │ 1    │ Cache      │ 20 conns │
  │ 2    │ Celery     │ +40 ovf  │
  │ 3    │ Results    └──────────┘
  └──────┘
        │
   ┌────┴────┐
   │ Celery  │  ← 4 workers
   │ Workers │    Email, TTS, AI quiz gen
   └─────────┘
```

---

## Quick Start

```bash
# 1. Clone and setup
cp .env.example .env
# Edit .env with your OpenAI API key and secrets

# 2. Start all services
docker-compose up -d

# 3. Run migrations + seed
docker-compose exec api flask db upgrade
docker-compose exec api flask seed

# 4. Run tests
docker-compose exec api pytest tests/ -v

# Test accounts:
#   Admin:   admin@apexlearn.dev   / Admin123!
#   Student: student@apexlearn.dev / Student123!
```
