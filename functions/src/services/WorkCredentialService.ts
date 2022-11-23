import {
  WorkCredentialWithDeworkTaskId, WorkCredentialWithERC721Data,
  WorkSubjectFromDework, WorkSubjectFromERC721,
} from "../types/workCredential.js";
import { issueWorkCRDL } from "../utils/ceramicHelper.js";
import {createWorkCRDLsFromDework, createWorkCRDLsFromERC721} from "../utils/etherHelper.js";

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
