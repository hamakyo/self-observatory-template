# Philosophy

[English](philosophy.md) | [日本語](ja/philosophy.md)

> **A person is not a state. A person is a trajectory through state space.**

`self-observatory` treats the self not as a static profile, but as a continuous, versioned process with a history of change.

## 1. State space and Git

```text
S₀ → S₁ → S₂ → S₃ → ... → Sₙ
```

Each state `S` holds memories, beliefs, values, knowledge, goals, relationships, and habits.  
What matters is not just the latest snapshot `Sₙ`, but **the transitions from one state to the next (the trajectory)**.

```text
commit  = state transition
tree    = state snapshot at a point in time
diff    = change
history = trajectory
```

Git is used here not merely for storage, but because its commit graph directly models continuity across change.

## 2. Temporal non-reduction (do not collapse a person into one frame)

An observation at one point in time is evidence about that state, not a final verdict on a whole person.

```text
observation(Sₜ) ≠ identity(Person)
observation(Sₜ) ≠ proof(Sₙ)
```

People change substantially while remaining the same continuous person. Avoid collapsing distinct axes into a single static label:

- Judging a past action as harmful and recognizing later pain as real can both be true at once.
- Recognizing later pain does not retroactively excuse past harm.
- Do not infer fixed essence from a single fragment; look for repeated evidence and context.

> **Evaluate a state in context; read a trajectory from history. Never mistake one frame for essence.**

This applies equally to understanding yourself and understanding others.

## 3. Observation must not replace participation

A model that only looks inward drifts away from reality.  
`self-observatory` must stay coupled to real-world feedback.

```text
Observe → Hypothesize → Act → Receive feedback → Revise
```

Over-analyzing, categorizing, and polishing self-models can become a way to postpone contact with reality. To guard against that:

> **Observatory must not replace participation.**

A simple daily check:

> **Did you take an action today that returned a Yes / No signal from reality?**

This is not a productivity score or moral grade. Whether the answer is Yes or No, the question simply checks whether the loop is still connected to the outside world.

## 4. Implications for records and design

- **Record changes ≠ personal changes**: Git timestamps record when the model was updated, not when an experience happened. Because experiencing, noticing, recording, and adopting happen at different times, commit dates never substitute for event dates.
- **Historical honesty**: Past Git trees contain only what was recorded at that time. Backfilling an old experience later does not rewrite past snapshots.
- **Value of failure and uncertainty**: Real-world outcomes (`success`, `failure`, `no_effect`, `inconclusive`, `pending`) belong in episodes and feed back into reviews. Failure and uncertainty are evidence that improves judgment, not demerits.

This repository aims to preserve five things rather than a polished self-portrait:

1. What changed
2. When it changed
3. Which experiences drove the change
4. Which beliefs were `superseded`
5. What remains uncertain

## 5. Open questions

These are concrete design questions for schemas, provenance, state transitions, and agency:

- What continuity makes two distant states “the same person”?
- When does a repeated observation shift from context into part of the self-model?
- How should contradictory states coexist without premature erasure?
- What should be forgotten, compressed, or preserved?
- Which changes may AI propose, and which decisions must remain strictly human?
