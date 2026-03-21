---
title: "Cross-Agent Communication"
category: development
acl:
  read: [all]
  write: [owner]
  approve: [owner]
  execute: [all]
owner: "{owner_id}"
requires_approval: false
---

# Cross-Agent Communication

## Purpose

How agents communicate, assign tasks, and control each other's sessions through elementStore.

## Pre-Conditions

- elementStore is healthy and reachable
- Both agents are registered in ES as `ai:agent` or `ai:assistant`
- The sending agent has appropriate ACL permissions

## Sending a Task to Another Agent

1. Create `ai:task` in ES:
   ```
   POST $ES_URL/store/ai:task
   {
     "name": "Task description",
     "agent_id": "{target_agent_id}",
     "status": "open",
     "priority": "P1",
     "source": "agent",
     "project": "{project_id}"
   }
   ```
2. The target agent picks it up in its next loop iteration.

## Asking Another Agent a Question

1. Create `ai:question` in ES:
   ```
   POST $ES_URL/store/ai:question
   {
     "question": "Your question",
     "from_agent": "{your_agent_id}",
     "to_agents": ["{target_agent_id}"],
     "status": "open",
     "context": "Why you're asking"
   }
   ```
2. The target agent answers in its next loop iteration.

## Sending a Message to a Running Agent

1. Find the agent's active conversation:
   ```
   GET $ES_URL/query/ai:conversation?agent_id={target_agent_id}&status=active
   ```
2. Send a message to that conversation:
   ```
   POST $ES_URL/action/ai:conversation.send_message/execute
   {target_conversation_id, message}
   ```

## Stopping a Running Agent

1. Find the agent's active conversation (same as above).
2. Stop generation:
   ```
   POST $ES_URL/action/ai:conversation.stop_generation/execute
   {target_conversation_id}
   ```
3. Or end the session entirely:
   ```
   POST $ES_URL/action/ai:conversation.end_conversation/execute
   {target_conversation_id}
   ```

## Checking Agent Status

Query active conversations to see who is running:
```
GET $ES_URL/query/ai:conversation?status=active
```

## Post-Conditions

- Task/question created and visible in target agent's next loop
- Or message delivered to running session via conversation

## Verification

- Query ES to confirm the task/question/message was created
- Check the target agent's conversation status
