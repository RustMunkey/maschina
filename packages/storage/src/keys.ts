/**
 * Key naming conventions for S3 objects.
 *
 * Structure:
 *   agent-artifacts/{userId}/{agentId}/{filename}
 *   task-outputs/{userId}/{runId}/{filename}
 *   uploads/{userId}/{uploadId}/{filename}
 */

export const StorageKeys = {
  agentArtifact: (userId: string, agentId: string, filename: string) =>
    `agent-artifacts/${userId}/${agentId}/${filename}`,

  taskOutput: (userId: string, runId: string, filename: string) =>
    `task-outputs/${userId}/${runId}/${filename}`,

  upload: (userId: string, uploadId: string, filename: string) =>
    `uploads/${userId}/${uploadId}/${filename}`,
} as const;

export type StoragePrefix = "agent-artifacts" | "task-outputs" | "uploads";
