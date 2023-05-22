#!/bin/bash

cd /home/ubuntu

tmux new-session -d -s pythagora
tmux send-keys -t safetytest-vue:0 'sudo su ubuntu' C-m
tmux send-keys -t safetytest-vue:0 'cd /home/ubuntu/api' C-m
tmux send-keys -t safetytest-vue:0 'git stash' C-m
tmux send-keys -t safetytest-vue:0 'git pull origin main' C-m
tmux send-keys -t safetytest-vue:0 'npm i' C-m
tmux send-keys -t safetytest-vue:0 'npm run start' C-m
