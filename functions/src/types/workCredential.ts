import { WorkCredential, WorkSubject } from "vess-sdk";

export type WorkSubjectFromDework = WorkSubject & {
  streamId?: string | null;
  taskId?: string | null;
};

export type WorkCredentialWithDeworkTaskId = {
  taskId: string;
  crdl: WorkCredential;
};
