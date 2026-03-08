mod scaffold;
mod tui;

use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "maschina-code",
    about = "Interactive scaffold tool for Maschina projects",
    version,
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Scaffold a new agent (Python)
    Agent {
        /// Agent name (e.g. "PriceMonitor")
        name: String,
        /// Output directory (default: current directory)
        #[arg(short, long, default_value = ".")]
        output: PathBuf,
    },
    /// Scaffold a new API route (TypeScript / Hono)
    Route {
        /// Route name (e.g. "widgets")
        name: String,
        #[arg(short, long, default_value = ".")]
        output: PathBuf,
    },
    /// Scaffold a new connector (TypeScript)
    Connector {
        /// Connector name (e.g. "Stripe")
        name: String,
        #[arg(short, long, default_value = ".")]
        output: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        None => {
            // No subcommand — launch the interactive TUI
            tui::run_tui()?;
        }

        Some(Commands::Agent { name, output }) => {
            let files = scaffold::scaffold(&scaffold::ScaffoldKind::Agent, &name, &output)?;
            for f in &files {
                println!("Created: {}", f.display());
            }
        }

        Some(Commands::Route { name, output }) => {
            let files = scaffold::scaffold(&scaffold::ScaffoldKind::Route, &name, &output)?;
            for f in &files {
                println!("Created: {}", f.display());
            }
        }

        Some(Commands::Connector { name, output }) => {
            let files = scaffold::scaffold(&scaffold::ScaffoldKind::Connector, &name, &output)?;
            for f in &files {
                println!("Created: {}", f.display());
            }
        }
    }

    Ok(())
}
