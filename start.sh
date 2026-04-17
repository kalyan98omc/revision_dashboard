#!/bin/bash

cd Backend
. .venv/bin/activate

gunicorn -k gevent -w 1 wsgi:application --bind 0.0.0.0:$PORT
