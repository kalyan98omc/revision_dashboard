#!/bin/bash
cd Backend
gunicorn wsgi:application --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT --timeout 120
