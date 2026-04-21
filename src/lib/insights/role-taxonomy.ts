export const TAXONOMY_VERSION = "2026-04";

export type CategoryStatus = "active" | "deprecated";
export type TopicDifficulty = "beginner" | "intermediate" | "advanced";

export interface HotTopic {
  id: string;
  title: string;
  description: string;
  difficulty: TopicDifficulty;
  skillKeywords: string[];
  tags?: string[];
  alwaysRelevant?: boolean;
}

export interface RoleCategory {
  id: string;
  displayName: string;
  description: string;
  signalKeywords: string[];
  hotTopics: HotTopic[];
  status: CategoryStatus;
  supersededBy: string[];
}

export const ROLE_CATEGORIES: readonly RoleCategory[] = [
  {
    id: "ai-engineering",
    displayName: "AI Engineering",
    description:
      "Building product systems on top of LLMs: RAG, agents, tool use, evaluation.",
    signalKeywords: [
      "llm", "rag", "agents", "langchain", "llamaindex", "vector db",
      "embeddings", "openai api", "anthropic api", "tool use",
      "langgraph", "autogen", "pinecone", "weaviate", "pgvector",
    ],
    hotTopics: [
      {
        id: "ai-rag-advanced",
        title: "RAG Beyond Naive Retrieval",
        description: "Hybrid search, re-ranking, query rewriting, multi-hop.",
        difficulty: "intermediate",
        skillKeywords: ["rag", "retrieval", "embeddings", "vector db", "re-ranking"],
        tags: ["retrieval", "llm"],
        alwaysRelevant: true,
      },
      {
        id: "ai-agent-orchestration",
        title: "Agent Orchestration",
        description: "LangGraph, AutoGen, state machines, robust tool use.",
        difficulty: "advanced",
        skillKeywords: ["agents", "langgraph", "autogen", "tool use"],
      },
      {
        id: "ai-evals-observability",
        title: "LLM Evaluation & Observability",
        description: "Offline evals, A/B tests, LangSmith / Braintrust / Helicone.",
        difficulty: "intermediate",
        skillKeywords: ["evals", "langsmith", "braintrust", "observability", "llm ops"],
        alwaysRelevant: true,
      },
      {
        id: "ai-structured-outputs",
        title: "Structured Outputs & Tool Calling",
        description: "JSON mode, function calling, constrained generation, type-safe clients.",
        difficulty: "intermediate",
        skillKeywords: ["structured outputs", "function calling", "json mode", "tool use"],
      },
      {
        id: "ai-vector-db-internals",
        title: "Vector DB Internals",
        description: "HNSW, IVF, quantization, hybrid search architectures.",
        difficulty: "advanced",
        skillKeywords: ["vector db", "hnsw", "embeddings", "ann", "quantization"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "ml-engineering",
    displayName: "ML Engineering",
    description:
      "Training, fine-tuning, and serving models. MLOps pipelines.",
    signalKeywords: [
      "pytorch", "tensorflow", "ray", "kubeflow", "sagemaker", "vertex ai",
      "mlflow", "weights & biases", "fine-tuning", "training", "mlops",
      "model serving", "triton", "nvidia", "cuda",
    ],
    hotTopics: [
      {
        id: "ml-finetuning-modern",
        title: "Modern Fine-Tuning",
        description: "LoRA, QLoRA, PEFT, RLHF/DPO, eval-driven training loops.",
        difficulty: "advanced",
        skillKeywords: ["fine-tuning", "lora", "peft", "rlhf", "dpo"],
        alwaysRelevant: true,
      },
      {
        id: "ml-model-serving",
        title: "High-Performance Model Serving",
        description: "vLLM, Triton, batching, quantization, GPU economics.",
        difficulty: "advanced",
        skillKeywords: ["serving", "vllm", "triton", "quantization", "gpu"],
      },
      {
        id: "ml-pipelines",
        title: "ML Pipelines & Orchestration",
        description: "Kubeflow, Airflow, feature stores, reproducible training.",
        difficulty: "intermediate",
        skillKeywords: ["kubeflow", "airflow", "feature store", "mlflow"],
      },
      {
        id: "ml-monitoring",
        title: "Model Monitoring & Drift",
        description: "Data/concept drift, shadow deployments, online evals.",
        difficulty: "intermediate",
        skillKeywords: ["drift", "monitoring", "evals", "shadow deployment"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "applied-research",
    displayName: "Applied Research",
    description:
      "Novel model R&D and research-to-production, often PhD-adjacent.",
    signalKeywords: [
      "research", "phd", "novel", "publication", "paper", "neurips",
      "icml", "iclr", "benchmark", "state of the art", "sota",
    ],
    hotTopics: [
      {
        id: "res-reasoning-models",
        title: "Reasoning & Long-Horizon Models",
        description: "o-series, reasoning distillation, test-time compute.",
        difficulty: "advanced",
        skillKeywords: ["reasoning", "test-time compute", "distillation"],
        alwaysRelevant: true,
      },
      {
        id: "res-multimodal",
        title: "Multimodal Architectures",
        description: "VLMs, audio/video, joint embedding spaces.",
        difficulty: "advanced",
        skillKeywords: ["multimodal", "vlm", "clip", "audio"],
      },
      {
        id: "res-evals-benchmarks",
        title: "Eval Design & Benchmarking",
        description: "Designing evals that actually measure capability, not memorization.",
        difficulty: "advanced",
        skillKeywords: ["evals", "benchmark", "leakage", "contamination"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "data-engineering",
    displayName: "Data Engineering",
    description: "Pipelines, warehousing, streaming, batch.",
    signalKeywords: [
      "airflow", "kafka", "spark", "snowflake", "databricks", "dbt",
      "redshift", "bigquery", "etl", "elt", "pipeline", "streaming",
      "flink", "kinesis", "delta lake", "iceberg",
    ],
    hotTopics: [
      {
        id: "de-lakehouse",
        title: "Lakehouse Architectures",
        description: "Iceberg, Delta, Hudi — open table formats eating the warehouse.",
        difficulty: "intermediate",
        skillKeywords: ["iceberg", "delta lake", "hudi", "lakehouse"],
        alwaysRelevant: true,
      },
      {
        id: "de-streaming",
        title: "Streaming-First Pipelines",
        description: "Flink, Kafka Streams, exactly-once semantics in 2026.",
        difficulty: "advanced",
        skillKeywords: ["flink", "kafka streams", "streaming", "exactly once"],
      },
      {
        id: "de-data-contracts",
        title: "Data Contracts & Quality",
        description: "Producer-side schemas, Great Expectations / Soda, data SLOs.",
        difficulty: "intermediate",
        skillKeywords: ["data contracts", "great expectations", "data quality"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "analytics-engineering",
    displayName: "Analytics Engineering",
    description: "dbt-centric modeling bridging DE and BI.",
    signalKeywords: [
      "dbt", "sql", "looker", "tableau", "mode", "semantic layer",
      "metric store", "sqlmesh", "cube", "lightdash",
    ],
    hotTopics: [
      {
        id: "ae-semantic-layer",
        title: "Semantic Layer Wars",
        description: "dbt Semantic Layer, Cube, MetricFlow — single-metric-definition battles.",
        difficulty: "intermediate",
        skillKeywords: ["semantic layer", "metricflow", "cube", "dbt"],
        alwaysRelevant: true,
      },
      {
        id: "ae-sqlmesh-vs-dbt",
        title: "SQLMesh vs dbt",
        description: "Virtual environments, column-level lineage, unit tests for SQL.",
        difficulty: "intermediate",
        skillKeywords: ["sqlmesh", "dbt", "lineage"],
      },
      {
        id: "ae-self-serve-analytics",
        title: "Self-Serve Analytics Done Right",
        description: "Headless BI, embedded dashboards, query-time governance.",
        difficulty: "intermediate",
        skillKeywords: ["headless bi", "embedded", "self serve"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "platform-engineering",
    displayName: "Platform Engineering",
    description: "Internal developer platforms (IDPs), golden paths, self-service.",
    signalKeywords: [
      "kubernetes", "k8s", "backstage", "terraform", "pulumi", "crossplane",
      "helm", "argo", "gitops", "idp", "internal developer platform",
      "service mesh", "linkerd", "istio",
    ],
    hotTopics: [
      {
        id: "pe-idp-with-backstage",
        title: "IDPs with Backstage",
        description: "Golden paths, scaffolder templates, software catalog at scale.",
        difficulty: "intermediate",
        skillKeywords: ["backstage", "idp", "scaffolder", "software catalog"],
        alwaysRelevant: true,
      },
      {
        id: "pe-crossplane-vs-terraform",
        title: "Crossplane, Pulumi, Terraform",
        description: "IaC is fragmenting — when to pick which, and how to compose them.",
        difficulty: "intermediate",
        skillKeywords: ["crossplane", "terraform", "pulumi", "iac"],
      },
      {
        id: "pe-gitops",
        title: "GitOps in Production",
        description: "Argo CD / Flux, progressive delivery, drift detection.",
        difficulty: "intermediate",
        skillKeywords: ["gitops", "argo cd", "flux", "progressive delivery"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "sre",
    displayName: "Site Reliability Engineering",
    description: "Production reliability, observability, incident response.",
    signalKeywords: [
      "sre", "reliability", "slo", "sli", "error budget", "prometheus",
      "grafana", "opentelemetry", "pagerduty", "incident", "postmortem",
      "chaos engineering",
    ],
    hotTopics: [
      {
        id: "sre-otel",
        title: "OpenTelemetry End-to-End",
        description: "Unified traces/metrics/logs, sampling strategies, vendor neutrality.",
        difficulty: "intermediate",
        skillKeywords: ["opentelemetry", "otel", "tracing", "observability"],
        alwaysRelevant: true,
      },
      {
        id: "sre-slo-math",
        title: "SLO Math That Actually Works",
        description: "Burn rates, error budgets, alert tuning that doesn't page at 3 AM.",
        difficulty: "intermediate",
        skillKeywords: ["slo", "error budget", "burn rate"],
      },
      {
        id: "sre-chaos",
        title: "Chaos & Resilience Testing",
        description: "GameDays, fault injection, load shedding, circuit breakers.",
        difficulty: "advanced",
        skillKeywords: ["chaos", "resilience", "load shedding", "circuit breaker"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "devops-infra",
    displayName: "DevOps / Cloud Infrastructure",
    description: "Cloud infra + CI/CD, less IDP-flavored than Platform Eng.",
    signalKeywords: [
      "aws", "gcp", "azure", "ci/cd", "jenkins", "github actions",
      "gitlab ci", "docker", "kubernetes", "ansible", "chef", "puppet",
    ],
    hotTopics: [
      {
        id: "do-actions-security",
        title: "CI/CD Supply Chain Security",
        description: "SLSA, signed provenance, least-privilege OIDC tokens, action pinning.",
        difficulty: "intermediate",
        skillKeywords: ["slsa", "supply chain", "oidc", "provenance"],
        alwaysRelevant: true,
      },
      {
        id: "do-finops",
        title: "Cloud Cost / FinOps",
        description: "Kubecost, commitment management, right-sizing automation.",
        difficulty: "intermediate",
        skillKeywords: ["finops", "kubecost", "cost", "right-sizing"],
      },
      {
        id: "do-edge-compute",
        title: "Edge Compute Stacks",
        description: "Cloudflare Workers, Fly.io, Deno Deploy — global deploy without K8s.",
        difficulty: "intermediate",
        skillKeywords: ["edge", "cloudflare workers", "fly.io", "deno deploy"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "backend-product",
    displayName: "Backend Product Engineering",
    description: "Feature APIs, product-facing services.",
    signalKeywords: [
      "api", "rest", "graphql", "grpc", "python", "go", "java", "node",
      "typescript", "postgres", "mysql", "redis", "microservices",
      "event driven", "domain driven",
    ],
    hotTopics: [
      {
        id: "bp-postgres-superpowers",
        title: "Postgres as the Universal Backend",
        description: "Partitioning, logical replication, pg_stat_statements, pgvector, event sourcing.",
        difficulty: "intermediate",
        skillKeywords: ["postgres", "partitioning", "logical replication", "pgvector"],
        alwaysRelevant: true,
      },
      {
        id: "bp-grpc-over-rest",
        title: "gRPC / Connect over REST",
        description: "Streaming, codegen, type-safe clients; when REST still wins.",
        difficulty: "intermediate",
        skillKeywords: ["grpc", "connect", "protobuf", "streaming"],
      },
      {
        id: "bp-eventual-consistency",
        title: "Event-Driven Architectures That Don't Rot",
        description: "Outbox pattern, idempotency keys, schema evolution, consumer replay.",
        difficulty: "advanced",
        skillKeywords: ["event driven", "outbox", "idempotency", "kafka"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "frontend-product",
    displayName: "Frontend Product Engineering",
    description: "UI features, design systems, product UX engineering.",
    signalKeywords: [
      "react", "next.js", "vue", "svelte", "typescript", "tailwind",
      "css", "design system", "component library", "ui", "web components",
    ],
    hotTopics: [
      {
        id: "fe-rsc-and-suspense",
        title: "React Server Components in Production",
        description: "Next.js App Router, streaming, cache semantics, migrating from pages dir.",
        difficulty: "intermediate",
        skillKeywords: ["rsc", "server components", "next.js", "app router"],
        alwaysRelevant: true,
      },
      {
        id: "fe-design-systems",
        title: "Design Systems with shadcn / Tailwind",
        description: "Token-driven theming, accessibility baked in, headless component patterns.",
        difficulty: "intermediate",
        skillKeywords: ["shadcn", "tailwind", "design system", "a11y"],
      },
      {
        id: "fe-typescript-strict",
        title: "TypeScript Strictness in Large Codebases",
        description: "Exhaustive checks, discriminated unions, type-only imports, module boundaries.",
        difficulty: "intermediate",
        skillKeywords: ["typescript", "strict", "discriminated unions"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "fullstack-product",
    displayName: "Full-Stack Product Engineering",
    description: "TypeScript end-to-end, shipping features across the stack.",
    signalKeywords: [
      "fullstack", "full-stack", "typescript", "next.js", "remix",
      "trpc", "prisma", "drizzle", "postgres", "react",
    ],
    hotTopics: [
      {
        id: "fs-type-safe-end-to-end",
        title: "Type-Safe End-to-End Stacks",
        description: "tRPC, server actions, Drizzle/Prisma — types from DB to UI.",
        difficulty: "intermediate",
        skillKeywords: ["trpc", "server actions", "drizzle", "prisma"],
        alwaysRelevant: true,
      },
      {
        id: "fs-auth-patterns",
        title: "Modern Auth Patterns",
        description: "Auth.js, Clerk, WorkOS, session vs JWT tradeoffs, passkeys.",
        difficulty: "intermediate",
        skillKeywords: ["auth.js", "clerk", "passkeys", "session"],
      },
      {
        id: "fs-nextjs-perf",
        title: "Next.js Perf at Scale",
        description: "Route segment config, partial prerendering, edge vs node runtimes.",
        difficulty: "advanced",
        skillKeywords: ["next.js", "performance", "ppr", "edge runtime"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "mobile",
    displayName: "Mobile Engineering",
    description: "iOS, Android, React Native, Flutter.",
    signalKeywords: [
      "ios", "android", "swift", "kotlin", "react native", "flutter",
      "swiftui", "jetpack compose", "mobile",
    ],
    hotTopics: [
      {
        id: "mob-swiftui-compose",
        title: "Declarative UI Maturity",
        description: "SwiftUI and Jetpack Compose at production scale.",
        difficulty: "intermediate",
        skillKeywords: ["swiftui", "jetpack compose", "declarative"],
        alwaysRelevant: true,
      },
      {
        id: "mob-kmp",
        title: "Kotlin Multiplatform",
        description: "KMP for shared business logic, when RN / Flutter still win.",
        difficulty: "advanced",
        skillKeywords: ["kmp", "kotlin multiplatform", "shared logic"],
      },
      {
        id: "mob-on-device-ml",
        title: "On-Device ML",
        description: "Core ML, TFLite, distilled models, privacy-preserving inference.",
        difficulty: "advanced",
        skillKeywords: ["core ml", "tflite", "on device", "mobile ml"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "systems-low-level",
    displayName: "Systems / Low-Level",
    description: "OS, compilers, databases, networking. Rust, C++, Zig.",
    signalKeywords: [
      "rust", "c++", "zig", "go", "systems", "kernel", "linux",
      "ebpf", "networking", "compiler", "database internals",
      "concurrent", "lock-free",
    ],
    hotTopics: [
      {
        id: "sys-rust-production",
        title: "Rust in Production",
        description: "Async ecosystems, unsafe boundaries, FFI, when to reach for it.",
        difficulty: "advanced",
        skillKeywords: ["rust", "tokio", "async", "unsafe"],
        alwaysRelevant: true,
      },
      {
        id: "sys-ebpf",
        title: "eBPF for Observability & Security",
        description: "Cilium, Pixie, Tetragon — kernel-level instrumentation without modules.",
        difficulty: "advanced",
        skillKeywords: ["ebpf", "cilium", "pixie", "tetragon"],
      },
      {
        id: "sys-db-internals",
        title: "Modern Database Internals",
        description: "LSM vs B+ trees, MVCC, vector indexes, column stores.",
        difficulty: "advanced",
        skillKeywords: ["lsm", "mvcc", "database internals", "column store"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "security-engineering",
    displayName: "Security Engineering",
    description: "AppSec, cloud security, DevSecOps, detection engineering.",
    signalKeywords: [
      "security", "appsec", "cloud security", "devsecoops", "detection",
      "siem", "sast", "dast", "threat model", "zero trust", "iam",
    ],
    hotTopics: [
      {
        id: "sec-zero-trust",
        title: "Zero Trust Architectures",
        description: "BeyondCorp patterns, SSO federation, workload identity.",
        difficulty: "intermediate",
        skillKeywords: ["zero trust", "beyondcorp", "sso", "workload identity"],
        alwaysRelevant: true,
      },
      {
        id: "sec-supply-chain",
        title: "Supply Chain Security",
        description: "SBOMs, SLSA, sigstore, signed provenance across CI/CD.",
        difficulty: "intermediate",
        skillKeywords: ["sbom", "slsa", "sigstore", "supply chain"],
      },
      {
        id: "sec-detection-engineering",
        title: "Detection Engineering",
        description: "Sigma rules, Panther/Chronicle, purple teaming.",
        difficulty: "advanced",
        skillKeywords: ["detection engineering", "sigma", "siem", "purple team"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "embedded-firmware",
    displayName: "Embedded / Firmware",
    description: "Microcontrollers, IoT, robotics middleware.",
    signalKeywords: [
      "embedded", "firmware", "microcontroller", "mcu", "rtos", "arm",
      "stm32", "esp32", "iot", "robotics", "ros", "zephyr",
    ],
    hotTopics: [
      {
        id: "emb-rust-embedded",
        title: "Embedded Rust",
        description: "no_std, RTIC, Embassy — async on MCUs.",
        difficulty: "advanced",
        skillKeywords: ["embedded rust", "rtic", "embassy", "no_std"],
        alwaysRelevant: true,
      },
      {
        id: "emb-zephyr",
        title: "Zephyr RTOS",
        description: "Device tree, modular drivers, bluetooth stacks.",
        difficulty: "advanced",
        skillKeywords: ["zephyr", "rtos", "device tree", "bluetooth"],
      },
      {
        id: "emb-ros2",
        title: "ROS 2 for Robotics",
        description: "DDS, real-time constraints, multi-robot systems.",
        difficulty: "advanced",
        skillKeywords: ["ros2", "ros", "robotics", "dds"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "devrel-dx",
    displayName: "DevRel / DX Engineering",
    description: "Developer experience, advocacy, SDK authoring.",
    signalKeywords: [
      "developer relations", "devrel", "developer experience", "dx",
      "sdk", "advocacy", "technical content", "docs",
    ],
    hotTopics: [
      {
        id: "dx-sdk-design",
        title: "SDK Design That Developers Love",
        description: "Ergonomic APIs, typed-ness, errors, streaming responses.",
        difficulty: "intermediate",
        skillKeywords: ["sdk", "api design", "ergonomics"],
        alwaysRelevant: true,
      },
      {
        id: "dx-docs-as-product",
        title: "Docs as Product",
        description: "Diátaxis, runnable examples, LLM-readable docs, changelog discipline.",
        difficulty: "intermediate",
        skillKeywords: ["docs", "diataxis", "examples"],
      },
      {
        id: "dx-developer-metrics",
        title: "Measuring Developer Experience",
        description: "DORA, SPACE, activation funnels, time-to-first-success.",
        difficulty: "intermediate",
        skillKeywords: ["dora", "space", "developer metrics"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "engineering-leadership",
    displayName: "Engineering Management / Tech Lead",
    description: "People leadership, tech leadership, staff+ ICs.",
    signalKeywords: [
      "engineering manager", "tech lead", "staff engineer", "principal",
      "leadership", "management", "team", "mentoring",
    ],
    hotTopics: [
      {
        id: "lead-staff-eng-archetypes",
        title: "Staff Engineer Archetypes",
        description: "Tech Lead, Architect, Solver, Right Hand — which one you're hiring for.",
        difficulty: "intermediate",
        skillKeywords: ["staff engineer", "archetype", "leadership"],
        alwaysRelevant: true,
      },
      {
        id: "lead-eng-productivity",
        title: "Engineering Productivity in the AI Era",
        description: "DORA 2026, AI-assisted development metrics, team-health signals.",
        difficulty: "intermediate",
        skillKeywords: ["productivity", "dora", "ai assisted"],
      },
      {
        id: "lead-org-design",
        title: "Org Design & Team Topologies",
        description: "Stream-aligned, platform, enabling teams; cognitive load; conway's law.",
        difficulty: "advanced",
        skillKeywords: ["team topologies", "org design", "conway"],
      },
    ],
    status: "active",
    supersededBy: [],
  },
  {
    id: "other",
    displayName: "Specialized / Other",
    description:
      "Fallback for roles the classifier can't confidently place. Displayed with per-user sub-clustering.",
    signalKeywords: [],
    hotTopics: [],
    status: "active",
    supersededBy: [],
  },
];

export function getCategoryById(id: string): RoleCategory | undefined {
  return ROLE_CATEGORIES.find((c) => c.id === id);
}

export function getActiveCategories(): RoleCategory[] {
  return ROLE_CATEGORIES.filter((c) => c.status === "active");
}
