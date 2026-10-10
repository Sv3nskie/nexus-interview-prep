export interface Module { title: string; summary: string }

/** Hand-curated syllabi for the focus topics; other topics get an AI-written outline on demand. */
export const CURRICULUM: Record<string, Module[]> = {
  javascript: [
    { title: 'Execution context, hoisting & the TDZ', summary: 'How var/let/const, function declarations and the call stack really behave.' },
    { title: 'Closures & lexical scope', summary: 'Capturing variables, the classic loop bug, module pattern, memory implications.' },
    { title: 'this, call/apply/bind & arrow functions', summary: 'The four binding rules and why arrows differ.' },
    { title: 'Prototypes, classes & inheritance', summary: 'The prototype chain, new, class sugar, private fields, mixins.' },
    { title: 'The event loop: tasks, microtasks & timers', summary: 'Ordering of setTimeout, promises, queueMicrotask, rendering; predict-the-output questions.' },
    { title: 'Promises & async/await patterns', summary: 'all/allSettled/race/any, error propagation, sequential vs parallel, cancellation with AbortController.' },
    { title: 'Type coercion, equality & numbers', summary: '== vs ===, truthiness, typeof quirks, floating point, BigInt.' },
    { title: 'Iterators, generators & async iteration', summary: 'Iteration protocols, lazy sequences, for await, streams.' },
    { title: 'Objects, immutability & modern syntax', summary: 'Destructuring, spread, optional chaining, Object.freeze, structuredClone, Map/Set/WeakMap, Proxy.' },
    { title: 'Modules: ESM vs CommonJS', summary: 'Static vs dynamic loading, circular imports, tree shaking, top-level await.' },
    { title: 'Memory, garbage collection & leaks', summary: 'Reachability, common leak sources, WeakRef, profiling.' },
    { title: 'Error handling & defensive code', summary: 'Error subclasses, async errors, unhandled rejections, finally semantics.' },
    { title: 'Performance patterns: debounce, throttle, memoize', summary: 'Implementing and reasoning about each, plus batching and lazy work.' },
    { title: 'Implement-it-yourself classics', summary: 'bind, Promise.all, curry, deepClone, EventEmitter, LRU cache, flatten, debounce.' },
  ],
  rust: [
    { title: 'Ownership & move semantics', summary: 'Stack vs heap, moves, Copy vs Clone, drop order.' },
    { title: 'Borrowing & references', summary: 'Shared vs mutable borrows, the aliasing rule, non-lexical lifetimes.' },
    { title: 'Lifetimes', summary: 'Lifetime annotations, elision rules, structs holding references, \'static.' },
    { title: 'Structs, enums & pattern matching', summary: 'Algebraic data types, match exhaustiveness, if let, let-else.' },
    { title: 'Error handling: Option, Result & ?', summary: 'Custom errors, thiserror/anyhow, From conversions, panics vs errors.' },
    { title: 'Traits & generics', summary: 'Trait bounds, associated types, blanket impls, coherence, monomorphization.' },
    { title: 'Trait objects vs generics', summary: 'dyn Trait, object safety, static vs dynamic dispatch trade-offs.' },
    { title: 'Closures & the Fn traits', summary: 'Fn/FnMut/FnOnce, move closures, returning closures.' },
    { title: 'Iterators & collections', summary: 'Lazy adapters, collect, Vec/HashMap/BTreeMap internals, entry API.' },
    { title: 'Smart pointers: Box, Rc, Arc, RefCell', summary: 'Interior mutability, reference cycles, Weak.' },
    { title: 'Concurrency: threads, channels, Mutex, Send & Sync', summary: 'Fearless concurrency, data races prevented at compile time, atomics.' },
    { title: 'Async Rust: futures, tokio & Pin', summary: 'How async/await compiles to state machines, runtimes, cancellation safety.' },
    { title: 'Cargo, modules, crates & testing', summary: 'Workspaces, features, visibility, unit/integration tests, clippy.' },
    { title: 'Unsafe, FFI & memory layout', summary: 'What unsafe allows, raw pointers, repr(C), soundness.' },
    { title: 'Classic interview exercises in Rust', summary: 'Linked list, LRU cache, tokenizer, thread pool, with ownership-friendly designs.' },
  ],
  database: [
    { title: 'Relational modelling & normalization', summary: 'Keys, 1NF–3NF/BCNF, when to denormalize on purpose.' },
    { title: 'SQL joins & set operations', summary: 'Inner/outer/cross/self joins, semi/anti joins, UNION vs UNION ALL.' },
    { title: 'Aggregation, GROUP BY & HAVING', summary: 'Conditional aggregation, NULL behaviour, DISTINCT pitfalls.' },
    { title: 'Window functions', summary: 'ROW_NUMBER/RANK/DENSE_RANK, LAG/LEAD, running totals, top-N per group.' },
    { title: 'Subqueries, CTEs & recursive queries', summary: 'Correlated subqueries, EXISTS vs IN, hierarchy traversal.' },
    { title: 'Indexes: B-tree, composite & covering', summary: 'Left-prefix rule, selectivity, index-only scans, write cost.' },
    { title: 'Reading query plans (EXPLAIN)', summary: 'Seq vs index scan, join algorithms, spotting bad estimates.' },
    { title: 'Transactions & ACID', summary: 'Atomicity, durability via WAL, savepoints, idempotency.' },
    { title: 'Isolation levels & anomalies', summary: 'Dirty/non-repeatable/phantom reads, write skew, snapshot isolation.' },
    { title: 'Locking, MVCC & deadlocks', summary: 'Row locks, SELECT FOR UPDATE, optimistic vs pessimistic concurrency.' },
    { title: 'Schema design, constraints & migrations', summary: 'Zero-downtime migrations, soft deletes, UUID vs serial keys, JSON columns.' },
    { title: 'MongoDB & document modelling', summary: 'Embed vs reference, aggregation pipeline, indexes, transactions, when not to use it.' },
    { title: 'NoSQL families & the CAP theorem', summary: 'Key-value, document, column, graph; consistency vs availability trade-offs.' },
    { title: 'Replication, sharding & scaling reads/writes', summary: 'Leader/follower, replication lag, partition keys, hot shards.' },
    { title: 'Caching & Redis patterns', summary: 'Cache-aside, write-through, invalidation, stampedes, TTLs.' },
    { title: 'Performance: N+1, pagination & bulk operations', summary: 'Keyset vs offset pagination, batching, connection pooling.' },
    { title: 'Classic SQL interview problems', summary: 'Second-highest salary, consecutive days, gaps & islands, duplicates, running totals.' },
  ],
};

