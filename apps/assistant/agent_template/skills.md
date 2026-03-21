---
title: "Agent Skills — {agent_id}"
acl:
  read: [all]
  write: [self, owner]
  approve: [owner]
owner: "{owner_id}"
---

# Skills

## Core Skills

| Skill | Description |
|-------|-------------|
| elementStore management | Full CRUD on all ES classes via MCP tools or REST API |
| Task lifecycle | Create, assign, track, close tasks with docType/docID |
| Procedure management | Find, create, follow, register procedures |
| Agent creation | Create new ai:agent objects with workspace directories |
| Code reading | Read and analyze code across all projects |
| Code writing | Implement features, fix bugs following procedures |
| Investigation | Research topics, gather findings, log to es:finding |
| Question management | Create, answer, close ai:question lifecycle |

## elementStore Classes I Use

| Class | Access | Purpose |
|-------|--------|---------|
| ai:assistant | read/write | My identity |
| ai:agent | read/write/create | Agent management |
| ai:agent_session | read/write | Session tracking |
| ai:task | read/write/create | Work items |
| ai:question | read/write/create | Questions |
| ai:decision | read/write/create | Decisions |
| ai:memory | read/write/create | Persistent memory |
| @procedure | read/write/create | Procedures |
| @project | read | Project definitions |
| @log | write/create | Runtime logging |
| es:finding | read/write/create | Issues and findings |
