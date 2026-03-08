use anyhow::{Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tera::Tera;

// ─── Template sources ─────────────────────────────────────────────────────────

const AGENT_PY: &str = r#""""{{ name }} — {{ description }}"""

from maschina_agents import {{ agent_type | title }}Agent
from maschina_runtime import RunInput, RunResult, Tool


class {{ class_name }}({{ agent_type | title }}Agent):
    @property
    def system_prompt(self) -> str:
        return (
            "You are {{ name }}. {{ description }}"
        )

    def tools(self) -> list[Tool]:
        return []
"#;

const ROUTE_TS: &str = r#"import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { db } from "@maschina/db";

const {{ name_camel }} = new Hono();

{{ name_camel }}.use("*", authMiddleware);

{{ name_camel }}.get("/", async (c) => {
  // TODO: implement GET /{{ name_kebab }}
  return c.json({ data: [] });
});

{{ name_camel }}.post("/", async (c) => {
  const body = await c.req.json();
  // TODO: implement POST /{{ name_kebab }}
  return c.json({ data: body }, 201);
});

export { {{ name_camel }} };
"#;

const CONNECTOR_TS: &str = r#"/**
 * {{ name }} connector — integrates external service with Maschina.
 */

export interface {{ class_name }}Config {
  apiKey: string;
  baseUrl?: string;
}

export class {{ class_name }}Connector {
  private config: {{ class_name }}Config;

  constructor(config: {{ class_name }}Config) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // TODO: establish connection
  }

  async disconnect(): Promise<void> {
    // TODO: close connection
  }
}
"#;

// ─── Scaffold options ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum ScaffoldKind {
    Agent,
    Route,
    Connector,
}

impl ScaffoldKind {
    pub fn display(&self) -> &'static str {
        match self {
            ScaffoldKind::Agent => "Agent (Python)",
            ScaffoldKind::Route => "API Route (TypeScript / Hono)",
            ScaffoldKind::Connector => "Connector (TypeScript)",
        }
    }

    pub fn all() -> Vec<ScaffoldKind> {
        vec![ScaffoldKind::Agent, ScaffoldKind::Route, ScaffoldKind::Connector]
    }
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

fn to_snake_case(s: &str) -> String {
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() && i != 0 {
            out.push('_');
        }
        out.push(c.to_lowercase().next().unwrap());
    }
    out.replace(' ', "_").replace('-', "_")
}

fn to_pascal_case(s: &str) -> String {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|p| !p.is_empty())
        .map(|p| {
            let mut chars = p.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect()
}

fn to_kebab_case(s: &str) -> String {
    to_snake_case(s).replace('_', "-")
}

fn to_camel_case(s: &str) -> String {
    let pascal = to_pascal_case(s);
    let mut chars = pascal.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_lowercase().collect::<String>() + chars.as_str(),
    }
}

// ─── Scaffolding ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct AgentCtx {
    name: String,
    class_name: String,
    description: String,
    agent_type: String,
}

#[derive(Serialize)]
struct RouteCtx {
    name_camel: String,
    name_kebab: String,
}

#[derive(Serialize)]
struct ConnectorCtx {
    name: String,
    class_name: String,
}

pub fn scaffold(kind: &ScaffoldKind, name: &str, output_dir: &Path) -> Result<Vec<PathBuf>> {
    let mut tera = Tera::default();
    let mut created = Vec::new();

    std::fs::create_dir_all(output_dir)?;

    match kind {
        ScaffoldKind::Agent => {
            tera.add_raw_template("agent.py", AGENT_PY)?;
            let ctx = AgentCtx {
                name: name.to_string(),
                class_name: to_pascal_case(name),
                description: format!("{} agent", name),
                agent_type: "analysis".to_string(),
            };
            let rendered = tera
                .render("agent.py", &tera::Context::from_serialize(&ctx)?)
                .context("failed to render agent template")?;
            let path = output_dir.join(format!("{}.py", to_snake_case(name)));
            std::fs::write(&path, rendered)?;
            created.push(path);
        }

        ScaffoldKind::Route => {
            tera.add_raw_template("route.ts", ROUTE_TS)?;
            let ctx = RouteCtx {
                name_camel: to_camel_case(name),
                name_kebab: to_kebab_case(name),
            };
            let rendered = tera
                .render("route.ts", &tera::Context::from_serialize(&ctx)?)
                .context("failed to render route template")?;
            let path = output_dir.join(format!("{}.ts", to_kebab_case(name)));
            std::fs::write(&path, rendered)?;
            created.push(path);
        }

        ScaffoldKind::Connector => {
            tera.add_raw_template("connector.ts", CONNECTOR_TS)?;
            let ctx = ConnectorCtx {
                name: name.to_string(),
                class_name: to_pascal_case(name),
            };
            let rendered = tera
                .render("connector.ts", &tera::Context::from_serialize(&ctx)?)
                .context("failed to render connector template")?;
            let path = output_dir.join(format!("{}.ts", to_kebab_case(name)));
            std::fs::write(&path, rendered)?;
            created.push(path);
        }
    }

    Ok(created)
}
