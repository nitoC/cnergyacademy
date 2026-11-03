/**
 * Course content used by the development seed. Written as real teaching
 * material so the reader, journey and quizzes can be evaluated properly.
 */
import type { LessonBlock } from '../src/courses/lesson-content';

export interface SeedQuestion {
  prompt: string;
  options: [string, boolean][];
  explanation: string;
}
export interface SeedModule {
  title: string;
  summary: string;
  access: 'FREE' | 'PREMIUM' | 'PREREQUISITE_QUIZ' | 'PREMIUM_AND_PREREQUISITE_QUIZ';
  /** Index of an earlier module whose quiz gates this one. */
  gatedBy?: number;
  lessons: { title: string; minutes: number; content: LessonBlock[] }[];
  quiz?: { title: string; passingScore: number; maxAttempts: number | null; questions: SeedQuestion[] };
}
export interface SeedCourse {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  subject: string;
  category: string;
  creator: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  minutes: number;
  price: number | null;
  status: 'PUBLISHED' | 'DRAFT' | 'SUBMITTED';
  outcomes: string[];
  cover: string;
  modules: SeedModule[];
}

const p = (text: string): LessonBlock => ({ type: 'paragraph', text });
const h = (text: string, level: 2 | 3 = 2): LessonBlock => ({ type: 'heading', level, text });
const list = (items: string[], style: 'bullet' | 'number' = 'bullet'): LessonBlock => ({ type: 'list', style, items });
const code = (language: string, src: string): LessonBlock => ({ type: 'code', language, code: src });
const note = (text: string, tone: 'note' | 'tip' | 'warning' = 'note', title?: string): LessonBlock => ({ type: 'callout', tone, text, title });
const resource = (title: string, url: string, description?: string): LessonBlock => ({ type: 'resource', title, url, description });

