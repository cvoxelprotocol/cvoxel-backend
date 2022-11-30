import {
  WorkCredentialWithDeworkTaskId, WorkCredentialWithERC721Data,
  WorkSubjectFromDework, WorkSubjectFromERC721,
} from "../types/workCredential.js";
import { initializeVESS } from "../utils/ceramicHelper.js";
import { EventAttendanceWithId, EventWithId, VessForNode } from "vess-sdk";
import {
  createEventAttendanceCredentials,
  createWorkCRDLsFromDework,
  createWorkCRDLsFromERC721
} from "../utils/etherHelper.js";
import { issueWorkCRDL } from "../utils/ceramicHelper.js";

export const issueWorkCRDLsFromDework = async (
  targetTasks: WorkSubjectFromDework[]
): Promise<WorkSubjectFromDework[]> => {
  const { vess } = await initializeVESS();
  const crdlsWithTaskIds = await createWorkCRDLsFromDework(targetTasks);

  const promises: Promise<WorkSubjectFromDework>[] = [];
  for (const crdlsWithTaskId of crdlsWithTaskIds) {
    // store into Ceramic
    const p = issueWorkCRDLFromDework(vess, crdlsWithTaskId);
    promises.push(p);
  }
  return await Promise.all(promises);
};

export const issueWorkCRDLFromDework = async (
  vess: VessForNode,
  crdlsWithTaskId: WorkCredentialWithDeworkTaskId
): Promise<WorkSubjectFromDework> => {
  const doc = await vess.createWorkCredential(crdlsWithTaskId.crdl);

  const updatedTask: WorkSubjectFromDework = {
    ...crdlsWithTaskId.crdl.subject,
    streamId: doc.id.toUrl(),
    taskId: crdlsWithTaskId.taskId,
  };
  return updatedTask;
};

export const issueEventAttendanceCredential = async (
  content: EventWithId,
  dids: string[]
): Promise<EventAttendanceWithId[]> => {
  try {
    const { vess } = await initializeVESS();
    const vcs = await createEventAttendanceCredentials(content, dids);
    const { docs } = await vess.issueEventAttendanceCredentials(vcs);
    return docs;
  } catch (error) {
    console.log(JSON.stringify(error));
    throw new Error("Failed to create event crdl on ceramic");
  }
};

export const issueWorkCRDLsFromERC721 = async (
  targetTokens: WorkSubjectFromERC721[]
): Promise<WorkSubjectFromERC721[]> => {
  // sign and create crdls
  const crdlsWithData = await createWorkCRDLsFromERC721(targetTokens);

  const promises: Promise<WorkSubjectFromERC721>[] = [];
  for (const crdls of crdlsWithData) {
    // store into Ceramic
    const p = issueWorkCRDLFromERC721(crdls);
    promises.push(p);
  }
  return await Promise.all(promises);
};

export const issueWorkCRDLFromERC721 = async (
  crdlsWithData: WorkCredentialWithERC721Data
): Promise<WorkSubjectFromERC721> => {
  console.log("crdl", crdlsWithData.crdl);
  const id = await issueWorkCRDL(crdlsWithData.crdl);

  console.log("streamId: ", id);
  const updatedToken: WorkSubjectFromERC721 = {
    ...crdlsWithData.crdl.subject,
    streamId: id,
    chainId:crdlsWithData.chainId,
    contractAddress:crdlsWithData.contractAddress,
    tokenId:crdlsWithData.tokenId.toString(),
    tokenHash:crdlsWithData.tokenHash
  };
  return updatedToken;
};
