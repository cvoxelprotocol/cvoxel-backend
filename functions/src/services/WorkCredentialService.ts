import {
  WorkCredentialWithDeworkTaskId,
  WorkSubjectFromDework,
} from "../types/workCredential.js";
import { issueWorkCRDL } from "../utils/ceramicHelper.js";
import { createWorkCRDLsFromDework } from "../utils/etherHelper.js";

export const issueWorkCRDLsFromDework = async (
  targetTasks: WorkSubjectFromDework[]
): Promise<WorkSubjectFromDework[]> => {
  // sign and create crdls
  const crdlsWithTaskIds = await createWorkCRDLsFromDework(targetTasks);

  const promises: Promise<WorkSubjectFromDework>[] = [];
  for (const crdlsWithTaskId of crdlsWithTaskIds) {
    // store into Ceramic
    const p = issueWorkCRDLFromDework(crdlsWithTaskId);
    promises.push(p);
  }
  return await Promise.all(promises);
};

export const issueWorkCRDLFromDework = async (
  crdlsWithTaskId: WorkCredentialWithDeworkTaskId
): Promise<WorkSubjectFromDework> => {
  console.log("crdl", crdlsWithTaskId.crdl);
  const id = await issueWorkCRDL(crdlsWithTaskId.crdl);

  console.log("streamId: ", id);
  const updatedTask: WorkSubjectFromDework = {
    ...crdlsWithTaskId.crdl.subject,
    streamId: id,
    taskId: crdlsWithTaskId.taskId,
  };
  return updatedTask;
};
