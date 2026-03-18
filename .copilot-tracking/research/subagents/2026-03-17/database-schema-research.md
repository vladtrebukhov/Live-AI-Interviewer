# Database Schema Evolution & Migration History

## Research Topics

- Complete data model and all relationships
- Migration history and schema evolution timeline
- Rationale for removing Clerk/auth
- Seed data strategy and seeded questions/test cases
- Indexing strategy
- ID generation approach
- Architectural decisions evident in schema design

## Data Model (Current — as of migration `20260307141325`)

### Enums

| Enum | Values |
|---|---|
| `Difficulty` | `easy`, `medium`, `hard` |
| `SessionStatus` | `active`, `completed`, `abandoned` |
| `MessageRole` | `user`, `assistant`, `system` |
| `MessageType` | `code`, `speech`, `feedback`, `system` |

### Models & Relationships

```text
Question (1) ──< TestCase          (cascade delete)
Question (1) ──< StarterCode       (cascade delete, unique on [questionId, language])
Question (1) ──< InterviewSession   (restrict delete)
InterviewSession (1) ──< SessionMessage (cascade delete)
```

#### Question

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `title` | TEXT | |
| `description` | TEXT | `@db.Text` for long content |
| `difficulty` | `Difficulty` enum | |
| `tags` | TEXT[] | PostgreSQL array |
| `createdAt` | TIMESTAMP | default `now()` |
| `updatedAt` | TIMESTAMP | auto-managed by Prisma `@updatedAt` |

#### StarterCode (added in migration 4)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `questionId` | TEXT | FK → Question, cascade delete |
| `language` | TEXT | e.g., `'typescript'`, `'javascript'` |
| `code` | TEXT | `@db.Text` |

Unique composite index: `(questionId, language)` — one starter code per language per question.

#### TestCase

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `questionId` | TEXT | FK → Question, cascade delete |
| `input` | TEXT | `@db.Text` |
| `expectedOutput` | TEXT | `@db.Text` |
| `isHidden` | BOOLEAN | default `false` |

#### InterviewSession

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `questionId` | TEXT | FK → Question (restrict delete) |
| `code` | TEXT | `@db.Text`, default `""` — stores candidate's current code |
| `status` | `SessionStatus` enum | default `active` |
| `startedAt` | TIMESTAMP | default `now()` |
| `endedAt` | TIMESTAMP? | nullable, set on completion |

#### SessionMessage

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (cuid) | PK |
| `sessionId` | TEXT | FK → InterviewSession, cascade delete |
| `role` | `MessageRole` enum | |
| `content` | TEXT | `@db.Text` |
| `messageType` | `MessageType` enum | |
| `createdAt` | TIMESTAMP | default `now()` |

## Migration History Timeline

### Migration 1: `20260305140542_init`

**Initial schema with Clerk-based authentication.**

Created:

- 4 enums: `Difficulty`, `SessionStatus`, `MessageRole`, `MessageType`
- 5 tables: `User`, `Question`, `TestCase`, `InterviewSession`, `SessionMessage`

Key design points:

- `User` table with `clerkId` (unique) and `email` (unique) for Clerk auth integration
- `Question` had a single `starterCode TEXT` column (one language only)
- `InterviewSession` had a `userId` FK → `User` with cascade delete
- `InterviewSession.questionId` FK → `Question` with restrict delete (preserves sessions if question is referenced)
- `TestCase` and `SessionMessage` both cascade-delete with their parents

Indexes:

- `User_clerkId_key` (unique)
- `User_email_key` (unique)

### Migration 2: `20260306000000_drop_clerk_id`

**Removed Clerk ID from User model.**

Changes:

- Dropped the `User_clerkId_key` unique index
- Dropped the `clerkId` column from `User`

Rationale: First step in removing external auth dependency. The Clerk integration was abandoned, likely simplifying the app to function without user authentication (anonymous interview sessions).

