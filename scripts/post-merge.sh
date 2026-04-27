#!/bin/bash
set -e
npm install
# 將空字串/Enter 自動送入 drizzle-kit push，
# 在罕見的互動式提示出現時選擇預設（最安全）選項，
# 避免 post-merge / 部署流程因等待輸入而 hang 死。
echo "" | npm run db:push
