use crate::{client::ApiClient, output::Output};
use anyhow::Result;
use console::style;

pub async fn run(client: &ApiClient, out: &Output) -> Result<()> {
    let usage: serde_json::Value = client.get("/usage").await?;

    if out.is_json() {
        out.data(&usage);
        return Ok(());
    }

    if let Some(period) = usage["period"].as_str() {
        println!("{}", style(format!("Usage — {period}")).bold());
    } else {
        println!("{}", style("Usage").bold());
    }

    if let Some(quotas) = usage["quotas"].as_object() {
        println!(
            "  {:<28} {:>10}  {:>10}",
            style("QUOTA").dim(),
            style("USED").dim(),
            style("LIMIT").dim()
        );
        for (key, val) in quotas {
            let used = val["used"].as_u64().unwrap_or(0);
            let limit = val["limit"].as_i64().unwrap_or(-1);
            let limit_str = if limit < 0 {
                "unlimited".to_string()
            } else {
                limit.to_string()
            };
            let pct = if limit > 0 {
                used * 100 / limit as u64
            } else {
                0
            };
            let bar = usage_bar(pct, 10);
            println!(
                "  {:<28} {:>10}  {:>10}  {}",
                key,
                style(used).cyan(),
                style(limit_str).dim(),
                bar,
            );
        }
    }

    println!();
    Ok(())
}

fn usage_bar(pct: u64, width: usize) -> String {
    let filled = (pct as usize * width / 100).min(width);
    let empty = width - filled;
    let color = if pct >= 90 {
        "red"
    } else if pct >= 70 {
        "yellow"
    } else {
        "green"
    };
    let bar = format!("[{}{}]", "█".repeat(filled), "░".repeat(empty));
    match color {
        "red" => format!("{}", style(bar).red()),
        "yellow" => format!("{}", style(bar).yellow()),
        _ => format!("{}", style(bar).green()),
    }
}