/** LeetCode starting points per focus topic. */
export const LC_CATEGORY: Record<string, string> = { javascript: 'javascript', database: 'database' };
export const LAB_LANG: Record<string, string> = { javascript: 'javascript', rust: 'rust', database: 'sql' };

/** Core algorithm tags a general SWE interview leans on, with a sensible solved-count target. */
export const CORE_TAGS: { slug: string; name: string; target: number }[] = [
  { slug: 'array', name: 'Array', target: 25 }, { slug: 'string', name: 'String', target: 20 },
  { slug: 'hash-table', name: 'Hash Table', target: 20 }, { slug: 'two-pointers', name: 'Two Pointers', target: 12 },
  { slug: 'sliding-window', name: 'Sliding Window', target: 10 }, { slug: 'binary-search', name: 'Binary Search', target: 12 },
  { slug: 'stack', name: 'Stack', target: 10 }, { slug: 'linked-list', name: 'Linked List', target: 10 },
  { slug: 'tree', name: 'Tree', target: 15 }, { slug: 'graph', name: 'Graph', target: 12 },
  { slug: 'dynamic-programming', name: 'Dynamic Programming', target: 20 }, { slug: 'heap-priority-queue', name: 'Heap', target: 8 },
  { slug: 'backtracking', name: 'Backtracking', target: 8 }, { slug: 'greedy', name: 'Greedy', target: 8 },
  { slug: 'trie', name: 'Trie', target: 4 }, { slug: 'union-find', name: 'Union Find', target: 4 },
];
