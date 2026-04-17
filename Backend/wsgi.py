"""
wsgi.py
────────
Production WSGI entry point.
Run with:  gunicorn "wsgi:application" --worker-class eventlet -w 4 -b 0.0.0.0:5000
Dev:       python wsgi.py
"""

import sys
if "celery" not in sys.argv[0]:
    import eventlet
    eventlet.monkey_patch()   # Must be first — patches stdlib for async I/O

from celery import Celery as _Celery
from app import create_app
from app.extensions import socketio


def make_celery(flask_app):
    """Create a Celery instance tied to the Flask app context."""
    celery_app = _Celery(
        flask_app.import_name,
        broker=flask_app.config.get("CELERY_BROKER_URL"),
        backend=flask_app.config.get("CELERY_RESULT_BACKEND"),
    )
    celery_app.conf.update(flask_app.config)

    class ContextTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app


flask_app = create_app()



# Expose as 'application' for gunicorn / uWSGI
application = flask_app

# Expose Celery instance for:  celery -A wsgi.celery worker ...
celery = make_celery(flask_app)


if __name__ == "__main__":
    # Development server with SocketIO
    socketio.run(
        flask_app,
        host="0.0.0.0",
        port=int(__import__("os").getenv("PORT", 5000)),
        debug=flask_app.debug,
        use_reloader=flask_app.debug,
    )
