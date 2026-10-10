export interface Topic { id: string; label: string; group: 'Role' | 'Language' | 'Framework' | 'Core'; focus: string }

export const TOPICS: Topic[] = [
  { id: 'frontend', label: 'Frontend', group: 'Role', focus: 'HTML/CSS, browser internals, rendering performance, accessibility, state management, web vitals, bundling' },
  { id: 'backend', label: 'Backend', group: 'Role', focus: 'API design, auth, caching, queues, concurrency, observability, scaling, error handling' },
  { id: 'fullstack', label: 'Full Stack', group: 'Role', focus: 'end-to-end feature delivery, API contracts, auth flows, deployment, trade-offs across the stack' },
  { id: 'database', label: 'Databases', group: 'Core', focus: 'SQL, indexing, query plans, transactions/isolation, normalization, NoSQL trade-offs, migrations, replication' },
  { id: 'mobile', label: 'Mobile Apps', group: 'Role', focus: 'app lifecycle, offline-first, navigation, performance, state, push notifications, store release process' },
  { id: 'server', label: 'Servers & DevOps', group: 'Core', focus: 'Linux, networking, nginx, Docker, CI/CD, TLS, monitoring, deployment strategies, incident response' },
  { id: 'javascript', label: 'JavaScript', group: 'Language', focus: 'closures, event loop, prototypes, async patterns, ES2023+, this-binding, memory, type coercion' },
  { id: 'rust', label: 'Rust', group: 'Language', focus: 'ownership, borrowing, lifetimes, traits, error handling, async, smart pointers, concurrency' },
  { id: 'dart', label: 'Dart', group: 'Language', focus: 'null safety, async/streams, isolates, mixins, extension methods, records/patterns, generics' },
  { id: 'react', label: 'React', group: 'Framework', focus: 'hooks, reconciliation, rendering, memoization, context, server components, suspense, testing' },
  { id: 'nodejs', label: 'Node.js', group: 'Framework', focus: 'event loop phases, streams, clustering, worker threads, modules, performance, security' },
  { id: 'flutter', label: 'Flutter', group: 'Framework', focus: 'widget tree, build/render pipeline, state management, platform channels, performance, animations' },
  { id: 'system-design', label: 'System Design', group: 'Core', focus: 'scalability, consistency, partitioning, load balancing, caching layers, back-of-envelope estimation' },
  { id: 'behavioral', label: 'Behavioral', group: 'Core', focus: 'STAR stories, conflict, ownership, failure, leadership, communication, prioritization' },
];

export const LEVELS = ['junior', 'mid', 'senior', 'staff'] as const;

export const ANGLES = [
  'core fundamentals', 'a debugging scenario', 'performance and optimisation', 'trade-offs between two approaches',
  'a real-world production incident', 'common misconceptions and gotchas', 'edge cases', 'architecture and design',
  'security implications', 'testing strategy', 'tooling and ecosystem', 'how it works under the hood',
  'code review of flawed code', 'scaling it up 100x', 'migrating a legacy system',
];

export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = <T>(arr: T[]): T[] => arr.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
export const topicById = (id: string) => TOPICS.find((t) => t.id === id);
