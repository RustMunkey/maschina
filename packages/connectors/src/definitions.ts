// ─── Connector catalog ────────────────────────────────────────────────────────
// Each connector maps 1-to-1 with a skill slug in SKILL_CATALOG.
// authType: "oauth2" = redirect flow; "api_key" = user pastes a token.

export type ConnectorAuthType = "oauth2" | "api_key";
export type ConnectorCategory = "productivity" | "dev" | "crm" | "data";

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface CredentialField {
  label: string;
  description: string;
  required: boolean;
  secret: boolean; // masked in UI
}

export interface ConnectorDef {
  slug: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  authType: ConnectorAuthType;
  /** Matches a key in SKILL_CATALOG */
  skillSlug: string;
  oauthConfig?: OAuthConfig;
  /** Fields the user must supply for api_key connectors */
  credentialSchema: Record<string, CredentialField>;
}

export const CONNECTOR_CATALOG: Record<string, ConnectorDef> = {
  slack: {
    slug: "slack",
    name: "Slack",
    description: "Post messages and read channel history from Slack workspaces.",
    category: "productivity",
    authType: "oauth2",
    skillSlug: "slack",
    oauthConfig: {
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["chat:write", "channels:read", "channels:history", "groups:read"],
    },
    credentialSchema: {
      access_token: {
        label: "Bot Token",
        description: "OAuth bot access token (xoxb-...)",
        required: true,
        secret: true,
      },
    },
  },

  github: {
    slug: "github",
    name: "GitHub",
    description: "Create and manage issues, pull requests, and files in GitHub repositories.",
    category: "dev",
    authType: "oauth2",
    skillSlug: "github",
    oauthConfig: {
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user"],
    },
    credentialSchema: {
      access_token: {
        label: "Access Token",
        description: "GitHub OAuth access token",
        required: true,
        secret: true,
      },
    },
  },

  notion: {
    slug: "notion",
    name: "Notion",
    description: "Create and search pages, databases, and blocks in Notion workspaces.",
    category: "productivity",
    authType: "api_key",
    skillSlug: "notion",
    credentialSchema: {
      access_token: {
        label: "Integration Token",
        description: "Notion internal integration secret (secret_...)",
        required: true,
        secret: true,
      },
    },
  },

  linear: {
    slug: "linear",
    name: "Linear",
    description: "Create, list, and update issues in Linear projects.",
    category: "dev",
    authType: "api_key",
    skillSlug: "linear",
    credentialSchema: {
      access_token: {
        label: "API Key",
        description: "Linear personal API key",
        required: true,
        secret: true,
      },
    },
  },
};

export function getConnectorDef(slug: string): ConnectorDef | undefined {
  return CONNECTOR_CATALOG[slug];
}

export function listConnectorDefs(): ConnectorDef[] {
  return Object.values(CONNECTOR_CATALOG);
}
