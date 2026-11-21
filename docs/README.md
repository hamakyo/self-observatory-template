# Documentation Index

[English](README.md) | [日本語](ja/README.md)

Documentation for `self-observatory`. Start with the guide that matches what you need.

## Start here (concept & overview)

| Document | Description |
| --- | --- |
| [How to Use](how-to-use.md) | 30-second workflow, what to record, and where notes live |
| [Philosophy](philosophy.md) | Core idea: a person is a trajectory through state space, not a static state |
| [Architecture](architecture.md) | Subsystems, safety write gate, AI boundaries, and dual evolution histories |
| [Roadmap (JA)](roadmap.md) | Milestones and progress from v0.1 to v1.0 |

## Daily capture & operations

| Document | Description |
| --- | --- |
| [Capture Architecture](capture.md) | How local memos, chat connectors, and imports pass through the same boundary |
| [Privacy Ingress (JA)](privacy-ingress.md) | Step-by-step local quarantine classification, minimization, approval, and staging checks |
| [Experience & Feedback Workflow (JA)](experience-feedback-workflow.md) | Practical workflow from Capture import to consolidation PR, trial records, and re-indexing |
| [Media Architecture (JA)](media.md) | Separating curated sanitized bytes (`assets/`) from semantic notes (`media/`) |

## Security & boundaries

| Document | Description |
| --- | --- |
| [Threat Model (JA)](threat-model.md) | Assets to protect, key risks, and trust boundaries |
| [Incident Response (JA)](incident-response.md) | Containment, cleanup, and prevention if sensitive data enters Git |

> For concrete storage rules, agent guidelines, and frontmatter definitions, see root [DATA_POLICY.md](../DATA_POLICY.md), [AGENTS.md](../AGENTS.md) ([日本語](ja/AGENTS.md)), and [SCHEMA.md](../SCHEMA.md).

## Self Observatory (local GUI, design & API)

| Document | Description |
| --- | --- |
| [Local GUI README](../apps/observatory/README.md) | Launching the local app, views, EN/JA switching, and test commands ([日本語](../apps/observatory/README.ja.md)) |
| [Self Observatory GUI Vision (JA)](self-observatory.md) | Overview and nine perspectives of the read-only local observatory |
| [Implementation Design (JA)](self-observatory-design.md) | Architecture, UI structure, and phased rollout |
| [Data Contracts (JA)](self-observatory-data-contracts.md) | Contracts for snapshots, derived index, relations, diffs, and external imports |
| [Read API Spec (JA)](self-observatory-api.md) | Endpoints, evolution classification, error codes, and serving rules |
| [Experience & Feedback Design (JA)](experience-feedback-design.md) | Schema extensions and design rationale for temporal precision and feedback |
| [Self Time Volume Prototype (JA)](self-time-volume.md) | 3D-to-SVG spacetime view contract, rendering limits, and benchmarks |
