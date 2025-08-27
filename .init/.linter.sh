#!/bin/bash
cd /home/kavia/workspace/code-generation/prompt-to-python-generator-166132-166141/ai_program_creator_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