export const COURSES: SeedCourse[] = [
  {
    slug: 'foundations-of-software-engineering',
    title: 'Foundations of Software Engineering',
    shortDescription: 'How working engineers break problems down, write code others can maintain, and ship it safely.',
    description:
      'A grounded introduction to the habits that separate code that works from software that lasts. You will practise decomposing problems, naming and structuring code, writing tests that earn their keep, and using version control as a thinking tool. Every module ends with a short check so you know the ideas have landed before you move on.',
    subject: 'software-engineering',
    category: 'fundamentals',
    creator: 'ada.okafor@academy.local',
    difficulty: 'BEGINNER',
    minutes: 180,
    price: null,
    status: 'PUBLISHED',
    cover: 'contour',
    outcomes: [
      'Decompose a vague requirement into small, testable pieces',
      'Write functions and modules with clear responsibilities',
      'Use automated tests to change code with confidence',
      'Work with Git branches and meaningful commits',
    ],
    modules: [
      {
        title: 'Thinking in problems, not code',
        summary: 'Before the editor opens: clarifying requirements and planning the smallest useful step.',
        access: 'FREE',
        lessons: [
          {
            title: 'What a requirement really asks for',
            minutes: 9,
            content: [
              p('Most bugs are not typing mistakes. They are misunderstandings that were written down faithfully. The first engineering skill is therefore reading a request and finding the questions it does not answer.'),
              h('Three questions to ask every time'),
              list(['Who is this for, and what are they trying to get done?', 'What does "done" look like — how would we demonstrate it?', 'What happens at the edges: empty input, huge input, failure?'], 'number'),
              p('Write the answers down in plain sentences. If you cannot, the requirement is not ready, and saying so early is far cheaper than discovering it in production.'),
              note('A requirement you can test is a requirement you understand. If you cannot describe the check, keep asking questions.', 'tip', 'Rule of thumb'),
            ],
          },
          {
            title: 'Decomposing work into thin slices',
            minutes: 11,
            content: [
              p('A thin slice is a piece of work that cuts through every layer the feature touches but does as little as possible in each. It can be demonstrated end to end, which means it can be reviewed, tested and shipped on its own.'),
              p('Compare "build the database schema for invoices" with "a user can create an invoice with one line item and see it in the list". The second is a slice: it forces decisions about the interface, the storage and the display, and it produces something a person can look at.'),
              h('Slicing a feature', 3),
              list(['Write the full feature as a single sentence.', 'Remove every adjective — "filterable", "paginated", "exportable".', 'What remains is your first slice. Add the adjectives back one at a time.'], 'number'),
              note('Slices that take more than a day or two usually hide two slices. Split them again.'),
            ],
          },
        ],
        quiz: {
          title: 'Check: problems before code',
          passingScore: 67,
          maxAttempts: null,
          questions: [
            { prompt: 'Which of these is the best first slice of an invoicing feature?', options: [['Design every database table invoices will ever need', false], ['A user creates an invoice with one line item and sees it listed', true], ['Build a PDF export for invoices', false]], explanation: 'A slice cuts through every layer but does the minimum in each, so it can be demonstrated end to end.' },
            { prompt: 'A requirement is ready to build when…', options: [['You can describe how you would check it is done', true], ['The ticket has a deadline', false], ['A manager has approved it', false]], explanation: 'If you can describe the check, you understand the requirement.' },
            { prompt: 'Why remove adjectives when slicing?', options: [['Adjectives are bad style', false], ['They usually hide additional, separable work', true], ['Tickets have a character limit', false]], explanation: '"Filterable", "paginated" and similar words are each extra slices that can follow the core one.' },
          ],
        },
      },
      {
        title: 'Code other people can read',
        summary: 'Naming, function size and module boundaries — the decisions that make code cheap to change.',
        access: 'FREE',
        lessons: [
          {
            title: 'Names are the first documentation',
            minutes: 10,
            content: [
              p('A reader meets your names before anything else. A good name says what something is for, not how it is implemented, and it stays true as the code evolves.'),
              code('ts', `// Hard to read: what is d? what does process do?\nfunction process(d: number[]) {\n  return d.filter((x) => x > 0).length;\n}\n\n// Says what it is for\nfunction countPositiveBalances(balances: number[]) {\n  return balances.filter((balance) => balance > 0).length;\n}`),
              p('Notice that the second version needs no comment. When a name needs a comment to explain it, try renaming first.'),
              note('Avoid names that describe types (`dataList`, `userObj`). The type system already tells the reader that.', 'warning'),
            ],
          },
          {
            title: 'Small functions with one reason to change',
            minutes: 12,
            content: [
              p('A function should do one thing at one level of detail. When a function mixes fetching, validation and formatting, any change to one of those concerns risks breaking the others.'),
              h('A quick test', 3),
              p('Describe what the function does in one sentence without using "and". If you need "and", you have found a seam where the function can be split.'),
              list(['Pure calculations in their own functions — easy to test.', 'Input/output (network, disk, database) at the edges.', 'A thin coordinating function that calls both.']),
              resource('Refactoring catalogue', 'https://refactoring.com/catalog/', 'Named, step-by-step refactorings with before-and-after examples.'),
            ],
          },
        ],
        quiz: {
          title: 'Check: readable code',
          passingScore: 67,
          maxAttempts: 3,
          questions: [
            { prompt: 'Which name best communicates intent?', options: [['tmpArr', false], ['overdueInvoices', true], ['invoiceListObj', false]], explanation: 'It says what the value is for, not its type.' },
            { prompt: 'Your function "loads orders and emails a summary". What does that suggest?', options: [['It is well named', false], ['It has two responsibilities and can be split', true], ['It should be made async', false]], explanation: 'The "and" reveals two reasons to change.' },
            { prompt: 'Where should network and database calls usually live?', options: [['Inside pure calculation helpers', false], ['At the edges, coordinated by a thin function', true], ['In global variables', false]], explanation: 'Keeping I/O at the edges leaves the core logic pure and easy to test.' },
          ],
        },
      },
      {
        title: 'Changing code safely',
        summary: 'Tests and version control as the safety net that lets you move quickly.',
        access: 'PREREQUISITE_QUIZ',
        gatedBy: 1,
        lessons: [
          {
            title: 'Tests that earn their keep',
            minutes: 13,
            content: [
              p('A useful test fails when behaviour breaks and passes when it does not. Tests that break whenever the implementation changes, even though behaviour is the same, slow you down without protecting you.'),
              code('ts', `test('countPositiveBalances ignores zero and negatives', () => {\n  expect(countPositiveBalances([10, 0, -5, 3])).toBe(2);\n});`),
              p('Test behaviour through public functions. Name each test after the rule it protects so that a failure tells you which rule was broken.'),
              note('Write the failing test first when fixing a bug. It proves the bug exists and that your fix addresses it.', 'tip'),
            ],
          },
          {
            title: 'Commits that tell a story',
            minutes: 10,
            content: [
              p('Version control is not just backup. A clean history explains why the code is the way it is, which is exactly what a future maintainer — often you — needs.'),
              list(['One logical change per commit.', 'Subject line in the imperative: "Validate invoice totals".', 'Body explains why, not what; the diff shows what.']),
              code('bash', `git switch -c feature/invoice-totals\ngit add src/invoices/totals.ts test/totals.test.ts\ngit commit -m "Validate invoice totals before saving"`),
            ],
          },
        ],
        quiz: {
          title: 'Final check: changing code safely',
          passingScore: 67,
          maxAttempts: null,
          questions: [
            { prompt: 'A good test should fail when…', options: [['Behaviour breaks', true], ['A private helper is renamed', false], ['Formatting changes', false]], explanation: 'Tests protect behaviour, not implementation details.' },
            { prompt: 'When fixing a bug, what do you write first?', options: [['The fix', false], ['A failing test that reproduces it', true], ['The release notes', false]], explanation: 'The failing test proves the bug and later proves the fix.' },
            { prompt: 'A commit message body should mainly explain…', options: [['What changed line by line', false], ['Why the change was made', true], ['Who reviewed it', false]], explanation: 'The diff already shows what changed.' },
          ],
        },
      },
    ],
  },
  {
    slug: 'production-ready-apis-with-nodejs',
    title: 'Production-Ready APIs with Node.js',
    shortDescription: 'Design, secure and operate HTTP APIs that survive real traffic and real users.',
    description:
      'Go beyond "it works on my machine". This course walks through resource design, validation, authentication, error handling, observability and deployment for Node.js APIs. The first module is free; the rest of the course is included with purchase. The final module unlocks after you pass the security checkpoint.',
    subject: 'software-engineering',
    category: 'backend-development',
    creator: 'ada.okafor@academy.local',
    difficulty: 'INTERMEDIATE',
    minutes: 360,
    price: 15000,
    status: 'PUBLISHED',
    cover: 'switchback',
    outcomes: ['Model resources and status codes consistently', 'Validate every input at the boundary', 'Implement session security that resists common attacks', 'Instrument an API with structured logs and health checks'],
    modules: [
      {
        title: 'Designing the contract',
        summary: 'Resources, verbs and status codes that clients can rely on.',
        access: 'FREE',
        lessons: [
          {
            title: 'Resources and representations',
            minutes: 12,
            content: [
              p('An API is a promise to its clients. Model the nouns your clients care about — orders, invoices, members — and let HTTP verbs express what happens to them.'),
              code('http', `GET    /orders          # list\nPOST   /orders          # create\nGET    /orders/{id}     # read one\nPATCH  /orders/{id}     # partial update\nPOST   /orders/{id}/cancel  # domain action`),
              note('Domain actions such as cancel or approve are often clearer as explicit sub-resources than as a PATCH of a status field. They also give you one place to enforce the rules of that transition.', 'tip'),
            ],
          },
          {
            title: 'Status codes clients can act on',
            minutes: 9,
            content: [
              p('Clients branch on status codes, so use them precisely. A consistent error body lets clients show useful messages without parsing prose.'),
              list(['400 — the request is malformed or fails validation', '401 — not authenticated', '403 — authenticated but not allowed', '404 — not found (also used to avoid revealing private resources)', '409 — conflicts with current state', '422/400 — business-rule violation, with a machine-readable code']),
              code('json', `{\n  "statusCode": 409,\n  "code": "ALREADY_OWNED",\n  "message": "You already own this course"\n}`),
            ],
          },
        ],
        quiz: {
          title: 'Check: API contracts',
          passingScore: 67,
          maxAttempts: null,
          questions: [
            { prompt: 'A signed-in user requests a resource they may not see. Which status hides its existence?', options: [['403', false], ['404', true], ['500', false]], explanation: '404 avoids confirming that a private resource exists.' },
            { prompt: 'Which is the clearest way to cancel an order?', options: [['POST /orders/{id}/cancel', true], ['GET /orders/{id}?cancel=true', false], ['DELETE /orders', false]], explanation: 'An explicit action keeps the transition rules in one place; GET must never change state.' },
            { prompt: 'Why include a machine-readable "code" in error bodies?', options: [['So clients can branch without parsing messages', true], ['It makes responses larger', false], ['HTTP requires it', false]], explanation: 'Messages change; codes are a stable contract.' },
          ],
        },
      },
      {
        title: 'Validation and data integrity',
        summary: 'Trust nothing that crosses the boundary.',
        access: 'PREMIUM',
        lessons: [
          {
            title: 'Validate at the edge, enforce in the core',
            minutes: 14,
            content: [
              p('Validate shape and types as soon as a request arrives, then enforce business rules where the data is changed. Both are necessary: a well-formed request can still try to do something it should not.'),
              code('ts', `class CreateOrderDto {\n  @IsUUID() productId: string;\n  @IsInt() @Min(1) @Max(50) quantity: number;\n}\n// Price comes from the database, never from the request.`),
              note('Never accept prices, scores, roles or statuses from a client. Look them up on the server.', 'warning', 'Mass assignment'),
            ],
          },
          {
            title: 'Transactions and idempotency',
            minutes: 15,
            content: [
              p('When one operation updates several records, wrap it in a transaction so it either fully happens or not at all. When an operation can be retried — payments, webhooks — make it idempotent so repeating it is harmless.'),
              list(['Use unique constraints as the last line of defence against duplicates.', 'Use conditional updates ("UPDATE … WHERE status = PENDING") to make state changes race-safe.', 'Record processed event ids so replays are recognised.']),
            ],
          },
        ],
        quiz: {
          title: 'Security checkpoint',
          passingScore: 75,
          maxAttempts: 3,
          questions: [
            { prompt: 'Where should the price of a purchase come from?', options: [['The request body', false], ['The server-side record of the product', true], ['A hidden form field', false]], explanation: 'Client-supplied prices can be tampered with.' },
            { prompt: 'Which technique makes a status change race-safe?', options: [['A conditional update on the current status', true], ['Reading the row twice', false], ['A longer timeout', false]], explanation: 'Only one concurrent caller can match the WHERE clause.' },
            { prompt: 'A payment webhook arrives twice. The handler should…', options: [['Grant access twice', false], ['Recognise the replay and do nothing the second time', true], ['Return 500 so it stops', false]], explanation: 'Idempotent handlers make retries safe.' },
            { prompt: 'Validation at the edge checks…', options: [['Shape and types', true], ['Only business rules', false], ['Nothing; the database will', false]], explanation: 'Edges check shape; the core enforces business rules.' },
          ],
        },
      },
      {
        title: 'Operating in production',
        summary: 'Logs, health checks and safe deployments.',
        access: 'PREMIUM_AND_PREREQUISITE_QUIZ',
        gatedBy: 1,
        lessons: [
          {
            title: 'Structured logs you can search',
            minutes: 11,
            content: [
              p('Logs are for machines first. Emit JSON with consistent fields — request id, user id, route, latency — so you can filter and aggregate when something goes wrong at 3am.'),
              code('json', `{"level":"info","msg":"payment settled","reference":"SA-LX2-9F3K","durationMs":182}`),
              note('Never log secrets, tokens or full card data. Log identifiers you can look up instead.', 'warning'),
            ],
          },
          {
            title: 'Health checks and graceful shutdown',
            minutes: 10,
            content: [
              p('A health endpoint that checks dependencies lets your platform route traffic away from a broken instance. Graceful shutdown lets in-flight requests finish before the process exits during a deploy.'),
              list(['Liveness: is the process running?', 'Readiness: can it serve traffic (database reachable)?', 'Shutdown: stop accepting, drain, then exit.']),
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'cloud-infrastructure-essentials',
    title: 'Cloud Infrastructure Essentials',
    shortDescription: 'Networks, compute and storage on the major clouds, without the vendor jargon.',
    description:
      'Learn the building blocks that every cloud shares — virtual networks, compute, managed databases, object storage and identity — and how to combine them into an architecture you can explain and defend. Includes cost awareness from day one.',
    subject: 'cloud-computing-and-devops',
    category: 'cloud-foundations',
    creator: 'ada.okafor@academy.local',
    difficulty: 'BEGINNER',
    minutes: 240,
    price: 20000,
    status: 'PUBLISHED',
    cover: 'terrace',
    outcomes: ['Explain regions, zones and virtual networks', 'Choose between VMs, containers and serverless', 'Apply least-privilege identity policies', 'Estimate the monthly cost of a simple architecture'],
    modules: [
      {
        title: 'The shape of a cloud',
        summary: 'Regions, availability zones and the shared-responsibility model.',
        access: 'FREE',
        lessons: [
          {
            title: 'Regions, zones and why they matter',
            minutes: 10,
            content: [
              p('A region is a geographic area; an availability zone is an isolated data centre within it. Spreading a service across zones protects it from a single facility failing. Choosing a region close to your users reduces latency and may be required by data-residency rules.'),
              note('For a Lagos-based audience, compare latency from the nearest African and European regions before deciding — the difference can be significant.', 'tip'),
            ],
          },
          {
            title: 'Who is responsible for what',
            minutes: 8,
            content: [
              p('The provider secures the physical infrastructure. You secure what you put on it: identities, network rules, operating-system patches on VMs, and your data. Managed services shift more of that line to the provider.'),
              list(['Infrastructure as a service: you patch the OS.', 'Platform as a service: the provider patches; you configure.', 'Software as a service: you manage users and data.']),
            ],
          },
        ],
        quiz: {
          title: 'Check: cloud basics',
          passingScore: 67,
          maxAttempts: null,
          questions: [
            { prompt: 'Spreading instances across availability zones protects against…', options: [['A single data centre failing', true], ['Bugs in your code', false], ['Leaked passwords', false]], explanation: 'Zones are physically isolated facilities.' },
            { prompt: 'On a plain virtual machine, who patches the operating system?', options: [['The cloud provider', false], ['You', true], ['Nobody', false]], explanation: 'With IaaS, OS maintenance is your responsibility.' },
            { prompt: 'Which factor commonly drives region choice?', options: [['Latency and data-residency rules', true], ['The provider logo', false], ['Alphabetical order', false]], explanation: 'Users and regulations determine where data should live.' },
          ],
        },
      },
      {
        title: 'Compute and storage choices',
        summary: 'Matching workloads to VMs, containers, functions and storage tiers.',
        access: 'PREMIUM',
        lessons: [
          {
            title: 'VMs, containers or functions?',
            minutes: 14,
            content: [
              p('Start from the workload. Long-running services with steady traffic suit containers or VMs. Spiky, event-driven work suits functions. Each step towards serverless trades control for less operational work.'),
              list(['VMs: full control, most maintenance.', 'Containers: portable, need an orchestrator or managed service.', 'Functions: zero idle cost, cold starts and execution limits.']),
            ],
          },
          {
            title: 'Object storage and lifecycle rules',
            minutes: 9,
            content: [
              p('Object storage holds files cheaply and durably. Lifecycle rules move rarely-read objects to colder, cheaper tiers automatically and delete what you no longer need.'),
              note('Keep buckets private by default and serve files through signed URLs or a CDN with access control.', 'warning'),
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'practical-network-defence',
    title: 'Practical Network Defence',
    shortDescription: 'Spot, contain and prevent the attacks that actually hit small organisations.',
    description:
      'A hands-on introduction to defending networks: understanding traffic, hardening services, reading logs for signs of compromise and responding calmly when something goes wrong. Grounded in incidents that small teams really face.',
    subject: 'cybersecurity',
    category: 'network-security',
    creator: 'tunde.bello@academy.local',
    difficulty: 'INTERMEDIATE',
    minutes: 260,
    price: 12500,
    status: 'PUBLISHED',
    cover: 'ridge',
    outcomes: ['Read packet captures for common protocols', 'Harden SSH and web services', 'Detect brute-force and scanning in logs', 'Run a basic incident response'],
    modules: [
      {
        title: 'Seeing your network',
        summary: 'What normal traffic looks like, so the abnormal stands out.',
        access: 'FREE',
        lessons: [
          {
            title: 'Baselines before alarms',
            minutes: 11,
            content: [
              p('You cannot spot unusual traffic without knowing what usual looks like. Spend a week recording which hosts talk to which, on what ports, at what times. That baseline turns vague worry into specific questions.'),
              code('bash', `# Top talkers from a capture\ntshark -r capture.pcap -q -z conv,ip | head -20`),
            ],
          },
        ],
        quiz: {
          title: 'Check: baselines',
          passingScore: 67,
          maxAttempts: null,
          questions: [
            { prompt: 'Why build a traffic baseline?', options: [['To recognise abnormal behaviour', true], ['To speed up the network', false], ['It is required by law everywhere', false]], explanation: 'Anomalies only stand out against known normal behaviour.' },
            { prompt: 'Which tool reads packet captures from the command line?', options: [['tshark', true], ['grep only', false], ['ssh-keygen', false]], explanation: 'tshark is the terminal version of Wireshark.' },
            { prompt: 'A baseline should record…', options: [['Who talks to whom, on which ports, and when', true], ['Only failed logins', false], ['Only bandwidth', false]], explanation: 'Connections, ports and timing together describe normal behaviour.' },
          ],
        },
      },
      {
        title: 'Hardening exposed services',
        summary: 'SSH, web servers and the settings attackers check first.',
        access: 'PREMIUM',
        lessons: [
          {
            title: 'Locking down SSH',
            minutes: 12,
            content: [
              p('Most internet-facing servers see SSH brute-force attempts within minutes of going online. Key-only authentication and disabling root login remove the easiest wins.'),
              code('conf', `PasswordAuthentication no\nPermitRootLogin no\nAllowUsers deploy`),
              note('Keep a second session open while changing SSH settings so a mistake does not lock you out.', 'warning'),
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'machine-learning-explained-plainly',
    title: 'Machine Learning, Explained Plainly',
    shortDescription: 'What models learn, how they fail, and how to judge whether one is any good.',
    description:
      'A clear, maths-light introduction to machine learning for engineers and decision makers. Understand training and evaluation, why models overfit, and the questions to ask before trusting a prediction.',
    subject: 'artificial-intelligence',
    category: 'machine-learning',
    creator: 'tunde.bello@academy.local',
    difficulty: 'BEGINNER',
    minutes: 150,
    price: null,
    status: 'PUBLISHED',
    cover: 'delta',
    outcomes: ['Explain training, validation and test data', 'Recognise overfitting', 'Choose a sensible evaluation metric'],
    modules: [
      {
        title: 'What a model learns',
        summary: 'Patterns from examples — and the limits of that idea.',
        access: 'FREE',
        lessons: [
          {
            title: 'Learning from examples',
            minutes: 10,
            content: [
              p('A model is a function whose parameters are adjusted until its outputs match known examples. It does not understand the world; it captures regularities in the data it was shown — including the accidental ones.'),
              note('If the training data under-represents a group, the model will usually perform worse for that group. Data choices are design choices.', 'warning'),
            ],
          },
          {
            title: 'Holding data back',
            minutes: 9,
            content: [
              p('To know how a model performs on new data, you must test it on data it never saw during training. Split your data into training, validation (for tuning) and test (for the final, honest score).'),
              list(['Training: the model learns from it.', 'Validation: you choose settings with it.', 'Test: touched once, at the end.']),
            ],
          },
        ],
        quiz: {
          title: 'Check: models and data',
          passingScore: 67,
          maxAttempts: null,
          questions: [
            { prompt: 'Why keep a test set aside?', options: [['To measure performance on unseen data honestly', true], ['To train faster', false], ['To reduce storage', false]], explanation: 'Scores on training data are optimistic.' },
            { prompt: 'A model scores 99% on training data and 60% on new data. This suggests…', options: [['Overfitting', true], ['Perfect generalisation', false], ['A bug in the test set only', false]], explanation: 'It memorised the training data instead of learning general patterns.' },
            { prompt: 'Under-represented groups in training data usually lead to…', options: [['Worse performance for those groups', true], ['Better performance for them', false], ['No effect', false]], explanation: 'The model sees too few examples to learn their patterns.' },
          ],
        },
      },
    ],
  },
  {
    slug: 'consulting-communication-for-engineers',
    title: 'Consulting Communication for Engineers',
    shortDescription: 'Explain technical trade-offs to clients and executives so they can decide.',
    description:
      'Engineers are often right and still not heard. This short course gives you structures for written updates, decision memos and difficult conversations, so your expertise turns into decisions.',
    subject: 'business-and-professional-skills',
    category: 'communication',
    creator: 'grace.mensah@academy.local',
    difficulty: 'BEGINNER',
    minutes: 90,
    price: null,
    status: 'PUBLISHED',
    cover: 'meander',
    outcomes: ['Lead with the decision you need', 'Present options with honest trade-offs', 'Write status updates people read'],
    modules: [
      {
        title: 'Lead with the decision',
        summary: 'Structure messages around what the reader must do.',
        access: 'FREE',
        lessons: [
          {
            title: 'The answer-first memo',
            minutes: 8,
            content: [
              p('Busy readers decide in the first two sentences whether to keep reading. Put the decision you need, and your recommendation, first. Supporting detail follows for those who want it.'),
              list(['Decision needed and by when', 'Your recommendation in one sentence', 'Two or three options with costs and risks', 'Detail and evidence'], 'number'),
            ],
          },
        ],
        quiz: {
          title: 'Check: answer first',
          passingScore: 67,
          maxAttempts: null,
          questions: [
            { prompt: 'What belongs in the first sentence of a decision memo?', options: [['The decision needed and your recommendation', true], ['Background history', false], ['A greeting', false]], explanation: 'Readers decide quickly whether to engage.' },
            { prompt: 'When presenting options you should…', options: [['Show honest costs and risks for each', true], ['Only show your preferred option', false], ['Hide the risks', false]], explanation: 'Trust comes from fair trade-offs.' },
            { prompt: 'Supporting detail should come…', options: [['After the recommendation', true], ['Before anything else', false], ['Never', false]], explanation: 'Detail serves readers who want to verify.' },
          ],
        },
      },
    ],
  },
  {
    slug: 'kubernetes-operations',
    title: 'Kubernetes Operations',
    shortDescription: 'Run workloads on Kubernetes without being run by it.',
    description: 'Draft course: deployments, services, configuration, scaling and troubleshooting a real cluster. Work in progress.',
    subject: 'cloud-computing-and-devops',
    category: 'devops-practices',
    creator: 'ada.okafor@academy.local',
    difficulty: 'ADVANCED',
    minutes: 300,
    price: null,
    status: 'DRAFT',
    cover: 'contour',
    outcomes: ['Deploy and roll back workloads', 'Debug failing pods'],
    modules: [
      { title: 'Pods, deployments and services', summary: 'The core objects.', access: 'FREE', lessons: [{ title: 'Why deployments, not pods', minutes: 10, content: [p('Pods are disposable. Deployments describe the desired state and let Kubernetes keep replacing pods to match it.')] }] },
    ],
  },
  {
    slug: 'threat-modelling-workshop',
    title: 'Threat Modelling Workshop',
    shortDescription: 'Find design flaws before attackers do, with a repeatable team exercise.',
    description:
      'A practical workshop format for threat modelling a system with your team: drawing data flows, applying STRIDE, and turning findings into tickets that actually get fixed. Submitted for review.',
    subject: 'cybersecurity',
    category: 'application-security',
    creator: 'tunde.bello@academy.local',
    difficulty: 'INTERMEDIATE',
    minutes: 120,
    price: null,
    status: 'SUBMITTED',
    cover: 'ridge',
    outcomes: ['Draw a data-flow diagram with trust boundaries', 'Apply STRIDE to each element', 'Prioritise findings by risk'],
    modules: [
      {
        title: 'Drawing the system',
        summary: 'Data flows and trust boundaries.',
        access: 'FREE',
        lessons: [
          { title: 'Data-flow diagrams in twenty minutes', minutes: 12, content: [p('Draw processes, data stores, external entities and the flows between them. Mark every place data crosses from less trusted to more trusted — those boundaries are where threats concentrate.')] },
        ],
      },
      {
        title: 'Applying STRIDE',
        summary: 'Six questions for every element.',
        access: 'PREMIUM',
        lessons: [
          { title: 'Spoofing to elevation of privilege', minutes: 14, content: [p('For each element ask: can it be spoofed, tampered with, repudiated, leak information, be denied service, or let someone elevate privilege? Record answers as concrete scenarios, not categories.')] },
        ],
      },
    ],
  },
];

export const SUBJECTS = [
  { slug: 'software-engineering', name: 'Software Engineering', accent: 'forest', description: 'Designing, building and maintaining software that lasts.', categories: ['Fundamentals', 'Backend Development', 'Frontend Development'] },
  { slug: 'cloud-computing-and-devops', name: 'Cloud Computing and DevOps', accent: 'slate', description: 'Running software reliably on modern infrastructure.', categories: ['Cloud Foundations', 'DevOps Practices'] },
  { slug: 'cybersecurity', name: 'Cybersecurity', accent: 'terracotta', description: 'Protecting systems, networks and people.', categories: ['Network Security', 'Application Security'] },
  { slug: 'artificial-intelligence', name: 'Artificial Intelligence', accent: 'amber', description: 'How learning systems work and where they fail.', categories: ['Machine Learning', 'Applied AI'] },
  { slug: 'business-and-professional-skills', name: 'Business and Professional Skills', accent: 'clay', description: 'Communication, leadership and the craft of working with people.', categories: ['Communication', 'Leadership'] },
];
