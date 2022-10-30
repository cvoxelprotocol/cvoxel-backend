import { signTypedData, SignTypedDataVersion } from "@metamask/eth-sig-util";
import { ethers, providers } from "ethers";
import {
  CLIENT_EIP712_TYPE,
  DELIVERABLES_EIP712_TYPE,
  DOMAIN_TYPE,
  EIP712DomainTypedData,
  EIP712WorkCredentialSubjectTypedData,
  PRIMARY_SUBJECT_TYPE,
  TX_EIP712_TYPE,
  WORK_EIP712_TYPE,
  WORK_SUBJECT_EIP712_TYPE,
} from "../types/eip712.js";
import {
  WorkCredentialWithDeworkTaskId,
  WorkSubjectFromDework,
} from "../types/workCredential.js";
import {
  DeliverableItem,
  Signatures,
  WorkCredential,
  WorkSubject,
} from "../__generated__/types/WorkCredential.js";
import { getPkhDIDFromAddress } from "./ceramicHelper.js";
import {
  castUndifined2DefaultValue,
  convertDateToTimestampStr,
} from "./commonUtil.js";
import { cast2WorkSubject } from "./typeUtils.js";

export const createWorkCRDLsFromDework = async (
  subjects: WorkSubjectFromDework[]
): Promise<WorkCredentialWithDeworkTaskId[]> => {
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const provider = new providers.AlchemyProvider("homestead", ALCHEMY_API_KEY);
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signer = wallet.connect(provider);
  const nowTimestamp = convertDateToTimestampStr(new Date());

  const crdlPromises: Promise<WorkCredentialWithDeworkTaskId>[] = [];

  console.log("wallet: ", signer.address);

  for (const deworkTask of subjects) {
    console.log("deworkTask", deworkTask.work?.summary);
    if (deworkTask.taskId) {
      const subject = convertValidworkSubjectTypedData(
        cast2WorkSubject(deworkTask)
      );
      const crdlPromise = signAndCreateWorkCRDLFromDework(
        deworkTask.taskId,
        subject,
        provider,
        signer,
        nowTimestamp
      );
      crdlPromises.push(crdlPromise);
    }
  }
  return await Promise.all(crdlPromises);
};

export const signAndCreateWorkCRDLFromDework = async (
  taskId: string,
  subject: WorkSubject,
  provider: ethers.providers.AlchemyProvider,
  signer: ethers.Wallet,
  createdAt: string
): Promise<WorkCredentialWithDeworkTaskId> => {
  const crdl: WorkCredential = await signAndCreateWorkCRDL(
    subject,
    provider,
    signer,
    createdAt
  );
  return { taskId, crdl };
};

export const createWorkCRDLs = async (
  subjects: WorkSubject[]
): Promise<WorkCredential[]> => {
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const provider = new providers.AlchemyProvider("homestead", ALCHEMY_API_KEY);
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signer = wallet.connect(provider);
  const nowTimestamp = convertDateToTimestampStr(new Date());

  const crdlPromises: Promise<WorkCredential>[] = [];

  for (const subject of subjects) {
    const crdlPromise = signAndCreateWorkCRDL(
      subject,
      provider,
      signer,
      nowTimestamp
    );
    crdlPromises.push(crdlPromise);
  }
  return await Promise.all(crdlPromises);
};

export const signAndCreateWorkCRDL = async (
  subject: WorkSubject,
  provider: ethers.providers.AlchemyProvider,
  signer: ethers.Wallet,
  createdAt: string
): Promise<WorkCredential> => {
  if (!subject.work) {
    throw new Error("Missing work subject");
  }
  const agentSig = await getEIP712WorkCredentialSubjectSignature(
    subject,
    provider,
    signer
  );

  const signature: Signatures = {
    holderSig: "",
    partnerSig: "",
    partnerSigner: "",
    agentSig: agentSig,
    agentSigner: getPkhDIDFromAddress(signer.address),
  };

  const crdl: WorkCredential = {
    id: subject.work.id,
    subject,
    signature,
    createdAt: createdAt,
    updatedAt: createdAt,
  };
  return crdl;
};

export const getEIP712WorkCredentialSubjectSignature = async (
  subject: WorkSubject,
  provider: ethers.providers.AlchemyProvider,
  signer: ethers.Wallet
): Promise<string> => {
  const { chainId } = await provider.getNetwork();
  const domain: EIP712DomainTypedData = {
    name: "Work Credential",
    version: "1",
    chainId: chainId,
    verifyingContract: "0x00000000000000000000000000000000000000000000", // WIP
  };
  const credentialTypedData = getEIP712WorkSubjectTypedData(domain, subject);
  const privateKey = Buffer.from(signer.privateKey.substring(2, 66), "hex");
  const signature = signTypedData({
    privateKey: privateKey,
    data: credentialTypedData,
    version: SignTypedDataVersion.V4,
  });
  console.log("signature", signature);
  return signature;
};

const getEIP712WorkSubjectTypedData = (
  domain: EIP712DomainTypedData,
  subject: WorkSubject
): EIP712WorkCredentialSubjectTypedData => {
  return {
    domain: domain,
    primaryType: PRIMARY_SUBJECT_TYPE,
    message: subject,
    types: {
      EIP712Domain: DOMAIN_TYPE,
      WorkCredentialSubject: WORK_SUBJECT_EIP712_TYPE,
      Work: WORK_EIP712_TYPE,
      DeliverableItem: DELIVERABLES_EIP712_TYPE,
      TX: TX_EIP712_TYPE,
      Client: CLIENT_EIP712_TYPE,
    },
  };
};

const convertValidworkSubjectTypedData = (
  subject: WorkSubject
): WorkSubject => {
  const deliverables: DeliverableItem[] = subject.deliverables
    ? subject.deliverables?.map((v) => {
        return castUndifined2DefaultValue(v, DELIVERABLES_EIP712_TYPE);
      })
    : [];

  return {
    work: castUndifined2DefaultValue(subject.work, WORK_EIP712_TYPE),
    tx: castUndifined2DefaultValue(subject.tx, TX_EIP712_TYPE),
    client: castUndifined2DefaultValue(subject.client, CLIENT_EIP712_TYPE),
    deliverables: deliverables,
  };
};