#!/usr/bin/env node
// discord-scaffold.mjs — one-shot Discord server scaffold for Maschina
// Usage: DISCORD_TOKEN=xxx GUILD_ID=yyy node scripts/discord-scaffold.mjs
//
// What it does:
//   - Creates roles (Admin, Dev, Ops, Node Runner, Community)
//   - Creates all categories and channels with correct permissions
//   - Sets slowmode / topic on relevant channels
//   - Safe to re-run — skips existing channels/roles by name
//
// Requirements:
//   - Bot must be in the server with Administrator permission
//   - node >= 18 (uses native fetch)

import { REST } from "@discordjs/rest";
import { ChannelType, PermissionFlagsBits, Routes } from "discord-api-types/v10";

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD = process.env.GUILD_ID;

if (!TOKEN || !GUILD) {
  console.error("Missing DISCORD_TOKEN or GUILD_ID");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ── helpers ──────────────────────────────────────────────────────────────────

async function getExisting() {
  const [channels, roles] = await Promise.all([
    rest.get(Routes.guildChannels(GUILD)),
    rest.get(Routes.guildRoles(GUILD)),
  ]);
  return {
    channels: new Map(channels.map((c) => [c.name.toLowerCase(), c])),
    roles: new Map(roles.map((r) => [r.name.toLowerCase(), r])),
  };
}

async function upsertRole(existing, { name, color, hoist, mentionable, permissions }) {
  if (existing.roles.has(name.toLowerCase())) {
    console.log(`  role exists: ${name}`);
    return existing.roles.get(name.toLowerCase());
  }
  const role = await rest.post(Routes.guildRoles(GUILD), {
    body: {
      name,
      color,
      hoist: hoist ?? false,
      mentionable: mentionable ?? false,
      permissions: permissions?.toString(),
    },
  });
  console.log(`  created role: ${name}`);
  return role;
}

async function upsertCategory(existing, name) {
  if (existing.channels.has(name.toLowerCase())) {
    console.log(`  category exists: ${name}`);
    return existing.channels.get(name.toLowerCase());
  }
  const cat = await rest.post(Routes.guildChannels(GUILD), {
    body: { name, type: ChannelType.GuildCategory },
  });
  console.log(`  created category: ${name}`);
  return cat;
}

async function upsertChannel(
  existing,
  { name, type, parent_id, topic, rate_limit, permission_overwrites },
) {
  if (existing.channels.has(name.toLowerCase())) {
    console.log(`  channel exists: #${name}`);
    return existing.channels.get(name.toLowerCase());
  }
  const ch = await rest.post(Routes.guildChannels(GUILD), {
    body: {
      name,
      type: type ?? ChannelType.GuildText,
      parent_id,
      topic,
      rate_limit_per_user: rate_limit ?? 0,
      permission_overwrites: permission_overwrites ?? [],
    },
  });
  console.log(`  created channel: #${name}`);
  return ch;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const existing = await getExisting();

  // Fetch @everyone role id
  const everyoneRole = [...existing.roles.values()].find((r) => r.name === "@everyone");
  const everyoneId = everyoneRole.id;

  console.log("\nRoles");

  const roles = {};
  roles.admin = await upsertRole(existing, {
    name: "Admin",
    color: 0xe74c3c,
    hoist: true,
    mentionable: false,
    permissions: PermissionFlagsBits.Administrator,
  });
  roles.dev = await upsertRole(existing, {
    name: "Dev",
    color: 0x3498db,
    hoist: true,
    mentionable: true,
  });
  roles.ops = await upsertRole(existing, {
    name: "Ops",
    color: 0xe67e22,
    hoist: true,
    mentionable: true,
  });
  roles.nodeRunner = await upsertRole(existing, {
    name: "Node Runner",
    color: 0x2ecc71,
    hoist: true,
    mentionable: true,
  });
  roles.community = await upsertRole(existing, {
    name: "Community",
    color: 0x95a5a6,
    hoist: false,
    mentionable: false,
  });

  // Re-fetch after creating roles so IDs are accurate
  const { channels: existingChannels } = await getExisting();
  const existingWithNewRoles = { channels: existingChannels, roles: existing.roles };
  // merge new roles in
  for (const [k, v] of Object.entries(roles)) {
    existingWithNewRoles.roles.set(v.name.toLowerCase(), v);
  }

  // Convenience: deny @everyone from seeing a channel
  const privateOverwrites = [
    { id: everyoneId, deny: PermissionFlagsBits.ViewChannel.toString(), type: 0 },
  ];
  const adminOnlyOverwrites = [
    { id: everyoneId, deny: PermissionFlagsBits.ViewChannel.toString(), type: 0 },
    { id: roles.admin.id, allow: PermissionFlagsBits.ViewChannel.toString(), type: 0 },
  ];
  const internalOverwrites = [
    { id: everyoneId, deny: PermissionFlagsBits.ViewChannel.toString(), type: 0 },
    { id: roles.admin.id, allow: PermissionFlagsBits.ViewChannel.toString(), type: 0 },
    { id: roles.dev.id, allow: PermissionFlagsBits.ViewChannel.toString(), type: 0 },
    { id: roles.ops.id, allow: PermissionFlagsBits.ViewChannel.toString(), type: 0 },
  ];
  const readOnlyOverwrites = [
    { id: everyoneId, deny: PermissionFlagsBits.SendMessages.toString(), type: 0 },
  ];

  // ── MASCHINA (public) ─────────────────────────────────────────────────────
  console.log("\nMAASCHINA");
  const catMaschina = await upsertCategory(existingWithNewRoles, "MASCHINA");

  await upsertChannel(existingWithNewRoles, {
    name: "welcome",
    parent_id: catMaschina.id,
    topic: "Welcome to the Maschina community. Read the pinned message to get started.",
    permission_overwrites: readOnlyOverwrites,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "announcements",
    parent_id: catMaschina.id,
    topic: "Official announcements — releases, updates, milestones.",
    permission_overwrites: readOnlyOverwrites,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "general",
    parent_id: catMaschina.id,
    topic: "General discussion about Maschina.",
    rate_limit: 5,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "roadmap",
    parent_id: catMaschina.id,
    topic: "What's coming. Discuss planned features.",
    rate_limit: 10,
  });

  // ── COMMUNITY ─────────────────────────────────────────────────────────────
  console.log("\nCOMMUNITY");
  const catCommunity = await upsertCategory(existingWithNewRoles, "COMMUNITY");

  await upsertChannel(existingWithNewRoles, {
    name: "introduce-yourself",
    parent_id: catCommunity.id,
    topic: "New here? Say hi.",
    rate_limit: 30,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "showcase",
    parent_id: catCommunity.id,
    topic: "Share what you've built with Maschina.",
    rate_limit: 10,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "support",
    parent_id: catCommunity.id,
    topic: "Get help. Check pinned messages and docs first.",
    rate_limit: 5,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "feedback",
    parent_id: catCommunity.id,
    topic: "Feature requests, UX feedback, ideas.",
    rate_limit: 10,
  });

  // ── NODE RUNNERS ─────────────────────────────────────────────────────────
  console.log("\nNODE RUNNERS");
  const catNodes = await upsertCategory(existingWithNewRoles, "NODE RUNNERS");

  await upsertChannel(existingWithNewRoles, {
    name: "node-general",
    parent_id: catNodes.id,
    topic: "Discussion for node runners — setup, questions, tips.",
  });
  await upsertChannel(existingWithNewRoles, {
    name: "node-announcements",
    parent_id: catNodes.id,
    topic: "Protocol updates that affect node runners.",
    permission_overwrites: readOnlyOverwrites,
  });

  // ── OPS (internal) ────────────────────────────────────────────────────────
  console.log("\nOPS");
  const catOps = await upsertCategory(existingWithNewRoles, "OPS");

  await upsertChannel(existingWithNewRoles, {
    name: "releases",
    parent_id: catOps.id,
    topic: "Automated: GitHub semantic-release posts here on every version tag.",
    permission_overwrites: internalOverwrites,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "health",
    parent_id: catOps.id,
    topic: "Automated: Dell health monitor posts here when a service goes down or recovers.",
    permission_overwrites: internalOverwrites,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "deploys",
    parent_id: catOps.id,
    topic: "Automated: deploy start and finish notifications.",
    permission_overwrites: internalOverwrites,
  });

  // ── DEV (internal) ────────────────────────────────────────────────────────
  console.log("\nDEV");
  const catDev = await upsertCategory(existingWithNewRoles, "DEV");

  await upsertChannel(existingWithNewRoles, {
    name: "dev-general",
    parent_id: catDev.id,
    topic: "Internal dev discussion.",
    permission_overwrites: internalOverwrites,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "ci",
    parent_id: catDev.id,
    topic: "Automated: CI pass/fail on PRs.",
    permission_overwrites: internalOverwrites,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "prs",
    parent_id: catDev.id,
    topic: "PR opened/merged/closed.",
    permission_overwrites: internalOverwrites,
  });
  await upsertChannel(existingWithNewRoles, {
    name: "bugs",
    parent_id: catDev.id,
    topic: "Bug reports and triage.",
    permission_overwrites: internalOverwrites,
  });

  console.log("\nDone. Server scaffolded.");
  console.log("\nNext:");
  console.log("  1. Assign yourself the Admin role");
  console.log("  2. Grab webhook URLs from #releases, #health, #deploys");
  console.log("  3. Add them to GitHub Actions secrets + Dell .env");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
