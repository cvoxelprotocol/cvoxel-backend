import {
  Transaction,
  Work,
  WorkCredential,
  WorkSubject,
} from "../__generated__/types/WorkCredential.js";
import { BigNumber } from "ethers";

export type WorkCredentialWithId = WorkCredential & {
  backupId?: string;
  holderDid?: string;
  potentialSigners?: string[];
};

export type WorkSubjectFromDework = WorkSubject & {
  streamId?: string | null;
  taskId?: string | null;
};

export type ERC721Data = {
  tokenURI: string;
  chainId: number;
  contractAddress: string;
  tokenId: BigNumber;
  tokenHash: string;
};

export type WorkSubjectFromERC721 = WorkSubject & {
  streamId?: string | null;
  chainId?: number | null;
  contractAddress?: string | null;
  tokenId?: string | null;
  tokenHash?: string | null;
};

export type WorkCredentialForm = Work &
  Transaction & {
    deliverableLink?: string;
    deliverableCID?: string;
  };

const AliasType = {
  workCredential: "WorkCredential",
  verifiableWorkCredential: "VerifiableWorkCredential",
  heldWorkCredentials: "HeldWorkCredentials",
  heldVerifiableWorkCredentials: "HeldVerifiableWorkCredentials",
  Organization: "Organization",
  MemberShip: "MemberShip",
  MembershipSubject: "MembershipSubject",
} as const;
export type AliasTypes = typeof AliasType[keyof typeof AliasType];

export type WorkCredentialWithDeworkTaskId = {
  taskId: string;
  crdl: WorkCredential;
};

export type WorkCredentialWithERC721Data = {
  crdl: WorkCredential;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  tokenHash: string;
};
