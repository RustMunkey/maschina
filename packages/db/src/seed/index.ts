import { seedPlans } from "./plans.js";

async function main() {
  console.log("Running database seed...");
  await seedPlans();
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
