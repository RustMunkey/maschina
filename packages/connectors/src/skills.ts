import type { PlanTier } from "@maschina/plans";

// ─── Skill catalog ────────────────────────────────────────────────────────────

export interface SkillDef {
  name: string;
  slug: string;
  description: string;
  /** Minimum plan tier required to enable this skill */
  minTier: PlanTier;
  /** Configurable fields users can set per-agent */
  configSchema: Record<string, SkillConfigField>;
}

export interface SkillConfigField {
  type: "string" | "number" | "boolean";
  description: string;
  default?: unknown;
  required?: boolean;
}

export const SKILL_CATALOG: Record<string, SkillDef> = {
  http_fetch: {
    slug: "http_fetch",
    name: "HTTP Fetch",
    description:
      "Fetch any public URL and return the response body. Useful for reading APIs, web pages, or data feeds.",
    minTier: "access",
    configSchema: {
      allowed_domains: {
        type: "string",
        description: "Comma-separated domain allowlist. Leave empty to allow all.",
        default: "",
      },
    },
  },

  web_search: {
    slug: "web_search",
    name: "Web Search",
    description:
      "Search the web using Brave Search and return the top results. Use for real-time information retrieval.",
    minTier: "m1",
    configSchema: {
      max_results: {
        type: "number",
        description: "Maximum number of search results to return (1–10).",
        default: 5,
      },
    },
  },

  code_exec: {
    slug: "code_exec",
    name: "Code Execution",
    description:
      "Execute Python code snippets in a sandboxed subprocess. Output is captured and returned to the agent.",
    minTier: "m5",
    configSchema: {
      timeout_secs: {
        type: "number",
        description: "Maximum execution time in seconds (1–30).",
        default: 10,
      },
    },
  },

  delegate_agent: {
    slug: "delegate_agent",
    name: "Agent Delegation",
    description:
      "Delegate subtasks to other Maschina agents and receive their output. Enables multi-agent collaboration patterns.",
    minTier: "access",
    configSchema: {},
  },

  // ─── Connector-backed skills ───────────────────────────────────────────────

  slack: {
    slug: "slack",
    name: "Slack",
    description: "Post messages and read channel history from a connected Slack workspace.",
    minTier: "m1",
    configSchema: {
      access_token: {
        type: "string",
        description: "Slack bot token (injected automatically after OAuth).",
        required: true,
      },
      default_channel: {
        type: "string",
        description: "Default channel to post to (e.g. #general).",
        default: "",
      },
    },
  },

  github: {
    slug: "github",
    name: "GitHub",
    description: "Create and list issues, read pull requests in connected GitHub repositories.",
    minTier: "m1",
    configSchema: {
      access_token: {
        type: "string",
        description: "GitHub access token (injected automatically after OAuth).",
        required: true,
      },
      default_repo: {
        type: "string",
        description: "Default repo in owner/repo format (e.g. acme/backend).",
        default: "",
      },
    },
  },

  notion: {
    slug: "notion",
    name: "Notion",
    description: "Create and search pages in connected Notion workspaces.",
    minTier: "m1",
    configSchema: {
      access_token: {
        type: "string",
        description: "Notion integration token.",
        required: true,
      },
    },
  },

  linear: {
    slug: "linear",
    name: "Linear",
    description: "Create, list, and update issues in Linear projects.",
    minTier: "m1",
    configSchema: {
      access_token: {
        type: "string",
        description: "Linear API key.",
        required: true,
      },
      default_team: {
        type: "string",
        description: "Default Linear team ID or key.",
        default: "",
      },
    },
  },
};

// Tier order for gate checks
const TIER_ORDER: PlanTier[] = ["access", "m1", "m5", "m10", "teams", "enterprise", "internal"];

export function tierIndex(tier: PlanTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function canUseSkill(userTier: PlanTier, skillSlug: string): boolean {
  const skill = SKILL_CATALOG[skillSlug];
  if (!skill) return false;
  return tierIndex(userTier) >= tierIndex(skill.minTier);
}

export function getSkill(slug: string): SkillDef | undefined {
  return SKILL_CATALOG[slug];
}

export function listSkills(): SkillDef[] {
  return Object.values(SKILL_CATALOG);
}
