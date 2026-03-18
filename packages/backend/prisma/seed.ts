import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadBackendEnv } from '../src/lib/env.js';

loadBackendEnv();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL']! }),
});

async function main() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.sessionMessage.deleteMany();
  await prisma.interviewSession.deleteMany();
  await prisma.starterCode.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.question.deleteMany();

  const questions = [
    {
      title: 'Design a Parking Lot',
      description: `Design a single-level parking lot system with the following requirements:
- Spot types: compact, regular, large
- Vehicle types: motorcycle, car, bus
- Parking rules:
  - motorcycle -> any spot
  - car -> regular or large
  - bus -> large only
- Support: park(vehicleType) -> spotId | null, unpark(spotId) -> boolean, and getAvailableSpots()

Focus on clean APIs and correct state updates. Keep the model intentionally small for a ~1 hour interview.`,
      difficulty: 'medium' as const,
      tags: ['OOP', 'Design Patterns', 'Classes'],
      starterCodes: [
        {
          language: 'typescript',
          code: `type SpotType = 'compact' | 'regular' | 'large';
type VehicleType = 'motorcycle' | 'car' | 'bus';

class ParkingLot {
  constructor(spots: Array<{ id: string; type: SpotType }>) {
    // TODO: store spots and occupancy state
  }

  park(vehicleType: VehicleType): string | null {
    // TODO: return a compatible spot id or null
    return null;
  }

  unpark(spotId: string): boolean {
    // TODO: free a spot by id
    return false;
  }

  getAvailableSpots(): Record<SpotType, number> {
    // TODO: return free counts by spot type
    return { compact: 0, regular: 0, large: 0 };
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createParkingLot(spots) {
  // TODO: initialize lot state from input spots

  function park(vehicleType) {
    // TODO: find a compatible spot and return its id
    return null;
  }

  function unpark(spotId) {
    // TODO: free spot by id and return success
    return false;
  }

  function getAvailableSpots() {
    // TODO: return free counts by type
    return { compact: 0, regular: 0, large: 0 };
  }

  return { park, unpark, getAvailableSpots };
}`,
        },
      ],
      testCases: [
        { input: 'park("car") in an empty lot with at least one regular/large spot', expectedOutput: 'returns allocated spot id (string)', isHidden: false },
        { input: 'park("bus") when only compact/regular spots are free', expectedOutput: 'null', isHidden: false },
        { input: 'unpark(validOccupiedSpotId)', expectedOutput: 'true and spot becomes available', isHidden: false },
        { input: 'park("car") when no compatible spot remains', expectedOutput: 'null', isHidden: true },
      ],
    },
    {
      title: 'Design a LRU Cache',
      description: `Design and implement a Least Recently Used (LRU) Cache with the following operations:
- get(key): Get the value if the key exists, otherwise return -1
- put(key, value): Set or insert the value. When cache reaches capacity, remove the least recently used item.
- Both operations should run in O(1) time complexity.

Use a combination of a hash map and doubly linked list.`,
      difficulty: 'medium' as const,
      tags: ['Data Structures', 'HashMap', 'Linked List'],
      starterCodes: [
        {
          language: 'typescript',
          code: `class LRUCache {
  constructor(capacity: number) {
    // TODO: implement
  }

  get(key: number): number {
    // TODO: implement
    return -1;
  }

  put(key: number, value: number): void {
    // TODO: implement
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createLRUCache(capacity) {
  function get(key) {
    // TODO: return value for key, or -1 if missing
    return -1;
  }

  function put(key, value) {
    // TODO: insert/update key and evict least recently used when needed
  }

  return { get, put };
}`,
        },
      ],
      testCases: [
        { input: 'capacity=2, put(1,1), put(2,2), get(1)', expectedOutput: '1', isHidden: false },
        { input: 'capacity=2, put(1,1), put(2,2), put(3,3), get(2)', expectedOutput: '-1', isHidden: false },
        { input: 'capacity=1, put(1,1), put(2,2), get(1)', expectedOutput: '-1', isHidden: true },
      ],
    },
    {
      title: 'Design a Task Scheduler',
      description: `Design a single-threaded task scheduler that:
    - Accepts tasks with priority (high, medium, low)
    - Supports dependencies (task B depends on task A)
    - Runs tasks in valid order: dependencies first, then priority
    - Exposes a simple API to add tasks and run all schedulable tasks

    Ignore thread pools, parallelism, and distributed concerns. Focus on ordering logic suitable for a ~1 hour interview.`,
      difficulty: 'hard' as const,
      tags: ['Concurrency', 'Priority Queue', 'Graph'],
      starterCodes: [
        {
          language: 'typescript',
          code: `type Priority = 'high' | 'medium' | 'low';

type Task = {
  id: string;
  priority: Priority;
  dependsOn: string[];
  run: () => void;
};

class TaskScheduler {
  addTask(task: Task): void {
    // TODO: store task by id
  }

  run(): string[] {
    // TODO: run tasks in dependency-safe, priority-aware order
    return [];
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createTaskScheduler() {
  function addTask(task) {
    // task = { id, priority, dependsOn, run }
    // TODO: store task
  }

  function run() {
    // TODO: resolve dependency-safe order, then priority
    return [];
  }

  return { addTask, run };
}`,
        },
      ],
      testCases: [
        { input: 'add high and low priority, execute', expectedOutput: 'high executes first', isHidden: false },
        { input: 'task with dependency', expectedOutput: 'dependency runs first', isHidden: false },
        { input: 'dependency cycle', expectedOutput: 'cycle detected or skipped with error', isHidden: true },
      ],
    },
    {
      title: 'Design a URL Shortener',
      description: `Design a URL shortening service that supports:
    - shorten(longUrl, customCode?)
    - resolve(shortCode)
    - custom short codes with collision checks

    Core requirements are shorten + resolve + collision handling.
    Analytics, click tracking, and TTL are optional stretch goals only.`,
      difficulty: 'easy' as const,
      tags: ['Hashing', 'System Design', 'CRUD'],
      starterCodes: [
        {
          language: 'typescript',
          code: `class URLShortener {
  constructor(baseUrl: string) {
    // TODO: implement
  }

  shorten(longUrl: string, customCode?: string): string {
    // TODO: implement
    return '';
  }

  resolve(shortCode: string): string | null {
    // TODO: implement
    return null;
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createUrlShortener(baseUrl) {
  function shorten(longUrl, customCode) {
    // TODO: create or reuse a short code and return full short URL
    return '';
  }

  function resolve(shortCode) {
    // TODO: return original URL for code, or null
    return null;
  }

  return { shorten, resolve };
}`,
        },
      ],
      testCases: [
        { input: 'shorten https://example.com', expectedOutput: 'returns short url', isHidden: false },
        { input: 'resolve short code', expectedOutput: 'https://example.com', isHidden: false },
        { input: 'custom code collision', expectedOutput: 'error thrown', isHidden: true },
      ],
    },
    {
      title: 'Design an Elevator System',
      description: `Design a single-elevator system simulation:
    - Queue floor requests
    - Move one floor at a time toward the current target
    - Track elevator state (current floor, direction, pending stops)
    - Support adding new requests while moving

    Focus on state transitions and queue handling. Ignore multi-elevator optimization and dispatch strategy.`,
      difficulty: 'hard' as const,
      tags: ['OOP', 'Scheduling', 'State Machine'],
      starterCodes: [
        {
          language: 'typescript',
          code: `type Direction = 'up' | 'down' | 'idle';

class ElevatorSystem {
  constructor(startFloor = 0) {
    // TODO: initialize state
  }

  requestFloor(floor: number): void {
    // TODO: add requested floor
  }

  step(): void {
    // TODO: move one floor toward next stop
  }

  getState(): { currentFloor: number; direction: Direction; queue: number[] } {
    // TODO: return current state snapshot
    return { currentFloor: 0, direction: 'idle', queue: [] };
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createElevatorSystem(startFloor = 0) {
  // TODO: initialize state

  function requestFloor(floor) {
    // TODO: add requested floor
  }

  function step() {
    // TODO: move one floor toward next stop
  }

  function getState() {
    // TODO: return current state snapshot
    return { currentFloor: startFloor, direction: 'idle', queue: [] };
  }

  return { requestFloor, step, getState };
}`,
        },
      ],
      testCases: [
        { input: 'request floor 5', expectedOutput: 'floor added to queue', isHidden: false },
        { input: 'step simulation', expectedOutput: 'elevator moves one floor', isHidden: false },
        { input: 'request while moving', expectedOutput: 'new request eventually served', isHidden: true },
      ],
    },
    {
      title: 'Design a Rate Limiter',
      description: `Design a token bucket rate limiter with:
    - Configurable capacity (max tokens)
    - Refill rate (tokens per second)
    - isAllowed(clientId): returns whether request is allowed
    - getRemainingTokens(clientId): returns current token estimate

    Focus on a single strategy (token bucket) and clear behavior in a single-process environment.`,
      difficulty: 'medium' as const,
      tags: ['Algorithms', 'System Design', 'Concurrency'],
      starterCodes: [
        {
          language: 'typescript',
          code: `type BucketState = {
  tokens: number;
  lastRefillMs: number;
};

class TokenBucketLimiter {
  constructor(private capacity: number, private refillPerSecond: number) {}

  isAllowed(clientId: string): boolean {
              // TODO: refill client bucket and consume one token if available
    return false;
  }

  getRemainingTokens(clientId: string): number {
              // TODO: return current token estimate for client
    return 0;
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createTokenBucketLimiter(capacity, refillPerSecond) {
  function isAllowed(clientId) {
    // TODO: refill client bucket and consume one token if possible
    return false;
  }

  function getRemainingTokens(clientId) {
    // TODO: return current token count for client
    return 0;
  }

  return { isAllowed, getRemainingTokens };
}`,
        },
      ],
      testCases: [
        { input: 'allow 5 requests within limit', expectedOutput: 'all allowed', isHidden: false },
        { input: '6th request over limit', expectedOutput: 'denied', isHidden: false },
        { input: 'wait for refill then retry', expectedOutput: 'allowed', isHidden: true },
      ],
    },
    {
      title: 'Design a File System',
      description: `Design an in-memory file system with core operations only:
    - mkdir(path)
    - createFile(path, content)
    - readFile(path)
    - list(path)

    Assume absolute paths and keep behavior predictable. Skip move/copy/search/recursive size concerns for this interview scope.`,
      difficulty: 'medium' as const,
      tags: ['Tree', 'OOP', 'Recursion'],
      starterCodes: [
        {
          language: 'typescript',
          code: `type Entry =
  | { type: 'file'; content: string }
  | { type: 'dir'; children: Record<string, Entry> };

class FileSystem {
  constructor() {
    // TODO: initialize root directory
  }

  mkdir(path: string): void {
    // TODO: create directory path
  }

  createFile(path: string, content: string): void {
    // TODO: create or overwrite file
  }

  readFile(path: string): string {
    // TODO: return file content or throw
    return '';
  }

  list(path: string): string[] {
    // TODO: list names at path
    return [];
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createFileSystem() {
  // TODO: initialize root directory

  function mkdir(path) {
    // TODO: create directory path
  }

  function createFile(path, content) {
    // TODO: create or overwrite file
  }

  function readFile(path) {
    // TODO: return file content
    return '';
  }

  function list(path) {
    // TODO: return names in a directory
    return [];
  }

  return { mkdir, createFile, readFile, list };
}`,
        },
      ],
      testCases: [
        { input: 'create file at /docs/readme.txt', expectedOutput: 'file created', isHidden: false },
        { input: 'list /docs', expectedOutput: '[readme.txt]', isHidden: false },
        { input: 'read missing file', expectedOutput: 'error', isHidden: true },
      ],
    },
    {
      title: 'Design a Chat Application',
      description: `Design a simple chat backend with:
    - createRoom(participantIds)
    - sendMessage(roomId, senderId, content)
    - getRecentMessages(roomId, limit)

    Keep scope to core room + message flow. Presence, read receipts, muting, and advanced moderation are optional extensions.`,
      difficulty: 'hard' as const,
      tags: ['OOP', 'Real-time', 'Observer Pattern'],
      starterCodes: [
        {
          language: 'typescript',
          code: `type Room = {
  id: string;
  participantIds: string[];
};

type Message = {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: number;
};

class ChatService {
  createRoom(participantIds: string[]): Room {
    // TODO: create and return room
    throw new Error('Not implemented');
  }

  sendMessage(roomId: string, senderId: string, content: string): Message {
    // TODO: create and store message
    throw new Error('Not implemented');
  }

  getRecentMessages(roomId: string, limit: number): Message[] {
    // TODO: return recent messages
    return [];
  }
}`,
        },
        {
          language: 'javascript',
          code: `function createChatService() {
  function createRoom(participantIds) {
    // TODO: create and return room
    return null;
  }

  function sendMessage(roomId, senderId, content) {
    // TODO: create, store, and return message
    return null;
  }

  function getRecentMessages(roomId, limit) {
    // TODO: return last N messages
    return [];
  }

  return { createRoom, sendMessage, getRecentMessages };
}`,
        },
      ],
      testCases: [
        { input: 'create room with 2 participants', expectedOutput: 'room created', isHidden: false },
        { input: 'send message', expectedOutput: 'message stored and returned', isHidden: false },
        { input: 'fetch recent messages limit=20', expectedOutput: 'returns latest up to 20', isHidden: true },
      ],
    },
  ];

  for (const q of questions) {
    const { testCases, starterCodes, ...questionData } = q;
    await prisma.question.create({
      data: {
        ...questionData,
        testCases: {
          create: testCases,
        },
        starterCodes: {
          create: starterCodes,
        },
      },
    });
  }

  const count = await prisma.question.count();
  console.log(`Seeded ${count} questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
