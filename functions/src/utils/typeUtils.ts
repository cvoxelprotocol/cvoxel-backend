import {WorkSubjectFromDework, WorkSubjectFromERC721} from "../types/workCredential.js";
import { WorkSubject } from "../__generated__/types/WorkCredential.js";
import { removeUndefined } from "./commonUtil.js";

export const cast2WorkSubjectFromDework = (
  deworkSubject: WorkSubjectFromDework
): WorkSubject => {
  const mid: WorkSubjectFromDework = removeUndefined<WorkSubjectFromDework>({
    ...deworkSubject,
    taskId: undefined,
    streamId: undefined,
  });
  return mid as WorkSubject;
};

export const cast2WorkSubjectFromERC721 = (
  subject: WorkSubjectFromERC721
): WorkSubject => {
  const mid: WorkSubjectFromERC721 = removeUndefined<WorkSubjectFromERC721>({
    ...subject,
    chainId: undefined,
    contractAddress: undefined,
    tokenId: undefined,
    tokenHash: undefined,
    streamId: undefined,
  });
  return mid as WorkSubject;
};

