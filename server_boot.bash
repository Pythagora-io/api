#!/bin/bash

cd /home/ubuntu

tmux new-session -d -s pythagora
tmux send-keys -t pythagora 'sudo su ubuntu' C-m
tmux send-keys -t pythagora 'cd /home/ubuntu/api' C-m
tmux send-keys -t pythagora 'git stash' C-m
tmux send-keys -t pythagora 'git pull origin main' C-m
tmux send-keys -t pythagora 'npm i' C-m
tmux send-keys -t pythagora 'npm run start' C-m