### Migration 3: `20260307000000_drop_user_model`

**Completely removed the User model and user-session relationship.**

Changes:

- Dropped FK constraint `InterviewSession_userId_fkey`
- Dropped unique index `User_email_key`
- Dropped `userId` column from `InterviewSession`
- Dropped `User` table entirely

All statements use `IF EXISTS` / `IF NOT EXISTS` for idempotent execution.

Rationale: Completes the auth removal. Sessions become anonymous — no user identity required. This simplifies the app to a "jump straight into an interview" experience without sign-up/login friction. The `InterviewSession` now only links to a `Question`, not a `User`.

### Migration 4: `20260307141325_add_starter_code_per_language`

**Refactored starter code from single column to per-language model.**

Changes:

- Dropped `starterCode` column from `Question`
- Created `StarterCode` table with `id`, `questionId`, `language`, `code`
- Added composite unique index `StarterCode_questionId_language_key`
- Added FK `StarterCode_questionId_fkey` with cascade delete

Rationale: Enabled multi-language support. Previously, a question had one `starterCode` string (presumably TypeScript only). Now each question can have starter code in multiple languages (TypeScript and JavaScript in the seed data), with a unique constraint preventing duplicates per language.

## Migration Lock

```toml
provider = "postgresql"
```

Confirms PostgreSQL as the sole database provider. No multi-provider support.

## ID Generation Approach

All models use **CUID** (`@default(cuid())`) for primary keys, stored as `TEXT`.

Design implications:

