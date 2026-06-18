import fs from "fs";
import { ensureSsaDataPath, readJsonFile } from "../ssa-data-paths";

export interface LocalOnboardingStatus {
  completed: boolean;
  completedAt: string | null;
  accessMode: "local" | "lan" | null;
  modelProvider: string | null;
  testUploadCompleted: boolean;
  synthesisTestCompleted: boolean;
}

export interface LocalOnboardingCompleteInput {
  accessMode?: "local" | "lan";
  modelProvider?: string;
  testUploadCompleted?: boolean;
  synthesisTestCompleted?: boolean;
}

const DEFAULT_STATUS: LocalOnboardingStatus = {
  completed: false,
  completedAt: null,
  accessMode: null,
  modelProvider: null,
  testUploadCompleted: false,
  synthesisTestCompleted: false,
};

function onboardingPath() {
  return ensureSsaDataPath("local-onboarding.json");
}

export function getLocalOnboardingStatus(): LocalOnboardingStatus {
  return {
    ...DEFAULT_STATUS,
    ...readJsonFile<Partial<LocalOnboardingStatus>>(onboardingPath(), {}),
  };
}

export function markLocalOnboardingComplete(input: LocalOnboardingCompleteInput = {}): LocalOnboardingStatus {
  const status: LocalOnboardingStatus = {
    ...getLocalOnboardingStatus(),
    completed: true,
    completedAt: new Date().toISOString(),
    accessMode: input.accessMode || getLocalOnboardingStatus().accessMode || "local",
    modelProvider: input.modelProvider || getLocalOnboardingStatus().modelProvider || null,
    testUploadCompleted: Boolean(input.testUploadCompleted ?? getLocalOnboardingStatus().testUploadCompleted),
    synthesisTestCompleted: Boolean(input.synthesisTestCompleted ?? getLocalOnboardingStatus().synthesisTestCompleted),
  };
  fs.writeFileSync(onboardingPath(), JSON.stringify(status, null, 2), "utf-8");
  return status;
}

export function resetLocalOnboarding(): LocalOnboardingStatus {
  const status = { ...DEFAULT_STATUS };
  fs.writeFileSync(onboardingPath(), JSON.stringify(status, null, 2), "utf-8");
  return status;
}