- CUIDs are collision-resistant, globally unique, and sortable by creation time
- TEXT storage (not UUID) — CUIDs are ~25 characters, slightly longer than UUIDs
- No auto-increment integers anywhere — fully distributed-safe ID generation
- Client-side generation is possible (CUIDs don't require DB round-trips)

## Indexing Strategy

Explicit indexes:

| Index | Table | Type | Status |
|---|---|---|---|
| `User_clerkId_key` | User | Unique | **Removed** (migration 2) |
| `User_email_key` | User | Unique | **Removed** (migration 3) |
| `StarterCode_questionId_language_key` | StarterCode | Unique composite | Active |

Implicit indexes (auto-created by PostgreSQL for PKs and FKs):

- All `id` columns have PK indexes
- FK columns (`questionId`, `sessionId`) get indexes from their FK constraints

Notable absence: No explicit indexes on frequently queried FK columns beyond what PostgreSQL auto-creates. No indexes on `status`, `difficulty`, `tags`, or `createdAt` — acceptable at current scale (seed has 8 questions).

## Seed Data Strategy

### Approach

The seed script (`prisma/seed.ts`):

1. Uses `PrismaClient` with `PrismaPg` adapter (driver adapter pattern)
2. Calls `loadBackendEnv()` to load environment variables before connecting
3. **Clears all data** in reverse-dependency order before seeding: `SessionMessage` → `InterviewSession` → `StarterCode` → `TestCase` → `Question`
4. Uses Prisma's nested `create` to atomically insert each question with its test cases and starter codes
5. Logs the count of seeded questions

### Seeded Questions (8 total)

| # | Title | Difficulty | Tags |
|---|---|---|---|
| 1 | Design a Parking Lot | medium | OOP, Design Patterns, Classes |
| 2 | Design a LRU Cache | medium | Data Structures, HashMap, Linked List |
| 3 | Design a Task Scheduler | hard | Concurrency, Priority Queue, Graph |
| 4 | Design a URL Shortener | easy | Hashing, System Design, CRUD |
| 5 | Design an Elevator System | hard | OOP, Scheduling, State Machine |
| 6 | Design a Rate Limiter | medium | Algorithms, System Design, Concurrency |
| 7 | Design a File System | medium | Tree, OOP, Recursion |
| 8 | Design a Chat Application | hard | OOP, Real-time, Observer Pattern |

Difficulty distribution: 1 easy, 4 medium, 3 hard.

### Starter Codes Per Question

Each question has **two starter code variants**:

- **TypeScript**: Class-based with typed signatures
- **JavaScript**: Function/closure-based (functional factory pattern)

Design choice: TypeScript starters use `class` syntax; JavaScript starters use closure-based factory functions (e.g., `createParkingLot()` returning `{ park, unpark, getAvailableSpots }`). This showcases idiomatic patterns for each language.

### Test Cases Per Question

Each question has 2–4 test cases:

- **Visible** (`isHidden: false`): 2–3 per question — shown to candidate during interview
- **Hidden** (`isHidden: true`): 1 per question — used for evaluation, not shown

Test cases are descriptive (natural language input/output) rather than executable assertions, suggesting they're used as behavioral guidelines for the LLM interviewer or for display purposes, not automated test execution.

## Architectural Decisions

### 1. Auth Removal — Anonymous-First Design

The project started with Clerk auth (migration 1) and progressively removed it across two migrations (2 and 3). The final schema has **no user model at all**. Sessions are anonymous, identified only by their CUID. This signals a deliberate decision to prioritize frictionless access over user tracking.

### 2. Driver Adapter Pattern

The Prisma config uses `PrismaPg` adapter rather than the default Prisma engine. This is the newer Prisma driver-adapter approach, using the `pg` driver directly. The `prisma.config.ts` loads env vars via `loadBackendEnv()` — consistent with the memory note about ESM import order issues.

### 3. Cascade Delete Strategy

- `TestCase`, `StarterCode`, `SessionMessage` all cascade-delete from their parents
- `InterviewSession` → `Question` uses **restrict** delete (can't delete a question that has sessions)
- This protects interview history while allowing clean question editing

### 4. Multi-Language Starter Code as Separate Model

Rather than embedding starter code as JSON or a single text field, the schema uses a normalized `StarterCode` model with a composite unique constraint. This enables:

- Adding new languages without schema changes
- Querying/filtering by language
- Independent versioning of starter code per language

### 5. Message Typing System

`SessionMessage` has both `role` (user/assistant/system) and `messageType` (code/speech/feedback/system). This dual-axis typing enables rich conversation modeling where the same role can produce different message types (e.g., a user can submit code or speak).

### 6. Session State Machine

`InterviewSession.status` uses a three-state enum: `active` → `completed` | `abandoned`. Combined with `startedAt`/`endedAt` timestamps, this supports session lifecycle tracking.

## Prisma Configuration

File: `packages/backend/prisma.config.ts`

- Schema path: `prisma/schema.prisma`
- Migration path: `prisma/migrations`
- Seed command: `npx tsx prisma/seed.ts`
- Datasource URL from `DATABASE_URL` env var (loaded via `loadBackendEnv()`)
- Client output: `../src/generated/prisma` (checked into source in `src/generated/`)

## Discovered Topics (Completed)

- [x] How does the app handle user identity without a User model? → Sessions are anonymous, identified by CUID only.
- [x] Are test cases machine-executable or descriptive? → Descriptive (natural language), used as behavioral specs.
- [x] What's the FK delete behavior pattern? → Cascade for children, restrict for cross-entity refs.

## References

- `packages/backend/prisma/schema.prisma` — current schema
- `packages/backend/prisma/seed.ts` — seed script
- `packages/backend/prisma.config.ts` — Prisma configuration
- `packages/backend/prisma/migrations/20260305140542_init/migration.sql` — initial schema with Clerk auth
- `packages/backend/prisma/migrations/20260306000000_drop_clerk_id/migration.sql` — remove clerkId
- `packages/backend/prisma/migrations/20260307000000_drop_user_model/migration.sql` — remove User model entirely
- `packages/backend/prisma/migrations/20260307141325_add_starter_code_per_language/migration.sql` — StarterCode model
- `packages/backend/prisma/migrations/migration_lock.toml` — provider lock
